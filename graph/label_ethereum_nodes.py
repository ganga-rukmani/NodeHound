"""
graph/label_ethereum_nodes.py

Loads all three Ethereum label sources into one unified lookup, then
updates every matching node currently in Neo4j with real label data.

Sources (real structures confirmed by inspection, not assumed):
  1. Etherscan (data/labels/ethereum/etherscan-labels/data/etherscan/combined/combinedAllLabels.json)
     - JSON object keyed by address (lowercase, no normalization needed to check)
     - value: {"name": "...", "labels": ["...", "..."]}
  2. OFAC (data/labels/ethereum/ofac-ethereum-addresses/data.csv)
     - CSV columns: address, name
     - e.g. "LAZARUS GROUP" - directly relevant to the WazirX eval case
  3. GraphSense (data/labels/graphsense-tagpacks/packs/*.yaml)
     - one pack per file; top-level `currency`, `label`, `abuse` fields apply
       to every address in that pack's `tags:` list
     - MUST filter for currency: ETH - many packs are BTC (like the
       africrypt-hack.yaml example) and don't apply to this chain

Priority when multiple sources tag the same address (first match wins,
since OFAC = legal/highest-confidence, then GraphSense = curated
community data, then Etherscan = largest but noisiest coverage):
  OFAC > GraphSense > Etherscan

Usage:
    python -m graph.label_ethereum_nodes
"""

import csv
import json
import os

import yaml

from graph.neo4j_client import Neo4jClient
from graph.schema import LabelCategory, AttributionTier

ETHERSCAN_LABELS_PATH = (
    "data/labels/ethereum/etherscan-labels/data/etherscan/combined/combinedAllLabels.json"
)
OFAC_CSV_PATH = "data/labels/ethereum/ofac-ethereum-addresses/data.csv"
GRAPHSENSE_PACKS_DIR = "data/labels/graphsense-tagpacks/packs"

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"


def load_etherscan_labels(path: str) -> dict:
    """Returns {address_lowercase: {"label": str, "category": str}}"""
    if not os.path.exists(path):
        print(f"[label_ethereum_nodes] WARNING: Etherscan file not found at {path}, skipping")
        return {}

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    result = {}
    for address, info in raw.items():
        name = info.get("name") or ""
        labels = info.get("labels") or []
        # Use the name if present, else fall back to the first label tag
        display_label = name if name else (labels[0] if labels else "unknown")
        category = _infer_category(labels, name)
        result[address.lower()] = {
            "label": display_label,
            "category": category,
            "source": "etherscan_labels",
        }
    print(f"[label_ethereum_nodes] loaded {len(result)} Etherscan labels")
    return result


def load_ofac_labels(path: str) -> dict:
    """Returns {address_lowercase: {"label": str, "category": "sanctioned"}}"""
    if not os.path.exists(path):
        print(f"[label_ethereum_nodes] WARNING: OFAC file not found at {path}, skipping")
        return {}

    result = {}
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            address = row.get("address", "").strip().lower()
            name = row.get("name", "").strip()
            if not address:
                continue
            result[address] = {
                "label": name,
                "category": LabelCategory.SANCTIONED.value,
                "source": "ofac_sdn",
            }
    print(f"[label_ethereum_nodes] loaded {len(result)} OFAC sanctioned labels")
    return result


