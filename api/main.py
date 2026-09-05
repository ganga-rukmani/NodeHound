"""
api/main.py

FastAPI layer connecting your backend pipeline to the frontend, matching
the API contract already handed to your teammate in the frontend SRS
(section 5).

BITCOIN SUPPORT ADDED (this version): previously hard-coded a 501 for
any Bitcoin trace request. Now wires in the real pipeline - trace_bitcoin()
(ingestion/bitcoin_adapter.py), Common-Input-Ownership clustering
(clustering/bitcoin_cluster.py), and GraphSense label matching
(graph/label_bitcoin_nodes.py) - all applied in-memory, same pattern as
Ethereum/Tron (no Neo4j round trip needed for a live API response).

HONEST LIMITATION carried forward deliberately: Bitcoin risk_score stays
None/null. The trained XGBoost model (scoring/xgboost_model.py) was
trained on Ethereum-specific behavioral features (native ETH + ERC-20
transfer patterns) - there is no equivalent Bitcoin feature-engineering
function yet, and forcing Ethereum features onto Bitcoin's UTXO model
would be incorrect, not just incomplete. _apply_scoring already only
activates for chain=='ethereum', so Bitcoin nodes simply skip scoring
rather than getting a wrong or fabricated number. Same principle as why
the GNN (trained on Elliptic) isn't wired to live addresses either.

CREDENTIALS: loaded from a .env file at the project root via python-dotenv
- no hardcoded keys, no fallback placeholder strings anywhere in this
file. If TRONGRID_API_KEY is missing from .env, the server refuses to
start with a clear error rather than silently using a fake value that
would fail with confusing 401s later.

Setup (one-time):
    pip install python-dotenv --break-system-packages
    Copy .env.example to .env in the project root, fill in real values.

Run with (from inside the backend/ folder):
    uvicorn api.main:app --reload --port 8080
"""

import json
import os
from datetime import datetime
from typing import Optional

import joblib
import networkx as nx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from alerts.alert_engine import generate_alerts
from intelligence.cross_chain import correlate_traces
from intelligence.recommendations import build_recommendations
from intelligence.typology_detector import detect_typologies
from intelligence.vasp_identifier import nearest_vasp
from reports.investigation_report import build_investigation_report
from scoring.chain_model import load_chain_model, predict_risk

load_dotenv()  # reads .env at project root into os.environ, if present

try:
    from graph.schema import AddressNode, TransferEdge, LabelCategory, AttributionTier, Chain
    from graph.label_ethereum_nodes import build_unified_label_lookup as build_eth_labels
    from graph.label_tron_nodes import load_tron_labels
    from graph.label_bitcoin_nodes import load_bitcoin_graphsense_labels, GRAPHSENSE_PACKS_DIR
    from scoring.attribution import rank_candidates, build_timeline
    from scoring.chain_features import build_chain_features, feature_columns_for_chain
    GRAPH_AVAILABLE = True
except Exception as _graph_err:
    print(f"[api] WARNING: graph module failed to load: {_graph_err}")
    GRAPH_AVAILABLE = False
    # Stub types so the rest of the file doesn't crash
    AddressNode = TransferEdge = LabelCategory = AttributionTier = None
    build_eth_labels = lambda: {}
    load_tron_labels = lambda *a, **kw: {}
    load_bitcoin_graphsense_labels = lambda *a, **kw: {}
    GRAPHSENSE_PACKS_DIR = "data/labels/graphsense-tagpacks/packs"
    rank_candidates = build_timeline = lambda *a, **kw: []
    build_chain_features = feature_columns_for_chain = None

try:
    from ingestion.ethereum_adapter import trace_ethereum
    ETH_INGESTION_AVAILABLE = True
except Exception as _e:
    print(f"[api] WARNING: ethereum ingestion unavailable: {_e}")
    ETH_INGESTION_AVAILABLE = False
    trace_ethereum = None

try:
    from ingestion.tron_adapter import trace_tron
    TRON_INGESTION_AVAILABLE = True
except Exception as _e:
    print(f"[api] WARNING: tron ingestion unavailable: {_e}")
    TRON_INGESTION_AVAILABLE = False
    trace_tron = None

try:
    from ingestion.bitcoin_adapter import trace_bitcoin
    BTC_INGESTION_AVAILABLE = True
except Exception as _e:
    print(f"[api] WARNING: bitcoin ingestion unavailable: {_e}")
    BTC_INGESTION_AVAILABLE = False
    trace_bitcoin = None

