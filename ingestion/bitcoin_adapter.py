"""
ingestion/bitcoin_adapter.py

Pulls a BOUNDED slice of Bitcoin activity via BigQuery's public dataset,
starting from a seed address, converted into the unified AddressNode /
TransferEdge shape.

KEY DIFFERENCE FROM ETHEREUM: Bitcoin uses the UTXO model, not the
account model. A single transaction has an `inputs` array (addresses
spending existing UTXOs) and an `outputs` array (addresses receiving new
UTXOs) - there is no single "from_address"/"to_address" like Ethereum.

SIMPLIFICATION (documented, not hidden): to represent a UTXO transaction
as pairwise TransferEdges for graph tracing, this adapter creates one
edge per (input_address, output_address) pair, splitting the total
transferred value evenly across output edges. This is a standard
simplification for graph visualization/tracing purposes - it does NOT
imply input address X specifically sent value to output address Y (in
UTXO transactions, inputs are pooled together, not individually routed
to specific outputs). The RAW inputs/outputs structure is preserved
separately (see get_raw_transactions) for clustering/bitcoin_cluster.py,
which needs the true input-grouping for the Common-Input-Ownership
Heuristic - do not use the pairwise edges for that, use the raw structure.

Usage:
    from datetime import datetime
    from ingestion.bitcoin_adapter import trace_bitcoin

    nodes, edges, raw_txs = trace_bitcoin(
        seed_address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        start_time=datetime(2024, 1, 1),
        end_time=datetime(2024, 6, 30),
        max_hops=2,
    )
"""

from datetime import datetime

from google.cloud import bigquery

from graph.schema import AddressNode, TransferEdge, Chain, AttributionTier

MAX_COUNTERPARTIES_PER_HOP = 20  # kept lower than Ethereum - UTXO tx can have many outputs
ROWS_PER_QUERY = 100


def _bigquery_client(project_id: str) -> bigquery.Client:
    return bigquery.Client(project=project_id)


