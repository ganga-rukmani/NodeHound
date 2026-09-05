"""Transparent, chain-agnostic attribution and evidence reconstruction."""

from collections import defaultdict, deque
from datetime import datetime
from typing import Any

from graph.schema import AddressNode, TransferEdge, AttributionTier

TIER_ORDER = (
    AttributionTier.KNOWN_SANCTIONED.value,
    AttributionTier.HIGH_CONFIDENCE.value,
    AttributionTier.MEDIUM_CONFIDENCE.value,
    AttributionTier.LOW_CONFIDENCE.value,
    AttributionTier.UNATTRIBUTED.value,
)


def _edge_dict(edge: TransferEdge) -> dict:
    return {
        "tx_hash": edge.tx_hash, "timestamp": edge.timestamp.isoformat() if edge.timestamp else None,
        "amount": edge.amount, "amount_usd": edge.amount_usd, "asset": edge.asset,
        "from_address": edge.from_address, "to_address": edge.to_address,
        "block_number": edge.block_number, "is_inferred_bridge_edge": edge.is_inferred_bridge_edge,
    }


def _paths(seed: str, edges: list[TransferEdge]) -> dict[str, list[TransferEdge]]:
    outgoing = defaultdict(list)
    for edge in sorted(edges, key=lambda item: item.timestamp or datetime.min):
        outgoing[edge.from_address].append(edge)
    paths: dict[str, list[TransferEdge]] = {seed: []}
    queue = deque([seed])
    while queue:
        address = queue.popleft()
        for edge in outgoing[address]:
            if edge.to_address not in paths:
                paths[edge.to_address] = paths[address] + [edge]
                queue.append(edge.to_address)
    return paths


def _tier(node: AddressNode, evidence: dict[str, Any]) -> str:
    if node.category and node.category.value == "sanctioned":
        return AttributionTier.KNOWN_SANCTIONED.value
    if node.is_labeled and (node.label_confidence or 0) >= 0.85:
        return AttributionTier.HIGH_CONFIDENCE.value
    if node.is_labeled:
        return AttributionTier.MEDIUM_CONFIDENCE.value
    if evidence["evidence_score"] >= 0.60:
        return AttributionTier.HIGH_CONFIDENCE.value
    if evidence["evidence_score"] >= 0.35:
        return AttributionTier.MEDIUM_CONFIDENCE.value
    if evidence["evidence_score"] >= 0.15:
        return AttributionTier.LOW_CONFIDENCE.value
    return AttributionTier.UNATTRIBUTED.value


def rank_candidates(seed_address: str, nodes: list[AddressNode], edges: list[TransferEdge]) -> list[dict]:
    """Return all reachable candidates with their individual evidence signals."""
    node_by_address = {node.address: node for node in nodes}
    paths = _paths(seed_address, edges)
    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for edge in edges:
        incoming[edge.to_address].append(edge)
        outgoing[edge.from_address].append(edge)

    candidates = []
    for address, node in node_by_address.items():
        if address == seed_address or address not in paths:
            continue
        path = paths[address]
        received = sum(edge.amount for edge in incoming[address] if edge.amount is not None)
        forwarded = sum(edge.amount for edge in outgoing[address] if edge.amount is not None)
        timestamps = [edge.timestamp for edge in path if edge.timestamp]
        continuity = min(received / forwarded, 1.0) if forwarded else (1.0 if received else 0.0)
        repeated_paths = sum(1 for edge in edges if edge.to_address == address)
        counterparties = {edge.from_address for edge in incoming[address]} | {edge.to_address for edge in outgoing[address]}
        concentration = min(len(counterparties) / 5.0, 1.0)
        proximity = max((node_by_address.get(edge.from_address).risk_score or 0.0 for edge in incoming[address] if node_by_address.get(edge.from_address)), default=0.0)
        timing = 1.0 if timestamps else 0.0
        label_signal = (node.label_confidence or 0.0) if node.is_labeled else 0.0
        evidence_score = round(min(1.0, label_signal * 0.35 + continuity * 0.20 + timing * 0.10 + min(repeated_paths / 3, 1) * 0.10 + concentration * 0.05 + proximity * 0.20), 4)
        evidence = {
            "evidence_score": evidence_score, "behavioral_risk_score": node.risk_score,
            "hop_distance": len(path), "timing_signal": timing,
            "fund_continuity": round(continuity, 4), "repeated_path_count": repeated_paths,
            "counterparty_concentration": round(concentration, 4), "proximity_to_flagged": round(proximity, 4),
            "known_label": node.label, "label_source": node.label_source,
            "shap_evidence": getattr(node, "shap_evidence", None),
        }
        tier = _tier(node, evidence)
        node.attribution_tier = AttributionTier(tier)
        candidates.append({
            "address": address, "label": node.label, "chain": node.chain.value,
            "category": node.category.value if node.category else None, "tier": tier,
            "evidence": evidence, "hop_distance": len(path),
            "first_seen": min(timestamps).isoformat() if timestamps else None,
            "last_seen": max(timestamps).isoformat() if timestamps else None,
            "total_received": received, "total_forwarded": forwarded,
            "assets": sorted({edge.asset for edge in path}),
            "evidence_chain": [_edge_dict(edge) for edge in path],
        })
    return sorted(candidates, key=lambda item: (TIER_ORDER.index(item["tier"]), -item["evidence"]["evidence_score"], item["hop_distance"]))


def build_timeline(edges: list[TransferEdge]) -> list[dict]:
    """Return chronological transfer events for the trace."""
    return [_edge_dict(edge) for edge in sorted(edges, key=lambda item: item.timestamp or datetime.min)]