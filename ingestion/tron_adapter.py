"""
ingestion/tron_adapter.py

Pulls a BOUNDED slice of Tron activity via TronGrid's public API, starting
from a seed address, converted into the unified AddressNode / TransferEdge
shape (graph/schema.py).

DESIGN NOTE - TRC20 (USDT) is the PRIMARY source, not an afterthought:
your own earlier research established that real-world Tron laundering
overwhelmingly moves through USDT-TRC20, not native TRX (FATF/industry
reports flag Tron/USDT as the dominant rail for pig-butchering scam
proceeds). The TRC20 endpoint also conveniently returns addresses already
in base58 ("T...") format and decoded amounts - matching everything else
in this project with no extra conversion needed.

Native TRX is included as a SECONDARY, best-effort source: TronGrid's
native transaction endpoint returns addresses in raw HEX format (prefixed
"41"), which needs base58check conversion to match your address format
everywhere else. This conversion is implemented but UNTESTED against
live data - flag any address-format mismatches back for debugging,
same pattern as the BigQuery/Tronscan fixes earlier.

Usage:
    from datetime import datetime
    from ingestion.tron_adapter import trace_tron

    nodes, edges = trace_tron(
        seed_address="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        start_time=datetime(2024, 7, 18),
        end_time=datetime(2024, 8, 18),
        max_hops=3,
        api_key="YOUR_TRONGRID_KEY",
    )
"""

import base64
from datetime import datetime

import requests

try:
    import base58
except ImportError:
    base58 = None  # only needed for native TRX hex->base58 conversion

from graph.schema import AddressNode, TransferEdge, Chain, AttributionTier

TRONGRID_BASE_URL = "https://api.trongrid.io"

MAX_COUNTERPARTIES_PER_HOP = 25
ROWS_PER_QUERY = MAX_COUNTERPARTIES_PER_HOP * 2


def _hex_to_base58(hex_address: str) -> str | None:
    """
    Converts TronGrid's raw hex address format (e.g. "41abc123...") to
    the standard base58 "T..." format used everywhere else in this
    project. UNTESTED against live data - if addresses look wrong after
    running this, this function is the first place to check.
    """
    if not hex_address or base58 is None:
        return None
    try:
        raw_bytes = bytes.fromhex(hex_address)
        return base58.b58encode_check(raw_bytes).decode("utf-8")
    except Exception:
        return None


def _sun_to_trx(value_sun) -> float:
    """1 TRX = 1,000,000 SUN."""
    if value_sun is None:
        return 0.0
    return float(value_sun) / 1_000_000


def _fetch_trc20_transfers(
    address: str,
    start_time: datetime,
    end_time: datetime,
    api_key: str,
    limit: int = ROWS_PER_QUERY,
) -> list[dict]:
    """
    PRIMARY source. Returns already-decoded, base58-formatted TRC20
    transfers - no address/amount conversion needed on our side.
    """
    url = f"{TRONGRID_BASE_URL}/v1/accounts/{address}/transactions/trc20"
    params = {
        "limit": limit,
        "min_timestamp": int(start_time.timestamp() * 1000),
        "max_timestamp": int(end_time.timestamp() * 1000),
    }
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        print(f"[tron_adapter] TRC20 fetch failed for {address}: {e}")
        return []


def _fetch_native_transfers(
    address: str,
    start_time: datetime,
    end_time: datetime,
    api_key: str,
    limit: int = ROWS_PER_QUERY,
) -> list[dict]:
    """
    SECONDARY, best-effort source. Native TRX transfers - addresses come
    back in hex format inside raw_data.contract[].parameter.value, need
    conversion via _hex_to_base58(). If this consistently returns
    malformed addresses, it's safe to disable this function's results
    and rely on TRC20 alone (still captures the primary real-world signal).
    """
    url = f"{TRONGRID_BASE_URL}/v1/accounts/{address}/transactions"
    params = {
        "limit": limit,
        "min_timestamp": int(start_time.timestamp() * 1000),
        "max_timestamp": int(end_time.timestamp() * 1000),
        "only_confirmed": "true",
    }
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        print(f"[tron_adapter] native fetch failed for {address}: {e}")
        return []


def _parse_native_tx(raw_tx: dict) -> dict | None:
    """
    Extracts from/to/amount from a raw TronGrid native transaction. Only
    handles simple TransferContract type - skips other contract types
    (smart contract calls, etc.) since those don't represent a plain
    value transfer.
    """
    try:
        contract = raw_tx["raw_data"]["contract"][0]
        if contract.get("type") != "TransferContract":
            return None
        value = contract["parameter"]["value"]
        from_hex = value.get("owner_address")
        to_hex = value.get("to_address")
        amount_sun = value.get("amount")

        from_addr = _hex_to_base58(from_hex)
        to_addr = _hex_to_base58(to_hex)
        if not from_addr or not to_addr:
            return None

        return {
            "tx_hash": raw_tx.get("txID"),
            "from_address": from_addr,
            "to_address": to_addr,
            "amount": _sun_to_trx(amount_sun),
            "timestamp": raw_tx.get("raw_data", {}).get("timestamp"),
        }
    except (KeyError, IndexError, TypeError):
        return None


