"""Leakage-free behavioral features for the three supported chains.

These features are derived only from observed transactions represented by
``TransferEdge`` objects (and optional Bitcoin raw transaction summaries).
Labels, label confidence, risk scores, attribution, hop distance, and other
post-label investigation results are deliberately excluded from the ML
schemas.
"""

from collections import defaultdict

import pandas as pd


CHAIN_FEATURE_COLUMNS = {
    "ethereum": ["in_count", "out_count", "in_volume", "out_volume", "unique_counterparties", "fan_in", "fan_out", "transaction_velocity", "active_duration_hours", "asset_count", "out_in_ratio", "token_transfer_count", "contract_interaction_count"],
    "tron": ["in_count", "out_count", "in_volume", "out_volume", "unique_counterparties", "fan_in", "fan_out", "transaction_velocity", "active_duration_hours", "asset_count", "out_in_ratio", "token_transfer_count", "contract_interaction_count"],
    "bitcoin": ["transaction_count", "input_count", "output_count", "in_volume", "out_volume", "unique_counterparties", "fan_in", "fan_out", "transaction_velocity", "active_duration_hours", "out_in_ratio", "utxo_inferred_edges", "asset_count"],
}


def build_chain_features(nodes: list, edges: list, seed_address: str, raw_transactions: list[dict] | None = None) -> pd.DataFrame:
    """Build a deterministic, chain-specific behavioral feature matrix."""
    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for edge in edges:
        outgoing[edge.from_address].append(edge)
        incoming[edge.to_address].append(edge)
    rows = []
    for node in nodes:
        ins = incoming[node.address]
        outs = outgoing[node.address]
        in_volume = sum(edge.amount or 0 for edge in ins)
        out_volume = sum(edge.amount or 0 for edge in outs)
        counterparties = {edge.from_address for edge in ins} | {edge.to_address for edge in outs}
        timestamps = [edge.timestamp for edge in ins + outs if edge.timestamp]
        assets = {edge.asset for edge in ins + outs}
        token_edges = sum(1 for edge in ins + outs if edge.asset not in {"ETH", "BTC", "TRX"})
        common = {
            "address": node.address,
            "in_count": len(ins), "out_count": len(outs),
            "in_volume": in_volume, "out_volume": out_volume,
            "unique_counterparties": len(counterparties),
            "fan_in": len({edge.from_address for edge in ins}),
            "fan_out": len({edge.to_address for edge in outs}),
            "transaction_velocity": len({edge.tx_hash for edge in ins + outs}) / max(len({item.date() for item in timestamps}), 1),
            "active_duration_hours": ((max(timestamps) - min(timestamps)).total_seconds() / 3600.0) if len(timestamps) > 1 else 0.0,
            "asset_count": len(assets),
            "out_in_ratio": out_volume / in_volume if in_volume else 0.0,
        }
        if node.chain.value in {"ethereum", "tron"}:
            rows.append({**common, "token_transfer_count": token_edges, "contract_interaction_count": token_edges})
        else:
            transactions = raw_transactions or []
            relevant = [item for item in transactions if node.address in item.get("inputs", []) or node.address in {output[0] for output in item.get("outputs", [])}]
            input_count = sum(item.get("inputs", []).count(node.address) for item in relevant)
            output_count = sum(sum(1 for output in item.get("outputs", []) if output[0] == node.address) for item in relevant)
            rows.append({
                **common,
                "transaction_count": len(relevant) if transactions else len({edge.tx_hash for edge in ins + outs}),
                "input_count": input_count if transactions else len(ins),
                "output_count": output_count if transactions else len(outs),
                "utxo_inferred_edges": sum(1 for edge in ins + outs if edge.evidence_type == "utxo_allocation_inferred"),
            })
    columns = ["address", *CHAIN_FEATURE_COLUMNS[nodes[0].chain.value]] if nodes else ["address"]
    return pd.DataFrame(rows, columns=columns)


def feature_columns_for_chain(chain: str) -> list[str]:
    if chain not in CHAIN_FEATURE_COLUMNS:
        raise ValueError(f"Unsupported chain: {chain}")
    return CHAIN_FEATURE_COLUMNS[chain]