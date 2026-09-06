"""Identify VASP-labelled nodes already present in an observed trace."""

from __future__ import annotations


def identify_nearest_vasps(nodes, candidates=None) -> list[dict]:
    """Return labelled exchange/VASP nodes with their observed path evidence.

    This function does not infer an entity from an address or query an
    unverified registry. A result exists only when the trace node has a label
    whose source and category identify it as an exchange/VASP.
    """
    candidates_by_address = {item.get("address"): item for item in (candidates or [])}
    results = []
    for node in nodes:
        source = (getattr(node, "label_source", None) or "").lower()
        category = getattr(getattr(node, "category", None), "value", None)
        source_type = (getattr(node, "source_type", None) or "").lower()
        is_vasp = category in {"exchange", "verified_exchange_or_entity"} or source_type == "verified_exchange" or "exchange" in source
        if not getattr(node, "is_labeled", False) or not is_vasp:
            continue
        candidate = candidates_by_address.get(node.address, {})
        chain = candidate.get("evidence_chain", [])
        first_event = chain[-1] if chain else {}
        results.append({
            "entity_name": node.label,
            "address": node.address,
            "chain": node.chain.value,
            "hop_distance": candidate.get("hop_distance"),
            "transaction_hash": first_event.get("tx_hash"),
            "timestamp": first_event.get("timestamp"),
            "amount": first_event.get("amount"),
            "label_source": node.label_source,
            "label_confidence": node.label_confidence,
            "evidence": {
                "observed_in_trace": True,
                "category": category,
                "source_type": node.source_type,
                "evidence_chain": chain,
            },
        })
    return sorted(results, key=lambda item: (item["hop_distance"] is None, item["hop_distance"] or 0, -(item["label_confidence"] or 0)))


def nearest_vasp(nodes, candidates=None) -> dict | None:
    matches = identify_nearest_vasps(nodes, candidates)
    return matches[0] if matches else None