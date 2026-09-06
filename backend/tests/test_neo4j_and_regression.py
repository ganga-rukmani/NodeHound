"""
backend/tests/test_neo4j_and_regression.py

Tests verifying:
1. Neo4j client connection health, fallback resilience, schema constraints, and Cypher directionality.
2. User authentication (registration, Argon2id hashing, login, brute-force protection, status enforcement).
3. Authorization & RBAC/ABAC (investigator access, supervisor unit access, IDOR protection).
4. System regression endpoints (/health, /api/neo4j/health, /node, /timeline).
"""

import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from api.main import app, _last_trace_cache, _last_trace_edges
from auth.database import init_database, get_connection
from auth.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from graph.schema import AddressNode, TransferEdge, Chain, AttributionTier, SCHEMA_SETUP_CYPHER
from graph.neo4j_client import Neo4jClient, get_neo4j_client

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    """Ensure database and caches are initialized."""
    init_database()


def get_token(email: str, password: str = "NodeHound@SecOps2026!") -> str:
    """Helper to log in and retrieve access token."""
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


# ==============================================================================
# 1. Neo4j Integration & Schema Verification
# ==============================================================================

def test_neo4j_client_health_check_resilience():
    """Verifies that check_health returns structured metadata without crashing."""
    client_instance = Neo4jClient(uri="bolt://127.0.0.1:9999", user="neo4j", password="password")
    health = client_instance.check_health()
    assert isinstance(health, dict)
    assert "status" in health
    assert "connected" in health
    assert "uri" in health
    # Offline port should report connected=False gracefully without throwing unhandled exceptions
    assert health["connected"] is False
    client_instance.close()


def test_neo4j_schema_constraints():
    """Verifies schema cypher statements enforce composite uniqueness on (chain, address)."""
    assert len(SCHEMA_SETUP_CYPHER) >= 4
    has_unique = any("REQUIRE (a.chain, a.address) IS UNIQUE" in s for s in SCHEMA_SETUP_CYPHER)
    assert has_unique, "Missing composite uniqueness constraint on (a.chain, a.address)"


def test_neo4j_strict_direction_preservation():
    """
    Verifies that TransferEdge mapping and Cypher queries strictly preserve
    from_address -> to_address and never reverse direction.
    """
    edge = TransferEdge(
        chain=Chain.ETHEREUM,
        tx_hash="0xabc123",
        from_address="0xsender1111",
        to_address="0xrecipient2222",
        asset="ETH",
        amount=5.5,
        evidence_type="direct_observed"
    )
    props = edge.neo4j_properties()
    assert props["tx_hash"] == "0xabc123"
    assert edge.from_address == "0xsender1111"
    assert edge.to_address == "0xrecipient2222"
    assert props["asset"] == "ETH"
    assert props["amount"] == 5.5

    # Check incoming/outgoing queries preserve direction
    test_client = Neo4jClient()
    # verify query structure by inspecting method source logic
    import inspect
    inc_source = inspect.getsource(test_client.get_incoming_transfers)
    out_source = inspect.getsource(test_client.get_outgoing_transfers)

    # Incoming query must match: (from)-[:TRANSFER]->(target) where target is address
    assert "MATCH (from:Address {chain: $chain})-[t:TRANSFER]->(target:Address {chain: $chain, address: $address})" in inc_source
    assert "from_address: from.address, to_address: target.address" in inc_source

    # Outgoing query must match: (target)-[:TRANSFER]->(to) where target is address
    assert "MATCH (target:Address {chain: $chain, address: $address})-[t:TRANSFER]->(to:Address {chain: $chain})" in out_source
    assert "from_address: target.address, to_address: to.address" in out_source
    test_client.close()


# ==============================================================================
# 2. Authentication Flow & Security Verification
# ==============================================================================

def test_successful_registration_and_argon2_hashing():
    """Verifies investigator registration and confirms password is saved only as Argon2id hash."""
    random_email = f"test_investigator_{uuid.uuid4().hex[:6]}@nodehound.gov"
    raw_password = "SecurePassword@2026!"

    res = client.post("/api/auth/register-request", json={
        "full_name": "Test Officer Alice",
        "organization_email": random_email,
        "investigator_id": "INV-TEST-01",
        "department": "Cyber Forensics",
        "unit": "UNIT-ALPHA",
        "designation": "Special Agent",
        "requested_role": "INVESTIGATOR",
        "password": raw_password,
        "confirm_password": raw_password,
    })
    assert res.status_code == 201
    assert res.json()["status"] == "PENDING"

    # Verify password hash directly in database
    conn = get_connection()
    user_row = conn.execute("SELECT password_hash, status, role FROM users WHERE email = ?", (random_email,)).fetchone()
    conn.close()

    assert user_row is not None
    stored_hash = user_row["password_hash"]
    # Check that plaintext password is NEVER stored
    assert raw_password not in stored_hash
    # Check that Argon2id hash prefix is present
    assert stored_hash.startswith("$argon2id$")
    assert verify_password(raw_password, stored_hash) is True
    assert verify_password("WrongPassword@123!", stored_hash) is False
    assert user_row["role"] == "INVESTIGATOR"


def test_duplicate_registration_rejected_generically():
    """Verifies that attempting to register an existing email is rejected generically without leaking info."""
    dup_payload = {
        "full_name": "Duplicate Investigator",
        "organization_email": "investigator1@nodehound.gov",  # existing user
        "investigator_id": "INV-DUP",
        "department": "Cyber Crime",
        "unit": "UNIT-ALPHA",
        "designation": "Analyst",
        "requested_role": "INVESTIGATOR",
        "password": "ValidPassword@123!",
        "confirm_password": "ValidPassword@123!",
    }
    res = client.post("/api/auth/register-request", json=dup_payload)
    assert res.status_code == 400
    assert "Unable to process account registration request." in res.json()["detail"]