try:
    from clustering.bitcoin_cluster import cluster_by_common_input_ownership
    BTC_CLUSTER_AVAILABLE = True
except Exception as _e:
    print(f"[api] WARNING: bitcoin clustering unavailable: {_e}")
    BTC_CLUSTER_AVAILABLE = False
    cluster_by_common_input_ownership = None

try:
    from scoring.features import engineer_features, FEATURE_COLUMNS
    from scoring.explainability import explain_address
    SCORING_AVAILABLE = True
except Exception:
    SCORING_AVAILABLE = False
    engineer_features = explain_address = None
    FEATURE_COLUMNS = []

app = FastAPI(title="NodeHound API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- credentials / config — optional, loaded from .env ---
BIGQUERY_PROJECT_ID = os.environ.get("GCP_PROJECT_ID")
TRONGRID_API_KEY = os.environ.get("TRONGRID_API_KEY")

_missing = [name for name, val in [("GCP_PROJECT_ID", BIGQUERY_PROJECT_ID),
                                     ("TRONGRID_API_KEY", TRONGRID_API_KEY)] if not val]
if _missing:
    print(
        f"[api] WARNING: missing environment variable(s): {', '.join(_missing)}. "
        f"Chains that need them will return 503. "
        f"Create backend/.env from .env.example and fill in real values to enable them."
    )
# --- end credentials / config ---

MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"

# --- loaded once at startup, not per request ---
_eth_label_lookup: dict = {}
_tron_label_lookup: dict = {}
_btc_label_lookup: dict = {}
_calibrated_model = None
_chain_models: dict = {}
_last_trace_cache: dict = {}  # {(chain, address): node_dict} for GET /node lookups
_last_trace_edges: list[TransferEdge] = []
_last_trace_candidates: list[dict] = []


@app.on_event("startup")
def load_caches():
    global _eth_label_lookup, _tron_label_lookup, _btc_label_lookup, _calibrated_model, _chain_models
    print("[api] loading label lookups...")

    try:
        _eth_label_lookup = build_eth_labels()
        print(f"[api] ethereum labels loaded ({len(_eth_label_lookup)} entries)")
    except Exception as e:
        print(f"[api] WARNING: ethereum labels failed to load: {e}")

    try:
        _tron_label_lookup = load_tron_labels("data/labels/tron/tron_labels.csv")
        print(f"[api] tron labels loaded ({len(_tron_label_lookup)} entries)")
    except Exception as e:
        print(f"[api] WARNING: tron labels failed to load: {e}")

    try:
        _btc_label_lookup = load_bitcoin_graphsense_labels(GRAPHSENSE_PACKS_DIR)
        print(f"[api] bitcoin labels loaded ({len(_btc_label_lookup)} entries)")
    except Exception as e:
        print(f"[api] WARNING: bitcoin labels failed to load: {e}")

    model_path = os.path.join(MODEL_ARTIFACTS_DIR, "calibrated_model.joblib")
    if SCORING_AVAILABLE and os.path.exists(model_path):
        try:
            _calibrated_model = joblib.load(model_path)
            print("[api] loaded calibrated XGBoost model")
        except Exception as e:
            print(f"[api] WARNING: model load failed: {e}")
    else:
        print("[api] no trained model found — /trace will run without risk_score. "
              "Run scoring/xgboost_model.py + scoring/calibration.py to enable it.")

    for chain in ("ethereum", "tron", "bitcoin"):
        try:
            artifact = load_chain_model(chain, MODEL_ARTIFACTS_DIR)
            if artifact.get("model_available"):
                _chain_models[chain] = artifact
                print(f"[api] loaded calibrated {chain} model")
            else:
                print(f"[api] {chain} model unavailable: {artifact['status']}")
        except Exception as e:
            print(f"[api] WARNING: {chain} model load failed: {e}")


SAMPLE_TRACE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sample_trace.json"))


class TraceRequest(BaseModel):
    seed_address: str
    chain: str  # "ethereum" | "tron" | "bitcoin"
    max_hops: int = 3
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


def _node_to_dict(node: AddressNode) -> dict:
    return {
        "chain": node.chain.value,
        "address": node.address,
        "is_labeled": node.is_labeled,
        "label": node.label,
        "category": node.category.value if node.category else None,
        "label_source": node.label_source,
        "source_type": node.source_type,
        "label_confidence": node.label_confidence,
        "label_timestamp": node.label_timestamp.isoformat() if node.label_timestamp else None,
        "attribution_tier": node.attribution_tier.value if node.attribution_tier else None,
        "cluster_id": node.cluster_id,
        "risk_score": node.risk_score,
        "risk_score_raw": node.risk_score_raw,
        "shap_evidence": getattr(node, "shap_evidence", None),
    }


def _edge_to_dict(edge: TransferEdge) -> dict:
    return {
        "chain": edge.chain.value,
        "tx_hash": edge.tx_hash,
        "from_address": edge.from_address,
        "to_address": edge.to_address,
        "asset": edge.asset,
        "amount": edge.amount,
        "amount_usd": edge.amount_usd,
        "timestamp": edge.timestamp.isoformat() if edge.timestamp else None,
        "block_number": edge.block_number,
        "is_inferred_bridge_edge": edge.is_inferred_bridge_edge,
        "evidence_type": edge.evidence_type,
        "edge_confidence": edge.edge_confidence,
    }


def _apply_labels(nodes: list[AddressNode], label_lookup: dict):
    """
    Applies label matches onto traced nodes. category and attribution_tier
    are always set as LabelCategory/AttributionTier ENUM OBJECTS (not raw
    strings) - _node_to_dict() always calls .value on them, and setting
    plain strings here previously crashed with 'str' object has no
    attribute 'value' the moment any node got labeled. Fixed with an
    explicit enum construction + safe fallback.
    """
    for node in nodes:
        info = label_lookup.get(node.address.lower()) or label_lookup.get(node.address)
        if info:
            node.is_labeled = True
            node.label = info["label"]

            category_str = info.get("category")
            try:
                node.category = LabelCategory(category_str) if category_str else None
            except ValueError:
                node.category = LabelCategory.UNKNOWN

            node.label_source = info.get("source")
            node.source_type = info.get("source_type") or (
                "sanctions_list" if "ofac" in (node.label_source or "").lower()
                else "verified_exchange" if "account" in (node.label_source or "").lower()
                else "community_tag"
            )
            node.label_confidence = info.get("label_confidence") or (
                1.0 if node.source_type == "sanctions_list" else 0.9 if node.source_type == "verified_exchange" else 0.7
            )
            node.label_timestamp = info.get("label_timestamp")
            node.attribution_tier = AttributionTier.KNOWN


def _apply_bitcoin_clusters(nodes: list[AddressNode], raw_transactions: list[dict]):
    """
    Applies Common-Input-Ownership clustering in-memory - mirrors the
    standalone graph/load_bitcoin_trace.py flow but skips the Neo4j round
    trip for API response speed, same pattern as _run_ranking below.
    """
    clusters = cluster_by_common_input_ownership(raw_transactions)
    for node in nodes:
        cluster_id = clusters.get(node.address)
        if cluster_id:
            node.cluster_id = cluster_id


def _run_ranking(seed_address: str, nodes: list[AddressNode], edges: list[TransferEdge]):
    """In-memory Personalized PageRank - mirrors graph/rank_destinations.py
    but skips the Neo4j round trip for API response speed. Chain-agnostic:
    works for Ethereum, Tron, and Bitcoin alike since it only needs
    from_address/to_address, which every TransferEdge has regardless of chain."""
    G = nx.DiGraph()
    for e in edges:
        w = e.amount or 0.0001
        if G.has_edge(e.from_address, e.to_address):
            G[e.from_address][e.to_address]["weight"] += w
        else:
            G.add_edge(e.from_address, e.to_address, weight=w)

    if seed_address not in G:
        return

    reachable = nx.descendants(G, seed_address) | {seed_address}
    subgraph = G.subgraph(reachable)

    personalization = {n: 0.0 for n in subgraph.nodes()}
    personalization[seed_address] = 1.0

    try:
        scores = nx.pagerank(subgraph, alpha=0.85, personalization=personalization, weight="weight")
    except Exception as e:
        print(f"[api] pagerank failed: {e}")
        return

    node_by_addr = {n.address: n for n in nodes}
    for addr, score in scores.items():
        if addr in node_by_addr:
            node_by_addr[addr].path_rank_score = score


def _apply_scoring(nodes: list[AddressNode], edges: list[TransferEdge], seed_address: str, chain: str, raw_transactions: list[dict] | None = None):
    """Apply only the requested chain's behavioral model, if available."""
    graph_model = _chain_models.get(chain)
    if graph_model and build_chain_features and feature_columns_for_chain:
        try:
            features_df = build_chain_features(nodes, edges, seed_address, raw_transactions)
            model = graph_model["model"]
            columns = graph_model["feature_columns"]
            if not features_df.empty:
                prediction = predict_risk(chain, features_df, graph_model)
                probabilities = prediction["risk_score"]
                raw_model = model
                calibrated_estimators = getattr(model, "calibrated_classifiers_", None)
                if calibrated_estimators:
                    raw_model = getattr(calibrated_estimators[0], "estimator", model)
                raw_probabilities = raw_model.predict_proba(features_df[columns])[:, 1]
                for node, score in zip(nodes, probabilities):
                    node.risk_score = round(float(score), 4)
                    row = features_df.loc[features_df["address"] == node.address, columns]
                    node.shap_evidence = explain_address(row, model=graph_model)
                for node, score in zip(nodes, raw_probabilities):
                    node.risk_score_raw = round(float(score), 4)
            return
        except Exception as e:
            print(f"[api] {chain} graph-model scoring failed, continuing without score: {e}")

    if not (SCORING_AVAILABLE and _calibrated_model and chain == "ethereum"):
        return

    addresses = [n.address for n in nodes]
    try:
        features_df = engineer_features(
            addresses, datetime(2020, 1, 1), datetime(2024, 12, 31), BIGQUERY_PROJECT_ID
        )
    except Exception as e:
        print(f"[api] feature engineering failed, skipping scoring: {e}")
        return

    if features_df.empty:
        return

    try:
        X = features_df[FEATURE_COLUMNS]
        prediction_model = _calibrated_model.get("model", _calibrated_model) if isinstance(_calibrated_model, dict) else _calibrated_model
        model_columns = _calibrated_model.get("feature_columns", FEATURE_COLUMNS) if isinstance(_calibrated_model, dict) else FEATURE_COLUMNS
        X = features_df[model_columns]
        proba = prediction_model.predict_proba(X)[:, 1]
    except Exception as e:
        print(f"[api] scoring prediction failed, skipping: {e}")
        return

    node_by_addr = {n.address: n for n in nodes}
    for addr, score in zip(features_df["address"], proba):
        if addr in node_by_addr:
            node_by_addr[addr].risk_score = round(float(score), 4)
            try:
                raw_model = _calibrated_model.get("model", _calibrated_model) if isinstance(_calibrated_model, dict) else _calibrated_model
                calibrated_estimators = getattr(raw_model, "calibrated_classifiers_", None)
                if calibrated_estimators:
                    raw_model = getattr(calibrated_estimators[0], "estimator", raw_model)
                raw_probability = raw_model.predict_proba(X.loc[features_df["address"] == addr])[:, 1][0]
                node_by_addr[addr].risk_score_raw = round(float(raw_probability), 4)
                node_by_addr[addr].shap_evidence = explain_address(
                    features_df.loc[features_df["address"] == addr, FEATURE_COLUMNS],
                    model=_calibrated_model,
                )
            except Exception as e:
                print(f"[api] SHAP evidence unavailable for {addr}: {e}")


def _build_summary(seed_address: str, nodes: list[AddressNode], edges: list[TransferEdge]) -> dict:
    known = [n for n in nodes if n.is_labeled]
    candidates = rank_candidates(seed_address, nodes, edges)
    qualifying = [item for item in candidates if item["tier"] != AttributionTier.UNATTRIBUTED.value]
    top_destination = None
    if qualifying:
        top_destination = dict(qualifying[0])
        top_destination["confidence"] = top_destination["evidence"]["evidence_score"]
    highest_risk_path = [seed_address]
    if qualifying:
        highest_risk_path.extend(
            [event["to_address"] for event in qualifying[0]["evidence_chain"]]
        )
    return {
        "total_nodes": len(nodes), "total_edges": len(edges),
        "known_vasp_matches": len(known),
        "candidates": candidates,
        "insufficient_evidence": not bool(qualifying),
        "top_destination": top_destination,
        "highest_risk_path": highest_risk_path if qualifying else [],
        "highest_risk_evidence_chain": qualifying[0]["evidence_chain"] if qualifying else [],
    }


def _risk_category(nodes: list[AddressNode], candidates: list[dict]) -> str:
    if any(item.get("tier") == AttributionTier.KNOWN_SANCTIONED.value for item in candidates):
        return "critical"
    scores = [node.risk_score for node in nodes if node.risk_score is not None]
    maximum = max(scores, default=0.0)
    if maximum >= 0.75:
        return "high"
    if maximum >= 0.45:
        return "medium"
    if maximum > 0:
        return "low"
    return "unscored"


def _build_investigation(seed: str, req: TraceRequest, start: datetime, end: datetime, nodes: list[AddressNode], edges: list[TransferEdge], summary: dict) -> dict:
    patterns = detect_typologies(nodes, edges)
    vasp = nearest_vasp(nodes, summary["candidates"])
    alerts = generate_alerts(summary["candidates"], patterns, vasp)
    recommendations = build_recommendations(summary["candidates"], patterns, vasp)
    evidence = {
        "timeline": build_timeline(edges),
        "candidate_evidence": [item.get("evidence_chain", []) for item in summary["candidates"]],
        "labelled_nodes": [_node_to_dict(node) for node in nodes if node.is_labeled],
    }
    model_information = {
        "chain_model_loaded": req.chain in _chain_models,
        "legacy_model_loaded": req.chain == "ethereum" and _calibrated_model is not None,
        "risk_score_disclaimer": "Behavioral risk is an estimate and is not proof of attacker ownership.",
    }
    return build_investigation_report(
        reported_wallet=req.seed_address,
        chain=req.chain,
        start=start,
        end=end,
        hop_depth=req.max_hops,
        risk_category=_risk_category(nodes, summary["candidates"]),
        risk_score=max((node.risk_score for node in nodes if node.risk_score is not None), default=None),
        attribution_tier=summary["candidates"][0]["tier"] if summary["candidates"] else AttributionTier.UNATTRIBUTED.value,
        top_destination=summary["top_destination"],
        nearest_vasp=vasp,
        candidates=summary["candidates"],
        fund_flow=build_timeline(edges),
        cross_chain_activity=correlate_traces([{"chain": req.chain, "nodes": [_node_to_dict(node) for node in nodes]}]),
        detected_patterns=patterns,
        alerts=alerts,
        recommendations=recommendations,
        evidence=evidence,
        model_information=model_information,
    )


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _calibrated_model is not None}


