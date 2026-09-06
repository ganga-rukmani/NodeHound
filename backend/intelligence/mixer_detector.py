"""Mixer intelligence and conservative transaction-pattern checks."""


def detect_mixer_activity(nodes, edges) -> list[dict]:
    node_by_address = {node.address: node for node in nodes}
    results = []
    for node in nodes:
        category = getattr(getattr(node, "category", None), "value", None)
        if category != "mixer":
            continue
        related = [edge for edge in edges if edge.from_address == node.address or edge.to_address == node.address]
        results.append({"type": "known_mixer_label", "address": node.address, "label": node.label, "confidence": node.label_confidence, "label_source": node.label_source, "transaction_hashes": [edge.tx_hash for edge in related], "evidence": "Observed label from the repository intelligence source."})
    return results