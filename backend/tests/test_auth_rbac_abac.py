"""
backend/tests/test_auth_rbac_abac.py

Comprehensive test suite verifying:
1. Investigator accessing own case -> ALLOW
2. Investigator accessing assigned case -> ALLOW
3. Investigator accessing another investigator's case -> DENY
4. Supervisor accessing same-unit case -> ALLOW
5. Supervisor accessing unauthorized unit case -> DENY
6. Investigator attempting approval -> DENY
7. Investigator attempting role escalation -> DENY
8. User changing case ID in URL (IDOR) -> DENY
9. Unauthorized evidence export -> DENY
10. Self-approval prevention (creator cannot approve own case) -> DENY
11. Argon2id password hashing and verification
12. Brute-force progressive lockout
"""

import os
import pytest
from fastapi.testclient import TestClient

from api.main import app
from auth.database import init_database, get_connection
from auth.security import (
    hash_password,
    verify_password,
    validate_password_strength,
)
from auth.authorization import evaluate_case_abac, Role

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    """Initializes and seeds database before running tests."""
    init_database()


def get_token(email: str, password: str = "NodeHound@SecOps2026!") -> str:
    """Helper to log in and retrieve access token."""
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


# ─────────────────────────────────────────────────────────────────────────────
# Required Security & Authorization Tests (1 - 10)
# ─────────────────────────────────────────────────────────────────────────────

