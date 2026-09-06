"""
graph/export_sample_trace.py

Exports the current Ethereum trace sitting in Neo4j into a static
sample_trace.json file, matching the exact schema in the frontend SRS
(section 3.3) so your teammate can build the Cytoscape.js visualization
against real data instead of guessing.

Run this AFTER load_ethereum_trace.py, label_ethereum_nodes.py, and
rank_destinations.py have all completed successfully - this script only
reads what's already in Neo4j, it doesn't run any pipeline steps itself.

Usage:
    python -m graph.export_sample_trace

Output:
    sample_trace.json (in current directory)

Hand this file to your teammate - per the SRS, it should be placed at:
    frontend/public/sample_trace.json
"""

import json

import networkx as nx

from graph.neo4j_client import Neo4jClient

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"

SEED_ADDRESS = "0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4".lower()

OUTPUT_PATH = "sample_trace.json"


def fetch_nodes(client: Neo4jClient) -> list[dict]:
    """Fetch all Ethereum nodes in the exact Address Node shape (SRS 3.1)."""
    with client.driver.session() as session:
        records = session.run(
            """
            MATCH (a:Address {chain: 'ethereum'})
            RETURN a.chain AS chain, a.address AS address,
                   a.is_labeled AS is_labeled, a.label AS label,
                   a.category AS category, a.label_source AS label_source,
                   a.attribution_tier AS attribution_tier,
                   a.cluster_id AS cluster_id,
                   a.path_rank_score AS path_rank_score,
                   a.risk_score AS risk_score,
                   a.risk_score_raw AS risk_score_raw
            """
        )
        return [dict(r) for r in records]


def fetch_edges(client: Neo4jClient) -> list[dict]:
    """Fetch all TRANSFER edges in the exact Transfer Edge shape (SRS 3.2)."""
    with client.driver.session() as session:
        records = session.run(
            """
            MATCH (a:Address {chain: 'ethereum'})-[t:TRANSFER]->(b:Address {chain: 'ethereum'})
            RETURN t.chain AS chain, t.tx_hash AS tx_hash,
                   a.address AS from_address, b.address AS to_address,
                   t.asset AS asset, t.amount AS amount,
                   t.amount_usd AS amount_usd, t.timestamp AS timestamp,
                   t.block_number AS block_number,
                   t.is_inferred_bridge_edge AS is_inferred_bridge_edge
            """
        )
        return [dict(r) for r in records]


def build_summary(nodes: list[dict], edges: list[dict]) -> dict:
    """
    Computes the summary block (SRS 3.3): totals, known VASP match count,
    top likely destination, and the path leading to it.
    """
    known_nodes = [n for n in nodes if n.get("is_labeled")]

    # Top destination = highest path_rank_score among labeled nodes
    # (falls back gracefully if ranking hasn't been run / all scores null)
    ranked = [n for n in known_nodes if n.get("path_rank_score") is not None]
    ranked.sort(key=lambda n: n["path_rank_score"], reverse=True)

    top_destination = None
    highest_risk_path = []

    if ranked:
        top = ranked[0]
        top_destination = {
            "address": top["address"],
            "label": top["label"],
            "confidence": round(top["path_rank_score"], 6),
        }

        # Reconstruct the path from seed to this destination for the
        # frontend's summary display.
        G = nx.DiGraph()
        for e in edges:
            G.add_edge(e["from_address"], e["to_address"])

        if SEED_ADDRESS in G and top["address"] in G:
            try:
                highest_risk_path = nx.shortest_path(G, SEED_ADDRESS, top["address"])
            except nx.NetworkXNoPath:
                highest_risk_path = []

    return {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "known_vasp_matches": len(known_nodes),
        "highest_risk_path": highest_risk_path,
        "top_destination": top_destination,
    }


def main():
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[export_sample_trace] could not connect to Neo4j")
        return

    nodes = fetch_nodes(client)
    edges = fetch_edges(client)

    if not nodes:
        print("[export_sample_trace] no nodes found in Neo4j - "
              "run load_ethereum_trace.py first")
        client.close()
        return

    summary = build_summary(nodes, edges)

    output = {
        "seed_address": SEED_ADDRESS,
        "nodes": nodes,
        "edges": edges,
        "summary": summary,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=str)  # default=str handles any stray non-JSON types safely

    print(f"[export_sample_trace] wrote {len(nodes)} nodes, {len(edges)} edges to {OUTPUT_PATH}")
    print(f"[export_sample_trace] summary: {json.dumps(summary, indent=2, default=str)}")
    print(f"\nHand this file to your teammate - place it at frontend/public/sample_trace.json")

    client.close()


if __name__ == "__main__":
    main()