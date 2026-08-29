"""
graph/schema.py

Unified graph schema shared across Ethereum, Bitcoin, and Tron.

Every chain adapter (ingestion/*_adapter.py) must convert its chain-native
data into these two shapes before writing to Neo4j. This is what lets one
path-finding / clustering / scoring pipeline work across all three chains
instead of three separate ones.

Design principle: keep chain-specific detail (e.g. Bitcoin's UTXO
inputs/outputs, Ethereum's gas fields) OUT of this schema. Store that raw
detail separately if needed (e.g. in a raw_tx cache), and only distill it
down to these common fields for the graph. The graph is for path-finding
and attribution, not full forensic replay.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class Chain(str, Enum):
    ETHEREUM = "ethereum"
    BITCOIN = "bitcoin"
    TRON = "tron"


class LabelCategory(str, Enum):
    """Matches the 'category' column convention used across your label CSVs."""
    EXCHANGE = "exchange"
    SANCTIONED = "sanctioned"
    MIXER = "mixer"
    BRIDGE = "bridge"
    SCAM_HEIST = "scam_heist"
    CONTRACT_OR_TOKEN = "contract_or_token"
    VERIFIED_EXCHANGE_OR_ENTITY = "verified_exchange_or_entity"
    UNKNOWN = "unknown"


class AttributionTier(str, Enum):
    """Known/Probable/Unknown framing from the original problem statement."""
    KNOWN = "known"          # matched a label source directly
    PROBABLE = "probable"    # flagged by behavioral classifier, no direct label
    UNKNOWN = "unknown"      # no signal either way


@dataclass
class AddressNode:
    """
    Maps to a Neo4j node with label :Address.

    Neo4j creation pattern (see neo4j_client.py):
        MERGE (a:Address {chain: $chain, address: $address})
        SET a.is_labeled = $is_labeled, a.label = $label, ...

    NOTE: uniqueness is on (chain, address) together, NOT address alone —
    the same string could theoretically collide across chains, and keeping
    chain explicit avoids any ambiguity when a bridge edge later connects
    an Ethereum address to a Tron address.
    """
    chain: Chain
    address: str

    is_labeled: bool = False
    label: Optional[str] = None                 # e.g. "Bitfinex", "TetherToken"
    category: Optional[LabelCategory] = None
    label_source: Optional[str] = None           # e.g. "etherscan_labels", "ofac", "tronscan_account_api"

    attribution_tier: AttributionTier = AttributionTier.UNKNOWN

    # Populated later by clustering modules (Step 3) - which entity cluster
    # this address was merged into, if any. Left None until clustering runs.
    cluster_id: Optional[str] = None

    # Populated by graph/rank_destinations.py (Step 4, Personalized PageRank
    # / Random Walk with Restart). This is a GRAPH PROXIMITY score -
    # "how reachable is this node from the seed address" - deliberately
    # kept separate from risk_score below, which comes from the trained
    # ML model (Step 5/6). Conflating the two would misrepresent a
    # structural signal as a calibrated probability.
    path_rank_score: Optional[float] = None

    # Populated later by scoring modules (Step 5/6) - filled in after the
    # XGBoost/GNN model + calibration run, not at ingestion time.
    risk_score: Optional[float] = None            # calibrated 0-1 probability
    risk_score_raw: Optional[float] = None         # pre-calibration model output

    def neo4j_properties(self) -> dict:
        """Flat dict of primitive values for writing to Neo4j (enums -> str)."""
        return {
            "chain": self.chain.value,
            "address": self.address,
            "is_labeled": self.is_labeled,
            "label": self.label,
            "category": self.category.value if self.category else None,
            "label_source": self.label_source,
            "attribution_tier": self.attribution_tier.value,
            "cluster_id": self.cluster_id,
            "path_rank_score": self.path_rank_score,
            "risk_score": self.risk_score,
            "risk_score_raw": self.risk_score_raw,
        }


@dataclass
class TransferEdge:
    """
    Maps to a Neo4j relationship :TRANSFER between two :Address nodes.

    Neo4j creation pattern:
        MATCH (from:Address {chain: $chain, address: $from_address})
        MATCH (to:Address {chain: $chain, address: $to_address})
        MERGE (from)-[t:TRANSFER {tx_hash: $tx_hash}]->(to)
        SET t.asset = $asset, t.amount = $amount, ...

    For Bitcoin specifically: one transaction can have multiple inputs and
    multiple outputs (UTXO model). Adapters must expand a single Bitcoin tx
    into one TransferEdge per (input_address, output_address) pair that
    makes sense for tracing (commonly: every input paired with every
    non-change output, or a simplified heuristic - decide this in
    bitcoin_adapter.py, not here). This schema only models the resulting
    pairwise edges, not the raw UTXO structure itself.
    """
    chain: Chain
    tx_hash: str

    from_address: str
    to_address: str

    asset: str                # e.g. "ETH", "BTC", "USDT-TRC20"
    amount: float              # in the asset's native unit, NOT wei/satoshi
    amount_usd: Optional[float] = None   # filled in if a price lookup is done

    timestamp: Optional[datetime] = None
    block_number: Optional[int] = None

    # Set to True by bridge_correlation.py (Step 9) when this edge is
    # inferred (time+amount matched) rather than directly observed on-chain.
    is_inferred_bridge_edge: bool = False

    def neo4j_properties(self) -> dict:
        return {
            "chain": self.chain.value,
            "tx_hash": self.tx_hash,
            "asset": self.asset,
            "amount": self.amount,
            "amount_usd": self.amount_usd,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "block_number": self.block_number,
            "is_inferred_bridge_edge": self.is_inferred_bridge_edge,
        }


# ---------------------------------------------------------------------------
# Neo4j constraints / indexes - run these ONCE when the DB is first set up.
# Put this in neo4j_client.py's init routine, referenced here so schema.py
# stays the single source of truth for "what the graph shape is."
# ---------------------------------------------------------------------------

SCHEMA_SETUP_CYPHER = [
    # Composite uniqueness: (chain, address) together identify a node
    "CREATE CONSTRAINT address_chain_unique IF NOT EXISTS "
    "FOR (a:Address) REQUIRE (a.chain, a.address) IS UNIQUE",

    # Speeds up label-based lookups (e.g. "find all known exchange nodes")
    "CREATE INDEX address_category_idx IF NOT EXISTS "
    "FOR (a:Address) ON (a.category)",

    "CREATE INDEX address_tier_idx IF NOT EXISTS "
    "FOR (a:Address) ON (a.attribution_tier)",

    # Speeds up tx_hash lookups when de-duplicating edges on re-ingestion
    "CREATE INDEX transfer_tx_hash_idx IF NOT EXISTS "
    "FOR ()-[t:TRANSFER]-() ON (t.tx_hash)",
]