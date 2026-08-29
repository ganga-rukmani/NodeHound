"""
graph/neo4j_client.py

Thin wrapper around the neo4j Python driver for:
  1. One-time schema setup (constraints/indexes from schema.py)
  2. Loading AddressNode / TransferEdge objects produced by chain adapters
     (e.g. ingestion/ethereum_adapter.py) into the running Neo4j container

All writes use MERGE, not CREATE, so re-running an adapter (e.g. after
updating your label CSV) never creates duplicate nodes/edges - it updates
existing ones in place. This matters because you'll re-run ingestion
multiple times as you iterate (add labels, re-trace with a wider time
window, etc.) and duplicate nodes would silently corrupt your graph
algorithms (PageRank, Louvain) later.

Usage:
    from graph.neo4j_client import Neo4jClient

    client = Neo4jClient(uri="bolt://localhost:7687", user="neo4j", password="nodehound123")
    client.setup_schema()
    client.load_nodes(nodes)
    client.load_edges(edges)
    client.close()
"""

from neo4j import GraphDatabase

from graph.schema import AddressNode, TransferEdge, SCHEMA_SETUP_CYPHER


class Neo4jClient:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def verify_connectivity(self) -> bool:
        """Quick sanity check before doing real work."""
        try:
            self.driver.verify_connectivity()
            return True
        except Exception as e:
            print(f"[neo4j_client] connection failed: {e}")
            return False

    def setup_schema(self):
        """Run once - creates constraints/indexes. Safe to re-run (IF NOT EXISTS)."""
        with self.driver.session() as session:
            for statement in SCHEMA_SETUP_CYPHER:
                session.run(statement)
        print(f"[neo4j_client] schema setup complete ({len(SCHEMA_SETUP_CYPHER)} statements)")

    def load_nodes(self, nodes: list[AddressNode], batch_size: int = 500):
        """
        MERGE each AddressNode on (chain, address). Batched with UNWIND for
        performance - one round-trip per batch instead of one per node.
        """
        query = """
            UNWIND $batch AS row
            MERGE (a:Address {chain: row.chain, address: row.address})
            SET a.is_labeled = row.is_labeled,
                a.label = row.label,
                a.category = row.category,
                a.label_source = row.label_source,
                a.attribution_tier = row.attribution_tier,
                a.cluster_id = row.cluster_id,
                a.path_rank_score = row.path_rank_score,
                a.risk_score = row.risk_score,
                a.risk_score_raw = row.risk_score_raw
        """
        self._write_in_batches(query, nodes, batch_size, label="nodes")

    def load_edges(self, edges: list[TransferEdge], batch_size: int = 500):
        """
        MERGE each TransferEdge. Uniqueness is on tx_hash + from + to, so
        the same transaction observed twice (e.g. re-tracing overlapping
        hops) doesn't create duplicate relationships.

        NOTE: MATCHes on (chain, address) for both endpoints, so load_nodes
        must be called before load_edges - endpoints need to exist first.
        """
        query = """
            UNWIND $batch AS row
            MATCH (from:Address {chain: row.chain, address: row.from_address})
            MATCH (to:Address {chain: row.chain, address: row.to_address})
            MERGE (from)-[t:TRANSFER {tx_hash: row.tx_hash, from_addr: row.from_address, to_addr: row.to_address}]->(to)
            SET t.asset = row.asset,
                t.amount = row.amount,
                t.amount_usd = row.amount_usd,
                t.timestamp = row.timestamp,
                t.block_number = row.block_number,
                t.is_inferred_bridge_edge = row.is_inferred_bridge_edge
        """
        self._write_in_batches(query, edges, batch_size, label="edges")

    def _write_in_batches(self, query: str, items: list, batch_size: int, label: str):
        with self.driver.session() as session:
            for i in range(0, len(items), batch_size):
                chunk = items[i : i + batch_size]
                batch_dicts = []
                for item in chunk:
                    props = item.neo4j_properties()
                    if isinstance(item, TransferEdge):
                        props["from_address"] = item.from_address
                        props["to_address"] = item.to_address
                    batch_dicts.append(props)
                session.run(query, batch=batch_dicts)
                print(f"[neo4j_client] loaded {label} batch "
                      f"{i // batch_size + 1} ({len(chunk)} items)")

    def get_graph_stats(self) -> dict:
        """Quick counts to sanity-check a load - not for production use."""
        with self.driver.session() as session:
            node_count = session.run("MATCH (a:Address) RETURN count(a) AS c").single()["c"]
            edge_count = session.run("MATCH ()-[t:TRANSFER]->() RETURN count(t) AS c").single()["c"]
            labeled_count = session.run(
                "MATCH (a:Address {is_labeled: true}) RETURN count(a) AS c"
            ).single()["c"]
        return {"nodes": node_count, "edges": edge_count, "labeled_nodes": labeled_count}


if __name__ == "__main__":
    # Quick manual test: connect, set up schema, confirm connectivity.
    # Does NOT load data here - run this after ethereum_adapter.py has
    # produced nodes/edges, then call load_nodes/load_edges from a script
    # that imports both (see graph/load_ethereum_trace.py, next step).
    client = Neo4jClient(uri="bolt://localhost:7687", user="neo4j", password="nodehound123")

    if client.verify_connectivity():
        print("[neo4j_client] connected successfully")
        client.setup_schema()
        print("[neo4j_client] current graph stats:", client.get_graph_stats())
    else:
        print("[neo4j_client] could not connect - check container is running "
              "and credentials match docker-compose.yml")

    client.close()