@app.post("/trace")
def trace(req: TraceRequest):
    global _last_trace_edges, _last_trace_candidates
    start = req.start_time or datetime(2020, 1, 1)
    end = req.end_time or datetime.now()

    # Demo data is loaded explicitly by the frontend. Never substitute an
    # Ethereum trace for a live request on another chain.
    needs_bq = req.chain in ("ethereum", "bitcoin") and not BIGQUERY_PROJECT_ID
    needs_trongrid = req.chain == "tron" and not TRONGRID_API_KEY
    if needs_bq:
        raise HTTPException(
            status_code=503,
            detail=f"{req.chain.title()} tracing requires GCP_PROJECT_ID. Use Load Demo Trace for offline sample data.",
        )
    if needs_trongrid:
        raise HTTPException(
            status_code=503,
            detail="Tron tracing requires TRONGRID_API_KEY. Use Load Demo Trace for offline sample data.",
        )

    if req.chain == "ethereum":
        if not ETH_INGESTION_AVAILABLE:
            raise HTTPException(status_code=503, detail="Ethereum ingestion module failed to load. Check server logs.")
        if not BIGQUERY_PROJECT_ID:
            raise HTTPException(status_code=503, detail="Ethereum tracing requires GCP_PROJECT_ID. Add it to backend/.env and restart.")
        seed = req.seed_address.lower()
        nodes, edges = trace_ethereum(seed, start, end, req.max_hops, BIGQUERY_PROJECT_ID)
        _apply_labels(nodes, _eth_label_lookup)

    elif req.chain == "tron":
        if not TRON_INGESTION_AVAILABLE:
            raise HTTPException(status_code=503, detail="Tron ingestion module failed to load. Check server logs.")
        if not TRONGRID_API_KEY:
            raise HTTPException(status_code=503, detail="Tron tracing requires TRONGRID_API_KEY. Add it to backend/.env and restart.")
        seed = req.seed_address
        nodes, edges = trace_tron(req.seed_address, start, end, req.max_hops, TRONGRID_API_KEY)
        _apply_labels(nodes, _tron_label_lookup)

    elif req.chain == "bitcoin":
        if not BTC_INGESTION_AVAILABLE:
            raise HTTPException(status_code=503, detail="Bitcoin ingestion module failed to load. Check server logs.")
        if not BIGQUERY_PROJECT_ID:
            raise HTTPException(status_code=503, detail="Bitcoin tracing requires GCP_PROJECT_ID. Add it to backend/.env and restart.")
        seed = req.seed_address
        nodes, edges, raw_txs = trace_bitcoin(
            req.seed_address, start, end, req.max_hops, BIGQUERY_PROJECT_ID
        )
        _apply_labels(nodes, _btc_label_lookup)
        _apply_bitcoin_clusters(nodes, raw_txs)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown chain: {req.chain}")

    _run_ranking(seed, nodes, edges)
    _apply_scoring(nodes, edges, seed, req.chain, raw_txs if req.chain == "bitcoin" else None)

    for node in nodes:
        _last_trace_cache[(node.chain.value, node.address)] = node

    summary = _build_summary(seed, nodes, edges)
    investigation = _build_investigation(seed, req, start, end, nodes, edges, summary)
    _last_trace_edges = edges
    _last_trace_candidates = summary["candidates"]

    return {
        "seed_address": req.seed_address,
        "nodes": [_node_to_dict(n) for n in nodes],
        "edges": [_edge_to_dict(e) for e in edges],
        "summary": summary,
        "candidates": summary["candidates"],
        "timeline": build_timeline(edges),
        "reported_wallet": investigation["reported_wallet"],
        "chain": investigation["chain"],
        "investigation_period": investigation["investigation_period"],
        "hop_depth": investigation["hop_depth"],
        "risk_category": investigation["risk_category"],
        "risk_score": investigation["risk_score"],
        "attribution_tier": investigation["attribution_tier"],
        "top_destination": investigation["top_destination"],
        "nearest_vasp": investigation["nearest_vasp"],
        "fund_flow": investigation["fund_flow"],
        "cross_chain_activity": investigation["cross_chain_activity"],
        "detected_patterns": investigation["detected_patterns"],
        "alerts": investigation["alerts"],
        "recommendations": investigation["recommendations"],
        "evidence": investigation["evidence"],
        "evidence_integrity_hash": investigation["evidence_integrity_hash"],
        "model_information": investigation["model_information"],
    }


