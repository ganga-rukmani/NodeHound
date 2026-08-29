"""
scoring/features.py

Engineers behavioral graph features per address directly from BigQuery -
this works for ANY address list (training addresses OR a live trace's
nodes), which is what lets the same feature logic be reused both to train
the model and to score new traces later.

Features (deliberately mirror the kind of signal real forensic tools and
academic graph-ML papers use - degree, velocity, counterparty diversity,
concentration - NOT arbitrary hand-picked weights):
  - out_tx_count, in_tx_count       : native ETH transaction counts
  - out_value_eth, in_value_eth      : native ETH value moved
  - distinct_senders, distinct_receivers : counterparty diversity (fan-in/fan-out)
  - token_out_count, token_in_count  : ERC-20 transfer counts
  - distinct_tokens                  : how many different tokens touched this address
  - active_days                      : span between first and last activity
  - tx_velocity                      : total_tx_count / (active_days + 1)
  - out_in_value_ratio               : outflow vs inflow concentration
  - fan_ratio                        : distinct_receivers / (distinct_senders + 1)

Usage:
    from scoring.features import engineer_features
    df = engineer_features(["0xabc...", "0xdef..."], start_time, end_time, project_id)
"""

from datetime import datetime

import pandas as pd
from google.cloud import bigquery

FEATURE_COLUMNS = [
    "out_tx_count", "in_tx_count", "out_value_eth", "in_value_eth",
    "distinct_senders", "distinct_receivers", "token_out_count",
    "token_in_count", "distinct_tokens", "active_days", "tx_velocity",
    "out_in_value_ratio", "fan_ratio",
]

FEATURES_QUERY = """
    WITH addr AS (
      SELECT address FROM UNNEST(@addresses) AS address
    ),
    native_out AS (
      SELECT from_address AS address,
             COUNT(*) AS out_tx_count,
             SUM(value) / 1e18 AS out_value_eth,
             COUNT(DISTINCT to_address) AS distinct_receivers,
             MIN(block_timestamp) AS first_out_ts,
             MAX(block_timestamp) AS last_out_ts
      FROM `bigquery-public-data.crypto_ethereum.transactions`
      WHERE from_address IN UNNEST(@addresses)
        AND block_timestamp BETWEEN @start_time AND @end_time
      GROUP BY from_address
    ),
    native_in AS (
      SELECT to_address AS address,
             COUNT(*) AS in_tx_count,
             SUM(value) / 1e18 AS in_value_eth,
             COUNT(DISTINCT from_address) AS distinct_senders,
             MIN(block_timestamp) AS first_in_ts,
             MAX(block_timestamp) AS last_in_ts
      FROM `bigquery-public-data.crypto_ethereum.transactions`
      WHERE to_address IN UNNEST(@addresses)
        AND block_timestamp BETWEEN @start_time AND @end_time
      GROUP BY to_address
    ),
    token_out AS (
      SELECT from_address AS address,
             COUNT(*) AS token_out_count,
             COUNT(DISTINCT token_address) AS distinct_tokens_out
      FROM `bigquery-public-data.crypto_ethereum.token_transfers`
      WHERE from_address IN UNNEST(@addresses)
        AND block_timestamp BETWEEN @start_time AND @end_time
      GROUP BY from_address
    ),
    token_in AS (
      SELECT to_address AS address,
             COUNT(*) AS token_in_count,
             COUNT(DISTINCT token_address) AS distinct_tokens_in
      FROM `bigquery-public-data.crypto_ethereum.token_transfers`
      WHERE to_address IN UNNEST(@addresses)
        AND block_timestamp BETWEEN @start_time AND @end_time
      GROUP BY to_address
    )
    SELECT
      addr.address,
      COALESCE(native_out.out_tx_count, 0) AS out_tx_count,
      COALESCE(native_in.in_tx_count, 0) AS in_tx_count,
      COALESCE(native_out.out_value_eth, 0.0) AS out_value_eth,
      COALESCE(native_in.in_value_eth, 0.0) AS in_value_eth,
      COALESCE(native_in.distinct_senders, 0) AS distinct_senders,
      COALESCE(native_out.distinct_receivers, 0) AS distinct_receivers,
      COALESCE(token_out.token_out_count, 0) AS token_out_count,
      COALESCE(token_in.token_in_count, 0) AS token_in_count,
      COALESCE(token_out.distinct_tokens_out, 0) + COALESCE(token_in.distinct_tokens_in, 0) AS distinct_tokens,
      LEAST(
        IFNULL(native_out.first_out_ts, TIMESTAMP('2100-01-01')),
        IFNULL(native_in.first_in_ts, TIMESTAMP('2100-01-01'))
      ) AS first_seen,
      GREATEST(
        IFNULL(native_out.last_out_ts, TIMESTAMP('1970-01-01')),
        IFNULL(native_in.last_in_ts, TIMESTAMP('1970-01-01'))
      ) AS last_seen
    FROM addr
    LEFT JOIN native_out ON addr.address = native_out.address
    LEFT JOIN native_in ON addr.address = native_in.address
    LEFT JOIN token_out ON addr.address = token_out.address
    LEFT JOIN token_in ON addr.address = token_in.address
"""


