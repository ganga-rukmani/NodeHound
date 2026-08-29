"""
api/main.py

FastAPI layer connecting your backend pipeline to the frontend, matching
the API contract already handed to your teammate in the frontend SRS
(section 5).

DESIGN CHOICE - runs the pipeline synchronously, in-memory, per request:
a live /trace call re-runs ingestion + labeling + ranking on the fly
rather than requiring you to have pre-run the standalone scripts. This
keeps the API self-contained and demoable, but means:
  - A live call is SLOW (real BigQuery/TronGrid calls, likely 30s-2min
    depending on hops) - fine for a backend demo to judges, but the
    frontend's "Load Demo Trace" static JSON fallback (already in the
    SRS) is what you should rely on for the actual live pitch, not this
    endpoint under time pressure on stage.
  - ML scoring (XGBoost) is only applied if the trained model files exist
    (scoring/model_artifacts/) - if you haven't run the training pipeline
    yet, /trace still works, just without risk_score populated.
  - Bitcoin is NOT implemented (stretch goal, not built) - returns a
    clear 501 rather than pretending to support it.

Run with:
    uvicorn api.main:app --reload --port 8000

Then POST to http://localhost:8000/trace
"""

import os
from datetime import datetime
from typing import Optional

import joblib
import networkx as nx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from graph.schema import AddressNode, TransferEdge
from graph.label_ethereum_nodes import build_unified_label_lookup as build_eth_labels
from graph.label_tron_nodes import load_tron_labels
from ingestion.ethereum_adapter import trace_ethereum
from ingestion.tron_adapter import trace_tron

try:
    from scoring.features import engineer_features, FEATURE_COLUMNS
    from scoring.explainability import explain_address
    SCORING_AVAILABLE = True
except ImportError:
    SCORING_AVAILABLE = False

