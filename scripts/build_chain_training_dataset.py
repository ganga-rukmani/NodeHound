"""Build a chain-model table from a real trace JSON and label CSV.

The trace must contain ``nodes`` and ``edges`` in NodeHound's API shape. The
label CSV must contain ``address`` and ``category``. Labels are joined only
after graph features are computed, so label confidence and risk scores cannot
leak into model inputs.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime

import pandas as pd

from graph.schema import AddressNode, Chain, TransferEdge
from scoring.chain_features import feature_columns_for_chain, build_chain_features


POSITIVE = {"sanctioned", "mixer", "scam_heist"}
NEGATIVE = {"exchange", "bridge", "contract_or_token", "verified_exchange_or_entity"}


def build_dataset(trace_path: str, labels_path: str, output_path: str) -> dict:
    with open(trace_path, encoding="utf-8") as handle:
        trace = json.load(handle)
    chain = Chain(trace["nodes"][0]["chain"])
    node_by_address = {
        item["address"]: AddressNode(chain, item["address"])
        for item in trace.get("nodes", [])
    }
    edges = []
    for item in trace.get("edges", []):
        timestamp = item.get("timestamp")
        edges.append(TransferEdge(
            chain, item["tx_hash"], item["from_address"], item["to_address"],
            item.get("asset", chain.value.upper()), float(item.get("amount") or 0),
            amount_usd=item.get("amount_usd"),
            timestamp=datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None) if timestamp else None,
            block_number=item.get("block_number"),
            is_inferred_bridge_edge=bool(item.get("is_inferred_bridge_edge", False)),
            evidence_type=item.get("evidence_type", "direct_observed"),
            edge_confidence=item.get("edge_confidence"),
        ))
    features = build_chain_features(list(node_by_address.values()), edges, trace["seed_address"])
    labels = pd.read_csv(labels_path)
    required = {"address", "category"}
    if not required.issubset(labels.columns):
        raise ValueError("Label CSV must contain address and category columns")
    labels["address"] = labels["address"].astype(str).str.strip().str.lower()
    labels["category"] = labels["category"].astype(str).str.strip().str.lower()
    labels["label"] = labels["category"].map(lambda value: 1 if value in POSITIVE else 0 if value in NEGATIVE else pd.NA)
    labels = labels.dropna(subset=["label"]).drop_duplicates("address")
    features["address"] = features["address"].str.lower()
    result = labels.merge(features, on="address", how="inner")
    columns = ["address", *feature_columns_for_chain(chain.value), "label", "category"]
    result = result[columns]
    if result["label"].nunique() < 2:
        raise ValueError("Trace/labels join does not contain both positive and negative classes")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    result.to_csv(output_path, index=False)
    return {"chain": chain.value, "rows": len(result), "positive": int(result["label"].sum()), "negative": int((result["label"] == 0).sum()), "output": output_path}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("trace")
    parser.add_argument("labels")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(build_dataset(args.trace, args.labels, args.output))