"""
find_bitcoin_trace.py

Selects a Bitcoin evaluation "case" from the Elliptic dataset.

IMPORTANT FRAMING: Elliptic's txIds are anonymized integers, not real
Bitcoin addresses/tx hashes - there is no way to verify these against a
real-world incident like WazirX or Funnull. This script does NOT produce
a "seed address to trace" the way ethereum_adapter/tron_adapter do.
Instead, it selects a real, labeled illicit transaction cluster directly
from the dataset - your Bitcoin case study becomes "here is a real
academic-benchmark illicit cluster, and here's how our system's
clustering/scoring logic would treat it" rather than "here is a
real-world hack we traced." Be upfront about this framing difference if
asked - it's honest, not a weaker claim, since Elliptic IS the standard
peer-reviewed benchmark for exactly this task.

Usage:
    python find_bitcoin_trace.py
Output:
    data/eval_traces/bitcoin_case_candidates.json  (top candidate illicit clusters to review)
"""

import json
import os
from collections import defaultdict

import pandas as pd

ELLIPTIC_DIR = "data/labels/bitcoin"
FEATURES_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_features.csv")
CLASSES_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_classes.csv")
EDGELIST_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_edgelist.csv")

OUTPUT_PATH = "data/eval_traces/bitcoin_case_candidates.json"
TOP_N_CANDIDATES = 5
NEIGHBORHOOD_HOPS = 2


def main():
    for path in (FEATURES_PATH, CLASSES_PATH, EDGELIST_PATH):
        if not os.path.exists(path):
            print(f"[find_bitcoin_trace] MISSING: {path}")
            print("[find_bitcoin_trace] check your actual Elliptic extraction path - "
                  "the folder structure from the Kaggle zip can vary (sometimes nested "
                  "one level deeper). Adjust ELLIPTIC_DIR above to match your real path.")
            return

    print("[find_bitcoin_trace] loading Elliptic dataset...")
    features = pd.read_csv(FEATURES_PATH, header=None)
    features.columns = ["txId", "time_step"] + [f"feat_{i}" for i in range(165)]

    classes = pd.read_csv(CLASSES_PATH)
    classes.columns = ["txId", "class"]

    edges = pd.read_csv(EDGELIST_PATH)
    edges.columns = ["txId1", "txId2"]

    illicit_ids = set(classes[classes["class"] == "1"]["txId"])
    print(f"[find_bitcoin_trace] {len(illicit_ids)} illicit-labeled transactions in the dataset")

    # Build adjacency (undirected, for neighborhood exploration)
    adjacency = defaultdict(set)
    for _, row in edges.iterrows():
        adjacency[row["txId1"]].add(row["txId2"])
        adjacency[row["txId2"]].add(row["txId1"])

    # Rank illicit nodes by degree - most-connected illicit nodes make
    # the most interesting/demoable case studies (a genuine cluster, not
    # an isolated single node).
    illicit_degrees = [(txid, len(adjacency.get(txid, set()))) for txid in illicit_ids]
    illicit_degrees.sort(key=lambda x: x[1], reverse=True)

    candidates = []
    for txid, degree in illicit_degrees[:TOP_N_CANDIDATES]:
        # BFS out NEIGHBORHOOD_HOPS from this seed to build a demoable subgraph
        visited = {txid}
        frontier = {txid}
        for _ in range(NEIGHBORHOOD_HOPS):
            next_frontier = set()
            for node in frontier:
                next_frontier |= adjacency.get(node, set())
            next_frontier -= visited
            visited |= next_frontier
            frontier = next_frontier

        subgraph_classes = classes[classes["txId"].isin(visited)]
        illicit_in_subgraph = (subgraph_classes["class"] == "1").sum()
        licit_in_subgraph = (subgraph_classes["class"] == "2").sum()
        unknown_in_subgraph = (subgraph_classes["class"] == "unknown").sum()

        time_step = features[features["txId"] == txid]["time_step"].values
        time_step = int(time_step[0]) if len(time_step) else None

        candidates.append({
            "seed_txId": int(txid),
            "seed_degree": degree,
            "time_step": time_step,
            "subgraph_size": len(visited),
            "illicit_count": int(illicit_in_subgraph),
            "licit_count": int(licit_in_subgraph),
            "unknown_count": int(unknown_in_subgraph),
            "neighborhood_txIds": [int(t) for t in visited],
        })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(candidates, f, indent=2)

    print(f"\n[find_bitcoin_trace] wrote {len(candidates)} candidates to {OUTPUT_PATH}")
    print("\n[find_bitcoin_trace] === Top candidates ===")
    for c in candidates:
        print(f"  txId {c['seed_txId']}: degree={c['seed_degree']}, "
              f"time_step={c['time_step']}, subgraph_size={c['subgraph_size']}, "
              f"illicit={c['illicit_count']}, licit={c['licit_count']}, "
              f"unknown={c['unknown_count']}")

    print("\n[find_bitcoin_trace] pick one seed_txId above as your Bitcoin case study - "
          "the one with the most illicit_count relative to subgraph_size makes the "
          "clearest demo (a real, dense illicit cluster, not just one flagged node "
          "surrounded by noise).")


if __name__ == "__main__":
    main()