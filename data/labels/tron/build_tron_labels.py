"""
build_tron_labels.py

Builds a labeled Tron address dataset (address, label, category, source)
using Tronscan's public API — verified field names as of Aug 2026.

Two data sources combined:
1. Top USDT-TRC20 holders (many are exchange/entity wallets, already tagged)
2. A small seed list of well-known Tron addresses, double-checked individually

No API key required — these are public Tronscan endpoints.
"""

import requests
import csv
import time

OUTPUT_FILE = "tron_labels.csv"
USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

# ---------------------------------------------------------------------------
# Source 1: Top USDT-TRC20 holders (bulk, verified field names)
# ---------------------------------------------------------------------------
def fetch_top_usdt_holders(total_to_check=1000, page_size=50):
    """
    Pulls top USDT holders from Tronscan, paginating since the API caps
    each request at 50 results regardless of the 'limit' param (confirmed
    Aug 2026: 'total' reports up to 10,000 holders, but max 50 returned
    per call).

    Confirmed fields per holder entry:
      - holder_address
      - addressTag   (plain text label, e.g. "Tether Treasury")
      - balance

    Returns only entries where addressTag is non-empty.
    total_to_check controls how many holders (across all pages) get
    checked in total, not how many labeled ones you'll get back.
    """
    url = "https://apilist.tronscanapi.com/api/token_trc20/holders"
    results = []
    start = 0

    while start < total_to_check:
        params = {
            "contract_address": USDT_CONTRACT,
            "limit": page_size,
            "start": start
        }
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            holders = data.get("trc20_tokens", [])

            if not holders:
                # no more results to page through
                break

            for h in holders:
                tag = (h.get("addressTag") or "").strip()
                address = h.get("holder_address", "")
                if tag and address:
                    results.append({
                        "address": address,
                        "label": tag,
                        "category": "unknown",
                        "source": "tronscan_top_holders"
                    })

        except requests.RequestException as e:
            print(f"[warn] Failed to fetch holders at start={start}: {e}")
            break

        print(f"  checked holders {start}-{start + page_size} "
              f"({len(results)} labeled so far)")
        start += page_size
        time.sleep(0.3)  # be polite to the API between pages

    return results


# ---------------------------------------------------------------------------
# Source 2: Manually seeded known addresses, checked individually
# Double-check any of these on tronscan.org before fully trusting them.
# ---------------------------------------------------------------------------
SEED_ADDRESSES = [
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",   # USDT contract itself
    "TXFBqBbqJommqZf7BV8NNYzePh97UmJodJ",   # confirmed Bitfinex via blueTagUrl
    # Add more known exchange/entity addresses here as you verify them
]

def fetch_account_tag(address):
    """
    Checks a single address against Tronscan's account endpoint.
    Confirmed fields (Aug 2026):
      - name           (populated for contracts/tokens, e.g. "TetherToken")
      - blueTagUrl     (populated for verified entities; label is the
                        image filename, e.g. .../Bitfinex.png -> "Bitfinex")
    """
    url = "https://apilist.tronscanapi.com/api/account"
    try:
        resp = requests.get(url, params={"address": address}, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        name = (data.get("name") or "").strip()
        blue_tag_url = (data.get("blueTagUrl") or "").strip()

        label = None
        if blue_tag_url:
            # extract filename without extension, e.g. ".../Bitfinex.png" -> "Bitfinex"
            filename = blue_tag_url.rstrip("/").split("/")[-1]
            label = filename.rsplit(".", 1)[0]
        elif name:
            label = name

        if label:
            return {
                "address": address,
                "label": label,
                "category": "unknown",
                "source": "tronscan_account"
            }
    except requests.RequestException as e:
        print(f"[warn] Failed to fetch account tag for {address}: {e}")
    return None


def main():
    all_rows = []

    print("Fetching top USDT holders (paginated)...")
    holder_rows = fetch_top_usdt_holders(total_to_check=1000, page_size=50)
    print(f"  -> {len(holder_rows)} labeled holders found")
    all_rows.extend(holder_rows)

    print("Checking seed addresses...")
    for addr in SEED_ADDRESSES:
        row = fetch_account_tag(addr)
        if row:
            all_rows.append(row)
        time.sleep(0.3)  # be polite to the API

    # de-duplicate by address
    seen = set()
    deduped = []
    for row in all_rows:
        if row["address"] not in seen:
            seen.add(row["address"])
            deduped.append(row)

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["address", "label", "category", "source"])
        writer.writeheader()
        writer.writerows(deduped)

    print(f"\nDone. {len(deduped)} labeled Tron addresses written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()