"""
bitcoin_heuristic_score.py

Fallback risk scoring for Bitcoin addresses.

HONEST FRAMING (say this explicitly if asked): NodeHound has no trained ML
model that can score a live Bitcoin address. The XGBoost model is trained
on Ethereum-specific behavioral features; the GraphSAGE GNN is trained and
validated only on Elliptic's anonymized academic dataset, which cannot be
applied to live addresses. This module is a stated, rule-based fallback —
not equivalent rigor to the Ethereum pipeline — used so the Bitcoin trace
path can still surface a usable risk signal for the demo.

Scoring logic (transparent, explainable by construction — every point is
traceable to a specific reason, matching the project's explainability
principle):

  +40  Direct label match (GraphSense BTC known-entity label)
  +35  Address sits in a CIOH cluster containing a labeled entity
  +20  High transaction velocity relative to cluster peers
  +15  Address received funds from another flagged/high-risk address
  -10  Address has long dormant history with no flagged connections
       (dampens false positives on old, quiet addresses)

Score is clipped to [0, 100] and returned alongside a plain-language
reason list — same explainability contract as the Ethereum SHAP output,
just via simple rule attribution instead of a trained model.
"""

from dataclasses import dataclass, field


@dataclass
class BitcoinRiskResult:
    address: str
    score: float
    tier: str  # "high", "medium", "low"
    reasons: list[str] = field(default_factory=list)


def score_bitcoin_address(
    address: str,
    direct_label: str | None,
    cluster_has_labeled_entity: bool,
    tx_velocity_percentile: float,  # 0.0-1.0, relative to cluster peers
    received_from_flagged: bool,
    is_dormant_and_unconnected: bool,
) -> BitcoinRiskResult:
    """
    All inputs should be computed upstream from your existing
    bitcoin_cluster.py (CIOH) and label_bitcoin_nodes.py outputs —
    this function only combines already-computed signals into a score.
    """
    score = 0.0
    reasons = []

    if direct_label:
        score += 40
        reasons.append(f"Directly labeled as '{direct_label}' (GraphSense)")

    if cluster_has_labeled_entity:
        score += 35
        reasons.append("Belongs to a CIOH cluster containing a known entity")

    if tx_velocity_percentile >= 0.8:
        score += 20
        reasons.append("Transaction velocity in top 20% of its cluster")

    if received_from_flagged:
        score += 15
        reasons.append("Received funds directly from a flagged address")

    if is_dormant_and_unconnected:
        score -= 10
        reasons.append("Long dormant history with no flagged connections "
                        "(reduces false-positive risk)")

    score = max(0.0, min(100.0, score))

    if score >= 60:
        tier = "high"
    elif score >= 30:
        tier = "medium"
    else:
        tier = "low"

    if not reasons:
        reasons.append("No risk signals detected — insufficient evidence "
                        "for elevated risk classification")

    return BitcoinRiskResult(address=address, score=score, tier=tier, reasons=reasons)


if __name__ == "__main__":
    # Smoke test
    result = score_bitcoin_address(
        address="1SampleAddress",
        direct_label="Known Ransomware Wallet",
        cluster_has_labeled_entity=True,
        tx_velocity_percentile=0.9,
        received_from_flagged=True,
        is_dormant_and_unconnected=False,
    )
    print(result)