"""Standardized, hashable investigation result construction."""

from __future__ import annotations

import hashlib
import json


def evidence_integrity_hash(evidence) -> str:
    canonical = json.dumps(evidence, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def build_investigation_report(*, reported_wallet, chain, start, end, hop_depth, risk_category, risk_score, attribution_tier, top_destination, nearest_vasp, candidates, fund_flow, cross_chain_activity, detected_patterns, alerts, recommendations, evidence, model_information) -> dict:
    result = {"reported_wallet": reported_wallet, "chain": chain, "investigation_period": {"start": start.isoformat() if hasattr(start, "isoformat") else start, "end": end.isoformat() if hasattr(end, "isoformat") else end}, "hop_depth": hop_depth, "risk_category": risk_category, "risk_score": risk_score, "attribution_tier": attribution_tier, "top_destination": top_destination, "nearest_vasp": nearest_vasp, "candidates": candidates, "fund_flow": fund_flow, "cross_chain_activity": cross_chain_activity, "detected_patterns": detected_patterns, "alerts": alerts, "recommendations": recommendations, "evidence": evidence, "model_information": model_information}
    result["evidence_integrity_hash"] = evidence_integrity_hash(evidence)
    return result