def _fetch_transactions_for_address(
    client: bigquery.Client,
    address: str,
    start_time: datetime,
    end_time: datetime,
    limit: int = ROWS_PER_QUERY,
) -> list[dict]:
    """
    Pulls raw transactions where `address` appears in inputs OR outputs.
    Returns the full inputs/outputs arrays per transaction - needed both
    for pairwise edge construction AND for CIOH clustering later.
    """
    query = """
        SELECT
            `hash` AS tx_hash,
            inputs,
            outputs,
            block_timestamp,
            block_number
        FROM `bigquery-public-data.crypto_bitcoin.transactions`
        WHERE block_timestamp BETWEEN @start_time AND @end_time
          AND (
            EXISTS(SELECT 1 FROM UNNEST(inputs) AS i WHERE i.addresses[SAFE_OFFSET(0)] = @address)
            OR
            EXISTS(SELECT 1 FROM UNNEST(outputs) AS o WHERE o.addresses[SAFE_OFFSET(0)] = @address)
          )
        ORDER BY block_timestamp DESC
        LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("address", "STRING", address),
            bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time),
            bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", end_time),
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
        ]
    )
    return [dict(row) for row in client.query(query, job_config=job_config).result()]


def _satoshi_to_btc(value_satoshi) -> float:
    if value_satoshi is None:
        return 0.0
    return float(value_satoshi) / 1e8


def _extract_addresses(entries: list) -> list[str]:
    """
    Each input/output entry has an `addresses` array (usually length 1,
    but the schema allows multiple for some script types - take all of
    them defensively).
    """
    result = []
    for entry in entries or []:
        addrs = entry.get("addresses") or []
        result.extend([a for a in addrs if a])
    return result


def trace_bitcoin(
    seed_address: str,
    start_time: datetime,
    end_time: datetime,
    max_hops: int = 2,
    project_id: str = "crypto-attribution-506814",
) -> tuple[list[AddressNode], list[TransferEdge], list[dict]]:
    """
    Breadth-first expansion from seed_address. Returns (nodes, edges,
    raw_transactions) - raw_transactions preserves true input/output
    groupings per tx, required by clustering/bitcoin_cluster.py's CIOH
    implementation (pairwise edges alone lose this grouping information).
    """
    client = _bigquery_client(project_id)

    visited_addresses: set[str] = {seed_address}
    nodes_by_address: dict[str, AddressNode] = {
        seed_address: AddressNode(chain=Chain.BITCOIN, address=seed_address,
                                    attribution_tier=AttributionTier.UNKNOWN)
    }
    edges: list[TransferEdge] = []
    raw_transactions: list[dict] = []
    seen_tx_hashes: set[str] = set()

    current_frontier = [seed_address]

    for hop in range(max_hops):
        if not current_frontier:
            break
        next_frontier: list[str] = []

        for address in current_frontier:
            rows = _fetch_transactions_for_address(client, address, start_time, end_time)
            counterparties_this_address = 0

            for row in rows:
                if row["tx_hash"] in seen_tx_hashes:
                    continue
                seen_tx_hashes.add(row["tx_hash"])

                input_addrs = _extract_addresses(row["inputs"])
                output_entries = row["outputs"] or []

                raw_transactions.append({
                    "tx_hash": row["tx_hash"],
                    "input_addresses": input_addrs,
                    "output_addresses": _extract_addresses(output_entries),
                    "timestamp": row["block_timestamp"],
                })

                total_output_value = sum(
                    _satoshi_to_btc(o.get("value")) for o in output_entries
                )
                per_output_share = (
                    total_output_value / len(output_entries) if output_entries else 0.0
                )

                # GUARD: some Bitcoin transactions (exchange consolidations/
                # distributions) have hundreds of inputs AND hundreds of
                # outputs. A full cartesian product (every input x every
                # output) on such a transaction alone can generate tens of
                # thousands of edges - across even a few hundred raw
                # transactions this explodes into millions of edges. Skip
                # pairwise edge creation for oversized transactions (still
                # keep them in raw_transactions below for CIOH clustering,
                # which needs the true input groupings regardless) - these
                # batch transactions are graph noise for tracing purposes
                # anyway, not meaningful individual fund-flow signal.
                MAX_TX_EDGE_PRODUCT = 400
                edge_product_size = len(input_addrs) * len(output_entries)
                skip_pairwise_edges = edge_product_size > MAX_TX_EDGE_PRODUCT

                if skip_pairwise_edges:
                    print(f"[bitcoin_adapter] skipping edge expansion for batch tx "
                          f"{row['tx_hash'][:12]}... ({len(input_addrs)} inputs x "
                          f"{len(output_entries)} outputs = {edge_product_size} would-be edges)")

                if not skip_pairwise_edges:
                    for in_addr in input_addrs:
                        for out_entry in output_entries:
                            out_addrs = out_entry.get("addresses") or []
                            for out_addr in out_addrs:
                                if not out_addr or in_addr == out_addr:
                                    continue

                                edges.append(
                                    TransferEdge(
                                        chain=Chain.BITCOIN,
                                        tx_hash=row["tx_hash"],
                                        from_address=in_addr,
                                        to_address=out_addr,
                                        asset="BTC",
                                        amount=per_output_share,
                                        timestamp=row["block_timestamp"],
                                        block_number=row["block_number"],
                                    )
                                )

                                for addr in (in_addr, out_addr):
                                    if addr not in nodes_by_address:
                                        nodes_by_address[addr] = AddressNode(
                                            chain=Chain.BITCOIN, address=addr
                                        )

                                counterparty = out_addr if in_addr == address else in_addr
                                if (
                                    counterparty not in visited_addresses
                                    and counterparties_this_address < MAX_COUNTERPARTIES_PER_HOP
                                ):
                                    visited_addresses.add(counterparty)
                                    next_frontier.append(counterparty)
                                    counterparties_this_address += 1

        current_frontier = next_frontier
        print(f"[bitcoin_adapter] hop {hop + 1}/{max_hops}: "
              f"expanded to {len(current_frontier)} new addresses, "
              f"{len(edges)} edges total so far")

    return list(nodes_by_address.values()), edges, raw_transactions


if __name__ == "__main__":
    # Manual smoke test - swap in a real seed address from your Bitcoin
    # case study before treating this as a real result.
    nodes, edges, raw_txs = trace_bitcoin(
        seed_address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",  # Genesis-linked test address
        start_time=datetime(2024, 1, 1),
        end_time=datetime(2024, 3, 31),
        max_hops=1,
    )
    print(f"\nDone. {len(nodes)} nodes, {len(edges)} edges, {len(raw_txs)} raw transactions.")