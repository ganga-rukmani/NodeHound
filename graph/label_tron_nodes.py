"""
graph/label_tron_nodes.py

Mirrors graph/label_ethereum_nodes.py, but simpler - Tron has one label
source (tron_labels.csv, built earlier via the Tronscan account-tag
script), not three to merge.

Usage:
    python -m graph.label_tron_nodes
"""

import csv
import os

from graph.neo4j_client import Neo4jClient
from graph.schema import AttributionTier

TRON_LABELS_CSV = "data/labels/tron/tron_labels_master.csv"

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"


def load_tron_labels(path: str) -> dict:
    if not os.path.exists(path):
        print(f"[label_tron_nodes] WARNING: {path} not found - run the Tron label "
              f"builder script first (build_tron_labels.py)")
        return {}

    lookup = {}
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            address = row.get("address", "").strip()
            if not address:
                continue
            lookup[address] = {
                "label": row.get("label", ""),
                "category": row.get("category", "unknown"),
                "source": row.get("source", "tronscan_account_api"),
            }
    print(f"[label_tron_nodes] loaded {len(lookup)} Tron labels")
    return lookup


def apply_labels_to_neo4j(label_lookup: dict):
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[label_tron_nodes] could not connect to Neo4j")
        return

    with client.driver.session() as session:
        existing_addresses = [
            r["address"] for r in session.run(
                "MATCH (a:Address {chain: 'tron'}) RETURN a.address AS address"
            )
        ]

    print(f"[label_tron_nodes] checking {len(existing_addresses)} graph addresses "
          f"against label lookup...")

    matches = []
    for address in existing_addresses:
        info = label_lookup.get(address)
        if info:
            matches.append({
                "address": address,
                "label": info["label"],
                "category": info["category"],
                "label_source": info["source"],
            })
            print(f"  MATCH: {address} -> {info['label']} ({info['category']})")

    if matches:
        query = """
            UNWIND $matches AS row
            MATCH (a:Address {chain: 'tron', address: row.address})
            SET a.is_labeled = true,
                a.label = row.label,
                a.category = row.category,
                a.label_source = row.label_source,
                a.attribution_tier = $known_tier
        """
        with client.driver.session() as session:
            session.run(query, matches=matches, known_tier=AttributionTier.KNOWN.value)
        print(f"[label_tron_nodes] updated {len(matches)} nodes in Neo4j")
    else:
        print("[label_tron_nodes] no matches found in this trace")

    client.close()


def main():
    lookup = load_tron_labels(TRON_LABELS_CSV)
    apply_labels_to_neo4j(lookup)


if __name__ == "__main__":
    main()