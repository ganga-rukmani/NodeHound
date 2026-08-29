"""
clustering/bitcoin_cluster.py

Implements the Common-Input-Ownership Heuristic (CIOH) - the real,
well-established Bitcoin-native clustering technique (this is what your
original architecture research correctly identified as Bitcoin's
equivalent to Ethereum's deposit-sweep detection).

THE HEURISTIC: in a UTXO transaction, ALL input addresses must be signed
by the same private key holder (you need every input's key to construct
a valid transaction). Therefore, if addresses A and B ever appear
together as inputs to the same transaction, they are (with very high
confidence) controlled by the same real-world entity. This transitively
chains: if {A,B} appear together in one tx, and {B,C} appear together in
another, then A, B, and C are all one cluster.

This requires the RAW input groupings from bitcoin_adapter.py's
raw_transactions output (NOT the pairwise TransferEdges, which lose this
grouping information - see bitcoin_adapter.py's docstring).

KNOWN LIMITATION (worth stating honestly if asked): CIOH can be defeated
by CoinJoin transactions (deliberately mixing multiple unrelated users'
inputs to break this exact assumption) - which is precisely why CoinJoin
exists as a privacy/laundering tool. This module does not attempt
CoinJoin detection (flagged as a further stretch in the original
architecture research, not implemented here).

Usage:
    python -m clustering.bitcoin_cluster
"""

from graph.neo4j_client import Neo4jClient

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"


class UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        if x not in self.parent:
            self.parent[x] = x
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx != ry:
            self.parent[rx] = ry


def cluster_by_common_input_ownership(raw_transactions: list[dict]) -> dict:
    """
    raw_transactions: list of {"input_addresses": [...], ...} as produced
    by ingestion/bitcoin_adapter.py's trace_bitcoin().

    Returns {address: cluster_id}.
    """
    uf = UnionFind()
    all_addresses = set()

    for tx in raw_transactions:
        inputs = tx.get("input_addresses", [])
        all_addresses.update(inputs)
        if len(inputs) < 2:
            continue  # single-input tx gives no co-ownership signal
        # Union every input address in this tx together
        first = inputs[0]
        for addr in inputs[1:]:
            uf.union(first, addr)

    clusters = {}
    root_to_id = {}
    next_id = 0
    for addr in all_addresses:
        root = uf.find(addr)
        if root not in root_to_id:
            root_to_id[root] = f"btc_cluster_{next_id:04d}"
            next_id += 1
        clusters[addr] = root_to_id[root]

    print(f"[bitcoin_cluster] CIOH found {next_id} clusters covering {len(clusters)} addresses "
          f"(from {len(raw_transactions)} transactions)")
    return clusters


def write_clusters_to_neo4j(client: Neo4jClient, clusters: dict):
    batch = [{"address": addr, "cluster_id": cid} for addr, cid in clusters.items()]
    query = """
        UNWIND $batch AS row
        MATCH (a:Address {chain: 'bitcoin', address: row.address})
        SET a.cluster_id = row.cluster_id
    """
    with client.driver.session() as session:
        session.run(query, batch=batch)
    print(f"[bitcoin_cluster] wrote cluster_id to {len(batch)} nodes in Neo4j")


if __name__ == "__main__":
    print("[bitcoin_cluster] this module needs raw_transactions from a live "
          "trace_bitcoin() call - run it via graph/load_bitcoin_trace.py, "
          "which calls cluster_by_common_input_ownership() with real data. "
          "Running this file directly has nothing to cluster.")