"""
graph/label_bitcoin_nodes.py

Labels real Bitcoin addresses using GraphSense TagPacks filtered for
currency == "BTC" - the same repo you already have cloned for Ethereum
(graphsense-tagpacks), just filtered the opposite way this time.

HONEST LIMITATION: Bitcoin has the WEAKEST real-address label coverage
of your three chains. Elliptic (your other Bitcoin data source) cannot
be used here at all - its txIds are anonymized and don't correspond to
real addresses BigQuery would return. GraphSense is genuinely the only
real-address label source available for live Bitcoin tracing. State this
plainly if asked - it's a real, structural data-availability gap, not an
oversight.

Usage:
    python -m graph.label_bitcoin_nodes
"""

import os

import yaml

from graph.neo4j_client import Neo4jClient
from graph.schema import LabelCategory, AttributionTier

GRAPHSENSE_PACKS_DIR = "data/labels/graphsense-tagpacks/packs"

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"


def _infer_category(label: str, abuse: str) -> str:
    label_lower = (label or "").lower()
    if abuse:
        return LabelCategory.SCAM_HEIST.value
    if any(h in label_lower for h in ["exchange", "binance", "coinbase", "kraken", "bitfinex"]):
        return LabelCategory.EXCHANGE.value
    if "mixer" in label_lower or "coinjoin" in label_lower:
        return LabelCategory.MIXER.value
    return LabelCategory.UNKNOWN.value


def load_bitcoin_graphsense_labels(packs_dir: str) -> dict:
    if not os.path.isdir(packs_dir):
        print(f"[label_bitcoin_nodes] WARNING: {packs_dir} not found")
        return {}

    result = {}
    pack_files = [f for f in os.listdir(packs_dir) if f.endswith((".yaml", ".yml"))]
    btc_pack_count = 0

    for filename in pack_files:
        if "wordcloud" in filename.lower():
            continue  # same noise filter established for Ethereum

        filepath = os.path.join(packs_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                pack = yaml.safe_load(f)
        except yaml.YAMLError:
            continue

        if not pack or pack.get("currency") != "BTC":
            continue

        btc_pack_count += 1
        pack_label = pack.get("label", filename.replace(".yaml", ""))
        abuse = pack.get("abuse")
        tags = pack.get("tags") or []

        for tag in tags:
            address = tag.get("address")
            if not address:
                continue
            result[address] = {
                "label": pack_label,
                "category": _infer_category(pack_label, abuse),
                "source": f"graphsense_tagpacks:{filename}",
            }

    print(f"[label_bitcoin_nodes] scanned {len(pack_files)} packs, "
          f"{btc_pack_count} were BTC-currency, {len(result)} addresses labeled")
    return result


def apply_labels_to_neo4j(label_lookup: dict):
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[label_bitcoin_nodes] could not connect to Neo4j")
        return

    with client.driver.session() as session:
        existing = [
            r["address"] for r in session.run(
                "MATCH (a:Address {chain: 'bitcoin'}) RETURN a.address AS address"
            )
        ]

    print(f"[label_bitcoin_nodes] checking {len(existing)} graph addresses against label lookup...")

    matches = []
    for address in existing:
        info = label_lookup.get(address)
        if info:
            matches.append({
                "address": address, "label": info["label"],
                "category": info["category"], "label_source": info["source"],
            })
            print(f"  MATCH: {address} -> {info['label']} ({info['category']})")

    if matches:
        query = """
            UNWIND $matches AS row
            MATCH (a:Address {chain: 'bitcoin', address: row.address})
            SET a.is_labeled = true, a.label = row.label,
                a.category = row.category, a.label_source = row.label_source,
                a.attribution_tier = $known_tier
        """
        with client.driver.session() as session:
            session.run(query, matches=matches, known_tier=AttributionTier.KNOWN.value)
        print(f"[label_bitcoin_nodes] updated {len(matches)} nodes")
    else:
        print("[label_bitcoin_nodes] no matches found - expected given thin Bitcoin "
              "label coverage, not necessarily an error")

    client.close()


def main():
    lookup = load_bitcoin_graphsense_labels(GRAPHSENSE_PACKS_DIR)
    apply_labels_to_neo4j(lookup)


if __name__ == "__main__":
    main()