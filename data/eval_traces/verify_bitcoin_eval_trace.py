"""
verify_bitcoin_eval_trace.py (corrected)

Uses the exact same query pattern as ingestion/bitcoin_adapter.py
(addresses[SAFE_OFFSET(0)]) instead of a guessed field name, since that
adapter's structure is already proven working in your codebase.

Case: WannaCry ransomware (May 2017) - real, publicly documented Bitcoin
addresses, safe replacement for Elliptic (which cannot be live-traced
since it uses anonymized txIds).
"""

from datetime import datetime
from google.cloud import bigquery

PROJECT_ID = "crypto-attribution-506814"

WANNACRY_ADDRESSES = [
    "115p7UMMngoj1pMvkpHijcRdfJNXj6LrLn",
    "12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw",
    "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94",
]


def verify_address_has_activity(client: bigquery.Client, address: str):
    query = """
        SELECT
            `hash` AS tx_hash,
            block_timestamp,
            ARRAY_LENGTH(inputs) AS input_count,
            ARRAY_LENGTH(outputs) AS output_count
        FROM `bigquery-public-data.crypto_bitcoin.transactions`
        WHERE (
            EXISTS(SELECT 1 FROM UNNEST(inputs) AS i WHERE i.addresses[SAFE_OFFSET(0)] = @address)
            OR
            EXISTS(SELECT 1 FROM UNNEST(outputs) AS o WHERE o.addresses[SAFE_OFFSET(0)] = @address)
        )
        ORDER BY block_timestamp ASC
        LIMIT 5
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("address", "STRING", address)]
    )
    return list(client.query(query, job_config=job_config).result())


def main():
    client = bigquery.Client(project=PROJECT_ID)

    for address in WANNACRY_ADDRESSES:
        print(f"\nChecking {address} ...")
        try:
            rows = verify_address_has_activity(client, address)
            if not rows:
                print("  [warn] No transactions found.")
                continue
            print(f"  -> {len(rows)} early transactions found:")
            for row in rows:
                print(f"     tx={row['tx_hash'][:16]}...  "
                      f"time={row['block_timestamp']}  "
                      f"inputs={row['input_count']}  outputs={row['output_count']}")
        except Exception as e:
            print(f"  [error] Query failed: {e}")

    print("\nIf confirmed, use any of these three addresses as your seed_address "
          "in a /trace request with chain='bitcoin'.")


if __name__ == "__main__":
    main()