def engineer_features(
    addresses: list[str],
    start_time: datetime,
    end_time: datetime,
    project_id: str,
) -> pd.DataFrame:
    """
    Returns a DataFrame with one row per address and the derived feature
    columns in FEATURE_COLUMNS, ready to hand to the XGBoost model
    (training or inference).

    NOTE: BigQuery ARRAY parameters have a practical size limit - keep
    `addresses` to a few thousand at most per call. For larger sets,
    chunk the address list and concatenate the resulting DataFrames.
    """
    client = bigquery.Client(project=project_id)

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("addresses", "STRING", [a.lower() for a in addresses]),
            bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time),
            bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", end_time),
        ]
    )
    rows = [dict(r) for r in client.query(FEATURES_QUERY, job_config=job_config).result()]
    df = pd.DataFrame(rows)

    if df.empty:
        # Return an empty frame with the right columns rather than crashing
        # downstream code that expects these columns to exist.
        return pd.DataFrame(columns=["address"] + FEATURE_COLUMNS)

    # BigQuery NUMERIC/BIGNUMERIC columns (out_value_eth, in_value_eth come
    # from SUM(value)/1e18 on a NUMERIC column) come back as Python
    # decimal.Decimal objects, not plain floats. Mixing Decimal and float
    # in pandas arithmetic raises a TypeError, so force everything numeric
    # to float immediately, before any derived-feature math happens.
    numeric_cols = [
        "out_tx_count", "in_tx_count", "out_value_eth", "in_value_eth",
        "distinct_senders", "distinct_receivers", "token_out_count",
        "token_in_count", "distinct_tokens",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(float).fillna(0.0)

    # Derived features computed in pandas (simpler than more SQL nesting)
    df["first_seen"] = pd.to_datetime(df["first_seen"])
    df["last_seen"] = pd.to_datetime(df["last_seen"])

    # Addresses with zero activity in the window get a sane default rather
    # than a nonsensical huge active_days value from the 1970/2100 sentinels.
    no_activity_mask = (df["out_tx_count"] + df["in_tx_count"] + df["token_out_count"] + df["token_in_count"]) == 0
    df.loc[no_activity_mask, ["first_seen", "last_seen"]] = pd.NaT

    df["active_days"] = (df["last_seen"] - df["first_seen"]).dt.days.fillna(0).clip(lower=0)

    total_tx = df["out_tx_count"] + df["in_tx_count"] + df["token_out_count"] + df["token_in_count"]
    df["tx_velocity"] = total_tx / (df["active_days"] + 1)

    df["out_in_value_ratio"] = df["out_value_eth"] / (df["in_value_eth"] + 1e-6)
    df["fan_ratio"] = df["distinct_receivers"] / (df["distinct_senders"] + 1)

    return df[["address"] + FEATURE_COLUMNS]


if __name__ == "__main__":
    # Quick manual smoke test on a couple of well-known addresses.
    test_addresses = [
        "0xdac17f958d2ee523a2206206994597c13d831ec7",  # Tether USD contract
        "0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4",  # WazirX compromised wallet
    ]
    df = engineer_features(
        test_addresses,
        start_time=datetime(2024, 1, 1),
        end_time=datetime(2024, 12, 31),
        project_id="crypto-attribution-506814",
    )
    print(df.to_string())