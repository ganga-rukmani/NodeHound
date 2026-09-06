"""
graph/load_ethereum_trace.py

Ties ingestion/ethereum_adapter.py together with graph/neo4j_client.py:
runs a real trace, loads the results into Neo4j, and prints stats to
confirm the load worked.

This is your first real end-to-end pipeline run: BigQuery -> Python -> Neo4j.

Usage:
    python -m graph.load_ethereum_trace
"""

from datetime import datetime

from ingestion.ethereum_adapter import trace_ethereum
from graph.neo4j_client import Neo4jClient

# --- config - adjust as needed ---
SEED_ADDRESS = "0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4"  # WazirX compromised wallet
START_TIME = datetime(2024, 7, 18)
END_TIME = datetime(2024, 8, 18)
MAX_HOPS = 3

BIGQUERY_PROJECT_ID = "crypto-attribution-506814"  # your real GCP project id

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"
# --- end config ---


def main():
    print(f"[load_ethereum_trace] tracing {SEED_ADDRESS} "
          f"({START_TIME.date()} to {END_TIME.date()}, max {MAX_HOPS} hops)...")

    nodes, edges = trace_ethereum(
        seed_address=SEED_ADDRESS,
        start_time=START_TIME,
        end_time=END_TIME,
        max_hops=MAX_HOPS,
        project_id=BIGQUERY_PROJECT_ID,
    )
    print(f"[load_ethereum_trace] trace complete: {len(nodes)} nodes, {len(edges)} edges")

    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[load_ethereum_trace] could not connect to Neo4j - is the container running?")
        return

    client.setup_schema()  # safe to re-run, uses IF NOT EXISTS

    print("[load_ethereum_trace] loading nodes...")
    client.load_nodes(nodes)

    print("[load_ethereum_trace] loading edges...")
    client.load_edges(edges)

    stats = client.get_graph_stats()
    print(f"\n[load_ethereum_trace] DONE. Current graph in Neo4j: {stats}")
    print("Open http://localhost:7474 and run: MATCH (a:Address)-[t:TRANSFER]->(b:Address) "
          "RETURN a, t, b LIMIT 100   to see it visually.")

    client.close()


if __name__ == "__main__":
    main()