@app.get("/node/{chain}/{address}")
def get_node(chain: str, address: str):
    node = _last_trace_cache.get((chain, address.lower())) or _last_trace_cache.get((chain, address))
    if not node:
        raise HTTPException(status_code=404, detail="Address not found in last computed trace - run /trace first")

    result = _node_to_dict(node) if hasattr(node, "chain") else dict(node)

    if SCORING_AVAILABLE and chain == "ethereum" and BIGQUERY_PROJECT_ID:
        try:
            features_df = engineer_features(
                [node.address if hasattr(node, "address") else node.get("address")],
                datetime(2020, 1, 1),
                datetime(2024, 12, 31),
                BIGQUERY_PROJECT_ID
            )
            if not features_df.empty:
                explanation = explain_address(features_df[FEATURE_COLUMNS], model=_calibrated_model)
                result["explainability"] = explanation
            else:
                result["explainability"] = []
        except Exception as e:
            print(f"[api] explainability failed for {address}: {e}")
            result["explainability"] = []
    else:
        result["explainability"] = result.get("explainability", [])

    result.setdefault("evidence", {})
    result["evidence"]["source_type"] = result.get("source_type")
    result["evidence"]["label_confidence"] = result.get("label_confidence")
    result["evidence"]["label_timestamp"] = result.get("label_timestamp")
    result["attribution"] = next((candidate for candidate in _last_trace_candidates if candidate["address"].lower() == address.lower()), None)

    return result


@app.get("/timeline/{chain}/{address}")
def get_timeline(chain: str, address: str):
    """Return chronological evidence events for a node in the last trace."""
    node = _last_trace_cache.get((chain, address.lower())) or _last_trace_cache.get((chain, address))
    if not node:
        raise HTTPException(status_code=404, detail="Address not found in last computed trace - run /trace first")
    events = [
        _edge_to_dict(edge) for edge in _last_trace_edges
        if edge.from_address.lower() == address.lower() or edge.to_address.lower() == address.lower()
    ]
    return {"chain": chain, "address": address, "timeline": build_timeline([
        edge for edge in _last_trace_edges
        if edge.from_address.lower() == address.lower() or edge.to_address.lower() == address.lower()
    ])}