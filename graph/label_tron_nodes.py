"""Load local Tron labels with explicit source reliability metadata."""

import csv
import os


def _source_metadata(source: str, category: str) -> tuple[str, float]:
    source_lower = source.lower()
    if "ofac" in source_lower or category == "sanctioned":
        return "sanctions_list", 1.0
    if "account" in source_lower or "blue" in source_lower:
        return "verified_exchange", 0.9
    return "community_tag", 0.7


def load_tron_labels(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    result = {}
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            address = (row.get("address") or "").strip()
            if not address:
                continue
            category = (row.get("category") or "unknown").strip()
            source = (row.get("source") or "tron_labels").strip()
            source_type, confidence = _source_metadata(source, category)
            result[address] = {
                "label": (row.get("label") or address).strip(),
                "category": category,
                "source": source,
                "source_type": source_type,
                "label_confidence": confidence,
            }
    ofac_path = os.path.join(os.path.dirname(path), "ofac_tron_labels.csv")
    if os.path.exists(ofac_path):
        with open(ofac_path, newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                address = (row.get("address") or "").strip()
                if address:
                    result[address] = {
                        "label": row.get("label") or "OFAC_SANCTIONED",
                        "category": "sanctioned", "source": "ofac_sdn_tron",
                        "source_type": "sanctions_list", "label_confidence": 1.0,
                    }
    return {key.lower(): value for key, value in result.items()}