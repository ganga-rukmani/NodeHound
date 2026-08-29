"""
data/labels/tron/categorize_tron_labels.py

Post-processes tron_labels_master.csv to fill in real category values
based on keyword matching against the label text, replacing the
generic "unknown" placeholder that was written for every row.

Usage:
    python categorize_tron_labels.py
"""

import csv

EXCHANGE_KEYWORDS = ["binance", "bitfinex", "okx", "bybit", "kraken",
                     "coinbase", "kucoin", "bitget", "gate", "mxc"]
TOKEN_CONTRACT_KEYWORDS = ["tethertoken", "usdt", "usdc"]
TREASURY_KEYWORDS = ["treasury"]


def categorize(label: str, existing_category: str) -> str:
    # Don't overwrite a category that's already meaningful
    # (e.g. "sanctioned" from the OFAC source)
    if existing_category and existing_category.lower() not in ("", "unknown"):
        return existing_category

    label_lower = (label or "").lower()

    if any(k in label_lower for k in TREASURY_KEYWORDS):
        return "treasury"
    if any(k in label_lower for k in TOKEN_CONTRACT_KEYWORDS):
        return "token_contract"
    if any(k in label_lower for k in EXCHANGE_KEYWORDS):
        return "exchange"

    return "unknown"  # genuinely unclassifiable, left as-is honestly


def main():
    with open("tron_labels_master.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    changed = 0
    for row in rows:
        new_category = categorize(row.get("label", ""), row.get("category", ""))
        if new_category != row.get("category"):
            changed += 1
        row["category"] = new_category

    with open("tron_labels_master.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["address", "label", "category", "source"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Recategorized {changed} of {len(rows)} rows in tron_labels_master.csv")


if __name__ == "__main__":
    main()