def test_1_investigator_accessing_own_case_allowed():
    """1. Investigator accessing own case -> ALLOW"""
    token = get_token("investigator1@nodehound.gov")
    # CASE-2026-ETH01 was created by investigator1
    res = client.get(
        "/api/cases/CASE-2026-ETH01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["case_id"] == "CASE-2026-ETH01"


def test_2_investigator_accessing_assigned_case_allowed():
    """2. Investigator accessing assigned case -> ALLOW"""
    token = get_token("investigator1@nodehound.gov")
    # CASE-2026-ETH01 is assigned to investigator1
    res = client.get(
        "/api/cases/CASE-2026-ETH01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["assigned_investigator"] == "usr_inv_101"


def test_3_investigator_accessing_other_case_denied():
    """3. Investigator accessing another investigator's case -> DENY (403/404)"""
    token = get_token("investigator1@nodehound.gov")
    # CASE-2026-TRON01 belongs to investigator2 in UNIT-BETA-FININT
    res = client.get(
        "/api/cases/CASE-2026-TRON01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code in (403, 404)
    assert "Access Denied" in res.json().get("detail", "") or "not found" in res.json().get("detail", "").lower()


def test_4_supervisor_accessing_same_unit_case_allowed():
    """4. Supervisor accessing same-unit case -> ALLOW"""
    token = get_token("supervisor@nodehound.gov")
    # CASE-2026-ETH01 is in UNIT-ALPHA-CYBER (same unit as supervisor)
    res = client.get(
        "/api/cases/CASE-2026-ETH01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["unit_id"] == "UNIT-ALPHA-CYBER"


def test_5_supervisor_accessing_unauthorized_unit_case_denied():
    """5. Supervisor accessing unauthorized unit case -> DENY"""
    token = get_token("supervisor@nodehound.gov")
    # CASE-2026-TRON01 is in UNIT-BETA-FININT (supervisor is in UNIT-ALPHA-CYBER)
    res = client.get(
        "/api/cases/CASE-2026-TRON01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "supervisor is assigned to 'UNIT-ALPHA-CYBER'" in res.json()["detail"]


def test_6_investigator_attempting_approval_denied():
    """6. Investigator attempting approval -> DENY (403)"""
    token = get_token("investigator1@nodehound.gov")
    # CASE-2026-ETH02 is in UNDER_REVIEW state
    res = client.post(
        "/api/cases/CASE-2026-ETH02/review",
        json={"decision": "APPROVED", "comments": "Self approved by investigator"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Only Investigation Supervisors" in res.json()["detail"] or "not granted permission" in res.json()["detail"]


def test_7_investigator_attempting_role_escalation_denied():
    """7. Investigator attempting role escalation -> DENY (403)"""
    token = get_token("investigator1@nodehound.gov")
    # Attempting to access supervisor/admin user approval endpoint
    res = client.post(
        "/api/auth/users/usr_inv_202/approve",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Unauthorized" in res.json()["detail"] or "Only supervisors" in res.json()["detail"]


def test_8_user_changing_case_id_in_url_idor_denied():
    """8. User changing case ID in URL (IDOR / BOLA) -> DENY"""
    token = get_token("investigator1@nodehound.gov")
    # Tampering URL from authorized case to another unit's case
    res = client.get(
        "/api/cases/CASE-2026-TRON01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code in (403, 404)
    # Tampering URL to non-existent case
    res_fake = client.get(
        "/api/cases/CASE-9999-NONEXISTENT",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_fake.status_code == 404


def test_9_unauthorized_evidence_export_denied():
    """9. Unauthorized evidence export -> DENY"""
    user_sysadmin = {"id": "usr_adm_001", "role": "SYSTEM_ADMINISTRATOR", "unit_id": "SYS-INFRA"}
    case_sample = {"case_id": "CASE-2026-ETH01", "created_by": "usr_inv_101", "unit_id": "UNIT-ALPHA-CYBER"}
    allowed, reason = evaluate_case_abac(user_sysadmin, case_sample, "evidence:export_authorized")
    assert not allowed
    assert "not granted permission" in reason or "System Administrators are prohibited" in reason

    user_other_inv = {"id": "usr_inv_202", "role": "INVESTIGATOR", "unit_id": "UNIT-BETA-FININT"}
    allowed_inv, reason_inv = evaluate_case_abac(user_other_inv, case_sample, "evidence:export_authorized")
    assert not allowed_inv
    assert "Unauthorized: Investigator is not the creator" in reason_inv


def test_10_self_approval_prevention():
    """10. Self-approval prevention (creator cannot approve their own case) -> DENY"""
    # Create case where creator is supervisor herself
    supervisor_user = {
        "id": "usr_sup_001",
        "role": "INVESTIGATION_SUPERVISOR",
        "unit_id": "UNIT-ALPHA-CYBER",
        "status": "ACTIVE"
    }
    case_created_by_supervisor = {
        "case_id": "CASE-2026-SUP01",
        "created_by": "usr_sup_001",  # Creator is the supervisor
        "unit_id": "UNIT-ALPHA-CYBER",
        "status": "UNDER_REVIEW"
    }

    # Supervisor attempts to approve her own case
    allowed, reason = evaluate_case_abac(supervisor_user, case_created_by_supervisor, "case:approve")
    assert not allowed
    assert "Separation of duties violation: A supervisor who created this case cannot approve their own investigation." in reason


# ─────────────────────────────────────────────────────────────────────────────
# Cryptographic & Password Security Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_11_argon2id_password_hashing():
    """11. Verifies Argon2id complexity, salt generation, and verification."""
    pwd = "SecOps!TestPass2026"
    h1 = hash_password(pwd)
    h2 = hash_password(pwd)
    assert h1.startswith("$argon2id$")
    assert h1 != h2, "Argon2id must use unique cryptographic salts"
    assert verify_password(pwd, h1)
    assert not verify_password("WrongPassword!", h1)


def test_12_password_policy_enforcement():
    """12. Verifies password policy rejects weak, short, or common passwords."""
    assert not validate_password_strength("short")[0]
    assert not validate_password_strength("nouppercase123!")[0]
    assert not validate_password_strength("NOLOWERCASE123!")[0]
    assert not validate_password_strength("NoSpecialChar123")[0]
    assert not validate_password_strength("password123")[0]
    assert validate_password_strength("Valid@Pass2026!")[0]


def test_13_brute_force_lockout():
    """13. Verifies account lockout occurs after repeated failed login attempts."""
    # Attempt 5 consecutive bad logins
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "investigator2@nodehound.gov", "password": "WrongPassword123!"})

    # 6th attempt should return 423 Locked
    res = client.post("/api/auth/login", json={"email": "investigator2@nodehound.gov", "password": "NodeHound@SecOps2026!"})
    assert res.status_code == 423
    assert "locked" in res.json()["detail"].lower()

    # Reset lockout in database for subsequent tests
    conn = get_connection()
    conn.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'investigator2@nodehound.gov'")
    conn.commit()
    conn.close()
