from datetime import datetime, timedelta

from graph.schema import AddressNode, Chain, LabelCategory, TransferEdge
from scoring.attribution import build_timeline, rank_candidates


def test_rank_candidates_exposes_chain_and_confidence_evidence():
    start = datetime(2024, 1, 1)
    seed = AddressNode(Chain.BITCOIN, "seed")
    intermediary = AddressNode(Chain.BITCOIN, "middle")
    candidate = AddressNode(Chain.BITCOIN, "candidate", is_labeled=True, label="Exchange", category=LabelCategory.EXCHANGE, label_confidence=0.9)
    edges = [
        TransferEdge(Chain.BITCOIN, "tx1", "seed", "middle", "BTC", 1.0, timestamp=start),
        TransferEdge(Chain.BITCOIN, "tx2", "middle", "candidate", "BTC", 0.9, timestamp=start + timedelta(hours=1)),
    ]

    candidates = rank_candidates("seed", [seed, intermediary, candidate], edges)

    assert candidates[0]["address"] == "candidate"
    assert candidates[0]["tier"] == "high_confidence"
    assert candidates[0]["hop_distance"] == 2
    assert len(candidates[0]["evidence_chain"]) == 2
    assert [event["tx_hash"] for event in build_timeline(edges)] == ["tx1", "tx2"]