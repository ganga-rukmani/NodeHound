"""Load Bitcoin GraphSense tag packs and optional OFAC CSV labels."""

import csv
import os

import yaml


def load_bitcoin_graphsense_labels(packs_dir: str) -> dict:
    result = {}
    if not os.path.isdir(packs_dir):
        return result
    for filename in os.listdir(packs_dir):
        if not filename.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(packs_dir, filename), encoding="utf-8") as handle:
            pack = yaml.safe_load(handle) or {}
        currency = str(pack.get("currency", "")).upper()
        if currency not in {"BTC", "BITCOIN"}:
            continue
        label = pack.get("label") or filename.rsplit(".", 1)[0]
        category = "scam_heist" if pack.get("abuse") else "unknown"
        for tag in pack.get("tags") or []:
            address = (tag.get("address") or "").strip().lower()
            if address:
                result[address] = {"label": label, "category": category,
                                   "source": f"graphsense_tagpacks:{filename}",
                                   "source_type": "community_tag", "label_confidence": 0.7}
    return result


def load_bitcoin_labels(packs_dir: str, ofac_path: str | None = None) -> dict:
    result = load_bitcoin_graphsense_labels(packs_dir)
    if ofac_path and os.path.exists(ofac_path):
        with open(ofac_path, newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                address = (row.get("address") or "").strip().lower()
                if address:
                    result[address] = {"label": row.get("name") or "OFAC_SANCTIONED",
                                       "category": "sanctioned", "source": "ofac_sdn",
                                       "source_type": "sanctions_list", "label_confidence": 1.0}
    return result


GRAPHSENSE_PACKS_DIR = "data/labels/graphsense-tagpacks/packs"