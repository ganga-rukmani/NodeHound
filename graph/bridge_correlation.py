"""
graph/bridge_correlation.py

Detects likely cross-chain fund movement by correlating deposits into
known bridge contracts on Ethereum with withdrawals from known bridge
contracts on Tron, matched by time proximity and matching asset.

SCHEMA CAVEAT - read this before running:
graph/schema.py's TransferEdge has a single `chain` field, designed for
edges that live entirely within one chain. A bridge edge inherently spans
TWO chains (an Ethereum address -> a Tron address), which the original
schema doesn't cleanly represent. Rather than restructure TransferEdge
(and ripple that change through neo4j_client.py's existing, tested
load_edges query), this module writes cross-chain edges with its OWN
dedicated Cypher query that explicitly matches a chain='ethereum' node on
one side and a chain='tron' node on the other. The edge's `chain`
property is set to the literal string "bridge" to make this visually
distinct in Neo4j Browser and avoid implying it belongs to either single
chain. Flag this as a known simplification if asked - a cleaner version
would add explicit from_chain/to_chain fields to the schema.

MATCHING METHOD (documented limitation, be upfront about this in a demo):
this correlates by TIME PROXIMITY and ASSET SYMBOL only - not exact
amount matching, since amount matching would require live USD price
conversion (out of scope given time constraints) and bridges often apply
fees/slippage that make raw amounts not match exactly anyway. This means
matches are PROBABILISTIC, not proof - exactly why the schema calls this
`is_inferred_bridge_edge`, and why a real investigation would treat this
as a lead to verify, not a confirmed fact.

Usage:
    python -m graph.bridge_correlation
"""

from datetime import timedelta

from graph.neo4j_client import Neo4jClient

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"

# Known bridge contract addresses - VERIFY these against the current
# official contract lists before trusting them in a demo; bridge
# contracts do get upgraded/redeployed. These are commonly-cited
# addresses as of research done during this project, not guaranteed
# current.
KNOWN_ETHEREUM_BRIDGE_CONTRACTS = {
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585": "Wormhole Token Bridge",
    # Multichain removed - the protocol shut down in 2023, so that
    # placeholder address is stale and would have produced false
    # correlations if left in. Add more verified bridge contract
    # addresses here as you confirm them.
}

KNOWN_TRON_BRIDGE_CONTRACTS = {
    # Add verified Tron-side bridge/gateway contract addresses here -
    # deliberately left sparse rather than guessing, since an incorrect
    # bridge address would silently produce false correlations.
}

TIME_TOLERANCE = timedelta(hours=2)  # how close in time a deposit/withdrawal pair must be


def fetch_bridge_deposits(client: Neo4jClient, bridge_addresses: set) -> list[dict]:
    """Finds edges where funds moved INTO a known bridge contract."""
    if not bridge_addresses:
        return []
    with client.driver.session() as session:
        records = session.run(
            """
            MATCH (sender:Address)-[t:TRANSFER]->(bridge:Address)
            WHERE bridge.address IN $bridge_addresses
            RETURN sender.address AS sender, sender.chain AS sender_chain,
                   t.asset AS asset, t.amount AS amount, t.timestamp AS timestamp,
                   t.tx_hash AS tx_hash
            """,
            bridge_addresses=list(bridge_addresses),
        )
        return [dict(r) for r in records]


def fetch_bridge_withdrawals(client: Neo4jClient, bridge_addresses: set) -> list[dict]:
    """Finds edges where funds moved OUT of a known bridge contract."""
    if not bridge_addresses:
        return []
    with client.driver.session() as session:
        records = session.run(
            """
            MATCH (bridge:Address)-[t:TRANSFER]->(receiver:Address)
            WHERE bridge.address IN $bridge_addresses
            RETURN receiver.address AS receiver, receiver.chain AS receiver_chain,
                   t.asset AS asset, t.amount AS amount, t.timestamp AS timestamp,
                   t.tx_hash AS tx_hash
            """,
            bridge_addresses=list(bridge_addresses),
        )
        return [dict(r) for r in records]


def correlate_bridge_edges(deposits: list[dict], withdrawals: list[dict]) -> list[dict]:
    """
    Matches each deposit to the closest-in-time withdrawal with the same
    asset symbol, within TIME_TOLERANCE. This is intentionally simple
    (no amount matching - see module docstring) and O(n*m), which is
    fine at hackathon trace scale but would need indexing for production.
    """
    matches = []
    for deposit in deposits:
        if not deposit.get("timestamp"):
            continue
        candidates = [
            w for w in withdrawals
            if w.get("asset") == deposit.get("asset") and w.get("timestamp")
        ]
        for withdrawal in candidates:
            try:
                dep_time = deposit["timestamp"]
                wd_time = withdrawal["timestamp"]
                # timestamps come back from Neo4j as strings (isoformat) -
                # comparing as strings works for same-format ISO 8601
                # within reasonable precision, but a real implementation
                # should parse both to datetime objects explicitly.
                from datetime import datetime
                dep_dt = datetime.fromisoformat(str(dep_time).replace("Z", "+00:00"))
                wd_dt = datetime.fromisoformat(str(wd_time).replace("Z", "+00:00"))
                if abs(wd_dt - dep_dt) <= TIME_TOLERANCE:
                    matches.append({
                        "from_address": deposit["sender"],
                        "from_chain": deposit["sender_chain"],
                        "to_address": withdrawal["receiver"],
                        "to_chain": withdrawal["receiver_chain"],
                        "asset": deposit["asset"],
                        "amount": deposit["amount"],
                        "tx_hash": f"bridge_inferred:{deposit['tx_hash']}:{withdrawal['tx_hash']}",
                    })
            except (ValueError, TypeError):
                continue  # malformed timestamp, skip this pair

    print(f"[bridge_correlation] found {len(matches)} candidate bridge correlations "
          f"(time-proximity + asset match, NOT amount-verified)")
    return matches

