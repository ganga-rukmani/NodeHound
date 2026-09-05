"""Cross-chain correlation using only explicit, observed identifiers."""


def correlate_traces(traces: list[dict]) -> list[dict]:
    """Correlate exact transaction/address identifiers across supplied traces.

    No amount/time proximity inference is performed here. A caller must pass
    independently observed traces; an absent trace produces no correlation.
    """
    address_occurrences = {}
    for trace in traces:
        for node in trace.get("nodes", []):
            address = node.get("address")
            if address:
                address_occurrences.setdefault(address.lower(), []).append({"chain": trace.get("chain"), "address": address})
    return [{"type": "exact_address_seen_on_multiple_chains", "address": occurrences[0]["address"], "chains": sorted({item["chain"] for item in occurrences}), "evidence": occurrences} for occurrences in address_occurrences.values() if len({item["chain"] for item in occurrences}) > 1]