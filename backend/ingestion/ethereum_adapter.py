"""
ingestion/ethereum_adapter.py

Pulls a BOUNDED slice of Ethereum activity from BigQuery's public dataset,
starting from a seed address, and converts it into the unified
AddressNode / TransferEdge shape (graph/schema.py) ready for Neo4j loading.

IMPORTANT - two separate fund-movement sources are queried per address:
  1. Native ETH transfers (crypto_ethereum.transactions.value)
  2. ERC-20 token transfers (crypto_ethereum.token_transfers) - this is
     REQUIRED, not optional. Many real incidents (including the WazirX
     2024 hack used as this project's eval trace) move funds as ERC-20
     tokens, not native ETH. A transaction's top-level `value` field is
     typically 0 for a token transfer - the real from/to/amount lives in
     the Transfer event log, which BigQuery exposes as the separate
     token_transfers table. Tracing only .transactions silently misses
     the entire attack path for token-based incidents.

Bounding strategy: hop depth AND time window combined (see prior
discussion) - keeps each query cheap and the graph from exploding in
width once high-fan-out addresses (exchange deposit wallets) get pulled in.

Usage:
    from datetime import datetime
    from ingestion.ethereum_adapter import trace_ethereum

    nodes, edges = trace_ethereum(
        seed_address="0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4",
        start_time=datetime(2024, 7, 18),
        end_time=datetime(2024, 8, 18),
        max_hops=4,
    )
"""

from datetime import datetime

from google.cloud import bigquery

from graph.schema import AddressNode, TransferEdge, Chain, AttributionTier


# Cap on counterparties expanded per hop, per address, ACROSS both native
# and token transfers combined. Without this, a single exchange deposit
# wallet swept by thousands of users could blow up the graph even within
# a bounded time window.
MAX_COUNTERPARTIES_PER_HOP = 25

# How many raw transfer rows to pull per address per hop, per source
# (native/token), before applying the fan-out cap above.
ROWS_PER_QUERY = MAX_COUNTERPARTIES_PER_HOP * 2


def _bigquery_client(project_id: str) -> bigquery.Client:
    return bigquery.Client(project=project_id)


def _fetch_native_transfers(
    client: bigquery.Client,
    address: str,
    start_time: datetime,
    end_time: datetime,
    limit: int = ROWS_PER_QUERY,
) -> list[dict]:
    """Native ETH transfers where `address` is sender or receiver."""
    query = """
        SELECT
            `hash` AS tx_hash,
            from_address,
            to_address,
            value,
            block_timestamp,
            block_number
        FROM `bigquery-public-data.crypto_ethereum.transactions`
        WHERE (from_address = @address OR to_address = @address)
          AND block_timestamp BETWEEN @start_time AND @end_time
          AND value > 0
        ORDER BY value DESC
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


def _fetch_token_transfers(
    client: bigquery.Client,
    address: str,
    start_time: datetime,
    end_time: datetime,
    limit: int = ROWS_PER_QUERY,
) -> list[dict]:
    """
    ERC-20 token transfers where `address` is sender or receiver. Joins
    against the tokens table to get a human-readable symbol and correct
    decimals for converting raw integer value into a real token amount.
    Falls back to 18 decimals (the ERC-20 default) if a token isn't in
    the tokens reference table.
    """
    query = """
        SELECT
            tt.transaction_hash AS tx_hash,
            tt.from_address AS from_address,
            tt.to_address AS to_address,
            tt.value AS raw_value,
            COALESCE(SAFE_CAST(tok.decimals AS INT64), 18) AS decimals,
            COALESCE(tok.symbol, CONCAT('TOKEN:', SUBSTR(tt.token_address, 0, 10))) AS symbol,
            tt.block_timestamp AS block_timestamp,
            tt.block_number AS block_number
        FROM `bigquery-public-data.crypto_ethereum.token_transfers` tt
        LEFT JOIN `bigquery-public-data.crypto_ethereum.tokens` tok
            ON tt.token_address = tok.address
        WHERE (tt.from_address = @address OR tt.to_address = @address)
          AND tt.block_timestamp BETWEEN @start_time AND @end_time
        ORDER BY SAFE_CAST(tt.value AS BIGNUMERIC) DESC
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


def _wei_to_eth(value_wei) -> float:
    if value_wei is None:
        return 0.0
    return float(value_wei) / 1e18


