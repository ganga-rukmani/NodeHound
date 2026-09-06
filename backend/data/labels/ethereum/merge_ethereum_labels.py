"""
merge_ethereum_labels.py

Merges three Ethereum label sources into one clean CSV:
  1. etherscan-labels  (JSON: {address: {name, labels: [...]}})
  2. ofac-ethereum-addresses (CSV: address,name)
  3. graphsense-tagpacks (YAML files with a 'tags' list)

Output: ethereum_labels_master.csv with columns:
  address, label, category, source

Run this from inside data/labels/ethereum/
"""

import json
import csv
import glob
import os

try:
    import yaml
except ImportError:
    raise SystemExit(
        "Missing dependency. Run: pip install pyyaml --break-system-packages"
    )

OUTPUT_FILE = "ethereum_labels_master.csv"

ETHERSCAN_PATH = "etherscan-labels/data/etherscan/combined/combinedAllLabels.json"
OFAC_PATH = "ofac-ethereum-addresses/data.csv"
GRAPHSENSE_DIR = "../graphsense-tagpacks/packs"


def load_etherscan():
    """
    Structure confirmed:
      { "0xabc...": {"name": "Balancer: MLN/ETH 90/10 #2", "labels": ["balancer"]}, ... }
    'name' is the display label. 'labels' is a category tag list (lowercase, e.g. "exchange",
    "phishing", "mixer") — join them if there are several.
    """
    rows = []
    if not os.path.exists(ETHERSCAN_PATH):
        print(f"[warn] Etherscan file not found at {ETHERSCAN_PATH}")
        return rows

    with open(ETHERSCAN_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    for address, info in data.items():
        name = (info.get("name") or "").strip()
        categories = info.get("labels") or []
        category = ", ".join(categories) if categories else "unknown"
        if name:
            rows.append({
                "address": address,
                "label": name,
                "category": category,
                "source": "etherscan_labels"
            })
    return rows


def load_ofac():
    """
    Structure confirmed:
      address,name
      0x098B716B8Aaf21512996dC57EB0615e2383E2f96,"LAZARUS GROUP"
    Every entry here is sanctioned -> category is always 'sanctioned'.
    """
    rows = []
    if not os.path.exists(OFAC_PATH):
        print(f"[warn] OFAC file not found at {OFAC_PATH}")
        return rows

    with open(OFAC_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            address = (row.get("address") or "").strip()
            name = (row.get("name") or "").strip()
            if address and name:
                rows.append({
                    "address": address,
                    "label": name,
                    "category": "sanctioned",
                    "source": "ofac_sdn"
                })
    return rows


def load_graphsense():
    """
    Structure confirmed (per YAML file):
      tags:
        - address: '0x...'
          currency: ETH
          label: myelherwallel.com
          source: https://cryptoscamdb.org/
          abuse: phishing
    Only keep currency == ETH entries (repo covers multiple chains).
    'abuse' field (when present) becomes the category; otherwise 'unknown'.
    """
    rows = []
    yaml_files = glob.glob(os.path.join(GRAPHSENSE_DIR, "*.yaml"))
    if not yaml_files:
        print(f"[warn] No YAML files found under {GRAPHSENSE_DIR}")
        return rows

    for filepath in yaml_files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            print(f"[warn] Skipping {filepath}, failed to parse: {e}")
            continue

        if not data or "tags" not in data:
            continue

        for tag in data["tags"]:
            currency = (tag.get("currency") or "").strip().upper()
            if currency != "ETH":
                continue
            address = (tag.get("address") or "").strip()
            label = (tag.get("label") or "").strip()
            category = (tag.get("abuse") or "unknown").strip()
            if address and label:
                rows.append({
                    "address": address,
                    "label": label,
                    "category": category,
                    "source": f"graphsense_{os.path.basename(filepath)}"
                })
    return rows


def main():
    all_rows = []

    print("Loading Etherscan labels...")
    etherscan_rows = load_etherscan()
    print(f"  -> {len(etherscan_rows)} entries")
    all_rows.extend(etherscan_rows)

    print("Loading OFAC sanctioned addresses...")
    ofac_rows = load_ofac()
    print(f"  -> {len(ofac_rows)} entries")
    all_rows.extend(ofac_rows)

    print("Loading GraphSense TagPacks (ETH only)...")
    graphsense_rows = load_graphsense()
    print(f"  -> {len(graphsense_rows)} entries")
    all_rows.extend(graphsense_rows)

    # Normalize addresses to lowercase for de-duplication (Ethereum addresses
    # are case-insensitive at the protocol level; checksummed casing varies
    # by source, which would otherwise cause false "duplicates").
    seen = {}
    for row in all_rows:
        key = row["address"].lower()
        if key not in seen:
            seen[key] = row
        else:
            # Address already labeled by another source — merge sources,
            # keep the first label found, note the overlap.
            existing = seen[key]
            if row["source"] not in existing["source"]:
                existing["source"] += f" + {row['source']}"

    deduped = list(seen.values())

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["address", "label", "category", "source"])
        writer.writeheader()
        writer.writerows(deduped)

    print(f"\nDone. {len(all_rows)} raw entries -> {len(deduped)} unique addresses "
          f"written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()