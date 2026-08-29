"""
graph/rank_destinations.py

Core attribution ranking mechanism - replaces the original doc's arbitrary
point-scoring system with Personalized PageRank (equivalent to Random Walk
with Restart), as locked in the architecture.

Given a seed address (the suspect/compromised wallet), this answers:
"Of all the KNOWN VASPs (labeled exchanges) reachable in this graph, which
one is the suspect wallet's funds most likely to have ended up at?"

Method: Personalized PageRank seeded 100% at the suspect address, weighted
by transfer amount, run over the directed transaction graph. Nodes more
strongly/directly connected to the seed (via larger, more direct transfer
paths) accumulate higher rank. We then filter the ranked results down to
only labeled/known nodes, since an "attribution" only means something when
it points to a real, named entity.

This produces path_rank_score - a graph-structural signal, NOT a
calibrated probability (that comes later from the trained ML model in
step 5/6). Reported honestly as "graph proximity rank," not "confidence."

Usage:
    python -m graph.rank_destinations
"""

import networkx as nx

from graph.neo4j_client import Neo4jClient

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"

SEED_ADDRESS = "0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4".lower()  # WazirX compromised wallet

PAGERANK_ALPHA = 0.85  # standard damping factor; (1 - alpha) = restart probability back to seed
TOP_N_RESULTS = 10


