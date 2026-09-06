"""Build an Ethereum behavioral training table from real labels and BigQuery.

Unknown or ambiguous labels are excluded instead of being turned into
synthetic negatives. Label provenance is retained in the output.
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime

import pandas as pd

from scoring.features import FEATURE_COLUMNS, engineer_features


MALICIOUS_CATEGORIES = {"sanctioned", "mixer", "scam_heist"}
BENIGN_CATEGORIES = {"exchange", "bridge", "contract_or_token", "verified_exchange_or_entity"}


def _label_rows(labels: pd.DataFrame) -> pd.DataFrame:
    labels = labels.copy()
    labels["category"] = labels["category"].fillna("unknown").str.strip().str.lower()
    labels["label"] = labels["category"].map(
        lambda category: 1 if category in MALICIOUS_CATEGORIES else 0 if category in BENIGN_CATEGORIES else pd.NA
    )
    labels = labels.dropna(subset=["label", "address"])
    labels["address"] = labels["address"].str.strip().str.lower()
    labels = labels[labels["address"].str.match(r"^0x[0-9a-f]{40}$", na=False)]
    return labels.drop_duplicates("address")


def build_training_dataset(labels_path: str, project_id: str, start: datetime, end: datetime, output_path: str) -> dict:
    labels = _label_rows(pd.read_csv(labels_path))
    features = engineer_features(labels["address"].tolist(), start, end, project_id)
    result = labels[["address", "label", "label_source", "source_type", "label_confidence", "label_timestamp"]].merge(features, on="address", how="inner")
    if result["label"].nunique() < 2:
        raise ValueError("Prepared data does not contain both positive and negative labels")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    result.to_csv(output_path, index=False)
    return {"rows": len(result), "positive": int(result["label"].sum()), "negative": int((result["label"] == 0).sum()), "output": output_path}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", default="data/labels/ethereum/ethereum_labels_master.csv")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--start", default="2020-01-01")
    parser.add_argument("--end", default="2024-12-31")
    parser.add_argument("--output", default="data/training/ethereum_behavioral.csv")
    args = parser.parse_args()
    print(build_training_dataset(args.labels, args.project_id, datetime.fromisoformat(args.start), datetime.fromisoformat(args.end), args.output))