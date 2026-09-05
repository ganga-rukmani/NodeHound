"""SAHYOG-compatible export boundary with explicit provenance."""


def to_sahyog_payload(investigation: dict) -> dict:
    return {"schema": "nodehound-investigation-v1", "source_system": "NodeHound", "reported_wallet": investigation.get("reported_wallet"), "chain": investigation.get("chain"), "investigation_period": investigation.get("investigation_period"), "risk_category": investigation.get("risk_category"), "candidates": investigation.get("candidates", []), "fund_flow": investigation.get("fund_flow", []), "evidence": investigation.get("evidence", []), "evidence_integrity_hash": investigation.get("evidence_integrity_hash"), "integration_status": "payload-ready; transmission endpoint not configured"}