def test_supervisor_role_escalation_prevention_at_registration():
    """Verifies an applicant cannot self-assign SUPERVISOR or SYSTEM_ADMINISTRATOR as an active role."""
    random_email = f"escalate_{uuid.uuid4().hex[:6]}@nodehound.gov"
    res = client.post("/api/auth/register-request", json={
        "full_name": "Escalation Attempter",
        "organization_email": random_email,
        "investigator_id": "INV-ESC",
        "department": "Cyber",
        "unit": "UNIT-BETA",
        "designation": "Agent",
        "requested_role": "SYSTEM_ADMINISTRATOR",
        "password": "ValidPassword@123!",
        "confirm_password": "ValidPassword@123!",
    })
    assert res.status_code == 201

    conn = get_connection()
    user_row = conn.execute("SELECT role, status FROM users WHERE email = ?", (random_email,)).fetchone()
    conn.close()

    # System administrator cannot be requested at registration; defaults to INVESTIGATOR
    assert user_row["role"] == "INVESTIGATOR"
    assert user_row["status"] == "PENDING"


def test_login_with_incorrect_password_rejected():
    """Verifies incorrect password returns generic 401."""
    res = client.post("/api/auth/login", json={
        "email": "investigator1@nodehound.gov",
        "password": "DefinitelyWrongPassword@999!"
    })
    assert res.status_code == 401
    assert "Invalid credentials" in res.json()["detail"]


def test_disabled_or_pending_account_login_prevented():
    """Verifies that PENDING or DISABLED accounts cannot authenticate."""
    conn = get_connection()
    conn.execute(
        "UPDATE users SET status = 'DISABLED' WHERE email = 'investigator2@nodehound.gov'"
    )
    conn.commit()
    conn.close()

    try:
        res = client.post("/api/auth/login", json={
            "email": "investigator2@nodehound.gov",
            "password": "NodeHound@SecOps2026!"
        })
        assert res.status_code == 403
        assert "disabled" in res.json()["detail"].lower() or "approval required" in res.json()["detail"].lower()
    finally:
        # Restore user status
        conn = get_connection()
        conn.execute(
            "UPDATE users SET status = 'ACTIVE' WHERE email = 'investigator2@nodehound.gov'"
        )
        conn.commit()
        conn.close()


def test_expired_token_rejected():
    """Verifies that an expired JWT token returns 401 Unauthorized."""
    expired_token = create_access_token(
        data={"sub": "usr_inv_101", "role": "INVESTIGATOR"},
        expires_delta=timedelta(seconds=-60)  # expired 1 minute ago
    )
    res = client.get(
        "/api/cases/CASE-2026-ETH01",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert res.status_code == 401


def test_protected_endpoints_require_authentication():
    """Verifies accessing protected case endpoints without token returns 401."""
    res = client.get("/api/cases/CASE-2026-ETH01")
    assert res.status_code == 401


# ==============================================================================
# 3. RBAC / ABAC Authorization & IDOR Protection
# ==============================================================================

def test_investigator_cannot_access_unauthorized_case_idor():
    """Verifies IDOR protection: Investigator 1 cannot access Investigator 2's unassigned case."""
    # CASE-2026-TRON01 is owned by investigator2 in UNIT-BETA
    token = get_token("investigator1@nodehound.gov")
    res = client.get(
        "/api/cases/CASE-2026-TRON01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "access denied" in res.json()["detail"].lower()


def test_supervisor_accesses_authorized_unit_cases():
    """Verifies Supervisor can access cases within their unit."""
    token = get_token("supervisor@nodehound.gov")
    res = client.get(
        "/api/cases/CASE-2026-ETH01",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["case_id"] == "CASE-2026-ETH01"


# ==============================================================================
# 4. Regression Endpoints Verification
# ==============================================================================

def test_health_endpoint():
    """Verifies the /health endpoint reports operational status."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("healthy", "degraded")
    assert "neo4j" in data
    assert "auth_database" in data
    assert data["auth_database"]["status"] == "connected"
    assert "scoring_models" in data
    assert "ingestion_adapters" in data


def test_neo4j_health_endpoint():
    """Verifies /api/neo4j/health endpoint responds with cluster diagnostics."""
    res = client.get("/api/neo4j/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "connected" in data
    assert "uri" in data


def test_node_and_timeline_endpoints_regression():
    """Verifies /node/{chain}/{address} and /timeline/{chain}/{address} endpoints."""
    # Seed a node into _last_trace_cache for testing
    test_addr = "0xdac17f958d2ee523a2206206994597c13d831ec7"
    dummy_node = AddressNode(
        chain=Chain.ETHEREUM,
        address=test_addr,
        is_labeled=True,
        label="Tether USD",
        attribution_tier=AttributionTier.KNOWN
    )
    _last_trace_cache[("ethereum", test_addr.lower())] = dummy_node

    dummy_edge = TransferEdge(
        chain=Chain.ETHEREUM,
        tx_hash="0xtesttxhash123",
        from_address=test_addr,
        to_address="0xrecipient456",
        asset="USDT",
        amount=1000.0,
        evidence_type="direct_observed"
    )
    _last_trace_edges.clear()
    _last_trace_edges.append(dummy_edge)

    # Test /node
    res_node = client.get(f"/node/ethereum/{test_addr}")
    assert res_node.status_code == 200
    assert res_node.json()["address"] == test_addr
    assert res_node.json()["label"] == "Tether USD"

    # Test /timeline
    res_timeline = client.get(f"/timeline/ethereum/{test_addr}")
    assert res_timeline.status_code == 200
    assert res_timeline.json()["address"] == test_addr
    assert len(res_timeline.json()["timeline"]) >= 1
