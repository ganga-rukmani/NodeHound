"""Deterministic, evidence-linked alert generation."""


def generate_alerts(candidates, patterns, nearest_vasp=None) -> list[dict]:
    alerts = []
    for candidate in candidates:
        if candidate.get("tier") in {"known_sanctioned", "high_confidence"}:
            alerts.append({"type": "high_priority_candidate", "severity": "high", "address": candidate["address"], "tier": candidate["tier"], "evidence": candidate.get("evidence_chain", [])})
    for pattern in patterns:
        alerts.append({"type": pattern["type"], "severity": "medium", "address": pattern.get("address"), "evidence": pattern.get("evidence")})
    if nearest_vasp:
        alerts.append({"type": "identified_vasp_in_flow", "severity": "informational", "address": nearest_vasp["address"], "entity": nearest_vasp["entity_name"], "evidence": nearest_vasp["evidence"]})
    return alerts