def correlate_by_shared_entity(client: Neo4jClient) -> list[dict]:
    """
    Cross-chain correlation via shared entity label, not bridge contracts.

    RATIONALE: research during this project confirmed Tron has essentially
    no live decentralized bridge presence today (Wormhole's own official
    mainnet contract list does not include Tron at all as of this
    writing) - real Tron<->EVM movement is overwhelmingly CEX-mediated
    (same entity deposits on one chain, withdraws on another from the
    same exchange account), which is invisible on-chain by definition.

    So instead of inferring bridge hops, this correlates nodes across
    chains that already carry the SAME label from our label sources -
    e.g. the Funnull/Huione case, where OFAC sanctioned one address on
    Ethereum and one on Tron under the same designation. This is a
    stronger, defensible signal than a guessed bridge contract: it's
    "we know this is the same entity because an authoritative source
    said so", not "we inferred these two transactions might be related".
    """
    query = """
        MATCH (a:Address), (b:Address)
        WHERE a.chain <> b.chain
          AND a.label IS NOT NULL AND b.label IS NOT NULL
          AND toLower(a.label) = toLower(b.label)
        RETURN DISTINCT a.address AS address_a, a.chain AS chain_a,
               b.address AS address_b, b.chain AS chain_b,
               a.label AS shared_label
    """
    with client.driver.session() as session:
        records = session.run(query)
        matches = [dict(r) for r in records]

    print(f"[bridge_correlation] found {len(matches)} same-entity cross-chain "
          f"matches (via shared label, not bridge contracts)")
    return matches


def write_entity_correlation_edges(client: Neo4jClient, matches: list[dict]):
    """Writes a distinct 'SAME_ENTITY' relationship (not TRANSFER) since
    no actual fund movement is being claimed here - just shared
    attribution."""
    if not matches:
        print("[bridge_correlation] no same-entity matches to write")
        return

    query = """
        UNWIND $batch AS row
        MATCH (a:Address {chain: row.chain_a, address: row.address_a})
        MATCH (b:Address {chain: row.chain_b, address: row.address_b})
        MERGE (a)-[r:SAME_ENTITY]->(b)
        SET r.shared_label = row.shared_label,
            r.correlation_method = 'shared_label'
    """
    with client.driver.session() as session:
        session.run(query, batch=matches)
    print(f"[bridge_correlation] wrote {len(matches)} SAME_ENTITY edges to Neo4j")

def write_bridge_edges(client: Neo4jClient, matches: list[dict]):
    """
    Writes cross-chain edges directly - cannot reuse neo4j_client.load_edges
    since that assumes both endpoints share one `chain` value. See module
    docstring for the schema caveat this works around.
    """
    if not matches:
        print("[bridge_correlation] no matches to write")
        return

    query = """
        UNWIND $batch AS row
        MATCH (from:Address {chain: row.from_chain, address: row.from_address})
        MATCH (to:Address {chain: row.to_chain, address: row.to_address})
        MERGE (from)-[t:TRANSFER {tx_hash: row.tx_hash}]->(to)
        SET t.chain = 'bridge',
            t.asset = row.asset,
            t.amount = row.amount,
            t.is_inferred_bridge_edge = true
    """
    with client.driver.session() as session:
        session.run(query, batch=matches)
    print(f"[bridge_correlation] wrote {len(matches)} inferred bridge edges to Neo4j")


def main():
    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    if not client.verify_connectivity():
        print("[bridge_correlation] could not connect to Neo4j")
        return

    if not KNOWN_TRON_BRIDGE_CONTRACTS:
        print("[bridge_correlation] WARNING: KNOWN_TRON_BRIDGE_CONTRACTS is empty - "
              "add verified Tron bridge contract addresses before this can find any "
              "real correlations. This is a placeholder run.")

    eth_bridges = set(KNOWN_ETHEREUM_BRIDGE_CONTRACTS.keys())
    tron_bridges = set(KNOWN_TRON_BRIDGE_CONTRACTS.keys())

    deposits = fetch_bridge_deposits(client, eth_bridges)
    withdrawals = fetch_bridge_withdrawals(client, tron_bridges)

    print(f"[bridge_correlation] {len(deposits)} deposits into known ETH bridges, "
          f"{len(withdrawals)} withdrawals from known Tron bridges")

    matches = correlate_bridge_edges(deposits, withdrawals)
    write_bridge_edges(client, matches)

    entity_matches = correlate_by_shared_entity(client)
    write_entity_correlation_edges(client, entity_matches)

    client.close()


if __name__ == "__main__":
    main()