"""Conservative intermediary and layering detectors."""

from __future__ import annotations

from collections import defaultdict


def detect_laundering_patterns(nodes, edges) -> list[dict]:
    node_by_address = {node.address: node for node in nodes}
    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for edge in edges:
        incoming[edge.to_address].append(edge)
        outgoing[edge.from_address].append(edge)
    patterns = []
    for address, node in node_by_address.items():
        ins, outs = incoming[address], outgoing[address]
        if not ins or not outs or node.is_labeled:
            continue
        received = sum(edge.amount or 0 for edge in ins)
        forwarded = sum(edge.amount or 0 for edge in outs)
        if forwarded <= 0 or received <= 0:
            continue
        ratio = forwarded / received
        if len(ins) >= 2 and len(outs) >= 1 and ratio >= 0.7:
            patterns.append({
                "type": "intermediary_forwarding",
                "address": address,
                "confidence": "medium_confidence" if ratio >= 0.9 else "low_confidence",
                "evidence": {"incoming_edges": len(ins), "outgoing_edges": len(outs), "forwarded_received_ratio": round(ratio, 4), "transaction_hashes": [edge.tx_hash for edge in ins + outs]},
                "disclaimer": "Behavior is consistent with intermediary forwarding; it does not establish illicit intent or ownership.",
            })
    return patterns


def detect_layering(edges, max_hops=3) -> list[dict]:
    """Find observed multi-hop paths, without assigning criminal intent."""
    outgoing = defaultdict(list)
    for edge in edges:
        outgoing[edge.from_address].append(edge)
    results = []
    for start in outgoing:
        frontier = [(start, [], set())]
        while frontier:
            address, path, visited = frontier.pop()
            if len(path) >= max_hops:
                continue
            for edge in outgoing[address]:
                if edge.to_address in visited:
                    continue
                next_path = path + [edge]
                if len(next_path) >= 2:
                    results.append({"type": "multi_hop_layering_pattern", "confidence": "low_confidence", "addresses": [start] + [item.to_address for item in next_path], "transaction_hashes": [item.tx_hash for item in next_path], "evidence": "Observed funds moving through multiple hops; this is not proof of laundering."})
                frontier.append((edge.to_address, next_path, visited | {edge.to_address}))
    return results