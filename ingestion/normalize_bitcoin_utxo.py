"""
normalize_bitcoin_utxo.py

Converts Bitcoin's UTXO transaction structure (many inputs, many outputs
per transaction) into simple address -> address edges, matching the shape
your Ethereum and Tron adapters already produce. This means your Neo4j
loader, frontend graph rendering, and intermediary-wallet-flagging logic
can all treat Bitcoin edges identically to the other two chains — no
special-casing needed downstream.

Method: for each transaction, pair every input address with every output
address, splitting the transaction's total output value proportionally.
This is a standard simplification used in blockchain forensics tooling
(it overstates precision on multi-party transactions, which is an honest,
stateable limitation — not a bug).

A hard cap on pairwise edges per transaction avoids the edge-explosion
problem on large consolidation/batch transactions (same 400-edge cap
already applied in bitcoin_adapter.py — kept consistent here).

Usage:
    from normalize_bitcoin_utxo import normalize_transaction

    edges = normalize_transaction(raw_bq_row)
    # edges is a list of dicts shaped like:
    # {"from_address": ..., "to_address": ..., "amount": ..., "tx_hash": ...,
    #  "timestamp": ..., "chain": "bitcoin", "asset": "BTC"}
"""

MAX_EDGES_PER_TX = 400  # same cap used in bitcoin_adapter.py


def _extract_addresses(entries, address_field="pubkey_base58"):
    """
    Pulls (address, value) pairs out of a raw inputs/outputs array.
    NOTE: address_field name is unverified against your live BigQuery
    schema — confirm this matches what your bitcoin_adapter.py actually
    uses before trusting output. If your adapter already parses these
    successfully, copy the field name it uses here instead of this guess.
    """
    result = []
    for entry in entries or []:
        address = entry.get(address_field)
        value = entry.get("value", 0)
        if address:
            result.append((address, value))
    return result


def normalize_transaction(raw_tx: dict) -> list[dict]:
    """
    raw_tx is expected to be one row from the Bitcoin BigQuery transactions
    table, with 'inputs' and 'outputs' as nested arrays (as seen when you
    inspected the schema earlier: repeated STRUCT fields).
    """
    tx_hash = raw_tx.get("hash")
    timestamp = raw_tx.get("block_timestamp")

    inputs = _extract_addresses(raw_tx.get("inputs"))
    outputs = _extract_addresses(raw_tx.get("outputs"))

    if not inputs or not outputs:
        return []

    total_output_value = sum(v for _, v in outputs) or 1  # avoid div-by-zero

    edges = []
    edge_count = 0

    for in_address, in_value in inputs:
        for out_address, out_value in outputs:
            if edge_count >= MAX_EDGES_PER_TX:
                break
            if in_address == out_address:
                continue  # skip self-transfers (change addresses back to sender)

            # proportional value split — an approximation, stated as such
            proportional_amount = in_value * (out_value / total_output_value)

            edges.append({
                "from_address": in_address,
                "to_address": out_address,
                "amount": proportional_amount,
                "tx_hash": tx_hash,
                "timestamp": timestamp,
                "chain": "bitcoin",
                "asset": "BTC",
                "approximate": True,  # flag so the frontend/report can show
                                       # "value is estimated" for UTXO edges
            })
            edge_count += 1
        if edge_count >= MAX_EDGES_PER_TX:
            break

    return edges


if __name__ == "__main__":
    # Quick smoke test with a fabricated transaction shape
    sample_tx = {
        "hash": "abc123",
        "block_timestamp": "2024-01-01T00:00:00Z",
        "inputs": [{"pubkey_base58": "1SenderAddress", "value": 100}],
        "outputs": [
            {"pubkey_base58": "1ReceiverA", "value": 60},
            {"pubkey_base58": "1ReceiverB", "value": 40},
        ],
    }
    for edge in normalize_transaction(sample_tx):
        print(edge)