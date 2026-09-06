"""
clustering/ethereum_cluster.py

Merges related Ethereum addresses into entity clusters using two signals,
matching the locked architecture:

  1. Deposit-sweep detection (primary, Ethereum-native signal):
     exchanges create many per-user deposit addresses that periodically
     "sweep" their balance to one central hot wallet. An address with many
     distinct senders (fan-in) that forwards almost all of it to a small,
     consistent set of destinations (fan-out) is very likely a deposit
     address, and gets clustered with its sweep destination.

  2. Louvain community detection (secondary signal): finds densely
     connected wallet groups in the transaction graph generally, using
     NetworkX's built-in implementation for prototyping (per locked stack -
     Neo4j GDS is the production-scale version, swap in later if needed).

Both signals are merged via a union-find structure so a deposit-sweep pair
and a Louvain community can combine into one final cluster_id when they
overlap.

Usage:
    python -m clustering.ethereum_cluster
"""

import networkx as nx

from graph.neo4j_client import Neo4jClient

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"

# --- deposit-sweep detection thresholds - tune these based on real results ---
MIN_DISTINCT_SENDERS = 3       # need at least this many distinct senders to look like a deposit address
MAX_SWEEP_DESTINATIONS = 2     # outflow concentrated into at most this many addresses
MIN_SWEEP_RATIO = 0.7          # at least this fraction of received value must be forwarded out
# -------------------------------------------------------------------------


class UnionFind:
    """Simple union-find so deposit-sweep pairs and Louvain communities
    can merge into one final cluster when they overlap on an address."""

    def __init__(self):
        self.parent = {}

    def find(self, x):
        if x not in self.parent:
            self.parent[x] = x
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        root_x, root_y = self.find(x), self.find(y)
        if root_x != root_y:
            self.parent[root_x] = root_y


