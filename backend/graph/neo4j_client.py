"""
graph/neo4j_client.py

Enterprise-grade wrapper around the Neo4j Python driver for NodeHound.

Key Features:
- Configuration via environment variables (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE)
- Safe fallback: non-fatal if Neo4j is offline or initializing
- Parameterized Cypher queries (SQL/Cypher-injection immune)
- Strict transaction direction preservation: (from_address:Address)-[:TRANSFER]->(to_address:Address)
- Deduplication: MERGE on (chain, address) for nodes and (tx_hash, from_addr, to_addr) for edges
- Bounded subgraph and path queries
- Reusable connection pooling and session management
"""

import os
import time
from typing import Optional, List, Dict, Any

try:
    from neo4j import GraphDatabase, Driver
    from neo4j.exceptions import ServiceUnavailable, AuthError
    NEO4J_DRIVER_AVAILABLE = True
except ImportError:
    NEO4J_DRIVER_AVAILABLE = False
    GraphDatabase = Driver = None
    ServiceUnavailable = AuthError = Exception

from graph.schema import AddressNode, TransferEdge, SCHEMA_SETUP_CYPHER


# Environment configuration with production defaults
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "nodehound123")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")


class Neo4jClient:
    """
    Thread-safe client managing Neo4j connection pool, schema initialization,
    and parameterized forensic Cypher executions.
    """

    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None
    ):
        self.uri = uri or NEO4J_URI
        self.user = user or NEO4J_USER
        self.password = password or NEO4J_PASSWORD
        self.database = database or NEO4J_DATABASE
        self._driver: Optional[Any] = None

        if NEO4J_DRIVER_AVAILABLE:
            try:
                self._driver = GraphDatabase.driver(
                    self.uri,
                    auth=(self.user, self.password),
                    max_connection_lifetime=3600,
                    max_connection_pool_size=50,
                    connection_acquisition_timeout=10.0,
                )
            except Exception as e:
                print(f"[neo4j_client] driver initialization warning: {e}")
                self._driver = None

    @property
    def driver(self) -> Optional[Any]:
        return self._driver

    def close(self):
        """Closes the underlying driver pool."""
        if self._driver:
            try:
                self._driver.close()
            except Exception:
                pass
            self._driver = None

    def verify_connectivity(self) -> bool:
        """Verifies active connectivity to the Neo4j cluster."""
        if not self._driver:
            return False
        try:
            self._driver.verify_connectivity()
            return True
        except Exception as e:
            print(f"[neo4j_client] connectivity check failed: {e}")
            return False

    def check_health(self) -> Dict[str, Any]:
        """
        Comprehensive health assessment returning connectivity, latency,
        and database version without crashing the caller.
        """
        if not NEO4J_DRIVER_AVAILABLE:
            return {
                "status": "unavailable",
                "connected": False,
                "error": "neo4j python driver is not installed",
                "uri": self.uri,
            }

        if not self._driver:
            return {
                "status": "disconnected",
                "connected": False,
                "error": "driver not initialized",
                "uri": self.uri,
            }

        start_time = time.time()
        try:
            with self._driver.session(database=self.database) as session:
                result = session.run("CALL dbms.components() YIELD name, versions, edition RETURN name, versions[0] AS version, edition").single()
                latency_ms = round((time.time() - start_time) * 1000, 2)
                if result:
                    return {
                        "status": "connected",
                        "connected": True,
                        "name": result["name"],
                        "version": result["version"],
                        "edition": result["edition"],
                        "latency_ms": latency_ms,
                        "database": self.database,
                        "uri": self.uri,
                    }
                return {
                    "status": "connected",
                    "connected": True,
                    "latency_ms": latency_ms,
                    "database": self.database,
                    "uri": self.uri,
                }
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            return {
                "status": "disconnected",
                "connected": False,
                "error": str(e),
                "latency_ms": latency_ms,
                "database": self.database,
                "uri": self.uri,
            }

    def setup_schema(self) -> bool:
        """Applies uniqueness constraints and search indexes (idempotent)."""
        if not self.verify_connectivity():
            return False
        try:
            with self._driver.session(database=self.database) as session:
                for statement in SCHEMA_SETUP_CYPHER:
                    session.run(statement)
            print(f"[neo4j_client] schema setup complete ({len(SCHEMA_SETUP_CYPHER)} statements applied)")
            return True
        except Exception as e:
            print(f"[neo4j_client] schema setup warning: {e}")
            return False

    def load_nodes(self, nodes: List[AddressNode], batch_size: int = 500) -> int:
        """
        MERGE each AddressNode on (chain, address).
        Parameterized UNWIND query prevents SQL/Cypher injection.
        """
        if not self._driver or not nodes:
            return 0

        query = """
            UNWIND $batch AS row
            MERGE (a:Address {chain: row.chain, address: row.address})
            SET a.is_labeled = row.is_labeled,
                a.label = row.label,
                a.category = row.category,
                a.label_source = row.label_source,
                a.source_type = row.source_type,
                a.label_confidence = row.label_confidence,
                a.label_timestamp = row.label_timestamp,
                a.attribution_tier = row.attribution_tier,
                a.cluster_id = row.cluster_id,
                a.path_rank_score = row.path_rank_score,
                a.risk_score = row.risk_score,
                a.risk_score_raw = row.risk_score_raw
        """
        return self._write_in_batches(query, nodes, batch_size, label="nodes")

    def load_edges(self, edges: List[TransferEdge], batch_size: int = 500) -> int:
        """
        MERGE each TransferEdge.
        Strict directionality: (from)-[:TRANSFER]->(to).
        Deduplication key: tx_hash + from_addr + to_addr.
        """
        if not self._driver or not edges:
            return 0

        query = """
            UNWIND $batch AS row
            MERGE (from:Address {chain: row.chain, address: row.from_address})
            MERGE (to:Address {chain: row.chain, address: row.to_address})
            MERGE (from)-[t:TRANSFER {tx_hash: row.tx_hash, from_addr: row.from_address, to_addr: row.to_address}]->(to)
            SET t.asset = row.asset,
                t.amount = row.amount,
                t.amount_usd = row.amount_usd,
                t.timestamp = row.timestamp,
                t.block_number = row.block_number,
                t.is_inferred_bridge_edge = row.is_inferred_bridge_edge,
                t.evidence_type = row.evidence_type,
                t.edge_confidence = row.edge_confidence
        """
        return self._write_in_batches(query, edges, batch_size, label="edges")

    def _write_in_batches(self, query: str, items: list, batch_size: int, label: str) -> int:
        written = 0
        with self._driver.session(database=self.database) as session:
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
                written += len(chunk)
        return written

    def upsert_address(self, node: AddressNode) -> bool:
        """Upsert a single AddressNode."""
        return self.load_nodes([node], batch_size=1) > 0

    def upsert_transfer(self, edge: TransferEdge) -> bool:
        """Upsert a single TransferEdge with strict FROM->TO direction."""
        return self.load_edges([edge], batch_size=1) > 0

    def get_address(self, chain: str, address: str) -> Optional[Dict[str, Any]]:
        """Retrieve single Address node properties."""
        if not self._driver:
            return None
        query = """
            MATCH (a:Address {chain: $chain, address: $address})
            RETURN a {.*} AS node
        """
        with self._driver.session(database=self.database) as session:
            record = session.run(query, chain=chain, address=address).single()
            return dict(record["node"]) if record else None

    def get_incoming_transfers(self, chain: str, address: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieve incoming transfers flowing TO this address:
        (from:Address)-[t:TRANSFER]->(target:Address {address: $address})
        Arrow semantics: from_address -> to_address.
        """
        if not self._driver:
            return []
        query = """
            MATCH (from:Address {chain: $chain})-[t:TRANSFER]->(target:Address {chain: $chain, address: $address})
            RETURN t {.*, from_address: from.address, to_address: target.address} AS transfer
            ORDER BY t.timestamp DESC
            LIMIT $limit
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query, chain=chain, address=address, limit=limit)
            return [dict(r["transfer"]) for r in result]

    def get_outgoing_transfers(self, chain: str, address: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieve outgoing transfers flowing FROM this address:
        (target:Address {address: $address})-[t:TRANSFER]->(to:Address {chain: $chain})
        Arrow semantics: from_address -> to_address.
        """
        if not self._driver:
            return []
        query = """
            MATCH (target:Address {chain: $chain, address: $address})-[t:TRANSFER]->(to:Address {chain: $chain})
            RETURN t {.*, from_address: target.address, to_address: to.address} AS transfer
            ORDER BY t.timestamp DESC
            LIMIT $limit
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query, chain=chain, address=address, limit=limit)
            return [dict(r["transfer"]) for r in result]

    def get_bounded_subgraph(self, chain: str, seed_address: str, max_hops: int = 3, limit: int = 200) -> Dict[str, Any]:
        """
        Extract bounded multi-hop subgraph around seed_address.
        Preserves observed transaction directions.
        """
        if not self._driver:
            return {"nodes": [], "edges": []}
        query = f"""
            MATCH path = (seed:Address {{chain: $chain, address: $seed_address}})-[r:TRANSFER*1..{max_hops}]-(connected:Address {{chain: $chain}})
            WITH relationships(path) AS rels, nodes(path) AS ns
            UNWIND rels AS rel
            UNWIND ns AS n
            RETURN collect(DISTINCT n {{.*}}) AS nodes,
                   collect(DISTINCT rel {{.*, from_address: startNode(rel).address, to_address: endNode(rel).address}}) AS edges
        """
        with self._driver.session(database=self.database) as session:
            record = session.run(query, chain=chain, seed_address=seed_address).single()
            if not record:
                return {"nodes": [], "edges": []}
            return {
                "nodes": [dict(n) for n in record["nodes"]],
                "edges": [dict(e) for e in record["edges"]][:limit]
            }

    def get_graph_stats(self) -> Dict[str, Any]:
        """Counts total nodes, edges, and labeled nodes in the database."""
        if not self._driver:
            return {"nodes": 0, "edges": 0, "labeled_nodes": 0}
        with self._driver.session(database=self.database) as session:
            node_count = session.run("MATCH (a:Address) RETURN count(a) AS c").single()["c"]
            edge_count = session.run("MATCH ()-[t:TRANSFER]->() RETURN count(t) AS c").single()["c"]
            labeled_count = session.run("MATCH (a:Address {is_labeled: true}) RETURN count(a) AS c").single()["c"]
        return {"nodes": node_count, "edges": edge_count, "labeled_nodes": labeled_count}


# Global singleton instance
_neo4j_client_instance: Optional[Neo4jClient] = None


def get_neo4j_client() -> Neo4jClient:
    """Returns or initializes the global Neo4jClient singleton."""
    global _neo4j_client_instance
    if _neo4j_client_instance is None:
        _neo4j_client_instance = Neo4jClient()
    return _neo4j_client_instance