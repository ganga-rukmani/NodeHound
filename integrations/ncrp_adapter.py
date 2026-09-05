"""NCRP/LEA integration-ready request adapter; no transmission performed."""


def to_ncrp_case(investigation: dict) -> dict:
    return {"case_type": "crypto_forensics_investigation", "reported_wallet": investigation.get("reported_wallet"), "chain": investigation.get("chain"), "period": investigation.get("investigation_period"), "risk_category": investigation.get("risk_category"), "attribution_tier": investigation.get("attribution_tier"), "evidence": investigation.get("evidence", []), "integrity_hash": investigation.get("evidence_integrity_hash"), "integration_status": "adapter-ready; agency endpoint and authentication not configured"}