def fetch_graph_from_neo4j(client: Neo4jClient) -> nx.DiGraph:
    """Pulls all Ethereum addresses + transfers into a NetworkX directed graph."""
    with client.driver.session() as session:
        edge_records = session.run(
            """
            MATCH (a:Address {chain: 'ethereum'})-[t:TRANSFER]->(b:Address {chain: 'ethereum'})
            RETURN a.address AS from_addr, b.address AS to_addr,
                   t.amount AS amount, t.tx_hash AS tx_hash
            """
        )
        edges = [dict(r) for r in edge_records]

    G = nx.DiGraph()
    for e in edges:
        # If the same pair has multiple transactions, sum the amounts as
        # edge weight (relevant for both sweep-ratio calc and Louvain).
        if G.has_edge(e["from_addr"], e["to_addr"]):
            G[e["from_addr"]][e["to_addr"]]["weight"] += e["amount"] or 0
            G[e["from_addr"]][e["to_addr"]]["tx_count"] += 1
        else:
            G.add_edge(e["from_addr"], e["to_addr"], weight=e["amount"] or 0, tx_count=1)

    print(f"[ethereum_cluster] loaded graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G


def detect_deposit_sweep_pairs(G: nx.DiGraph) -> list[tuple[str, str]]:
    """
    For every node, check if it looks like a deposit address:
      - receives from >= MIN_DISTINCT_SENDERS distinct addresses
      - sends out to <= MAX_SWEEP_DESTINATIONS distinct addresses
      - total outflow >= MIN_SWEEP_RATIO * total inflow

    Returns list of (deposit_address, sweep_destination) pairs to cluster together.
    """
    pairs = []

    for node in G.nodes():
        senders = list(G.predecessors(node))
        receivers = list(G.successors(node))

        if len(senders) < MIN_DISTINCT_SENDERS:
            continue
        if len(receivers) == 0 or len(receivers) > MAX_SWEEP_DESTINATIONS:
            continue

        total_in = sum(G[s][node]["weight"] for s in senders)
        total_out = sum(G[node][r]["weight"] for r in receivers)

        if total_in <= 0:
            continue

        sweep_ratio = total_out / total_in
        if sweep_ratio >= MIN_SWEEP_RATIO:
            # Cluster this "deposit address" with wherever it swept to.
            # If there are 2 sweep destinations, pick the larger one as
            # the canonical cluster anchor.
            main_destination = max(receivers, key=lambda r: G[node][r]["weight"])
            pairs.append((node, main_destination))

    print(f"[ethereum_cluster] detected {len(pairs)} deposit-sweep pairs")
    return pairs


def detect_louvain_communities(G: nx.DiGraph) -> dict:
    """
    Runs Louvain community detection on the undirected, weighted version
    of the graph. Returns {address: community_id}.
    """
    undirected = G.to_undirected()

    try:
        communities = nx.algorithms.community.louvain_communities(
            undirected, weight="weight", seed=42
        )
    except AttributeError:
        # Older NetworkX versions don't ship louvain_communities built-in.
        raise RuntimeError(
            "networkx.algorithms.community.louvain_communities not found - "
            "upgrade with: pip install --upgrade networkx --break-system-packages "
            "(requires networkx >= 3.3)"
        )

    node_to_community = {}
    for i, community in enumerate(communities):
        for node in community:
            node_to_community[node] = f"louvain_{i}"

    print(f"[ethereum_cluster] Louvain found {len(communities)} communities")
    return node_to_community


def build_final_clusters(
    G: nx.DiGraph,
    sweep_pairs: list[tuple[str, str]],
    louvain_map: dict,
) -> dict:
    """
    Merges deposit-sweep pairs and Louvain communities via union-find into
    one final cluster_id per address. Only addresses touched by at least
    one signal get a cluster_id - isolated/unclustered addresses stay None.
    """
    uf = UnionFind()

    # Seed union-find with Louvain communities first (every node starts in
    # its own Louvain group).
    for node, community in louvain_map.items():
        uf.union(node, community)  # union node with its community "anchor" id

    # Deposit-sweep pairs get unioned together directly - this can merge
    # two different Louvain communities if a sweep pattern crosses them,
    # which is fine and actually a stronger signal than Louvain alone.
    for deposit_addr, destination in sweep_pairs:
        uf.union(deposit_addr, destination)

    # Assign final cluster_id strings based on union-find roots.
    final_clusters = {}
    root_to_cluster_id = {}
    next_cluster_num = 0

    all_nodes = set(louvain_map.keys()) | {n for pair in sweep_pairs for n in pair}
    for node in all_nodes:
        root = uf.find(node)
        if root not in root_to_cluster_id:
            root_to_cluster_id[root] = f"cluster_{next_cluster_num:04d}"
            next_cluster_num += 1
        final_clusters[node] = root_to_cluster_id[root]

    print(f"[ethereum_cluster] merged into {next_cluster_num} final clusters "
          f"covering {len(final_clusters)} addresses")
    return final_clusters


def write_clusters_to_neo4j(client: Neo4jClient, clusters: dict):
    """Writes cluster_id back onto each Address node."""
    batch = [{"address": addr, "cluster_id": cid} for addr, cid in clusters.items()]

    query = """
        UNWIND $batch AS row
        MATCH (a:Address {chain: 'ethereum', address: row.address})
        SET a.cluster_id = row.cluster_id
    """
    with client.driver.session() as session:
        session.run(query, batch=batch)

    print(f"[ethereum_cluster] wrote cluster_id to {len(batch)} nodes in Neo4j")


def main():
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[ethereum_cluster] could not connect to Neo4j")
        return

    G = fetch_graph_from_neo4j(client)

    if G.number_of_nodes() == 0:
        print("[ethereum_cluster] no Ethereum graph data found - run load_ethereum_trace.py first")
        client.close()
        return

    sweep_pairs = detect_deposit_sweep_pairs(G)
    louvain_map = detect_louvain_communities(G)
    final_clusters = build_final_clusters(G, sweep_pairs, louvain_map)

    write_clusters_to_neo4j(client, final_clusters)

    # Print a quick summary of the largest clusters - worth eyeballing to
    # sanity check the results make sense (e.g. does a known exchange's
    # cluster actually contain multiple addresses?)
    from collections import Counter
    cluster_sizes = Counter(final_clusters.values())
    print("\n[ethereum_cluster] top 5 largest clusters:")
    for cluster_id, size in cluster_sizes.most_common(5):
        print(f"  {cluster_id}: {size} addresses")

    client.close()


if __name__ == "__main__":
    main()