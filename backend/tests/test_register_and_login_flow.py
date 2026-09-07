"""
backend/tests/test_register_and_login_flow.py
End-to-end integration test verifying:
1. Standard user registration stores credentials with Argon2id hash in database.
2. The user can immediately log in using their registered email and password.
3. Passwords are never stored in plaintext.
4. Auto-generated defaults populate safely.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from api.main import app
from auth.database import get_connection
from auth.security import verify_password

client = TestClient(app)

def test_standard_register_and_immediate_login():
    email = f"agent_{uuid.uuid4().hex[:8]}@forensics.agency.gov"
    password = "MySecurePass2026!"
    full_name = "Agent Clarissa Starling"

    reg_res = client.post("/api/auth/register", json={
        "full_name": full_name,
        "email": email,
        "password": password,
        "confirm_password": password,
    })

    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()
    assert reg_data["status"] == "ACTIVE"
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == email.lower()
    assert reg_data["user"]["full_name"] == full_name

    conn = get_connection()
    user_row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
    conn.close()

    assert user_row is not None
    assert user_row["email"] == email.lower()
    assert user_row["status"] == "ACTIVE"
    assert password not in user_row["password_hash"]
    assert verify_password(password, user_row["password_hash"]) is True

    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })

    assert login_res.status_code == 200, login_res.text
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["user"]["email"] == email.lower()
    assert login_data["user"]["full_name"] == full_name


def test_register_duplicate_email_rejected():
    email = f"dup_{uuid.uuid4().hex[:8]}@agency.gov"
    password = "Password@123!"

    res1 = client.post("/api/auth/register", json={
        "full_name": "First Officer",
        "email": email,
        "password": password,
        "confirm_password": password,
    })
    assert res1.status_code == 201

    res2 = client.post("/api/auth/register", json={
        "full_name": "Second Officer",
        "email": email,
        "password": password,
        "confirm_password": password,
    })
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"].lower()


def test_register_password_mismatch_rejected():
    res = client.post("/api/auth/register", json={
        "full_name": "Test Officer",
        "email": f"mismatch_{uuid.uuid4().hex[:6]}@agency.gov",
        "password": "Password123!",
        "confirm_password": "DifferentPassword123!",
    })
    assert res.status_code == 400
    assert "do not match" in res.json()["detail"].lower()


def test_register_short_password_rejected():
    res = client.post("/api/auth/register", json={
        "full_name": "Test Officer",
        "email": f"short_{uuid.uuid4().hex[:6]}@agency.gov",
        "password": "123",
        "confirm_password": "123",
    })
    assert res.status_code in (400, 422)
    assert res.json()["detail"] is not None
