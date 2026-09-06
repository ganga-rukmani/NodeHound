"""
backend/auth/database.py

SQLite-backed persistence layer for NodeHound Authentication, RBAC, ABAC,
Case Management, and Immutable Forensic Audit Trails.

Enforces:
- ACID transactions
- Parameterized queries (SQL injection immunity)
- Audit logging for all authorization and state transitions
"""

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

DB_PATH = os.environ.get(
    "NODEHOUND_AUTH_DB",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "nodehound_auth.db")
)


def get_connection() -> sqlite3.Connection:
    """Provides a thread-safe connection to the SQLite database with WAL enabled."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_database():
    """Creates tables if they do not exist and seeds initial development personas."""
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        investigator_id TEXT NOT NULL,
        department TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        designation TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE', -- PENDING, ACTIVE, SUSPENDED
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        mfa_secret TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 2. Refresh Tokens Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Cases Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cases (
        case_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        assigned_investigator TEXT,
        supervisor_id TEXT,
        unit_id TEXT NOT NULL,
        blockchain TEXT NOT NULL,
        seed_address TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        hop_count INTEGER NOT NULL DEFAULT 3,
        priority TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
        status TEXT NOT NULL DEFAULT 'DRAFT',    -- DRAFT, ACTIVE, UNDER_REVIEW, CHANGES_REQUESTED, APPROVED, CLOSED, ARCHIVED
        classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL', -- RESTRICTED, CONFIDENTIAL, SECRET
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
    );
    """)

    # 4. Case Audit Logs (Immutable Forensic Trail)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS case_audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        outcome TEXT NOT NULL, -- ALLOWED, DENIED
        ip_address TEXT,
        details TEXT
    );
    """)

    # 5. Case Reviews Table (Separation of duties decisions)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS case_reviews (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        reviewer_id TEXT NOT NULL,
        decision TEXT NOT NULL, -- APPROVED, REJECTED, CHANGES_REQUESTED
        comments TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES cases(case_id),
        FOREIGN KEY (reviewer_id) REFERENCES users(id)
    );
    """)

    conn.commit()
    conn.close()
    seed_initial_data()


def seed_initial_data():
    """Seeds default investigation personas and cases if users table is empty."""
    from auth.security import hash_password

    conn = get_connection()
    try:
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count > 0:
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        default_pwd_hash = hash_password("NodeHound@SecOps2026!")

        # Default users
        users = [
            (
                "usr_sup_001",
                "supervisor@nodehound.gov",
                "Agent Sarah Connor",
                "SUP-701",
                "Cyber Narcotics Division",
                "UNIT-ALPHA-CYBER",
                "Supervisory Forensic Special Agent",
                "INVESTIGATION_SUPERVISOR",
                default_pwd_hash,
                "ACTIVE",
                0,
                None,
                0,
                None,
                now_iso,
                now_iso,
            ),
            (
                "usr_inv_101",
                "investigator1@nodehound.gov",
                "Officer Alex Vance",
                "INV-101",
                "Cyber Narcotics Division",
                "UNIT-ALPHA-CYBER",
                "Senior Blockchain Forensic Investigator",
                "INVESTIGATOR",
                default_pwd_hash,
                "ACTIVE",
                0,
                None,
                0,
                None,
                now_iso,
                now_iso,
            ),
            (
                "usr_inv_202",
                "investigator2@nodehound.gov",
                "Detective Marcus Reed",
                "INV-202",
                "Financial Crimes Taskforce",
                "UNIT-BETA-FININT",
                "Lead Financial Intelligence Investigator",
                "INVESTIGATOR",
                default_pwd_hash,
                "ACTIVE",
                0,
                None,
                0,
                None,
                now_iso,
                now_iso,
            ),
            (
                "usr_adm_001",
                "admin@nodehound.gov",
                "Tech Admin Davis",
                "SYS-001",
                "Security Operations Center",
                "SYS-INFRA",
                "Platform Infrastructure Administrator",
                "SYSTEM_ADMINISTRATOR",
                default_pwd_hash,
                "ACTIVE",
                0,
                None,
                0,
                None,
                now_iso,
                now_iso,
            ),
        ]

        conn.executemany("""
        INSERT INTO users (
            id, email, full_name, investigator_id, department, unit_id, designation,
            role, password_hash, status, mfa_enabled, mfa_secret, failed_login_attempts,
            locked_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, users)

        # Initial Cases
        cases = [
            (
                "CASE-2026-ETH01",
                "Operation Tether Flow",
                "Multi-hop fund routing investigation tracking suspected illicit liquidation through high-velocity smart contracts.",
                "usr_inv_101",
                "usr_inv_101",
                None,
                "UNIT-ALPHA-CYBER",
                "ethereum",
                "0xdac17f958d2ee523a2206206994597c13d831ec7",
                "2024-01-01",
                "2024-01-02",
                3,
                "HIGH",
                "ACTIVE",
                "CONFIDENTIAL",
                now_iso,
                now_iso,
            ),
            (
                "CASE-2026-ETH02",
                "Binance Bridge Inflow Trace",
                "Large volume deposit aggregation and peeling chain analysis into centralized exchange hot wallets.",
                "usr_inv_101",
                "usr_inv_101",
                None,
                "UNIT-ALPHA-CYBER",
                "ethereum",
                "0x28c6c06298d514db089934071355e5743bf21d60",
                "2024-01-01",
                "2024-01-02",
                2,
                "CRITICAL",
                "UNDER_REVIEW",
                "SECRET",
                now_iso,
                now_iso,
            ),
            (
                "CASE-2026-TRON01",
                "TRC20 Cross-Border Pipeline",
                "Cross-chain stablecoin conduit trace tracking mixer hops and OTC broker liquidity pools.",
                "usr_inv_202",
                "usr_inv_202",
                None,
                "UNIT-BETA-FININT",
                "tron",
                "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
                "2024-01-01",
                "2024-01-02",
                3,
                "MEDIUM",
                "ACTIVE",
                "RESTRICTED",
                now_iso,
                now_iso,
            ),
        ]

        conn.executemany("""
        INSERT INTO cases (
            case_id, title, description, created_by, assigned_investigator, supervisor_id,
            unit_id, blockchain, seed_address, start_date, end_date, hop_count,
            priority, status, classification, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, cases)

        conn.commit()
    finally:
        conn.close()


def record_audit_log(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    outcome: str,
    details: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """Appends an immutable audit event for authorization and forensic tracking."""
    conn = get_connection()
    try:
        conn.execute("""
        INSERT INTO case_audit_logs (id, timestamp, user_id, action, resource_type, resource_id, outcome, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            datetime.now(timezone.utc).isoformat(),
            user_id,
            action,
            resource_type,
            resource_id,
            outcome,
            ip_address,
            details
        ))
        conn.commit()
    finally:
        conn.close()
