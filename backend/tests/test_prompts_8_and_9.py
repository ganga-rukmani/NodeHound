"""
backend/tests/test_prompts_8_and_9.py

Comprehensive automated test suite for:
- Prompt 8: Fraud Typology Classification
- Prompt 9: Investigator Action & Disclosure Packet
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from auth.database import get_connection, init_database
from auth.security import create_access_token


@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    """Ensure database tables and initial personas are initialized."""
    init_database()


@pytest.fixture
def reset_case_state():
    """Ensures test case CASE-2026-ETH01 is reset to clean ACTIVE state for testing."""
    conn = get_connection()
    try:
        conn.execute("""
        UPDATE cases
        SET status = 'ACTIVE',
            closed_by = NULL,
            closed_at = NULL,
            closure_reason = NULL,
            fraud_typology = 'UNKNOWN',
            fraud_typology_source = 'UNKNOWN',
            fraud_typology_secondary = NULL,
            victim_wallet = '0xdac17f958d2ee523a2206206994597c13d831ec7'
        WHERE case_id = 'CASE-2026-ETH01'
        """)
        conn.execute("DELETE FROM case_action_packets WHERE case_id = 'CASE-2026-ETH01'")
        conn.commit()
    finally:
        conn.close()


@pytest.fixture
def client():
    return TestClient(app)


def get_auth_token(user_id: str, email: str, role: str, unit_id: str) -> str:
    """Generates standard JWT access token for role/unit testing."""
    return create_access_token({
        "sub": user_id,
        "email": email,
        "role": role,
        "unit_id": unit_id,
        "investigator_id": "TEST-ID",
        "full_name": "Test Persona",
    })


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 8: Fraud Typology Classification Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_default_typology_is_unknown(client, reset_case_state):
    """Verifies that a case defaults to UNKNOWN typology and UNKNOWN source."""
    token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    resp = client.get("/api/cases/CASE-2026-ETH01", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    case_data = resp.json()
    assert case_data["fraud_typology"] == "UNKNOWN"
    assert case_data["fraud_typology_source"] == "UNKNOWN"


def test_investigator_can_set_typology_for_authorized_case(client, reset_case_state):
    """Verifies that an authorized investigator can classify the case with a controlled typology."""
    token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    payload = {
        "fraud_typology": "Ransomware",
        "fraud_typology_source": "INVESTIGATOR",
        "fraud_typology_secondary": "Extortion"
    }
    resp = client.post(
        "/api/cases/CASE-2026-ETH01/typology",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["fraud_typology"] == "Ransomware"
    assert data["fraud_typology_source"] == "INVESTIGATOR"
    assert data["fraud_typology_secondary"] == "Extortion"
    assert "disclaimer" in data

    # Verify persistence via get_case
    get_resp = client.get("/api/cases/CASE-2026-ETH01", headers={"Authorization": f"Bearer {token}"})
    assert get_resp.status_code == 200
    assert get_resp.json()["fraud_typology"] == "Ransomware"


def test_unauthorized_investigator_cannot_modify_typology(client, reset_case_state):
    """Verifies that an investigator from another unit cannot classify another investigator's case (IDOR/BOLA)."""
    # usr_inv_202 belongs to UNIT-BETA-FININT
    token_beta = get_auth_token("usr_inv_202", "investigator2@nodehound.gov", "INVESTIGATOR", "UNIT-BETA-FININT")
    resp = client.post(
        "/api/cases/CASE-2026-ETH01/typology",
        json={"fraud_typology": "Pig Butchering", "fraud_typology_source": "INVESTIGATOR"},
        headers={"Authorization": f"Bearer {token_beta}"}
    )
    assert resp.status_code == 403


