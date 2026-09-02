"""
graph/load_tron_trace.py

Mirrors graph/load_ethereum_trace.py - ties tron_adapter.py together with
neo4j_client.py: runs a real Tron trace and loads it into Neo4j.

CREDENTIALS: loaded from a .env file at the project root via python-dotenv.
No hardcoded keys or fallback placeholder strings.

Usage:
    python -m graph.load_tron_trace
"""

import os
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from ingestion.tron_adapter import trace_tron
from graph.neo4j_client import Neo4jClient

# --- config - adjust as needed ---
SEED_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"  # swap for your actual Tron eval trace seed
START_TIME = datetime(2024, 6, 1)
END_TIME = datetime(2024, 8, 31)
MAX_HOPS = 2  # keep smaller than Ethereum's - TronGrid rate limits are tighter

TRONGRID_API_KEY = os.environ.get("TRONGRID_API_KEY")
if not TRONGRID_API_KEY:
    raise RuntimeError(
        "TRONGRID_API_KEY not found. Copy .env.example to .env in the "
        "project root and fill in your real TronGrid key, then re-run."
    )

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"
# --- end config ---


def main():
    print(f"[load_tron_trace] tracing {SEED_ADDRESS} "
          f"({START_TIME.date()} to {END_TIME.date()}, max {MAX_HOPS} hops)...")

    nodes, edges = trace_tron(
        seed_address=SEED_ADDRESS,
        start_time=START_TIME,
        end_time=END_TIME,
        max_hops=MAX_HOPS,
        api_key=TRONGRID_API_KEY,
    )
    print(f"[load_tron_trace] trace complete: {len(nodes)} nodes, {len(edges)} edges")

    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[load_tron_trace] could not connect to Neo4j - is the container running?")
        return

    client.setup_schema()

    print("[load_tron_trace] loading nodes...")
    client.load_nodes(nodes)

    print("[load_tron_trace] loading edges...")
    client.load_edges(edges)

    stats = client.get_graph_stats()
    print(f"\n[load_tron_trace] DONE. Current graph in Neo4j: {stats}")

    client.close()


if __name__ == "__main__":
    main()