def trace_tron(
    seed_address: str,
    start_time: datetime,
    end_time: datetime,
    max_hops: int = 3,
    api_key: str = "",
) -> tuple[list[AddressNode], list[TransferEdge]]:
    """
    Breadth-first expansion outward from seed_address, up to max_hops,
    within [start_time, end_time]. Pulls TRC20 (primary) and native TRX
    (secondary, best-effort) transfers at every hop.
    """
    visited_addresses: set[str] = {seed_address}
    nodes_by_address: dict[str, AddressNode] = {
        seed_address: AddressNode(
            chain=Chain.TRON,
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
            counterparties_this_address = 0

            # --- TRC20 (primary) ---
            trc20_rows = _fetch_trc20_transfers(address, start_time, end_time, api_key)
            for row in trc20_rows:
                from_addr = row.get("from")
                to_addr = row.get("to")
                if not from_addr or not to_addr:
                    continue

                token_info = row.get("token_info", {})
                symbol = token_info.get("symbol", "UNKNOWN_TRC20")
                decimals = token_info.get("decimals", 6)
                try:
                    amount = float(row.get("value", 0)) / (10 ** int(decimals))
                except (ValueError, TypeError):
                    amount = 0.0

                counterparty = to_addr if from_addr == address else from_addr

                edges.append(
                    TransferEdge(
                        chain=Chain.TRON,
                        tx_hash=row.get("transaction_id", ""),
                        from_address=from_addr,
                        to_address=to_addr,
                        asset=symbol,
                        amount=amount,
                        timestamp=datetime.fromtimestamp(row["block_timestamp"] / 1000)
                        if row.get("block_timestamp") else None,
                    )
                )

                for addr in (from_addr, to_addr):
                    if addr not in nodes_by_address:
                        nodes_by_address[addr] = AddressNode(chain=Chain.TRON, address=addr)

                if (
                    counterparty not in visited_addresses
                    and counterparties_this_address < MAX_COUNTERPARTIES_PER_HOP
                ):
                    visited_addresses.add(counterparty)
                    next_frontier.append(counterparty)
                    counterparties_this_address += 1

            # --- native TRX (secondary, best-effort) ---
            native_rows = _fetch_native_transfers(address, start_time, end_time, api_key)
            for raw_tx in native_rows:
                parsed = _parse_native_tx(raw_tx)
                if not parsed:
                    continue

                from_addr, to_addr = parsed["from_address"], parsed["to_address"]
                counterparty = to_addr if from_addr == address else from_addr

                edges.append(
                    TransferEdge(
                        chain=Chain.TRON,
                        tx_hash=parsed["tx_hash"],
                        from_address=from_addr,
                        to_address=to_addr,
                        asset="TRX",
                        amount=parsed["amount"],
                        timestamp=datetime.fromtimestamp(parsed["timestamp"] / 1000)
                        if parsed.get("timestamp") else None,
                    )
                )

                for addr in (from_addr, to_addr):
                    if addr not in nodes_by_address:
                        nodes_by_address[addr] = AddressNode(chain=Chain.TRON, address=addr)

                if (
                    counterparty not in visited_addresses
                    and counterparties_this_address < MAX_COUNTERPARTIES_PER_HOP
                ):
                    visited_addresses.add(counterparty)
                    next_frontier.append(counterparty)
                    counterparties_this_address += 1

        current_frontier = next_frontier
        print(f"[tron_adapter] hop {hop + 1}/{max_hops}: "
              f"expanded to {len(current_frontier)} new addresses, "
              f"{len(edges)} edges total so far")

    return list(nodes_by_address.values()), edges


if __name__ == "__main__":
    # Manual smoke test - swap in a real API key and a Tron address with
    # known recent activity before running.
    TRONGRID_API_KEY = "YOUR_TRONGRID_KEY_HERE"
    nodes, edges = trace_tron(
        seed_address="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        start_time=datetime(2024, 6, 1),
        end_time=datetime(2024, 8, 31),
        max_hops=2,
        api_key=TRONGRID_API_KEY,
    )
    print(f"\nDone. {len(nodes)} nodes, {len(edges)} edges.")
    asset_counts = {}
    for e in edges:
        asset_counts[e.asset] = asset_counts.get(e.asset, 0) + 1
    print(f"Asset breakdown: {asset_counts}")