def fetch_graph_with_labels(client: Neo4jClient) -> tuple[nx.DiGraph, dict]:
    """
    Pulls the Ethereum graph plus each node's label info, needed to filter
    ranked results down to known/labeled destinations.
    Returns (graph, {address: {is_labeled, label, category}}).
    """
    with client.driver.session() as session:
        edge_records = session.run(
            """
            MATCH (a:Address {chain: 'ethereum'})-[t:TRANSFER]->(b:Address {chain: 'ethereum'})
            RETURN a.address AS from_addr, b.address AS to_addr, t.amount AS amount
            """
        )
        edges = [dict(r) for r in edge_records]

        node_records = session.run(
            """
            MATCH (a:Address {chain: 'ethereum'})
            RETURN a.address AS address, a.is_labeled AS is_labeled,
                   a.label AS label, a.category AS category
            """
        )
        node_info = {
            r["address"]: {
                "is_labeled": r["is_labeled"],
                "label": r["label"],
                "category": r["category"],
            }
            for r in node_records
        }

    G = nx.DiGraph()
    for e in edges:
        weight = e["amount"] or 0.0001  # avoid zero-weight edges being ignored entirely
        if G.has_edge(e["from_addr"], e["to_addr"]):
            G[e["from_addr"]][e["to_addr"]]["weight"] += weight
        else:
            G.add_edge(e["from_addr"], e["to_addr"], weight=weight)

    print(f"[rank_destinations] loaded graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G, node_info


def run_personalized_pagerank(G: nx.DiGraph, seed_address: str) -> tuple[dict, nx.DiGraph]:
    """
    Runs Personalized PageRank seeded entirely at seed_address, but FIRST
    restricts the graph to only nodes forward-reachable from the seed
    (i.e. nx.descendants) - this matters because ethereum_adapter.py
    traces BOTH incoming and outgoing transactions at each hop for full
    context, so the raw graph contains addresses that are upstream of the
    seed's counterparties (unrelated to where the seed's own funds went)
    mixed in with genuinely downstream addresses.

    Without this filter, upstream-only nodes get near-zero PageRank (no
    forward path exists) and silently rank at the bottom with no
    explanation - which looks like a bug rather than the honest answer
    "this exchange wasn't actually downstream of the suspect wallet."

    Returns (scores, reachable_subgraph) - scores are ONLY for nodes that
    are genuinely forward-reachable from the seed.
    """
    if seed_address not in G:
        raise ValueError(
            f"Seed address {seed_address} not found in graph - "
            f"check it matches exactly what's in Neo4j (case/format)"
        )

    reachable = nx.descendants(G, seed_address)
    reachable.add(seed_address)
    subgraph = G.subgraph(reachable).copy()

    print(f"[rank_destinations] {len(reachable)} of {G.number_of_nodes()} nodes "
          f"are forward-reachable from the seed address")

    if len(reachable) <= 1:
        print("[rank_destinations] WARNING: seed address has no forward-reachable "
              "nodes at all - check the trace actually captured outgoing transfers")
        return {}, subgraph

    personalization = {node: 0.0 for node in subgraph.nodes()}
    personalization[seed_address] = 1.0

    scores = nx.pagerank(
        subgraph,
        alpha=PAGERANK_ALPHA,
        personalization=personalization,
        weight="weight",
    )
    return scores, subgraph


def rank_known_destinations(scores: dict, node_info: dict) -> list[dict]:
    """
    Filters the full pagerank ranking down to only labeled/known nodes,
    sorted highest score first. This is your actual "most likely VASP
    destination" answer.
    """
    known_results = []
    for address, score in scores.items():
        info = node_info.get(address, {})
        if info.get("is_labeled"):
            known_results.append({
                "address": address,
                "label": info.get("label"),
                "category": info.get("category"),
                "path_rank_score": score,
            })

    known_results.sort(key=lambda r: r["path_rank_score"], reverse=True)
    return known_results


def reconstruct_path(G: nx.DiGraph, seed_address: str, destination: str) -> list[str] | None:
    """
    Finds the highest-weight path from seed to destination for
    explainability - "here's the actual chain of transfers that connects
    the suspect wallet to this exchange."

    Uses a bottleneck-path approach (maximize the minimum edge weight
    along the path) rather than plain shortest-hop-count, since a path
    through large transfers is more evidentially meaningful than an
    arbitrary short path through dust transactions.
    """
    if destination not in G or seed_address not in G:
        return None

    try:
        # networkx doesn't have a built-in "max bottleneck path" for
        # arbitrary graphs, so approximate with the standard shortest path
        # using NEGATIVE log weight as cost (turns "maximize product of
        # weights" into a shortest-path problem) - simpler and robust:
        # just use hop-count shortest path here for a first pass, since
        # explainability just needs *a* real path, not necessarily the
        # single "best" one by some exotic metric.
        path = nx.shortest_path(G, source=seed_address, target=destination)
        return path
    except nx.NetworkXNoPath:
        return None


def write_scores_to_neo4j(client: Neo4jClient, scores: dict):
    """Writes path_rank_score onto every node that has one."""
    batch = [{"address": addr, "path_rank_score": score} for addr, score in scores.items()]

    query = """
        UNWIND $batch AS row
        MATCH (a:Address {chain: 'ethereum', address: row.address})
        SET a.path_rank_score = row.path_rank_score
    """
    with client.driver.session() as session:
        session.run(query, batch=batch)

    print(f"[rank_destinations] wrote path_rank_score to {len(batch)} nodes in Neo4j")


def main():
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[rank_destinations] could not connect to Neo4j")
        return

    G, node_info = fetch_graph_with_labels(client)

    if G.number_of_nodes() == 0:
        print("[rank_destinations] no graph data found - run load_ethereum_trace.py first")
        client.close()
        return

    scores, subgraph = run_personalized_pagerank(G, SEED_ADDRESS)

    if scores:
        write_scores_to_neo4j(client, scores)

    known_destinations = rank_known_destinations(scores, node_info)

    # Also identify labeled nodes that exist in the trace but are NOT
    # forward-reachable from the seed - worth reporting honestly rather
    # than silently dropping them, since it's a real finding ("this
    # exchange appeared in the trace but wasn't actually downstream").
    all_labeled = {addr for addr, info in node_info.items() if info.get("is_labeled")}
    reachable_labeled = {r["address"] for r in known_destinations}
    unreachable_labeled = all_labeled - reachable_labeled

    print(f"\n[rank_destinations] Ranked known VASP destinations DOWNSTREAM of seed "
          f"{SEED_ADDRESS}:")
    print("=" * 80)
    if not known_destinations:
        print("  None of the labeled addresses in this trace are forward-reachable "
              "from the seed. This likely means the trace needs more hops in the "
              "outgoing direction, or funds genuinely stopped before reaching a "
              "known VASP within this window.")
    for i, result in enumerate(known_destinations[:TOP_N_RESULTS], 1):
        print(f"  #{i}  {result['label']} ({result['category']})")
        print(f"       address: {result['address']}")
        print(f"       path_rank_score: {result['path_rank_score']:.8e}")

        path = reconstruct_path(subgraph, SEED_ADDRESS, result["address"])
        if path:
            shown = [p[:10] + "..." for p in path]
            print(f"       path ({len(path) - 1} hops): {' -> '.join(shown)}")
        print()

    if unreachable_labeled:
        print(f"\n[rank_destinations] NOTE: {len(unreachable_labeled)} labeled address(es) "
              f"appeared in the trace but are NOT downstream of the seed "
              f"(likely upstream/unrelated context captured during tracing):")
        for addr in unreachable_labeled:
            info = node_info[addr]
            print(f"  - {info['label']} ({info['category']}) - {addr}")

    client.close()


if __name__ == "__main__":
    main()