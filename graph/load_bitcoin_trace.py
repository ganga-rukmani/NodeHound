"""
graph/load_bitcoin_trace.py

Ties bitcoin_adapter.py + clustering/bitcoin_cluster.py + neo4j_client.py
together: traces a real Bitcoin address, loads it into Neo4j, and runs
CIOH clustering on the same call (since clustering needs the raw
transaction data this script already has in memory).

Usage:
    python -m graph.load_bitcoin_trace
"""

from datetime import datetime

from ingestion.bitcoin_adapter import trace_bitcoin
from clustering.bitcoin_cluster import cluster_by_common_input_ownership, write_clusters_to_neo4j
from graph.neo4j_client import Neo4jClient

# --- config - swap SEED_ADDRESS for your chosen Bitcoin case study address ---
SEED_ADDRESS = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"  # swap for your real Bitcoin case study
START_TIME = datetime(2024, 1, 1)
END_TIME = datetime(2024, 3, 31)
MAX_HOPS = 1  # start small - re-test with MAX_HOPS=2 only after confirming this runs cleanly

BIGQUERY_PROJECT_ID = "crypto-attribution-506814"

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"
# --- end config ---


def main():
    print(f"[load_bitcoin_trace] tracing {SEED_ADDRESS} "
          f"({START_TIME.date()} to {END_TIME.date()}, max {MAX_HOPS} hops)...")

    nodes, edges, raw_txs = trace_bitcoin(
        seed_address=SEED_ADDRESS,
        start_time=START_TIME,
        end_time=END_TIME,
        max_hops=MAX_HOPS,
        project_id=BIGQUERY_PROJECT_ID,
    )
    print(f"[load_bitcoin_trace] trace complete: {len(nodes)} nodes, {len(edges)} edges, "
          f"{len(raw_txs)} raw transactions")

    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[load_bitcoin_trace] could not connect to Neo4j")
        return

    client.setup_schema()

    print("[load_bitcoin_trace] loading nodes...")
    client.load_nodes(nodes)

    print("[load_bitcoin_trace] loading edges...")
    client.load_edges(edges)

    print("[load_bitcoin_trace] running CIOH clustering...")
    clusters = cluster_by_common_input_ownership(raw_txs)
    write_clusters_to_neo4j(client, clusters)

    stats = client.get_graph_stats()
    print(f"\n[load_bitcoin_trace] DONE. Current graph in Neo4j: {stats}")

    client.close()


if __name__ == "__main__":
    main()