def _raw_to_token_amount(raw_value, decimals: int) -> float:
    if raw_value is None:
        return 0.0
    try:
        return float(raw_value) / (10 ** decimals)
    except (ValueError, OverflowError):
        return 0.0


def trace_ethereum(
    seed_address: str,
    start_time: datetime,
    end_time: datetime,
    max_hops: int = 4,
    project_id: str = "crypto-attribution-506814",
) -> tuple[list[AddressNode], list[TransferEdge]]:
    """
    Breadth-first expansion outward from seed_address, up to max_hops,
    within [start_time, end_time]. Pulls BOTH native ETH transfers and
    ERC-20 token transfers at every hop. Returns deduplicated nodes and
    edges ready to hand to graph/neo4j_client.py for loading.
    """
    client = _bigquery_client(project_id)

    seed_address = seed_address.lower()
    visited_addresses: set[str] = {seed_address}
    nodes_by_address: dict[str, AddressNode] = {
        seed_address: AddressNode(
            chain=Chain.ETHEREUM,
            address=seed_address,
            attribution_tier=AttributionTier.UNKNOWN,
        )
    }
    edges: list[TransferEdge] = []

    current_frontier = [seed_address]

    for hop in range(max_hops):
        if not current_frontier:
            break

        next_frontier: list[str] = []

        for address in current_frontier:
            native_rows = _fetch_native_transfers(client, address, start_time, end_time)
            token_rows = _fetch_token_transfers(client, address, start_time, end_time)

            counterparties_this_address = 0

            # --- native ETH edges ---
            for row in native_rows:
                from_addr = (row["from_address"] or "").lower()
                to_addr = (row["to_address"] or "").lower()
                if not from_addr or not to_addr:
                    continue

                counterparty = to_addr if from_addr == address else from_addr

                edges.append(
                    TransferEdge(
                        chain=Chain.ETHEREUM,
                        tx_hash=row["tx_hash"],
                        from_address=from_addr,
                        to_address=to_addr,
                        asset="ETH",
                        amount=_wei_to_eth(row["value"]),
                        timestamp=row["block_timestamp"],
                        block_number=row["block_number"],
                    )
                )

                for addr in (from_addr, to_addr):
                    if addr not in nodes_by_address:
                        nodes_by_address[addr] = AddressNode(chain=Chain.ETHEREUM, address=addr)

                if (
                    counterparty not in visited_addresses
                    and counterparties_this_address < MAX_COUNTERPARTIES_PER_HOP
                ):
                    visited_addresses.add(counterparty)
                    next_frontier.append(counterparty)
                    counterparties_this_address += 1

            # --- ERC-20 token edges ---
            for row in token_rows:
                from_addr = (row["from_address"] or "").lower()
                to_addr = (row["to_address"] or "").lower()
                if not from_addr or not to_addr:
                    continue

                counterparty = to_addr if from_addr == address else from_addr
                amount = _raw_to_token_amount(row["raw_value"], row["decimals"])

                edges.append(
                    TransferEdge(
                        chain=Chain.ETHEREUM,
                        tx_hash=row["tx_hash"],
                        from_address=from_addr,
                        to_address=to_addr,
                        asset=row["symbol"],
                        amount=amount,
                        timestamp=row["block_timestamp"],
                        block_number=row["block_number"],
                    )
                )

                for addr in (from_addr, to_addr):
                    if addr not in nodes_by_address:
                        nodes_by_address[addr] = AddressNode(chain=Chain.ETHEREUM, address=addr)

                if (
                    counterparty not in visited_addresses
                    and counterparties_this_address < MAX_COUNTERPARTIES_PER_HOP
                ):
                    visited_addresses.add(counterparty)
                    next_frontier.append(counterparty)
                    counterparties_this_address += 1

        current_frontier = next_frontier
        print(f"[ethereum_adapter] hop {hop + 1}/{max_hops}: "
              f"expanded to {len(current_frontier)} new addresses, "
              f"{len(edges)} edges total so far")

    return list(nodes_by_address.values()), edges


if __name__ == "__main__":
    nodes, edges = trace_ethereum(
        seed_address="0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4",
        start_time=datetime(2024, 7, 18),
        end_time=datetime(2024, 8, 18),
        max_hops=3,
    )
    print(f"\nDone. {len(nodes)} nodes, {len(edges)} edges.")

    asset_counts = {}
    for e in edges:
        asset_counts[e.asset] = asset_counts.get(e.asset, 0) + 1
    print(f"Asset breakdown: {asset_counts}")