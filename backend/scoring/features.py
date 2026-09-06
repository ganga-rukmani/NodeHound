"""Behavioral Ethereum feature engineering backed by BigQuery.

The features in this module deliberately describe address activity only. They
do not include labels, graph distance, or any other target-derived signal.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

import pandas as pd

try:
	from google.cloud import bigquery
except ImportError:  # pragma: no cover - exercised only without dependencies
	bigquery = None


FEATURE_COLUMNS = [
	"out_tx_count",
	"in_tx_count",
	"out_value_eth",
	"in_value_eth",
	"distinct_senders",
	"distinct_receivers",
	"fan_ratio",
	"token_out_count",
	"token_in_count",
	"distinct_tokens",
	"active_days",
	"tx_velocity",
	"out_in_value_ratio",
]

_ZERO_FEATURES = {column: 0.0 for column in FEATURE_COLUMNS}


def _clean_addresses(addresses: Iterable[str]) -> list[str]:
	"""Return unique, normalized EVM addresses and ignore malformed values."""
	result = []
	seen = set()
	for address in addresses:
		value = str(address or "").strip().lower()
		if len(value) != 42 or not value.startswith("0x"):
			continue
		try:
			int(value[2:], 16)
		except ValueError:
			continue
		if value not in seen:
			seen.add(value)
			result.append(value)
	return result


def _query_features(
	client,
	addresses: list[str],
	start_date: datetime,
	end_date: datetime,
) -> list[dict]:
	query = """
				WITH events AS (
						SELECT LOWER(from_address) AS address, LOWER(to_address) AS counterparty,
									 `hash` AS tx_hash, CAST(value AS FLOAT64) / 1e18 AS value_eth,
									 block_timestamp AS activity_time, 'native' AS asset_type, 'out' AS direction,
									 CAST(NULL AS STRING) AS token_address
						FROM `bigquery-public-data.crypto_ethereum.transactions`
						WHERE block_timestamp BETWEEN @start_date AND @end_date
							AND LOWER(from_address) IN UNNEST(@addresses)
							AND CAST(value AS BIGNUMERIC) > 0
						UNION ALL
						SELECT LOWER(to_address), LOWER(from_address), `hash`, CAST(value AS FLOAT64) / 1e18,
									 block_timestamp, 'native', 'in', CAST(NULL AS STRING)
						FROM `bigquery-public-data.crypto_ethereum.transactions`
						WHERE block_timestamp BETWEEN @start_date AND @end_date
							AND LOWER(to_address) IN UNNEST(@addresses)
							AND CAST(value AS BIGNUMERIC) > 0
						UNION ALL
						SELECT LOWER(from_address), LOWER(to_address), transaction_hash, 0.0,
									 block_timestamp, 'token', 'out', CAST(token_address AS STRING)
						FROM `bigquery-public-data.crypto_ethereum.token_transfers`
						WHERE block_timestamp BETWEEN @start_date AND @end_date
							AND LOWER(from_address) IN UNNEST(@addresses)
						UNION ALL
						SELECT LOWER(to_address), LOWER(from_address), transaction_hash, 0.0,
									 block_timestamp, 'token', 'in', CAST(token_address AS STRING)
						FROM `bigquery-public-data.crypto_ethereum.token_transfers`
						WHERE block_timestamp BETWEEN @start_date AND @end_date
							AND LOWER(to_address) IN UNNEST(@addresses)
				)
		SELECT
			address,
						COUNT(DISTINCT IF(asset_type = 'native' AND direction = 'out', tx_hash, NULL)) AS out_tx_count,
						COUNT(DISTINCT IF(asset_type = 'native' AND direction = 'in', tx_hash, NULL)) AS in_tx_count,
						SUM(IF(asset_type = 'native' AND direction = 'out', value_eth, 0)) AS out_value_eth,
						SUM(IF(asset_type = 'native' AND direction = 'in', value_eth, 0)) AS in_value_eth,
						COUNT(DISTINCT IF(direction = 'in', counterparty, NULL)) AS distinct_senders,
						COUNT(DISTINCT IF(direction = 'out', counterparty, NULL)) AS distinct_receivers,
						COUNT(DISTINCT IF(asset_type = 'token' AND direction = 'out', tx_hash, NULL)) AS token_out_count,
						COUNT(DISTINCT IF(asset_type = 'token' AND direction = 'in', tx_hash, NULL)) AS token_in_count,
						COUNT(DISTINCT IF(asset_type = 'token', token_address, NULL)) AS distinct_tokens,
						COUNT(DISTINCT DATE(activity_time)) AS active_days,
			COUNT(DISTINCT tx_hash) AS total_activity_count
				FROM events
		GROUP BY address
	"""
	config = bigquery.QueryJobConfig(query_parameters=[
		bigquery.ArrayQueryParameter("addresses", "STRING", addresses),
		bigquery.ScalarQueryParameter("start_date", "TIMESTAMP", start_date),
		bigquery.ScalarQueryParameter("end_date", "TIMESTAMP", end_date),
	])
	# Keep this helper replaceable in tests and compatible with BigQuery's Row.
	return [dict(row) for row in client.query(query, job_config=config).result()]


def engineer_features(addresses, start_date: datetime, end_date: datetime, project_id: str) -> pd.DataFrame:
	"""Build the 13 behavioral features for the supplied Ethereum addresses.

	Native transfers are measured in ETH. Token counts include ERC-20 logs,
	while ``distinct_tokens`` counts token contracts. ``fan_ratio`` is
	``distinct_receivers / max(out_tx_count, 1)`` and ``tx_velocity`` is the
	total distinct activity count divided by active calendar days.
	"""
	normalized = _clean_addresses(addresses)
	columns = ["address", *FEATURE_COLUMNS]
	if not normalized:
		return pd.DataFrame(columns=columns)
	if bigquery is None:
		raise RuntimeError("google-cloud-bigquery is required for Ethereum feature engineering")
	if not project_id:
		raise ValueError("project_id is required for Ethereum feature engineering")

	client = bigquery.Client(project=project_id)
	rows = _query_features(client, normalized, start_date, end_date)
	grouped: dict[str, dict] = {address: dict(_ZERO_FEATURES) for address in normalized}
	for row in rows:
		address = str(row.get("address") or "").lower()
		if address not in grouped:
			continue
		target = grouped[address]
		for column in ("out_tx_count", "in_tx_count", "out_value_eth", "in_value_eth", "distinct_senders", "distinct_receivers", "active_days"):
			target[column] += float(row.get(column) or 0)
		target["distinct_tokens"] += float(row.get("distinct_tokens") or 0)
		target["token_out_count"] += float(row.get("token_out_count") or 0)
		target["token_in_count"] += float(row.get("token_in_count") or 0)
		target["_activity"] = target.get("_activity", 0) + float(row.get("total_activity_count") or 0)
	records = []
	for address, values in grouped.items():
		out_count = values["out_tx_count"]
		active_days = values["active_days"]
		values["fan_ratio"] = values["distinct_receivers"] / max(out_count, 1.0)
		values["tx_velocity"] = values.get("_activity", 0.0) / max(active_days, 1.0)
		values["out_in_value_ratio"] = values["out_value_eth"] / max(values["in_value_eth"], 1e-12)
		values.pop("_activity", None)
		records.append({"address": address, **values})
	return pd.DataFrame(records, columns=columns)
