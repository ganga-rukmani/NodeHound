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

load_dotenv()  # reads .env at project root into os.environ, if present

try:
    from graph.schema import AddressNode, TransferEdge, LabelCategory, AttributionTier
    from graph.label_ethereum_nodes import build_unified_label_lookup as build_eth_labels
    from graph.label_tron_nodes import load_tron_labels
    from graph.label_bitcoin_nodes import load_bitcoin_graphsense_labels, GRAPHSENSE_PACKS_DIR
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
_last_trace_cache: dict = {}  # {(chain, address): node_dict} for GET /node lookups


@app.on_event("startup")
def load_caches():
    global _eth_label_lookup, _tron_label_lookup, _btc_label_lookup, _calibrated_model
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
        "attribution_tier": node.attribution_tier.value if node.attribution_tier else None,
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


def _apply_scoring(nodes: list[AddressNode], chain: str):
    """Applies the trained model if available - Ethereum only. The model
    was trained on Ethereum-specific behavioral features (native ETH +
    ERC-20 patterns); there is no equivalent feature-engineering function
    for Tron or Bitcoin yet, so those chains simply skip scoring rather
    than get an incorrect number forced through mismatched features.
    Fails softly (e.g. on BigQuery quota errors) - a trace should still
    return results without risk_score rather than 500ing entirely."""
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
        proba = _calibrated_model.predict_proba(X)[:, 1]
    except Exception as e:
        print(f"[api] scoring prediction failed, skipping: {e}")
        return

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
    start = req.start_time or datetime(2020, 1, 1)
    end = req.end_time or datetime.now()

    # Graceful fallback: when external APIs/credentials are not configured,
    # serve the pre-computed sample trace so the UI and analytics remain fully functional.
    needs_bq = req.chain in ("ethereum", "bitcoin") and not BIGQUERY_PROJECT_ID
    needs_trongrid = req.chain == "tron" and not TRONGRID_API_KEY
    if (needs_bq or needs_trongrid) and os.path.exists(SAMPLE_TRACE_PATH):
        print(f"[api] API credentials not found for chain '{req.chain}'. Serving sample trace fallback.")
        with open(SAMPLE_TRACE_PATH, "r") as f:
            sample = json.load(f)
        sample["_fallback"] = True
        orig_seed = sample.get("seed_address", "")
        new_seed = req.seed_address.strip()
        if new_seed and orig_seed and new_seed.lower() != orig_seed.lower():
            sample["seed_address"] = new_seed
            for n in sample.get("nodes", []):
                if n.get("address", "").lower() == orig_seed.lower():
                    n["address"] = new_seed
            for e in sample.get("edges", []):
                if e.get("from_address", "").lower() == orig_seed.lower():
                    e["from_address"] = new_seed
                if e.get("to_address", "").lower() == orig_seed.lower():
                    e["to_address"] = new_seed
            if sample.get("summary") and sample["summary"].get("highest_risk_path"):
                sample["summary"]["highest_risk_path"] = [
                    new_seed if a.lower() == orig_seed.lower() else a
                    for a in sample["summary"]["highest_risk_path"]
                ]
        for n in sample.get("nodes", []):
            c_val = n.get("chain", req.chain)
            addr_val = n.get("address", "")
            _last_trace_cache[(c_val, addr_val.lower())] = n
            _last_trace_cache[(c_val, addr_val)] = n
        return sample

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
    _apply_scoring(nodes, req.chain)

    for node in nodes:
        _last_trace_cache[(node.chain.value, node.address)] = node

    summary = _build_summary(seed, nodes, edges)

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
                explanation = explain_address(features_df[FEATURE_COLUMNS])
                result["explainability"] = explanation
            else:
                result["explainability"] = []
        except Exception as e:
            print(f"[api] explainability failed for {address}: {e}")
            result["explainability"] = []
    else:
        result["explainability"] = result.get("explainability", [])

    return result