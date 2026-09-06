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

    # 6. Case Candidate Status Table (Prompt 3: Watchlist, Priority, Reviewed)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS case_candidate_status (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL, -- WATCHLIST, INVESTIGATION_PRIORITY, REVIEWED
        notes TEXT,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES cases(case_id),
        FOREIGN KEY (updated_by) REFERENCES users(id),
        UNIQUE(case_id, address)
    );
    """)

    # 7. Case Notes Table (Prompt 6: Investigator Notes vs Blockchain Evidence)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS case_notes (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES cases(case_id),
        FOREIGN KEY (author_id) REFERENCES users(id)
    );
    """)

    # Ensure schema migrations for cases table columns if missing
    cursor.execute("PRAGMA table_info(cases);")
    existing_cols = {row["name"] for row in cursor.fetchall()}
    if "closed_by" not in existing_cols:
        cursor.execute("ALTER TABLE cases ADD COLUMN closed_by TEXT;")
    if "closed_at" not in existing_cols:
        cursor.execute("ALTER TABLE cases ADD COLUMN closed_at TEXT;")
    if "closure_reason" not in existing_cols:
        cursor.execute("ALTER TABLE cases ADD COLUMN closure_reason TEXT;")
    if "victim_wallet" not in existing_cols:
        cursor.execute("ALTER TABLE cases ADD COLUMN victim_wallet TEXT;")

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


