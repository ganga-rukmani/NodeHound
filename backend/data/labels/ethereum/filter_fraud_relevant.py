"""
filter_fraud_relevant.py

Splits ethereum_labels_master.csv into two files:
  1. ethereum_labels_fraud_relevant.csv — addresses tagged scam, phishing,
     sanctioned, or containing fraud-relevant keywords (mixer, hack, exploit,
     heist, ransomware, etc.)
  2. ethereum_labels_other.csv — everything else (DeFi protocols, token
     metadata, housekeeping tags like "take-action" or "old-contract")

Run this from inside data/labels/ethereum/, after merge_ethereum_labels.py
has already produced ethereum_labels_master.csv.
"""

import csv

INPUT_FILE = "ethereum_labels_master.csv"
FRAUD_OUTPUT = "ethereum_labels_fraud_relevant.csv"
OTHER_OUTPUT = "ethereum_labels_other.csv"

# Keywords checked against the 'category' field (comma-joined labels list
# from Etherscan, or the 'abuse' field from GraphSense). Checked as
# substrings, case-insensitive, so "phishing" also catches entries like
# "phishing, scam".
FRAUD_KEYWORDS = [
    "scam",
    "phishing",
    "sanctioned",
    "mixer",
    "hack",
    "exploit",
    "heist",
    "ransomware",
    "fraud",
    "theft",
    "stolen",
    "malware",
    "darknet",
    "terrorism",
]


def is_fraud_relevant(category: str) -> bool:
    category_lower = category.lower()
    return any(keyword in category_lower for keyword in FRAUD_KEYWORDS)


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    fraud_rows = []
    other_rows = []

    for row in rows:
        if is_fraud_relevant(row["category"]):
            fraud_rows.append(row)
        else:
            other_rows.append(row)

    fieldnames = ["address", "label", "category", "source"]

    with open(FRAUD_OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(fraud_rows)

    with open(OTHER_OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(other_rows)

    print(f"Total rows processed: {len(rows)}")
    print(f"Fraud-relevant: {len(fraud_rows)} -> {FRAUD_OUTPUT}")
    print(f"Other (DeFi/metadata/housekeeping): {len(other_rows)} -> {OTHER_OUTPUT}")


if __name__ == "__main__":
    main()