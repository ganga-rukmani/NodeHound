"""
backend/tests/test_prompts_3_to_7.py

Automated test suite verifying:
- Prompt 3: Suspicious Wallet Prioritization (Ranking, Evidence->Reason->Action, Status tagging)
- Prompt 4: Fund Flow DNA (Chain-specific groups, deterministic interpretation, no fabricated ML)
- Prompt 5: Investigation Replay (Chronological ordering, hop levels, candidate flags)
- Prompt 6: Case Workspace & Timeline (Immutable events, distinct investigator notes)
- Prompt 7: Supervisor Console & Case Closure (Unit isolation, assignment, closure with reason, IDOR protection)
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from auth.database import init_database, get_connection
from auth.security import create_access_token

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_auth_db():
    init_database()


@pytest.fixture(autouse=True)
def reset_case_state():
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE cases SET status = 'ACTIVE', closed_by = NULL, closed_at = NULL, closure_reason = NULL WHERE case_id = 'CASE-2026-ETH01'"
        )
        conn.commit()
    finally:
        conn.close()


def get_auth_header(user_id: str, email: str, role: str, unit_id: str, full_name: str = "Test User") -> dict:
    token = create_access_token({
        "sub": user_id,
        "email": email,
        "role": role,
        "unit_id": unit_id,
        "investigator_id": "TEST-01",
        "full_name": full_name,
    })
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 3: Suspicious Wallet Prioritization Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_prioritization_authorized_access_and_evidence_structure():
    """Authorized investigator receives candidate ranking with Evidence -> Reason -> Action."""
    # CASE-2026-ETH01 belongs to UNIT-ALPHA-CYBER, assigned to usr_inv_101
    headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    res = client.get("/api/cases/CASE-2026-ETH01/prioritization", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["case_id"] == "CASE-2026-ETH01"
    assert "candidates" in data
    assert len(data["candidates"]) > 0

    c1 = data["candidates"][0]
    assert "tier" in c1
    assert "priority_rank" in c1
    assert "priority_label" in c1
    assert "evidence" in c1
    assert "reason" in c1
    assert "recommended_action" in c1
    assert "why_prioritized" in c1
    assert isinstance(c1["why_prioritized"], list)

    # Verify terminology: Never claim exact attacker
    assert "attacker" not in c1["priority_label"].lower()
    assert "disclaimer" in data
    assert "does not by itself establish ownership" in data["disclaimer"]


def test_prioritization_unauthorized_case_denied():
    """Investigator in UNIT-BETA-FININT cannot view prioritization for UNIT-ALPHA-CYBER case."""
    headers = get_auth_header("usr_inv_202", "investigator2@nodehound.gov", "INVESTIGATOR", "UNIT-BETA-FININT")
    res = client.get("/api/cases/CASE-2026-ETH01/prioritization", headers=headers)
    assert res.status_code == 403


def test_candidate_status_tagging_and_persistence():
    """Investigator can mark candidate as WATCHLIST, INVESTIGATION_PRIORITY, or REVIEWED."""
    headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    test_addr = "0x742d35cc6634c0532925a3b844bc454e4438f44e"

    # 1. Update status to WATCHLIST
    res = client.post(
        f"/api/cases/CASE-2026-ETH01/candidates/{test_addr}/status",
        headers=headers,
        json={"status": "WATCHLIST", "notes": "Flagged for manual OTC bridge review"}
    )
    assert res.status_code == 200, res.text

    # 2. Verify prioritization reflects status
    res2 = client.get("/api/cases/CASE-2026-ETH01/prioritization", headers=headers)
    assert res2.status_code == 200
    matched = next((c for c in res2.json()["candidates"] if c["address"].lower() == test_addr.lower()), None)
    assert matched is not None
    assert matched["status"] == "WATCHLIST"
    assert "OTC bridge" in matched["notes"]


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 4: Fund Flow DNA Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_fund_flow_dna_features_and_disclaimer():
    """Fund Flow DNA returns grouped behavioral features without fabricated ML scores."""
    headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    res = client.get("/api/cases/CASE-2026-ETH01/dna/0x742d35cc6634c0532925a3b844bc454e4438f44e", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "feature_groups" in data
    fg = data["feature_groups"]
    assert "FLOW_STRUCTURE" in fg
    assert "VELOCITY" in fg
    assert "COUNTERPARTY_BEHAVIOR" in fg
    assert "VALUE_FLOW" in fg
    assert "ASSET_CONTRACT_ACTIVITY" in fg

    assert "interpretations" in data
    assert "what_does_this_mean" in data
    assert "disclaimer" in data
    assert "does not establish ownership" in data["disclaimer"]

    # Verify no fake probability score
    ml_status = data.get("ml_model_status", {})
    assert ml_status.get("model_active") is False


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 5: Investigation Replay Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_investigation_replay_chronological_sequence():
    """Investigation Replay provides chronologically ordered events with hop levels and candidate labels."""
    headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    res = client.get("/api/cases/CASE-2026-ETH01/replay", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "events" in data
    events = data["events"]
    assert len(events) >= 2

    # Check chronological ordering
    timestamps = [e["timestamp"] for e in events if e.get("timestamp")]
    assert timestamps == sorted(timestamps)

    # Check event fields and hop labels
    for e in events:
        assert "event_index" in e
        assert "source" in e
        assert "destination" in e
        assert "hop" in e
        assert "hop_label" in e
        assert e["event_type"] == "FUND MOVEMENT DETECTED"
        if e.get("is_high_priority_candidate"):
            assert e["candidate_label"] == "HIGH-PRIORITY INVESTIGATION CANDIDATE"
            assert "attacker" not in e["candidate_label"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 6: Case Timeline & Investigator Notes Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_case_notes_distinguished_from_blockchain_evidence():
    """Investigator notes can be created and retrieved distinctly from evidence."""
    headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")

    # Add note
    res = client.post(
        "/api/cases/CASE-2026-ETH01/notes",
        headers=headers,
        json={"content": "Reviewed hop 2 liquidity cluster with cross-reference to OTC registry."}
    )
    assert res.status_code == 201, res.text
    note = res.json()
    assert note["author_name"] == "Officer Alex Vance"

    # Retrieve notes
    res2 = client.get("/api/cases/CASE-2026-ETH01/notes", headers=headers)
    assert res2.status_code == 200
    notes = res2.json()
    assert any("Reviewed hop 2" in n["content"] for n in notes)

    # Verify timeline reflects the note event
    res3 = client.get("/api/cases/CASE-2026-ETH01/timeline", headers=headers)
    assert res3.status_code == 200
    timeline = res3.json()["events"]
    assert any(e["action"] == "INVESTIGATOR_NOTE_ADDED" for e in timeline)


# ─────────────────────────────────────────────────────────────────────────────
# Prompt 7: Supervisor Console, Case Assignment, & Closure Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_supervisor_console_access_and_unit_isolation():
    """Supervisor console is accessible to Investigation Supervisors for their unit."""
    sup_headers = get_auth_header("usr_sup_001", "supervisor@nodehound.gov", "INVESTIGATION_SUPERVISOR", "UNIT-ALPHA-CYBER")
    res = client.get("/api/cases/supervisor/console", headers=sup_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["unit_id"] == "UNIT-ALPHA-CYBER"
    assert "metrics" in data
    assert "cases" in data
    assert "unit_investigators" in data

    # Investigator cannot access supervisor console
    inv_headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")
    res2 = client.get("/api/cases/supervisor/console", headers=inv_headers)
    assert res2.status_code == 403


def test_supervisor_case_closure_requires_valid_status_and_reason():
    """Supervisor can close active/approved cases with formal reason; investigator cannot."""
    sup_headers = get_auth_header("usr_sup_001", "supervisor@nodehound.gov", "INVESTIGATION_SUPERVISOR", "UNIT-ALPHA-CYBER")
    inv_headers = get_auth_header("usr_inv_101", "investigator1@nodehound.gov", "INVESTIGATOR", "UNIT-ALPHA-CYBER")

    # 1. Investigator attempt to close case is denied
    res_inv = client.post(
        "/api/cases/CASE-2026-ETH01/close",
        headers=inv_headers,
        json={"reason": "Investigator closure attempt"}
    )
    assert res_inv.status_code == 403

    # 2. Supervisor closes case with reason
    res_sup = client.post(
        "/api/cases/CASE-2026-ETH01/close",
        headers=sup_headers,
        json={"reason": "Investigation completed; evidence preserved and referred to asset recovery."}
    )
    assert res_sup.status_code == 200, res_sup.text
    assert res_sup.json()["status"] == "CLOSED"
    assert res_sup.json()["case"]["status"] == "CLOSED"
    assert "referred to asset recovery" in res_sup.json()["case"]["closure_reason"]