def set_candidate_status(
    case_id: str,
    address: str,
    status: str,
    notes: Optional[str],
    user_id: str
) -> dict:
    """Sets or updates the investigation prioritization status of a candidate wallet."""
    conn = get_connection()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        rec_id = f"cstat_{uuid.uuid4().hex[:12]}"
        conn.execute("""
        INSERT INTO case_candidate_status (id, case_id, address, status, notes, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_id, address) DO UPDATE SET
            status = excluded.status,
            notes = COALESCE(excluded.notes, case_candidate_status.notes),
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        """, (rec_id, case_id, address.lower(), status, notes, user_id, now_iso))
        conn.commit()

        row = conn.execute(
            "SELECT * FROM case_candidate_status WHERE case_id = ? AND address = ?",
            (case_id, address.lower())
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def get_candidate_statuses(case_id: str) -> dict[str, dict]:
    """Retrieves all candidate status tags for a given case, keyed by lowercase address."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "SELECT * FROM case_candidate_status WHERE case_id = ?",
            (case_id,)
        )
        return {row["address"].lower(): dict(row) for row in cursor.fetchall()}
    finally:
        conn.close()


def add_case_note(
    case_id: str,
    author_id: str,
    author_name: str,
    content: str
) -> dict:
    """Appends an investigator note clearly distinguished from blockchain evidence."""
    conn = get_connection()
    try:
        note_id = f"note_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute("""
        INSERT INTO case_notes (id, case_id, author_id, author_name, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (note_id, case_id, author_id, author_name, content.strip(), now_iso))
        conn.commit()

        row = conn.execute("SELECT * FROM case_notes WHERE id = ?", (note_id,)).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def get_case_notes(case_id: str) -> list[dict]:
    """Returns chronological investigator notes for the case."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "SELECT * FROM case_notes WHERE case_id = ? ORDER BY created_at ASC",
            (case_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def close_case(
    case_id: str,
    user_id: str,
    closure_reason: str
) -> dict:
    """Closes an approved case, recording closed_by, closed_at, and closure_reason."""
    conn = get_connection()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute("""
        UPDATE cases
        SET status = 'CLOSED',
            closed_by = ?,
            closed_at = ?,
            closure_reason = ?,
            updated_at = ?
        WHERE case_id = ?
        """, (user_id, now_iso, closure_reason, now_iso, case_id))
        conn.commit()

        row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def get_supervisor_console_data(unit_id: str) -> dict:
    """Aggregates unit-scoped queue for the supervisor console."""
    conn = get_connection()
    try:
        cursor = conn.execute("""
        SELECT c.*, u.full_name as creator_name, inv.full_name as assignee_name
        FROM cases c
        LEFT JOIN users u ON c.created_by = u.id
        LEFT JOIN users inv ON c.assigned_investigator = inv.id
        WHERE c.unit_id = ?
        ORDER BY c.updated_at DESC
        """, (unit_id,))
        rows = [dict(row) for row in cursor.fetchall()]

        active = [c for c in rows if c["status"] == "ACTIVE"]
        under_review = [c for c in rows if c["status"] == "UNDER_REVIEW"]
        high_priority = [c for c in rows if c["priority"] in ("HIGH", "CRITICAL") and c["status"] not in ("CLOSED", "ARCHIVED")]
        unassigned = [c for c in rows if not c["assigned_investigator"] and c["status"] not in ("CLOSED", "ARCHIVED")]
        awaiting_approval = [c for c in rows if c["status"] == "UNDER_REVIEW"]
        closed = [c for c in rows if c["status"] == "CLOSED"]

        # Unit investigators list for assignment modal
        inv_cursor = conn.execute("""
        SELECT id, email, full_name, investigator_id, role, status
        FROM users
        WHERE unit_id = ? AND role = 'INVESTIGATOR' AND status = 'ACTIVE'
        ORDER BY full_name ASC
        """, (unit_id,))
        investigators = [dict(row) for row in inv_cursor.fetchall()]

        return {
            "unit_id": unit_id,
            "metrics": {
                "active_count": len(active),
                "under_review_count": len(under_review),
                "high_priority_count": len(high_priority),
                "unassigned_count": len(unassigned),
                "closed_count": len(closed),
                "total_cases": len(rows),
            },
            "cases": rows,
            "unit_investigators": investigators,
        }
    finally:
        conn.close()


def get_case_timeline_events(case_id: str) -> list[dict]:
    """Compiles chronological timeline events from immutable audit logs, reviews, and notes."""
    conn = get_connection()
    try:
        # 1. Audit logs
        logs = conn.execute("""
        SELECT a.id, a.timestamp, a.action, a.resource_type, a.resource_id, a.outcome, a.details,
               u.full_name as actor_name, u.role as actor_role
        FROM case_audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.resource_id = ? OR a.details LIKE ?
        ORDER BY a.timestamp ASC
        """, (case_id, f"%{case_id}%")).fetchall()

        events = []
        for row in logs:
            events.append({
                "event_id": row["id"],
                "timestamp": row["timestamp"],
                "action": row["action"],
                "actor": row["actor_name"] or "System",
                "role": row["actor_role"] or "SYSTEM",
                "type": "AUDIT",
                "outcome": row["outcome"],
                "details": row["details"],
            })

        # 2. Case reviews
        reviews = conn.execute("""
        SELECT r.id, r.created_at as timestamp, r.decision, r.comments,
               u.full_name as actor_name, u.role as actor_role
        FROM case_reviews r
        LEFT JOIN users u ON r.reviewer_id = u.id
        WHERE r.case_id = ?
        ORDER BY r.created_at ASC
        """, (case_id,)).fetchall()

        for row in reviews:
            events.append({
                "event_id": row["id"],
                "timestamp": row["timestamp"],
                "action": f"SUPERVISOR_REVIEW_{row['decision']}",
                "actor": row["actor_name"] or "Supervisor",
                "role": row["actor_role"] or "INVESTIGATION_SUPERVISOR",
                "type": "REVIEW",
                "outcome": row["decision"],
                "details": row["comments"],
            })

        # 3. Notes
        notes = conn.execute("""
        SELECT id, created_at as timestamp, author_name as actor, content as details
        FROM case_notes
        WHERE case_id = ?
        ORDER BY created_at ASC
        """, (case_id,)).fetchall()

        for row in notes:
            events.append({
                "event_id": row["id"],
                "timestamp": row["timestamp"],
                "action": "INVESTIGATOR_NOTE_ADDED",
                "actor": row["actor"],
                "role": "INVESTIGATOR",
                "type": "NOTE",
                "outcome": "RECORDED",
                "details": row["details"],
            })

        # Sort all chronologically
        events.sort(key=lambda e: e["timestamp"] or "")
        return events
    finally:
        conn.close()

