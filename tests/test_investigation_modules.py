from datetime import datetime

from alerts.alert_engine import generate_alerts
from graph.schema import AddressNode, Chain, LabelCategory, TransferEdge
from intelligence.cross_chain import correlate_traces
from intelligence.laundering_detector import detect_laundering_patterns
from intelligence.mixer_detector import detect_mixer_activity
from intelligence.recommendations import build_recommendations
from intelligence.vasp_identifier import nearest_vasp
from reports.investigation_report import build_investigation_report, evidence_integrity_hash


def _fixture():
    seed = AddressNode(Chain.ETHEREUM, "seed")
    middle = AddressNode(Chain.ETHEREUM, "middle")
    vasp = AddressNode(Chain.ETHEREUM, "vasp", is_labeled=True, label="Verified Exchange", category=LabelCategory.EXCHANGE, label_source="test_public_registry", source_type="verified_exchange", label_confidence=0.9)
    edges = [
        TransferEdge(Chain.ETHEREUM, "tx1", "seed", "middle", "ETH", 1, timestamp=datetime(2024, 1, 1)),
        TransferEdge(Chain.ETHEREUM, "tx1b", "other", "middle", "ETH", 0.2, timestamp=datetime(2024, 1, 1)),
        TransferEdge(Chain.ETHEREUM, "tx2", "middle", "vasp", "ETH", 1.0, timestamp=datetime(2024, 1, 1, 1)),
    ]
    candidates = [{"address": "vasp", "hop_distance": 2, "evidence_chain": [{"tx_hash": "tx2", "timestamp": "2024-01-01T01:00:00", "amount": 0.8}]}]
    return [seed, middle, vasp], edges, candidates


def test_vasp_and_laundering_evidence():
    nodes, edges, candidates = _fixture()
    assert nearest_vasp(nodes, candidates)["entity_name"] == "Verified Exchange"
    patterns = detect_laundering_patterns(nodes, edges)
    assert patterns and patterns[0]["address"] == "middle"


def test_mixer_and_cross_chain_empty_without_evidence():
    nodes, edges, _ = _fixture()
    assert detect_mixer_activity(nodes, edges) == []
    assert correlate_traces([{ "chain": "ethereum", "nodes": [{"address": "0x1"}] }]) == []


def test_alerts_recommendations_and_integrity_hash():
    nodes, edges, candidates = _fixture()
    patterns = detect_laundering_patterns(nodes, edges)
    vasp = nearest_vasp(nodes, candidates)
    alerts = generate_alerts(candidates, patterns, vasp)
    recommendations = build_recommendations(candidates, patterns, vasp)
    assert alerts and recommendations
    report = build_investigation_report(reported_wallet="seed", chain="ethereum", start=datetime(2024, 1, 1), end=datetime(2024, 1, 2), hop_depth=2, risk_category="unscored", risk_score=None, attribution_tier="unattributed", top_destination=None, nearest_vasp=vasp, candidates=candidates, fund_flow=[], cross_chain_activity=[], detected_patterns=patterns, alerts=alerts, recommendations=recommendations, evidence={"edges": ["tx1"]}, model_information={})
    assert report["evidence_integrity_hash"] == evidence_integrity_hash(report["evidence"])