app = FastAPI(title="NodeHound API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

BIGQUERY_PROJECT_ID = "crypto-attribution-506814"
TRONGRID_API_KEY = os.environ.get("TRONGRID_API_KEY", "YOUR_TRONGRID_KEY_HERE")

MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"

# --- loaded once at startup, not per request ---
_eth_label_lookup: dict = {}
_tron_label_lookup: dict = {}
_calibrated_model = None
_last_trace_cache: dict = {}  # {(chain, address): node_dict} for GET /node lookups


@app.on_event("startup")
def load_caches():
    global _eth_label_lookup, _tron_label_lookup, _calibrated_model
    print("[api] loading label lookups...")
    _eth_label_lookup = build_eth_labels()
    _tron_label_lookup = load_tron_labels("data/labels/tron/tron_labels_master.csv")

    model_path = os.path.join(MODEL_ARTIFACTS_DIR, "calibrated_model.joblib")
    if SCORING_AVAILABLE and os.path.exists(model_path):
        _calibrated_model = joblib.load(model_path)
        print("[api] loaded calibrated XGBoost model")
    else:
        print("[api] no trained model found - /trace will run without risk_score. "
              "Run scoring/xgboost_model.py + scoring/calibration.py to enable it.")


class TraceRequest(BaseModel):
    seed_address: str
    chain: str  # "ethereum" | "tron" | "bitcoin"
    max_hops: int = 3
    start_time: datetime
    end_time: datetime


def _node_to_dict(node: AddressNode) -> dict:
    return {
        "chain": node.chain.value,
        "address": node.address,
        "is_labeled": node.is_labeled,
        "label": node.label,
        "category": node.category.value if hasattr(node.category, "value") else node.category,
        "label_source": node.label_source,
        "attribution_tier": node.attribution_tier.value if hasattr(node.attribution_tier, "value") else node.attribution_tier,
        "cluster_id": node.cluster_id,
        "risk_score": node.risk_score,
        "risk_score_raw": node.risk_score_raw,
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
    }


def _apply_labels(nodes: list[AddressNode], label_lookup: dict):
    for node in nodes:
        info = label_lookup.get(node.address.lower()) or label_lookup.get(node.address)
        if info:
            node.is_labeled = True
            node.label = info["label"]
            node.category = info.get("category")
            node.label_source = info.get("source")
            node.attribution_tier = "known"


def _run_ranking(seed_address: str, nodes: list[AddressNode], edges: list[TransferEdge]):
    """In-memory Personalized PageRank - mirrors graph/rank_destinations.py
    but skips the Neo4j round trip for API response speed."""
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


def _apply_scoring(nodes: list[AddressNode], chain: str):
    """Applies the trained model if available - Ethereum only for now,
    since that's the only chain the model was trained on."""
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

    X = features_df[FEATURE_COLUMNS]
    proba = _calibrated_model.predict_proba(X)[:, 1]

    node_by_addr = {n.address: n for n in nodes}
    for addr, score in zip(features_df["address"], proba):
        if addr in node_by_addr:
            node_by_addr[addr].risk_score = round(float(score), 4)


def _build_summary(seed_address: str, nodes: list[AddressNode], edges: list[TransferEdge]) -> dict:
    known = [n for n in nodes if n.is_labeled]
    ranked = sorted(
        [n for n in known if n.path_rank_score is not None],
        key=lambda n: n.path_rank_score, reverse=True,
    )

    top_destination = None
    highest_risk_path = []
    if ranked:
        top = ranked[0]
        top_destination = {
            "address": top.address, "label": top.label,
            "confidence": round(top.path_rank_score, 6),
        }
        G = nx.DiGraph()
        for e in edges:
            G.add_edge(e.from_address, e.to_address)
        if seed_address in G and top.address in G:
            try:
                highest_risk_path = nx.shortest_path(G, seed_address, top.address)
            except nx.NetworkXNoPath:
                pass

    return {
        "total_nodes": len(nodes), "total_edges": len(edges),
        "known_vasp_matches": len(known),
        "highest_risk_path": highest_risk_path,
        "top_destination": top_destination,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _calibrated_model is not None}


@app.post("/trace")
def trace(req: TraceRequest):
    seed = req.seed_address.lower()

    if req.chain == "ethereum":
        nodes, edges = trace_ethereum(seed, req.start_time, req.end_time, req.max_hops, BIGQUERY_PROJECT_ID)
        _apply_labels(nodes, _eth_label_lookup)
    elif req.chain == "tron":
        nodes, edges = trace_tron(req.seed_address, req.start_time, req.end_time, req.max_hops, TRONGRID_API_KEY)
        _apply_labels(nodes, _tron_label_lookup)
    elif req.chain == "bitcoin":
        raise HTTPException(status_code=501, detail="Bitcoin tracing is not implemented (stretch goal)")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown chain: {req.chain}")

    _run_ranking(seed if req.chain == "ethereum" else req.seed_address, nodes, edges)
    _apply_scoring(nodes, req.chain)

    for node in nodes:
        _last_trace_cache[(node.chain.value, node.address)] = node

    summary = _build_summary(seed if req.chain == "ethereum" else req.seed_address, nodes, edges)

    return {
        "seed_address": req.seed_address,
        "nodes": [_node_to_dict(n) for n in nodes],
        "edges": [_edge_to_dict(e) for e in edges],
        "summary": summary,
    }


@app.get("/node/{chain}/{address}")
def get_node(chain: str, address: str):
    node = _last_trace_cache.get((chain, address.lower())) or _last_trace_cache.get((chain, address))
    if not node:
        raise HTTPException(status_code=404, detail="Address not found in last computed trace - run /trace first")

    result = _node_to_dict(node)

    if SCORING_AVAILABLE and chain == "ethereum":
        try:
            features_df = engineer_features(
                [node.address], datetime(2020, 1, 1), datetime(2024, 12, 31), BIGQUERY_PROJECT_ID
            )
            if not features_df.empty:
                explanation = explain_address(features_df[FEATURE_COLUMNS])
                result["explainability"] = explanation
        except Exception as e:
            print(f"[api] explainability failed for {address}: {e}")
            result["explainability"] = []
    else:
        result["explainability"] = []

    return result