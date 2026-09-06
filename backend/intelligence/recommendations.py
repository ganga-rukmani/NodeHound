"""Evidence-linked investigator recommendations."""


def build_recommendations(candidates, patterns, nearest_vasp=None) -> list[dict]:
    recommendations = []
    if candidates:
        recommendations.append({"priority": "high", "action": "Preserve and review the evidence chain for the highest-ranked candidate.", "basis": "ranked graph candidate with observed transfer path"})
    if patterns:
        recommendations.append({"priority": "medium", "action": "Review intermediary and multi-hop activity with transaction-level records.", "basis": "detected_patterns", "pattern_count": len(patterns)})
    if nearest_vasp:
        recommendations.append({"priority": "medium", "action": "Validate the identified VASP label and prepare a lawful information request if required.", "basis": "verified repository label", "entity": nearest_vasp["entity_name"]})
    if not recommendations:
        recommendations.append({"priority": "low", "action": "Collect additional transaction and intelligence data before attributing activity.", "basis": "insufficient evidence"})
    return recommendations