def load_graphsense_labels(packs_dir: str) -> dict:
    """
    Returns {address_lowercase: {"label": str, "category": str}}
    Only includes packs where currency == "ETH" (many packs are BTC/other
    chains and don't apply here).
    """
    if not os.path.isdir(packs_dir):
        print(f"[label_ethereum_nodes] WARNING: GraphSense packs dir not found at {packs_dir}, skipping")
        return {}

    result = {}
    pack_files = [f for f in os.listdir(packs_dir) if f.endswith((".yaml", ".yml"))]
    eth_pack_count = 0

    for filename in pack_files:
        filepath = os.path.join(packs_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                pack = yaml.safe_load(f)
        except yaml.YAMLError as e:
            print(f"[label_ethereum_nodes] WARNING: could not parse {filename}: {e}")
            continue

        if not pack or pack.get("currency") != "ETH":
            continue  # skip non-Ethereum packs (e.g. the africrypt-hack.yaml BTC example)

        # Skip packs that are just scraped mirrors of Etherscan's own label
        # cloud repackaged as YAML - these give a meaningless label (the
        # filename itself, e.g. "etherscan-label-word-cloud") instead of a
        # real entity name, and duplicate data you already have directly
        # from the etherscan-labels source with a real name attached.
        if "wordcloud" in filename.lower() or "word-cloud" in filename.lower():
            continue

        eth_pack_count += 1
        pack_label = pack.get("label", filename.replace(".yaml", ""))
        abuse = pack.get("abuse")  # e.g. "service_hack" - useful signal if present
        tags = pack.get("tags") or []

        for tag in tags:
            address = tag.get("address")
            if not address:
                continue
            result[address.lower()] = {
                "label": pack_label,
                "category": LabelCategory.SCAM_HEIST.value if abuse else LabelCategory.UNKNOWN.value,
                "source": f"graphsense_tagpacks:{filename}",
            }

    print(f"[label_ethereum_nodes] scanned {len(pack_files)} packs, "
          f"{eth_pack_count} were ETH-currency, {len(result)} addresses labeled")
    return result


def _infer_category(labels: list, name: str) -> str:
    """
    Best-effort mapping from Etherscan's free-text label tags to our
    LabelCategory enum. This is a heuristic, not ground truth - spot-check
    matches manually before trusting the category in a pitch/demo, and
    expand these keyword lists as you discover real matches that get
    miscategorized (e.g. ChangeNOW/Stake.com initially fell through to
    "unknown" before this list was widened).
    """
    labels_lower = [l.lower() for l in labels]
    name_lower = name.lower()
    combined = " ".join(labels_lower) + " " + name_lower

    # Widened from the initial narrow list - covers instant-swap services,
    # gambling/casino platforms often used as laundering waypoints, and the
    # generic "exchange"/"cex" label tags Etherscan itself uses.
    exchange_hints = [
        "exchange", "cex", "kucoin", "binance", "coinbase", "kraken", "bybit",
        "okx", "huobi", "changenow", "stake.com", "gate.io", "bitfinex",
        "gemini", "crypto.com", "mexc", "bitget",
    ]
    dex_hints = ["uniswap", "sushiswap", "curve", "balancer", "pancakeswap",
                 "1inch", "dex", "router", "permit2"]
    mixer_hints = ["mixer", "tornado"]
    scam_hints = ["phishing", "scam", "hack", "exploit", "heist", "blacklist"]
    bridge_hints = ["bridge", "multichain", "wormhole", "portal"]

    if any(h in combined for h in mixer_hints):
        return LabelCategory.MIXER.value
    if any(h in combined for h in scam_hints):
        return LabelCategory.SCAM_HEIST.value
    if any(h in combined for h in bridge_hints):
        return LabelCategory.BRIDGE.value
    if any(h in combined for h in exchange_hints):
        return LabelCategory.EXCHANGE.value
    if any(h in combined for h in dex_hints):
        # DEXs aren't VASPs in the traditional sense, but they're a
        # legitimate "funds were swapped here" waypoint worth tracking
        # distinctly from a plain unknown address.
        return LabelCategory.CONTRACT_OR_TOKEN.value
    return LabelCategory.UNKNOWN.value


def build_unified_label_lookup() -> dict:
    """
    Merges all three sources. Priority: OFAC > GraphSense > Etherscan,
    since OFAC is the highest-confidence/legal source and Etherscan is the
    largest but noisiest.
    """
    etherscan = load_etherscan_labels(ETHERSCAN_LABELS_PATH)
    graphsense = load_graphsense_labels(GRAPHSENSE_PACKS_DIR)
    ofac = load_ofac_labels(OFAC_CSV_PATH)

    unified = {}
    unified.update(etherscan)   # lowest priority, applied first
    unified.update(graphsense)  # overwrites Etherscan on conflict
    unified.update(ofac)        # highest priority, applied last, wins all conflicts

    print(f"[label_ethereum_nodes] unified lookup: {len(unified)} total labeled addresses")
    return unified


def apply_labels_to_neo4j(label_lookup: dict):
    """
    Fetches all Ethereum addresses currently in Neo4j, checks each against
    the label lookup, and updates matches with real label/category/source/
    attribution_tier data.
    """
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[label_ethereum_nodes] could not connect to Neo4j")
        return

    with client.driver.session() as session:
        existing_addresses = [
            record["address"]
            for record in session.run(
                "MATCH (a:Address {chain: 'ethereum'}) RETURN a.address AS address"
            )
        ]

    print(f"[label_ethereum_nodes] checking {len(existing_addresses)} graph addresses "
          f"against label lookup...")

    matches = []
    for address in existing_addresses:
        label_info = label_lookup.get(address.lower())
        if label_info:
            matches.append({
                "address": address,
                "label": label_info["label"],
                "category": label_info["category"],
                "label_source": label_info["source"],
            })

    print(f"[label_ethereum_nodes] found {len(matches)} matches in this trace")
    for m in matches:
        print(f"  MATCH: {m['address']} -> {m['label']} ({m['category']}, via {m['label_source']})")

    if matches:
        update_query = """
            UNWIND $matches AS row
            MATCH (a:Address {chain: 'ethereum', address: row.address})
            SET a.is_labeled = true,
                a.label = row.label,
                a.category = row.category,
                a.label_source = row.label_source,
                a.attribution_tier = $known_tier
        """
        with client.driver.session() as session:
            session.run(update_query, matches=matches, known_tier=AttributionTier.KNOWN.value)
        print(f"[label_ethereum_nodes] updated {len(matches)} nodes in Neo4j")
    else:
        print("[label_ethereum_nodes] no matches found - this trace's addresses "
              "may genuinely not overlap with your label sources, worth spot-checking manually")

    client.close()


def main():
    label_lookup = build_unified_label_lookup()
    apply_labels_to_neo4j(label_lookup)


if __name__ == "__main__":
    main()