def test_supervisor_can_view_typology(client, reset_case_state):
    """Verifies that a supervisor within the unit can view the investigator's classification."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    client.post(
        "/api/cases/CASE-2026-ETH01/typology",
        json={"fraud_typology": "Crypto Investment Fraud", "fraud_typology_source": "COMPLAINT"},
        headers={"Authorization": f"Bearer {inv_token}"}
    )

    sup_token = get_auth_token("usr_sup_001", "supervisor@nodehound.gov", "INVESTIGATION_SUPERVISOR", "UNIT-ALPHA-CYBER")
    resp = client.get("/api/cases/CASE-2026-ETH01", headers={"Authorization": f"Bearer {sup_token}"})
    assert resp.status_code == 200
    assert resp.json()["fraud_typology"] == "Crypto Investment Fraud"
    assert resp.json()["fraud_typology_source"] == "COMPLAINT"


def test_typology_does_not_convert_blockchain_behavior_into_crime_assertion(client, reset_case_state):
    """Verifies that raw blockchain telemetry remains neutral and distinct from the fraud typology."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    client.post(
        "/api/cases/CASE-2026-ETH01/typology",
        json={"fraud_typology": "Ransomware", "fraud_typology_source": "INVESTIGATOR"},
        headers={"Authorization": f"Bearer {inv_token}"}
    )

    prior_resp = client.get("/api/cases/CASE-2026-ETH01/prioritization", headers={"Authorization": f"Bearer {inv_token}"})
    assert prior_resp.status_code == 200
    pdata = prior_resp.json()
    # Ensure candidates use "High-Priority Investigation Candidate" and do NOT claim "Ransomware Wallet"
    for cand in pdata["candidates"]:
        assert "Attacker Wallet" not in cand["priority_label"]
        assert "Ransomware" not in cand["tier"]


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 9: Investigator Action & Disclosure Packet Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_packet_generation_contains_all_statutory_sections(client, reset_case_state):
    """Verifies that packet generation includes all 12 statutory sections with SHA-256 evidence hash."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    resp = client.post("/api/cases/CASE-2026-ETH01/packet/generate", headers={"Authorization": f"Bearer {inv_token}"})
    assert resp.status_code == 200
    record = resp.json()

    assert record["status"] == "DRAFT"
    packet = record["packet"]
    assert "case" in packet
    assert "incident" in packet
    assert "fraud_typology" in packet
    assert "blockchain" in packet
    assert "fund_flow" in packet
    assert "suspicious_candidates" in packet
    assert "attribution" in packet
    assert "vasp_exposure" in packet
    assert "alerts" in packet
    assert "findings" in packet
    assert "recommendations" in packet
    assert "evidence" in packet
    assert "review" in packet

    # Evidence hash check
    evidence = packet["evidence"]
    assert evidence["hash_algorithm"] == "SHA-256"
    assert len(evidence["evidence_integrity_hash"]) == 64


def test_packet_missing_fields_default_to_not_available(client, reset_case_state):
    """Verifies that missing incident fields are rendered as 'Not available' without synthetic fabrication."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    resp = client.get("/api/cases/CASE-2026-ETH01/packet", headers={"Authorization": f"Bearer {inv_token}"})
    assert resp.status_code == 200
    packet = resp.json()["packet"]
    incident = packet["incident"]
    # Check that missing incident fields are 'Not available'
    assert incident["incident_date"] == "Not available"
    assert incident["complaint_reference"] == "Not available"


def test_packet_status_lifecycle_and_submission(client, reset_case_state):
    """Verifies transition from DRAFT to READY_FOR_REVIEW."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    client.post("/api/cases/CASE-2026-ETH01/packet/generate", headers={"Authorization": f"Bearer {inv_token}"})

    submit_resp = client.post("/api/cases/CASE-2026-ETH01/packet/submit", headers={"Authorization": f"Bearer {inv_token}"})
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "READY_FOR_REVIEW"


def test_packet_supervisor_review_and_self_approval_prevention(client, reset_case_state):
    """Verifies supervisor review and enforces separation of duties (blocks self-approval)."""
    # Directly seed a case where creator is supervisor herself
    conn = get_connection()
    try:
        conn.execute("""
        INSERT OR REPLACE INTO cases (
            case_id, title, created_by, unit_id, blockchain, seed_address, status, priority, classification, hop_count, created_at, updated_at
        ) VALUES (
            'CASE-2026-SUP01', 'Supervisor Created Case', 'usr_sup_001', 'UNIT-ALPHA-CYBER', 'ethereum',
            '0xdac17f958d2ee523a2206206994597c13d831ec7', 'ACTIVE', 'HIGH', 'CONFIDENTIAL', 3,
            '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z'
        )
        """)
        conn.commit()
    finally:
        conn.close()

    sup1_token = get_auth_token("usr_sup_001", "supervisor@nodehound.gov", "INVESTIGATION_SUPERVISOR", "UNIT-ALPHA-CYBER")

    # Generate packet
    gen_resp = client.post("/api/cases/CASE-2026-SUP01/packet/generate", headers={"Authorization": f"Bearer {sup1_token}"})
    assert gen_resp.status_code == 200

    # Supervisor attempting to approve her own case's packet must be BLOCKED
    review_resp = client.post(
        "/api/cases/CASE-2026-SUP01/packet/review",
        json={"decision": "APPROVED", "comments": "Self approval attempt"},
        headers={"Authorization": f"Bearer {sup1_token}"}
    )
    assert review_resp.status_code == 403
    assert "Separation of duties violation" in review_resp.json()["detail"]


def test_packet_json_export_structure(client, reset_case_state):
    """Verifies GET /api/cases/{case_id}/packet/json returns structured export."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    resp = client.get("/api/cases/CASE-2026-ETH01/packet/json", headers={"Authorization": f"Bearer {inv_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "case" in data
    assert "fund_flow" in data
    assert "suspicious_candidates" in data
    assert "evidence" in data


def test_packet_pdf_generation(client, reset_case_state):
    """Verifies GET /api/cases/{case_id}/packet/pdf generates and returns valid PDF bytes."""
    inv_token = get_auth_token("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    resp = client.get("/api/cases/CASE-2026-ETH01/packet/pdf", headers={"Authorization": f"Bearer {inv_token}"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
