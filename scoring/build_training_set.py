"""
scoring/build_training_set.py

Builds the weakly-supervised training address list for the XGBoost risk
model.

  - ILLICIT (positive, class_label=1): addresses already categorized as
    sanctioned / scam_heist / mixer by the unified label lookup (OFAC +
    GraphSense scam packs + Etherscan phishing/hack tags) - reuses the
    exact same lookup built in graph/label_ethereum_nodes.py, so there is
    one single source of truth for what counts as "known illicit" across
    the whole project.
  - LICIT (negative, class_label=0): addresses categorized as exchange /
    contract_or_token (named legitimate infrastructure), PLUS a random
    sample of generally active Ethereum addresses (the overwhelming
    majority of which are benign given real-world base rates).

IMPORTANT - this is WEAK supervision, not verified ground truth. Some
noise is expected: a random address could theoretically be illicit but
just not caught yet, and a "licit" exchange address could occasionally
process illicit funds without being illicit itself. This is the same
bootstrapping approach real forensic tooling uses before enough confirmed
casework exists - be upfront about this if asked, don't oversell it as
clean ground truth.

Usage:
    python -m scoring.build_training_set
Output:
    scoring/training_addresses.csv  (address, class_label, category, source)
"""

import csv
import os
import random
from datetime import datetime

from google.cloud import bigquery

from graph.label_ethereum_nodes import build_unified_label_lookup

BIGQUERY_PROJECT_ID = "crypto-attribution-506814"  # your real GCP project id
OUTPUT_PATH = "scoring/training_addresses.csv"

ILLICIT_CATEGORIES = {"sanctioned", "scam_heist", "mixer"}
LICIT_CATEGORIES = {"exchange", "contract_or_token"}

RANDOM_BENIGN_SAMPLE_SIZE = 300
RANDOM_SAMPLE_START = datetime(2024, 1, 1)
RANDOM_SAMPLE_END = datetime(2024, 12, 31)


def fetch_random_active_addresses(n: int, project_id: str) -> list[str]:
    """
    Pulls a random sample of addresses that sent a transaction during
    2024 - used as additional weakly-labeled benign examples, since the
    overwhelming majority of all addresses are not illicit. TABLESAMPLE
    keeps this query cheap even against the full transactions table.
    """
    client = bigquery.Client(project=project_id)
    query = """
        SELECT DISTINCT from_address AS address
        FROM `bigquery-public-data.crypto_ethereum.transactions`
        TABLESAMPLE SYSTEM (1 PERCENT)
        WHERE block_timestamp BETWEEN @start_time AND @end_time
          AND from_address IS NOT NULL
        LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", RANDOM_SAMPLE_START),
            bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", RANDOM_SAMPLE_END),
            bigquery.ScalarQueryParameter("limit", "INT64", n),
        ]
    )
    rows = client.query(query, job_config=job_config).result()
    return [r["address"].lower() for r in rows]


def main():
    print("[build_training_set] loading unified label lookup (OFAC + GraphSense + Etherscan)...")
    label_lookup = build_unified_label_lookup()

    illicit_rows = []
    licit_rows = []

    for address, info in label_lookup.items():
        category = info.get("category")
        if category in ILLICIT_CATEGORIES:
            illicit_rows.append((address, category, info["source"]))
        elif category in LICIT_CATEGORIES:
            licit_rows.append((address, category, info["source"]))

    print(f"[build_training_set] {len(illicit_rows)} illicit-labeled addresses "
          f"(categories: {ILLICIT_CATEGORIES})")
    print(f"[build_training_set] {len(licit_rows)} licit-labeled addresses "
          f"(categories: {LICIT_CATEGORIES})")

    print(f"[build_training_set] pulling {RANDOM_BENIGN_SAMPLE_SIZE} random active "
          f"addresses as additional benign examples...")
    random_addresses = fetch_random_active_addresses(RANDOM_BENIGN_SAMPLE_SIZE, BIGQUERY_PROJECT_ID)

    illicit_set = {a for a, *_ in illicit_rows}
    random_addresses = [a for a in random_addresses if a not in illicit_set]
    print(f"[build_training_set] {len(random_addresses)} random benign addresses kept "
          f"(after excluding overlap with illicit set)")

    rows = []
    for address, category, source in illicit_rows:
        rows.append({"address": address, "class_label": 1, "category": category, "source": source})
    for address, category, source in licit_rows:
        rows.append({"address": address, "class_label": 0, "category": category, "source": source})
    for address in random_addresses:
        rows.append({"address": address, "class_label": 0, "category": "random_sample",
                      "source": "bigquery_random_sample"})

    random.shuffle(rows)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["address", "class_label", "category", "source"])
        writer.writeheader()
        writer.writerows(rows)

    pos_count = sum(1 for r in rows if r["class_label"] == 1)
    neg_count = sum(1 for r in rows if r["class_label"] == 0)
    print(f"\n[build_training_set] wrote {len(rows)} training addresses to {OUTPUT_PATH}")
    print(f"[build_training_set] class balance: {pos_count} illicit (1), {neg_count} licit (0)")
    if pos_count < 50:
        print(f"[build_training_set] NOTE: only {pos_count} illicit examples - this is a "
              f"small positive class for training. Expected given real sanctioned/scam "
              f"address coverage is inherently limited; the model will still learn real "
              f"signal, just be honest about this sample size if asked.")


if __name__ == "__main__":
    main()