"""
scoring/apply_bitcoin_scoring.py

Applies the rule-based fallback scorer (bitcoin_heuristic_score.py) to a
traced Bitcoin graph. This is NOT equivalent rigor to the Ethereum XGBoost
pipeline - it's a stated, transparent fallback since no trained model
exists for live Bitcoin addresses (say this plainly if asked).

Computes the 5 input signals per node directly from the graph structure
already produced by trace_bitcoin() + label application, so no extra
BigQuery calls are needed beyond what /trace already does.
"""

from graph.schema import AddressNode, TransferEdge, AttributionTier
from scoring.bitcoin_heuristic_score import score_bitcoin_address


def apply_bitcoin_heuristic_scoring(nodes: list[AddressNode], edges: list[TransferEdge]) -> dict:
    """
    Mutates nodes in place: sets risk_score (0.0-1.0, matching the scale
    used by the Ethereum XGBoost model's predict_proba output) and, for
    unlabeled nodes only, upgrades attribution_tier to PROBABLE when the
    heuristic finds meaningful risk signal - never overwrites a KNOWN
    tier that _apply_labels() already set from a direct label match.

    Returns a separate {address: [reason, ...]} dict rather than writing
    reasons onto the node object itself - this avoids assuming anything
    about AddressNode's field types in schema.py (which this file doesn't
    have visibility into). main.py should attach this dict into the API
    response alongside the node list, e.g. as
    result["bitcoin_risk_reasons"][address].
    """
    reasons_by_address: dict = {}
    if not nodes:
        return reasons_by_address

    node_by_addr = {n.address: n for n in nodes}

    # in-degree / out-degree per address, used as a rough tx-velocity proxy
    out_degree: dict[str, int] = {}
    in_degree: dict[str, int] = {}
    incoming_from: dict[str, list[str]] = {}

    for e in edges:
        out_degree[e.from_address] = out_degree.get(e.from_address, 0) + 1
        in_degree[e.to_address] = in_degree.get(e.to_address, 0) + 1
        incoming_from.setdefault(e.to_address, []).append(e.from_address)

    max_degree = max([*out_degree.values(), *in_degree.values(), 1])

    # group nodes by cluster_id (set upstream by clustering/bitcoin_cluster.py,
    # if that step ran - if cluster_id is None throughout, this degrades to
    # "no cluster signal available", which is an honest, stated limitation)
    cluster_members: dict[str, list[AddressNode]] = {}
    for n in nodes:
        if n.cluster_id:
            cluster_members.setdefault(n.cluster_id, []).append(n)

    for node in nodes:
        total_degree = out_degree.get(node.address, 0) + in_degree.get(node.address, 0)
        velocity_percentile = total_degree / max_degree if max_degree else 0.0

        cluster_has_labeled_entity = False
        if node.cluster_id:
            peers = cluster_members.get(node.cluster_id, [])
            cluster_has_labeled_entity = any(p.is_labeled for p in peers if p is not node)

        received_from_flagged = any(
            node_by_addr[addr].is_labeled
            for addr in incoming_from.get(node.address, [])
            if addr in node_by_addr
        )

        is_dormant_and_unconnected = (
            total_degree <= 1 and not cluster_has_labeled_entity and not received_from_flagged
        )

        result = score_bitcoin_address(
            address=node.address,
            direct_label=node.label if node.is_labeled else None,
            cluster_has_labeled_entity=cluster_has_labeled_entity,
            tx_velocity_percentile=velocity_percentile,
            received_from_flagged=received_from_flagged,
            is_dormant_and_unconnected=is_dormant_and_unconnected,
        )

        # scale 0-100 -> 0-1 to match Ethereum's predict_proba scale
        node.risk_score = round(result.score / 100.0, 4)
        reasons_by_address[node.address] = result.reasons

        # only upgrade tier if not already KNOWN from a direct label match
        if node.attribution_tier != AttributionTier.KNOWN:
            if result.tier in ("high", "medium"):
                node.attribution_tier = AttributionTier.PROBABLE
            else:
                node.attribution_tier = AttributionTier.UNKNOWN

    return reasons_by_address