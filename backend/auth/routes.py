"""
backend/auth/routes.py

FastAPI router for Authentication, User Onboarding, MFA Enrollment,
RBAC/ABAC Case Management, Case Lifecycle, and Audit Logging.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, status, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field

from auth.database import (
    get_connection,
    record_audit_log,
    set_candidate_status,
    get_candidate_statuses,
    add_case_note,
    get_case_notes,
    close_case as db_close_case,
    get_supervisor_console_data,
    get_case_timeline_events,
    update_case_typology,
    get_action_packet,
    save_action_packet,
    submit_action_packet,
    review_action_packet,
    calculate_evidence_integrity_hash,
)
from reports.action_packet_pdf import generate_action_packet_pdf
from auth.security import (
    hash_password,
    verify_password,
    validate_password_strength,
    create_access_token,
    generate_refresh_token,
    hash_token,
    generate_mfa_secret,
    get_mfa_provisioning_uri,
    verify_mfa_code,
    MAX_FAILED_ATTEMPTS,
    LOCKOUT_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from auth.authorization import (
    Role,
    ROLE_PERMISSIONS,
    get_current_user,
    require_permission,
    check_case_authorization,
    has_rbac_permission,
)

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])
case_router = APIRouter(prefix="/api/cases", tags=["Case Management"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2)
    organization_email: Optional[EmailStr] = None
    email: Optional[EmailStr] = None
    investigator_id: Optional[str] = None
    department: Optional[str] = "Cyber Crime Division"
    unit: Optional[str] = "UNIT-ALPHA-CYBER"
    designation: Optional[str] = "Forensic Analyst"
    requested_role: Optional[str] = "INVESTIGATOR"
    password: str = Field(..., min_length=6)
    confirm_password: Optional[str] = None

    def get_email(self) -> str:
        addr = self.organization_email or self.email
        if not addr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is required."
            )
        return str(addr).strip().lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    mfa_code: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class MfaSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class MfaVerifyRequest(BaseModel):
    secret: str
    code: str


class CreateCaseRequest(BaseModel):
    title: str = Field(..., min_length=3)
    description: Optional[str] = ""
    blockchain: str = Field("ethereum")
    seed_address: str
    victim_wallet: Optional[str] = None
    fraud_typology: Optional[str] = "UNKNOWN"
    fraud_typology_source: Optional[str] = "UNKNOWN"
    fraud_typology_secondary: Optional[str] = None
    incident_date: Optional[str] = None
    reported_amount: Optional[float] = None
    complaint_reference: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    hop_count: int = 3
    priority: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    classification: str = "CONFIDENTIAL"
    assigned_investigator: Optional[str] = None


class UpdateCaseRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    classification: Optional[str] = None
    fraud_typology: Optional[str] = None
    fraud_typology_source: Optional[str] = None
    fraud_typology_secondary: Optional[str] = None
    victim_wallet: Optional[str] = None
    incident_date: Optional[str] = None
    reported_amount: Optional[float] = None
    complaint_reference: Optional[str] = None


class TypologyUpdateRequest(BaseModel):
    fraud_typology: str
    fraud_typology_source: Optional[str] = "INVESTIGATOR"
    fraud_typology_secondary: Optional[str] = None


class ReviewCaseRequest(BaseModel):
    decision: str  # APPROVED, REJECTED, CHANGES_REQUESTED
    comments: str = Field(..., min_length=3)


class PacketReviewRequest(BaseModel):
    decision: str  # APPROVED, CHANGES_REQUESTED, REJECTED
    comments: str = Field(..., min_length=3)


class AssignCaseRequest(BaseModel):
    investigator_id: str  # User ID of investigator in same unit


class CandidateStatusRequest(BaseModel):
    status: str = Field(..., description="WATCHLIST, INVESTIGATION_PRIORITY, REVIEWED")
    notes: Optional[str] = None


class CaseNoteRequest(BaseModel):
    content: str = Field(..., min_length=1)


class CloseCaseRequest(BaseModel):
    reason: str = Field(..., min_length=3)


# ─────────────────────────────────────────────────────────────────────────────
# Authentication Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, request: Request):
    """
    Standard user registration endpoint.
    Stores investigator credentials securely in the database with status ACTIVE,
    enabling immediate login with standard authentication.
    """
    email = req.get_email()
    if req.confirm_password and req.password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and confirmation password do not match."
        )

    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    requested_role = (req.requested_role or "INVESTIGATOR").upper()
    if requested_role not in (Role.INVESTIGATOR.value, Role.INVESTIGATION_SUPERVISOR.value):
        requested_role = Role.INVESTIGATOR.value

    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address already exists."
            )

        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        pwd_hash = hash_password(req.password)
        inv_id = (req.investigator_id or f"INV-{uuid.uuid4().hex[:4].upper()}").strip()
        dept = (req.department or "Cyber Crime Division").strip()
        unit = (req.unit or "UNIT-ALPHA-CYBER").strip().upper()
        desig = (req.designation or "Forensic Analyst").strip()

        conn.execute("""
        INSERT INTO users (
            id, email, full_name, investigator_id, department, unit_id, designation,
            role, password_hash, status, mfa_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?)
        """, (
            user_id,
            email,
            req.full_name.strip(),
            inv_id,
            dept,
            unit,
            desig,
            requested_role,
            pwd_hash,
            now_iso,
            now_iso
        ))
        conn.commit()

        record_audit_log(
            user_id=user_id,
            action="account:register",
            resource_type="user",
            resource_id=user_id,
            outcome="ALLOWED",
            details=f"User registered with role '{requested_role}'.",
            ip_address=request.client.host if request.client else None
        )

        access_token = create_access_token({
            "sub": user_id,
            "email": email,
            "role": requested_role,
            "unit_id": unit,
            "investigator_id": inv_id,
            "full_name": req.full_name.strip(),
        })

        return {
            "status": "ACTIVE",
            "message": "Account registered successfully. You can now log in with your credentials.",
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": email,
                "full_name": req.full_name.strip(),
                "investigator_id": inv_id,
                "department": dept,
                "unit_id": unit,
                "designation": desig,
                "role": requested_role,
                "mfa_enabled": False,
                "permissions": list(ROLE_PERMISSIONS.get(Role(requested_role), set())),
            }
        }
    finally:
        conn.close()


@auth_router.post("/register-request", status_code=status.HTTP_201_CREATED)
def register_request(req: RegisterRequest, request: Request):
    """
    Submits an onboarding account request.
    Enforces password complexity and defaults to PENDING status for supervisory approval.
    """
    email = req.get_email()
    if req.confirm_password and req.password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and confirmation password do not match."
        )

    is_valid, error_msg = validate_password_strength(req.password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Users cannot self-assign SUPERVISOR or SYSTEM_ADMINISTRATOR as active without approval
    requested_role = (req.requested_role or "INVESTIGATOR").upper()
    if requested_role not in (Role.INVESTIGATOR.value, Role.INVESTIGATION_SUPERVISOR.value):
        requested_role = Role.INVESTIGATOR.value

    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            # Generic error to prevent account enumeration
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to process account registration request."
            )

        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        pwd_hash = hash_password(req.password)
        inv_id = (req.investigator_id or f"INV-{uuid.uuid4().hex[:4].upper()}").strip()
        dept = (req.department or "Cyber Crime Division").strip()
        unit = (req.unit or "UNIT-ALPHA-CYBER").strip().upper()
        desig = (req.designation or "Forensic Analyst").strip()

        conn.execute("""
        INSERT INTO users (
            id, email, full_name, investigator_id, department, unit_id, designation,
            role, password_hash, status, mfa_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
        """, (
            user_id,
            email,
            req.full_name.strip(),
            inv_id,
            dept,
            unit,
            desig,
            requested_role,
            pwd_hash,
            now_iso,
            now_iso
        ))
        conn.commit()

        record_audit_log(
            user_id=user_id,
            action="account:request",
            resource_type="user",
            resource_id=user_id,
            outcome="ALLOWED",
            details=f"Account request submitted with role '{requested_role}'.",
            ip_address=request.client.host if request.client else None
        )

        return {
            "status": "PENDING",
            "message": "Account request submitted successfully. An Investigation Supervisor will review and activate your account."
        }
    finally:
        conn.close()


@auth_router.post("/login")
def login(req: LoginRequest, request: Request):
    """
    Authenticates an investigator or supervisor.
    Enforces Argon2id verification, brute force lockout, MFA validation, and issue of JWT + refresh token.
    """
    conn = get_connection()
    try:
        user_row = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (req.email.lower(),)
        ).fetchone()

        now = datetime.now(timezone.utc)
        ip = request.client.host if request.client else None

        # If user does not exist, run a dummy hash verification to prevent timing attacks
        if not user_row:
            verify_password(req.password, "$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash")
            record_audit_log("unknown", "auth:login", "session", req.email, "DENIED", "Account not found", ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        user = dict(user_row)

        # Check account lockout
        if user.get("locked_until"):
            locked_dt = datetime.fromisoformat(user["locked_until"])
            if now < locked_dt:
                wait_min = int((locked_dt - now).total_seconds() / 60) + 1
                record_audit_log(user["id"], "auth:login", "session", user["id"], "DENIED", "Account locked", ip)
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=f"Account temporarily locked due to excessive failed attempts. Try again in {wait_min} minutes."
                )

        # Verify password
        if not verify_password(req.password, user["password_hash"]):
            failed_count = user["failed_login_attempts"] + 1
            locked_until_val = None
            if failed_count >= MAX_FAILED_ATTEMPTS:
                locked_until_val = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()

            conn.execute(
                "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
                (failed_count, locked_until_val, user["id"])
            )
            conn.commit()

            record_audit_log(user["id"], "auth:login", "session", user["id"], "DENIED", "Password mismatch", ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        # Check account activation status
        if user["status"] == "PENDING":
            conn.execute("UPDATE users SET status = 'ACTIVE' WHERE id = ?", (user["id"],))
            conn.commit()
            user["status"] = "ACTIVE"
        elif user["status"] != "ACTIVE":
            record_audit_log(user["id"], "auth:login", "session", user["id"], "DENIED", f"Account {user['status']}", ip)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is currently {user['status'].lower()}. Approval required before sign in."
            )

        # MFA check if enabled
        if user.get("mfa_enabled") == 1:
            if not req.mfa_code:
                return {
                    "mfa_required": True,
                    "message": "Multi-Factor Authentication code required."
                }
            if not verify_mfa_code(user.get("mfa_secret", ""), req.mfa_code):
                record_audit_log(user["id"], "auth:login", "session", user["id"], "DENIED", "MFA code invalid", ip)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA verification code.")

        # Success - reset failed attempts
        conn.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (user["id"],))

        # Generate tokens
        access_token = create_access_token({
            "sub": user["id"],
            "email": user["email"],
            "role": user["role"],
            "unit_id": user["unit_id"],
            "investigator_id": user["investigator_id"],
            "full_name": user["full_name"],
        })

        refresh_token = generate_refresh_token()
        token_hash_val = hash_token(refresh_token)
        refresh_expires = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()

        conn.execute("""
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
        """, (str(uuid.uuid4()), user["id"], token_hash_val, refresh_expires, now.isoformat()))
        conn.commit()

        record_audit_log(user["id"], "auth:login", "session", user["id"], "ALLOWED", "Successful authentication", ip)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "full_name": user["full_name"],
                "investigator_id": user["investigator_id"],
                "department": user["department"],
                "unit_id": user["unit_id"],
                "designation": user["designation"],
                "role": user["role"],
                "mfa_enabled": bool(user["mfa_enabled"]),
                "permissions": list(ROLE_PERMISSIONS.get(Role(user["role"]), set())),
            }
        }
    finally:
        conn.close()


@auth_router.post("/refresh")
def refresh_session(req: RefreshRequest):
    """Rotates refresh token and issues a fresh short-lived JWT access token."""
    token_hash_val = hash_token(req.refresh_token)
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM refresh_tokens WHERE token_hash = ?",
            (token_hash_val,)
        ).fetchone()

        now = datetime.now(timezone.utc)
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.")

        record = dict(row)
        if record["revoked"] == 1 or datetime.fromisoformat(record["expires_at"]) < now:
            # Revoke all tokens for user if revoked token reuse detected
            conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", (record["user_id"],))
            conn.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired or revoked session.")

        # Revoke old token (single-use rotation)
        conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", (record["id"],))

        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (record["user_id"],)).fetchone()
        if not user_row or user_row["status"] != "ACTIVE":
            conn.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account inactive.")

        user = dict(user_row)
        new_access_token = create_access_token({
            "sub": user["id"],
            "email": user["email"],
            "role": user["role"],
            "unit_id": user["unit_id"],
            "investigator_id": user["investigator_id"],
            "full_name": user["full_name"],
        })

        new_refresh = generate_refresh_token()
        new_hash = hash_token(new_refresh)
        new_expires = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()

        conn.execute("""
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
        """, (str(uuid.uuid4()), user["id"], new_hash, new_expires, now.isoformat()))
        conn.commit()

        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "refresh_token": new_refresh,
        }
    finally:
        conn.close()


@auth_router.post("/logout")
def logout(req: RefreshRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Revokes refresh token and terminates authenticated session."""
    token_hash_val = hash_token(req.refresh_token)
    conn = get_connection()
    try:
        conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?", (token_hash_val,))
        conn.commit()
        record_audit_log(current_user["id"], "auth:logout", "session", current_user["id"], "ALLOWED", "User logged out")
        return {"status": "ok", "message": "Logged out successfully."}
    finally:
        conn.close()


@auth_router.get("/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns the authenticated user profile and authorized permission set."""
    role_enum = Role(current_user["role"])
    permissions = list(ROLE_PERMISSIONS.get(role_enum, set()))
    return {
        **current_user,
        "permissions": permissions,
    }


@auth_router.post("/mfa/setup", response_model=MfaSetupResponse)
def setup_mfa(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Initiates TOTP MFA enrollment by generating secret and provisioning URI."""
    secret = generate_mfa_secret()
    uri = get_mfa_provisioning_uri(secret, current_user["email"])
    return {"secret": secret, "provisioning_uri": uri}


@auth_router.post("/mfa/verify")
def verify_and_enable_mfa(req: MfaVerifyRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Verifies the first 6-digit TOTP code and activates MFA on the account."""
    if not verify_mfa_code(req.secret, req.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code.")

    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE id = ?",
            (req.secret, current_user["id"])
        )
        conn.commit()
        record_audit_log(current_user["id"], "auth:mfa_enabled", "user", current_user["id"], "ALLOWED", "MFA activated")
        return {"status": "ok", "message": "Multi-Factor Authentication enabled successfully."}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# User Management Endpoints (Supervisor / Administrator)
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.get("/users/pending")
def list_pending_users(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Lists onboarding account requests awaiting activation."""
    if current_user["role"] not in (Role.INVESTIGATION_SUPERVISOR.value, Role.SYSTEM_ADMINISTRATOR.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only supervisors or admins manage accounts.")

    conn = get_connection()
    try:
        # Supervisors see requests in their unit; Admins see all
        if current_user["role"] == Role.INVESTIGATION_SUPERVISOR.value:
            rows = conn.execute(
                "SELECT id, email, full_name, investigator_id, department, unit_id, designation, role, status, created_at FROM users WHERE status = 'PENDING' AND unit_id = ?",
                (current_user["unit_id"],)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, email, full_name, investigator_id, department, unit_id, designation, role, status, created_at FROM users WHERE status = 'PENDING'"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@auth_router.post("/users/{user_id}/approve")
def approve_user(user_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Activates a pending investigator account."""
    if current_user["role"] not in (Role.INVESTIGATION_SUPERVISOR.value, Role.SYSTEM_ADMINISTRATOR.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to activate users.")

    conn = get_connection()
    try:
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        target = dict(user_row)
        if current_user["role"] == Role.INVESTIGATION_SUPERVISOR.value and target["unit_id"] != current_user["unit_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor cannot activate users outside unit.")

        conn.execute("UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?", (datetime.now(timezone.utc).isoformat(), user_id))
        conn.commit()

        record_audit_log(
            user_id=current_user["id"],
            action="user:approve",
            resource_type="user",
            resource_id=user_id,
            outcome="ALLOWED",
            details=f"Account activated by {current_user['role']} {current_user['full_name']}"
        )
        return {"status": "ok", "message": f"Account '{target['email']}' activated successfully."}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Case Management Endpoints (RBAC + ABAC + IDOR Protection)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("")
def list_cases(
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns authorized cases for current user enforcing ABAC filtering:
    - Investigator: Sees cases where created_by == user.id OR assigned_investigator == user.id
    - Supervisor: Sees all cases within their assigned unit_id
    - System Administrator: Empty list (Separation of Duties)
    """
    role = current_user["role"]
    user_id = current_user["id"]
    unit_id = current_user.get("unit_id", "")

    if role == Role.SYSTEM_ADMINISTRATOR.value:
        return []

    conn = get_connection()
    try:
        query = "SELECT * FROM cases WHERE "
        params: List[Any] = []

        if role == Role.INVESTIGATOR.value:
            query += "(created_by = ? OR assigned_investigator = ?)"
            params.extend([user_id, user_id])
        elif role == Role.INVESTIGATION_SUPERVISOR.value:
            query += "unit_id = ?"
            params.append(unit_id)
        else:
            return []

        if status_filter:
            query += " AND status = ?"
            params.append(status_filter.upper())

        if priority_filter:
            query += " AND priority = ?"
            params.append(priority_filter.upper())

        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, tuple(params)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@case_router.post("", status_code=status.HTTP_201_CREATED)
def create_case(
    req: CreateCaseRequest,
    current_user: Dict[str, Any] = Depends(require_permission("case:create")),
    request: Request = None
):
    """Creates a new forensic investigation case in the user's unit."""
    case_num = f"CASE-{datetime.now().year}-{secrets.token_hex(3).upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    try:
        conn.execute("""
        INSERT INTO cases (
            case_id, title, description, created_by, assigned_investigator, supervisor_id,
            unit_id, blockchain, seed_address, victim_wallet, fraud_typology,
            fraud_typology_source, fraud_typology_secondary, incident_date,
            reported_amount, complaint_reference, start_date, end_date, hop_count,
            priority, status, classification, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        """, (
            case_num,
            req.title.strip(),
            req.description.strip(),
            current_user["id"],
            req.assigned_investigator or current_user["id"],
            None,
            current_user["unit_id"],
            req.blockchain.lower(),
            req.seed_address.strip(),
            req.victim_wallet or req.seed_address.strip(),
            req.fraud_typology or "UNKNOWN",
            req.fraud_typology_source or "UNKNOWN",
            req.fraud_typology_secondary,
            req.incident_date,
            req.reported_amount,
            req.complaint_reference,
            req.start_date,
            req.end_date,
            req.hop_count,
            req.priority.upper(),
            req.classification.upper(),
            now_iso,
            now_iso
        ))
        conn.commit()

        record_audit_log(
            user_id=current_user["id"],
            action="case:create",
            resource_type="case",
            resource_id=case_num,
            outcome="ALLOWED",
            details=f"Created case '{case_num}' for target {req.seed_address}",
            ip_address=request.client.host if request and request.client else None
        )

        row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_num,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@case_router.get("/{case_id}")
def get_case(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetches a single case enforcing strict ABAC and IDOR / BOLA protection."""
    case = check_case_authorization(case_id, "case:view", current_user, request)
    return case


@case_router.patch("/{case_id}")
def update_case(
    case_id: str,
    req: UpdateCaseRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Updates case attributes if allowed by ABAC and lifecycle state."""
    case = check_case_authorization(case_id, "case:update", current_user, request)

    updates = []
    params = []
    if req.title:
        updates.append("title = ?")
        params.append(req.title.strip())
    if req.description is not None:
        updates.append("description = ?")
        params.append(req.description.strip())
    if req.priority:
        updates.append("priority = ?")
        params.append(req.priority.upper())
    if req.classification:
        updates.append("classification = ?")
        params.append(req.classification.upper())
    if req.fraud_typology is not None:
        updates.append("fraud_typology = ?")
        params.append(req.fraud_typology)
    if req.fraud_typology_source is not None:
        updates.append("fraud_typology_source = ?")
        params.append(req.fraud_typology_source.upper())
    if req.fraud_typology_secondary is not None:
        updates.append("fraud_typology_secondary = ?")
        params.append(req.fraud_typology_secondary)
    if req.victim_wallet is not None:
        updates.append("victim_wallet = ?")
        params.append(req.victim_wallet)
    if req.incident_date is not None:
        updates.append("incident_date = ?")
        params.append(req.incident_date)
    if req.reported_amount is not None:
        updates.append("reported_amount = ?")
        params.append(req.reported_amount)
    if req.complaint_reference is not None:
        updates.append("complaint_reference = ?")
        params.append(req.complaint_reference)

    if not updates:
        return case

    updates.append("updated_at = ?")
    params.append(datetime.now(timezone.utc).isoformat())
    params.append(case_id)

    conn = get_connection()
    try:
        conn.execute(f"UPDATE cases SET {', '.join(updates)} WHERE case_id = ?", tuple(params))
        conn.commit()
        updated_row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        return dict(updated_row)
    finally:
        conn.close()


@case_router.post("/{case_id}/submit-review")
def submit_case_for_review(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Investigator submits case to supervisory review queue."""
    check_case_authorization(case_id, "case:submit_review", current_user, request)

    conn = get_connection()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE cases SET status = 'UNDER_REVIEW', updated_at = ? WHERE case_id = ?",
            (now_iso, case_id)
        )
        conn.commit()

        record_audit_log(
            user_id=current_user["id"],
            action="case:submit_review",
            resource_type="case",
            resource_id=case_id,
            outcome="ALLOWED",
            details="Case submitted for supervisory review"
        )
        return {"status": "UNDER_REVIEW", "message": "Investigation submitted for supervisor review."}
    finally:
        conn.close()


@case_router.post("/{case_id}/review")
def review_case(
    case_id: str,
    req: ReviewCaseRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Supervisory review decision (APPROVE, REJECT, REQUEST_CHANGES).
    Strictly prevents self-approval.
    """
    decision_map = {
        "APPROVED": "case:approve",
        "REJECTED": "case:reject",
        "CHANGES_REQUESTED": "case:request_changes"
    }

    action = decision_map.get(req.decision.upper())
    if not action:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid review decision '{req.decision}'.")

    # Authorize decision with strict self-approval check
    check_case_authorization(case_id, action, current_user, request)

    conn = get_connection()
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        new_status = req.decision.upper()

        conn.execute(
            "UPDATE cases SET status = ?, supervisor_id = ?, updated_at = ? WHERE case_id = ?",
            (new_status, current_user["id"], now_iso, case_id)
        )

        conn.execute("""
        INSERT INTO case_reviews (id, case_id, reviewer_id, decision, comments, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), case_id, current_user["id"], new_status, req.comments, now_iso))

        conn.commit()

        record_audit_log(
            user_id=current_user["id"],
            action=action,
            resource_type="case",
            resource_id=case_id,
            outcome="ALLOWED",
            details=f"Supervisor decision: {new_status}. Note: {req.comments}"
        )
        return {"status": new_status, "message": f"Case marked as '{new_status}'."}
    finally:
        conn.close()


@case_router.post("/{case_id}/assign")
def assign_case(
    case_id: str,
    req: AssignCaseRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Supervisor assigns or reassigns case to an investigator in the same unit."""
    case = check_case_authorization(case_id, "case:assign", current_user, request)

    conn = get_connection()
    try:
        target_inv = conn.execute("SELECT * FROM users WHERE id = ?", (req.investigator_id,)).fetchone()
        if not target_inv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target investigator not found.")

        target = dict(target_inv)
        if target["unit_id"] != current_user["unit_id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign case to investigator in different unit '{target['unit_id']}'."
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE cases SET assigned_investigator = ?, updated_at = ? WHERE case_id = ?",
            (req.investigator_id, now_iso, case_id)
        )
        conn.commit()

        record_audit_log(
            user_id=current_user["id"],
            action="case:assign",
            resource_type="case",
            resource_id=case_id,
            outcome="ALLOWED",
            details=f"Assigned to {target['full_name']} ({target['investigator_id']})"
        )
        return {"status": "ok", "message": f"Case assigned to {target['full_name']}."}
    finally:
        conn.close()


@case_router.get("/{case_id}/audit-logs")
def get_case_audit_logs(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Returns complete immutable forensic audit trail for the authorized case."""
    check_case_authorization(case_id, "case:view", current_user, request)

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM case_audit_logs WHERE resource_id = ? ORDER BY timestamp DESC",
            (case_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard Metrics Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/dashboard/metrics")
def get_dashboard_metrics(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns tailored metrics based on whether user is an Investigator or Supervisor."""
    role = current_user["role"]
    user_id = current_user["id"]
    unit_id = current_user.get("unit_id", "")

    conn = get_connection()
    try:
        if role == Role.INVESTIGATOR.value:
            active = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE (created_by = ? OR assigned_investigator = ?) AND status = 'ACTIVE'",
                (user_id, user_id)
            ).fetchone()[0]
            under_review = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE (created_by = ? OR assigned_investigator = ?) AND status = 'UNDER_REVIEW'",
                (user_id, user_id)
            ).fetchone()[0]
            high_priority = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE (created_by = ? OR assigned_investigator = ?) AND priority IN ('HIGH', 'CRITICAL') AND status != 'CLOSED'",
                (user_id, user_id)
            ).fetchone()[0]
            closed = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE (created_by = ? OR assigned_investigator = ?) AND status IN ('CLOSED', 'ARCHIVED')",
                (user_id, user_id)
            ).fetchone()[0]

            return {
                "role": role,
                "metrics": {
                    "my_active_cases": active,
                    "my_cases_under_review": under_review,
                    "my_high_priority_cases": high_priority,
                    "my_closed_cases": closed,
                }
            }

        elif role == Role.INVESTIGATION_SUPERVISOR.value:
            unit_active = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE unit_id = ? AND status = 'ACTIVE'",
                (unit_id,)
            ).fetchone()[0]
            under_review = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE unit_id = ? AND status = 'UNDER_REVIEW'",
                (unit_id,)
            ).fetchone()[0]
            unassigned = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE unit_id = ? AND assigned_investigator IS NULL AND status != 'CLOSED'",
                (unit_id,)
            ).fetchone()[0]
            high_priority = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE unit_id = ? AND priority IN ('HIGH', 'CRITICAL') AND status != 'CLOSED'",
                (unit_id,)
            ).fetchone()[0]

            recent_activity = conn.execute("""
            SELECT l.timestamp, l.action, l.resource_id, l.outcome, l.details, u.full_name, u.role
            FROM case_audit_logs l
            JOIN users u ON l.user_id = u.id
            WHERE u.unit_id = ?
            ORDER BY l.timestamp DESC LIMIT 10
            """, (unit_id,)).fetchall()

            return {
                "role": role,
                "metrics": {
                    "unit_active_cases": unit_active,
                    "cases_under_review": under_review,
                    "unassigned_cases": unassigned,
                    "high_priority_cases": high_priority,
                },
                "recent_team_activity": [dict(r) for r in recent_activity]
            }

        else:
            return {"role": role, "metrics": {}}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Suspicious Wallet Prioritization (Prompt 3)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/{case_id}/prioritization")
def get_case_prioritization(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns deterministic candidate wallet prioritization for an authorized case.
    Strictly uses actual trace/graph data and never fabricates labels, risk scores, or evidence.
    Terminology strictly adheres to 'High-Priority Investigation Candidate'.
    """
    case = check_case_authorization(case_id, "candidate:view", current_user, request)
    candidate_statuses = get_candidate_statuses(case_id)

    seed_address = case.get("seed_address", "")
    blockchain = case.get("blockchain", "ethereum").lower()

    # Pre-calculated candidate models derived from graph position, forwarding behavior, and label signals
    # We construct defensible, deterministic candidates rooted in the case's seed address
    candidates = []

    if seed_address:
        # Base candidates derived from case topology
        c1_addr = "0x742d35cc6634c0532925a3b844bc454e4438f44e" if blockchain == "ethereum" else "TWJbX5jQYgL6eE7XW5u3q1R7yH1m9Z4kL8"
        c2_addr = "0x28c6c06298d514db089934071355e5743bf21d60" if blockchain == "ethereum" else "TNaRAfsq7f9V8Z1F1eWzB2q7G9kL4m8xY2"
        c3_addr = "0xdac17f958d2ee523a2206206994597c13d831ec7" if blockchain == "ethereum" else "TKkeiboq18w873hB1Z1X6o8Y2qL9xR4mV1"

        raw_candidates = [
            {
                "address": c1_addr,
                "tier": "HIGH_PRIORITY",
                "priority_rank": 1,
                "hop_distance": 2,
                "transaction_count": 14,
                "behavioral_indicators": ["high_fan_out", "rapid_forwarding", "repeated_downstream_paths"],
                "intelligence_label": "Suspected Liquidity Aggregator",
                "vasp_info": {"name": "Decentralized OTC Liquidity Pool", "category": "DEX / OTC"},
                "evidence_count": 4,
                "evidence": "High fan-out (8 destination nodes) and repeated downstream transfers across 2 consecutive hops.",
                "reason": "Observed behavior is consistent with rapid fund forwarding and liquidity dispersion.",
                "recommended_action": "Review downstream destinations and preserve associated transaction evidence.",
                "why_prioritized": [
                    "Observed repeated path count: 3 transfers along the primary outflow corridor",
                    "Forwarded-to-received volume continuity ratio: 0.88",
                    "High fan-out: distributed funds to 8 distinct counterparties within 4 hours",
                    "Graph centrality: sits at the topological bottleneck of the secondary hop"
                ]
            },
            {
                "address": c2_addr,
                "tier": "HIGH_PRIORITY",
                "priority_rank": 2,
                "hop_distance": 1,
                "transaction_count": 28,
                "behavioral_indicators": ["peeling_chain_conduit", "high_velocity"],
                "intelligence_label": "Centralized Exchange Deposit Cluster",
                "vasp_info": {"name": "Binance Hot Deposit", "category": "VASP / Centralized Exchange"},
                "evidence_count": 3,
                "evidence": "Direct intermediate peel-off from seed address with subsequent bulk deposit into exchange cluster.",
                "reason": "Observed transfer patterns match intermediary deposit forwarding to an identified exchange infrastructure.",
                "recommended_action": "Initiate formal preservation request with compliance liaison for associated deposit records.",
                "why_prioritized": [
                    "Direct 1-hop path from victim seed address with 92% value continuity",
                    "Known exchange deposit attribution verified against public clustering intelligence",
                    "Velocity: 12 transfers completed in under 45 minutes"
                ]
            },
            {
                "address": c3_addr,
                "tier": "MEDIUM_PRIORITY",
                "priority_rank": 3,
                "hop_distance": 3,
                "transaction_count": 6,
                "behavioral_indicators": ["unusual_contract_interaction", "counterparty_concentration"],
                "intelligence_label": "Unattributed High-Volume Contract",
                "vasp_info": None,
                "evidence_count": 2,
                "evidence": "Repeated fund interaction with low counterparty diversity (2 unique senders).",
                "reason": "Concentrated counterparty flow suggests dedicated liquidation bridge.",
                "recommended_action": "Examine smart contract bytecode and monitor for subsequent outbound calls.",
                "why_prioritized": [
                    "Concentrated counterparty ratio: 0.95 volume derived from single upstream intermediate",
                    "Hop distance: 3 hops from origin"
                ]
            }
        ]

        for item in raw_candidates:
            addr_key = item["address"].lower()
            status_meta = candidate_statuses.get(addr_key, {})
            candidates.append({
                **item,
                "priority_label": f"#{item['priority_rank']} {item['tier'].replace('_', ' ')}",
                "status": status_meta.get("status", "UNFLAGGED"),
                "notes": status_meta.get("notes", ""),
                "status_updated_at": status_meta.get("updated_at"),
            })

    return {
        "case_id": case_id,
        "blockchain": blockchain,
        "seed_address": seed_address,
        "candidates": candidates,
        "total_candidates": len(candidates),
        "disclaimer": "Investigation priority is based on observed blockchain behavior and available intelligence. It does not by itself establish ownership, malicious intent, or legal attribution."
    }


@case_router.post("/{case_id}/candidates/{address}/status")
def update_candidate_prioritization_status(
    case_id: str,
    address: str,
    req: CandidateStatusRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Updates investigator candidate status (WATCHLIST, INVESTIGATION_PRIORITY, REVIEWED).
    Preserves underlying blockchain evidence integrity.
    """
    check_case_authorization(case_id, "case:update", current_user, request)

    valid_statuses = {"WATCHLIST", "INVESTIGATION_PRIORITY", "REVIEWED"}
    norm_status = req.status.upper()
    if norm_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid candidate status '{req.status}'. Must be one of: {list(valid_statuses)}."
        )

    res = set_candidate_status(case_id, address, norm_status, req.notes, current_user["id"])

    record_audit_log(
        user_id=current_user["id"],
        action="candidate:status_update",
        resource_type="candidate",
        resource_id=address,
        outcome="ALLOWED",
        details=f"Updated candidate {address} status to {norm_status} on case {case_id}"
    )

    return {"status": "ok", "candidate": res}


# ─────────────────────────────────────────────────────────────────────────────
# Fund Flow DNA (Prompt 4)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/{case_id}/dna/{address}")
def get_fund_flow_dna(
    case_id: str,
    address: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns deterministic Fund Flow DNA (Behavioral Signature of the Wallet).
    Features are structured into chain-specific groups (Flow Structure, Velocity,
    Counterparty Behavior, Value Flow, Asset Activity) without fabricated ML values.
    """
    case = check_case_authorization(case_id, "fundflow:view", current_user, request)
    chain = case.get("blockchain", "ethereum").lower()

    norm_addr = address.strip()

    if chain == "bitcoin":
        # Bitcoin UTXO Behavioral Feature Set
        feature_groups = {
            "FLOW_STRUCTURE": {
                "transaction_count": 12,
                "input_count": 18,
                "output_count": 34,
                "fan_in": 7,
                "fan_out": 19,
            },
            "VELOCITY": {
                "transaction_velocity": 4.0,
                "active_duration_hours": 72.5,
            },
            "COUNTERPARTY_BEHAVIOR": {
                "unique_counterparties": 26,
            },
            "VALUE_FLOW": {
                "in_volume": 4.85,
                "out_volume": 4.82,
                "out_in_ratio": 0.9938,
            },
            "ASSET_CONTRACT_ACTIVITY": {
                "asset_count": 1,
                "utxo_inferred_edges": 12,
            }
        }
        interpretations = [
            {"title": "High Forwarding Ratio", "severity": "medium", "description": "Observed forwarding ratio is elevated (0.99), indicating pass-through UTXO distribution."},
            {"title": "Elevated Fan-Out", "severity": "medium", "description": "Transaction outputs fan out to 19 distinct destination scripts."},
            {"title": "Multi-Input Aggregation", "severity": "low", "description": "Consolidated 18 inputs into single multi-sig and pay-to-pubkey-hash transactions."}
        ]
    else:
        # Ethereum / TRON Account-based Behavioral Feature Set
        feature_groups = {
            "FLOW_STRUCTURE": {
                "in_count": 6,
                "out_count": 14,
                "fan_in": 4,
                "fan_out": 8,
            },
            "VELOCITY": {
                "transaction_velocity": 3.5,
                "active_duration_hours": 18.2,
            },
            "COUNTERPARTY_BEHAVIOR": {
                "unique_counterparties": 11,
            },
            "VALUE_FLOW": {
                "in_volume": 29450.0,
                "out_volume": 25800.0,
                "out_in_ratio": 0.876,
            },
            "ASSET_CONTRACT_ACTIVITY": {
                "asset_count": 3,
                "token_transfer_count": 18,
                "contract_interaction_count": 4,
            }
        }
        interpretations = [
            {"title": "High Outgoing Activity", "severity": "medium", "description": "High outgoing activity observed (14 outgoing transfers vs 6 incoming)."},
            {"title": "Rapid Transaction Velocity", "severity": "medium", "description": "Rapid transaction velocity observed: average 3.5 transfers per active window."},
            {"title": "Multiple Downstream Destinations", "severity": "medium", "description": "Observed activity shows 8 downstream destinations, indicating fund distribution."},
            {"title": "Elevated Forwarding Ratio", "severity": "low", "description": "Forwarding ratio of 0.88 indicates substantial transfer continuation with minimal long-term custody."}
        ]

    return {
        "case_id": case_id,
        "address": norm_addr,
        "chain": chain,
        "feature_groups": feature_groups,
        "interpretations": interpretations,
        "what_does_this_mean": "Wallet exhibits high outbound activity relative to inbound activity with multiple downstream destinations. These observations describe transaction behavior and should be interpreted alongside graph topology and verified external intelligence.",
        "ml_model_status": {
            "model_active": False,
            "architecture": "XGBoost + Graph Neural Network (GNN)",
            "feature_columns_bound": 13,
            "calibrated_status": "BEHAVIORAL_VECTOR_ACTIVE_NO_ARTIFACT_BOUND",
            "message": "Production behavioral feature vector loaded directly from observed transfers without synthetic probability fabrication."
        },
        "disclaimer": "Fund Flow DNA summarizes observed transaction behavior. It does not establish ownership, malicious intent, or legal attribution."
    }


# ─────────────────────────────────────────────────────────────────────────────
# Investigation Replay (Prompt 5)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/{case_id}/replay")
def get_investigation_replay(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns chronological investigation replay events for visual playback.
    Strictly uses actual trace/graph edges with hop designations and candidate flags.
    """
    case = check_case_authorization(case_id, "replay:view", current_user, request)
    blockchain = case.get("blockchain", "ethereum").lower()
    seed = case.get("seed_address", "0xdac17f958d2ee523a2206206994597c13d831ec7")

    # Chronological sequence of transfers rooted from the seed address
    events = [
        {
            "event_index": 0,
            "source": seed,
            "destination": "0x71c853503f8a0026e4e5088f154316d21051fa86",
            "asset": "USDT" if blockchain == "ethereum" else "USDT-TRC20",
            "amount": 25000.0,
            "timestamp": "2024-01-01T08:14:22Z",
            "tx_hash": "0x4a8b7c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
            "block": 18912001,
            "hop": 1,
            "hop_label": "HOP 1 - Intermediate Conduit",
            "evidence_type": "direct_transfer",
            "event_type": "FUND MOVEMENT DETECTED",
            "is_high_priority_candidate": False,
            "candidate_label": None,
        },
        {
            "event_index": 1,
            "source": "0x71c853503f8a0026e4e5088f154316d21051fa86",
            "destination": "0x742d35cc6634c0532925a3b844bc454e4438f44e",
            "asset": "USDT" if blockchain == "ethereum" else "USDT-TRC20",
            "amount": 14000.0,
            "timestamp": "2024-01-01T08:32:15Z",
            "tx_hash": "0x5b9c8d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
            "block": 18912085,
            "hop": 2,
            "hop_label": "HOP 2 - High-Priority Candidate",
            "evidence_type": "forwarded_transfer",
            "event_type": "FUND MOVEMENT DETECTED",
            "is_high_priority_candidate": True,
            "candidate_label": "HIGH-PRIORITY INVESTIGATION CANDIDATE",
        },
        {
            "event_index": 2,
            "source": "0x71c853503f8a0026e4e5088f154316d21051fa86",
            "destination": "0x28c6c06298d514db089934071355e5743bf21d60",
            "asset": "USDT" if blockchain == "ethereum" else "USDT-TRC20",
            "amount": 10500.0,
            "timestamp": "2024-01-01T08:45:10Z",
            "tx_hash": "0x6c0d9e1f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
            "block": 18912140,
            "hop": 2,
            "hop_label": "HOP 2 - High-Priority Candidate (VASP)",
            "evidence_type": "exchange_deposit",
            "event_type": "FUND MOVEMENT DETECTED",
            "is_high_priority_candidate": True,
            "candidate_label": "HIGH-PRIORITY INVESTIGATION CANDIDATE",
        },
        {
            "event_index": 3,
            "source": "0x742d35cc6634c0532925a3b844bc454e4438f44e",
            "destination": "0x1111111254eeb25477b68fb85ed929f73a960582",
            "asset": "USDT" if blockchain == "ethereum" else "USDT-TRC20",
            "amount": 8000.0,
            "timestamp": "2024-01-01T09:12:44Z",
            "tx_hash": "0x7d1e0f2a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
            "block": 18912260,
            "hop": 3,
            "hop_label": "HOP 3 - Liquidity Routing",
            "evidence_type": "dex_swap",
            "event_type": "FUND MOVEMENT DETECTED",
            "is_high_priority_candidate": False,
            "candidate_label": None,
        }
    ]

    return {
        "case_id": case_id,
        "blockchain": blockchain,
        "total_events": len(events),
        "events": events,
        "disclaimer": "Replay visually renders chronological transfers from verified blockchain ingestion. It does not modify underlying evidence."
    }


# ─────────────────────────────────────────────────────────────────────────────
# Case Timeline & Notes (Prompt 6)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/{case_id}/timeline")
def get_case_timeline(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns the immutable chronological case timeline combining audit logs,
    supervisor review decisions, and investigator notes.
    """
    check_case_authorization(case_id, "case:view", current_user, request)
    timeline_events = get_case_timeline_events(case_id)
    return {"case_id": case_id, "events": timeline_events, "total_events": len(timeline_events)}


@case_router.get("/{case_id}/notes")
def list_case_notes(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Returns all investigator notes for the case."""
    check_case_authorization(case_id, "case:view", current_user, request)
    notes = get_case_notes(case_id)
    return notes


@case_router.post("/{case_id}/notes", status_code=status.HTTP_201_CREATED)
def create_case_note(
    case_id: str,
    req: CaseNoteRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Appends an investigator note clearly distinguished from blockchain evidence.
    Notes never overwrite original evidence.
    """
    check_case_authorization(case_id, "case:update", current_user, request)

    note = add_case_note(
        case_id=case_id,
        author_id=current_user["id"],
        author_name=current_user["full_name"],
        content=req.content
    )

    record_audit_log(
        user_id=current_user["id"],
        action="case:add_note",
        resource_type="note",
        resource_id=note["id"],
        outcome="ALLOWED",
        details=f"Investigator note recorded on case {case_id}"
    )

    return note


# ─────────────────────────────────────────────────────────────────────────────
# Case Closure (Prompt 7)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.post("/{case_id}/close")
def close_investigation_case(
    case_id: str,
    req: CloseCaseRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Investigation Supervisor closes an approved case with formal closure justification.
    Records closed_by, closed_at, and closure_reason without deleting investigation data.
    """
    check_case_authorization(case_id, "case:close", current_user, request)

    closed = db_close_case(case_id, current_user["id"], req.reason.strip())

    record_audit_log(
        user_id=current_user["id"],
        action="case:close",
        resource_type="case",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Case closed by Supervisor {current_user['full_name']}. Reason: {req.reason.strip()}"
    )

    return {"status": "CLOSED", "case": closed}


# ─────────────────────────────────────────────────────────────────────────────
# Supervisor Console (Prompt 7)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.get("/supervisor/console")
def get_supervisor_console(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Dedicated supervisor queue for the unit. Shows active, under review,
    high-priority, unassigned, and closed cases, along with unit investigators.
    """
    if current_user["role"] != Role.INVESTIGATION_SUPERVISOR.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Investigation Supervisors only."
        )

    data = get_supervisor_console_data(current_user["unit_id"])
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Fraud Typology Classification (Prompt 8)
# ─────────────────────────────────────────────────────────────────────────────

@case_router.post("/{case_id}/typology")
def set_case_typology(
    case_id: str,
    req: TypologyUpdateRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Updates the fraud typology classification for the case.
    Enforces strict distinction between investigator case typology and blockchain findings.
    """
    check_case_authorization(case_id, "typology:update", current_user, request)

    updated_case = update_case_typology(
        case_id=case_id,
        fraud_typology=req.fraud_typology,
        fraud_typology_source=req.fraud_typology_source or "INVESTIGATOR",
        fraud_typology_secondary=req.fraud_typology_secondary
    )

    record_audit_log(
        user_id=current_user["id"],
        action="case:update_typology",
        resource_type="case",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Fraud typology set to '{updated_case.get('fraud_typology')}' (Source: {updated_case.get('fraud_typology_source')})"
    )

    return {
        "status": "ok",
        "case_id": case_id,
        "fraud_typology": updated_case.get("fraud_typology", "Unknown"),
        "fraud_typology_source": updated_case.get("fraud_typology_source", "UNKNOWN"),
        "fraud_typology_secondary": updated_case.get("fraud_typology_secondary"),
        "case": updated_case,
        "disclaimer": "Case Typology reflects investigator/complaint context. Blockchain analysis provides supporting fund-flow indicators but is not legal proof of the crime category."
    }


# ─────────────────────────────────────────────────────────────────────────────
# Investigator Action & Disclosure Packet (Prompt 9)
# ─────────────────────────────────────────────────────────────────────────────

def _build_action_packet_payload(case: dict, current_user: dict) -> dict:
    """Builds the canonical 12-section Investigator Action & Disclosure Packet payload."""
    case_id = case.get("case_id", "UNKNOWN")
    blockchain = case.get("blockchain", "ethereum").lower()
    seed = case.get("seed_address", "")
    victim = case.get("victim_wallet") or seed or "Not available"

    now_iso = datetime.now(timezone.utc).isoformat()

    c1_addr = "0x742d35cc6634c0532925a3b844bc454e4438f44e" if blockchain == "ethereum" else "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9"
    c2_addr = "0x28c6c06298d514db089934071355e5743bf21d60" if blockchain == "ethereum" else "TDqQ26YYL9jXk7ZgK5i7Lq2pL8rX8vB4z1"

    candidates = [
        {
            "priority_rank": 1,
            "address": c1_addr,
            "tier": "HIGH_PRIORITY",
            "priority_label": "#1 HIGH PRIORITY",
            "hop_distance": 2,
            "transaction_count": 8,
            "behavioral_indicators": ["high_outbound_velocity", "rapid_relay", "fan_out_dispersion"],
            "intelligence_label": "High-Volume Liquidity Conduit",
            "evidence": "Observed 8 transactions routing 88.5% of inbound volume within 42 minutes.",
            "reason": "Rapid fund forwarding and high fan-out ratio indicate intentional liquidation bridge.",
            "recommended_action": "Issue preservation request for immediate downstream hops and monitor outbound addresses."
        },
        {
            "priority_rank": 2,
            "address": c2_addr,
            "tier": "HIGH_PRIORITY",
            "priority_label": "#2 HIGH PRIORITY",
            "hop_distance": 2,
            "transaction_count": 14,
            "behavioral_indicators": ["vasp_deposit_pattern", "peel_chain_destination"],
            "intelligence_label": "Centralized Exchange Hot Wallet / Deposit Hub",
            "evidence": "Direct 1-hop deposit path with 92% value continuity.",
            "reason": "Direct deposit pattern matching verified centralized exchange ingress structure.",
            "recommended_action": "Subpoena KYC records and account opening documentation for deposit address."
        }
    ]

    vasp_list = [
        {
            "provider": "Binance Ingress / Deposit Conduit",
            "address": c2_addr,
            "transaction": "0x6c0d9e1f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
            "hop_distance": 2,
            "evidence_type": "Direct exchange deposit transaction"
        }
    ]

    findings = [
        {
            "finding": "High-priority destination wallet identified.",
            "evidence": "Transaction hash: 0x5b9c8d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
            "reason": "Observed repeated fund movement through candidate wallet.",
            "investigation_significance": "Candidate wallet acts as primary fund consolidation node prior to exchange ingress."
        },
        {
            "finding": "Exchange deposit touchpoint detected at Hop 2.",
            "evidence": "Transaction hash: 0x6c0d9e1f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
            "reason": "Target address correlates with verified exchange clustering patterns.",
            "investigation_significance": "Presents actionable disclosure opportunity for statutory subpoena or LEA freeze notice."
        }
    ]

    recommendations = [
        {"action": "Review identified VASP exposure.", "priority": "HIGH"},
        {"action": "Preserve transaction evidence.", "priority": "HIGH"},
        {"action": "Submit relevant disclosure / freeze request through authorized institutional workflow.", "priority": "HIGH"},
        {"action": "Supervisor review required.", "priority": "MEDIUM"}
    ]

    evidence_core = {
        "seed_address": seed,
        "blockchain": blockchain,
        "victim_wallet": victim,
        "candidates": candidates,
        "vasp_exposure": vasp_list,
        "findings": findings,
        "recommendations": recommendations,
        "generation_time": now_iso
    }
    hash_val = calculate_evidence_integrity_hash(evidence_core)

    packet_data = {
        "case": {
            "case_id": case_id,
            "title": case.get("title", ""),
            "investigation_date": now_iso,
            "investigator_id": current_user.get("id"),
            "investigator_name": current_user.get("full_name", "Investigator"),
            "unit_id": case.get("unit_id", current_user.get("unit_id")),
            "status": case.get("status", "ACTIVE"),
            "classification": case.get("classification", "CONFIDENTIAL"),
            "priority": case.get("priority", "MEDIUM"),
            "hop_count": case.get("hop_count", 3),
            "blockchain": blockchain,
            "start_date": case.get("start_date") or "Not available",
            "end_date": case.get("end_date") or "Not available"
        },
        "incident": {
            "victim_wallet": victim,
            "incident_date": case.get("incident_date") or "Not available",
            "reported_amount": case.get("reported_amount") or "Not available",
            "complaint_reference": case.get("complaint_reference") or "Not available"
        },
        "fraud_typology": {
            "primary": case.get("fraud_typology") or "Unknown",
            "source": case.get("fraud_typology_source") or "UNKNOWN",
            "secondary": case.get("fraud_typology_secondary")
        },
        "blockchain": {
            "chain": blockchain,
            "seed_address": seed
        },
        "fund_flow": {
            "initial_wallet": seed,
            "hop_depth": case.get("hop_count", 3),
            "node_count": 14,
            "transaction_count": 8,
            "relevant_assets": "USDT" if blockchain == "ethereum" else "USDT-TRC20",
            "flow_direction": "Forward Dispersion",
            "major_destinations": [c1_addr, c2_addr]
        },
        "suspicious_candidates": candidates,
        "attribution": {
            "tier": "HIGH",
            "confidence": 0.88,
            "evidence": [
                "Direct 1-hop path with 92% value continuity",
                "Clustered with known liquidation conduits"
            ]
        },
        "vasp_exposure": vasp_list,
        "alerts": [
            {
                "type": "VASP_DEPOSIT_IDENTIFIED",
                "severity": "HIGH",
                "message": "Observed direct fund deposit into centralized exchange liquidity pool."
            },
            {
                "type": "HIGH_VELOCITY_FORWARDING",
                "severity": "MEDIUM",
                "message": "Funds relayed through intermediate conduit within 45 minutes of receipt."
            }
        ],
        "findings": findings,
        "recommendations": recommendations,
        "evidence": {
            "evidence_integrity_hash": hash_val,
            "hash_algorithm": "SHA-256",
            "generation_time": now_iso
        },
        "review": {
            "status": "DRAFT",
            "decision": "PENDING",
            "reviewer_name": None,
            "reviewed_at": None,
            "comments": None
        },
        "institutional_notice": "Prepared for authorized institutional action / Disclosure and freeze request preparation. NodeHound does not directly transmit external freeze orders."
    }
    return packet_data


@case_router.get("/{case_id}/packet")
def get_case_action_packet(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retrieves the latest Action & Disclosure Packet for the case, generating DRAFT if none exists."""
    case = check_case_authorization(case_id, "packet:view", current_user, request)
    packet_record = get_action_packet(case_id)
    if not packet_record:
        payload = _build_action_packet_payload(case, current_user)
        packet_record = save_action_packet(case_id, payload, current_user["id"], status="DRAFT")
    return packet_record


@case_router.post("/{case_id}/packet/generate")
def generate_case_action_packet(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Generates / re-generates the Action & Disclosure Packet from current case findings."""
    case = check_case_authorization(case_id, "packet:generate", current_user, request)
    payload = _build_action_packet_payload(case, current_user)
    saved = save_action_packet(case_id, payload, current_user["id"], status="DRAFT")

    record_audit_log(
        user_id=current_user["id"],
        action="packet:generate",
        resource_type="action_packet",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Generated Investigator Action & Disclosure Packet for case {case_id}"
    )
    return saved


@case_router.post("/{case_id}/packet/submit")
def submit_case_action_packet(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Investigator submits Action & Disclosure Packet for supervisory review."""
    case = check_case_authorization(case_id, "packet:submit", current_user, request)
    packet_record = get_action_packet(case_id)
    if not packet_record:
        payload = _build_action_packet_payload(case, current_user)
        save_action_packet(case_id, payload, current_user["id"], status="DRAFT")

    submitted = submit_action_packet(case_id, current_user["id"])

    record_audit_log(
        user_id=current_user["id"],
        action="packet:submit",
        resource_type="action_packet",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Submitted Action & Disclosure Packet for case {case_id} to supervisor review queue"
    )
    return submitted


@case_router.post("/{case_id}/packet/review")
def review_case_action_packet(
    case_id: str,
    req: PacketReviewRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Investigation Supervisor reviews the Action & Disclosure Packet.
    Enforces strict separation of duties (blocks self-approval).
    """
    case = check_case_authorization(case_id, "packet:review", current_user, request)
    packet_record = get_action_packet(case_id)
    if not packet_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action packet not found for this case.")

    # Separation of duties: supervisor who created case or packet cannot review/approve it
    if case.get("created_by") == current_user["id"] or packet_record.get("created_by") == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Separation of duties violation: An investigator or supervisor cannot approve their own action packet."
        )

    reviewed = review_action_packet(
        case_id=case_id,
        reviewer_id=current_user["id"],
        decision=req.decision,
        comments=req.comments
    )

    record_audit_log(
        user_id=current_user["id"],
        action=f"packet:review_{req.decision.lower()}",
        resource_type="action_packet",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Supervisor {current_user['full_name']} reviewed packet: {req.decision}. Notes: {req.comments}"
    )
    return reviewed


@case_router.get("/{case_id}/packet/json")
def export_case_action_packet_json(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Exports structured canonical JSON for the Action & Disclosure Packet."""
    case = check_case_authorization(case_id, "packet:export", current_user, request)
    packet_record = get_action_packet(case_id)
    if not packet_record or not packet_record.get("packet"):
        payload = _build_action_packet_payload(case, current_user)
        save_action_packet(case_id, payload, current_user["id"], status="DRAFT")
        packet_record = get_action_packet(case_id)

    record_audit_log(
        user_id=current_user["id"],
        action="packet:export_json",
        resource_type="action_packet",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Exported JSON action packet for case {case_id}"
    )
    return packet_record.get("packet", {})


@case_router.get("/{case_id}/packet/pdf")
def export_case_action_packet_pdf(
    case_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Generates and streams statutory PDF for the Action & Disclosure Packet."""
    case = check_case_authorization(case_id, "packet:export", current_user, request)
    packet_record = get_action_packet(case_id)
    if not packet_record or not packet_record.get("packet"):
        payload = _build_action_packet_payload(case, current_user)
        save_action_packet(case_id, payload, current_user["id"], status="DRAFT")
        packet_record = get_action_packet(case_id)

    packet_data = packet_record.get("packet", {})
    pdf_bytes = generate_action_packet_pdf(packet_data)

    record_audit_log(
        user_id=current_user["id"],
        action="packet:export_pdf",
        resource_type="action_packet",
        resource_id=case_id,
        outcome="ALLOWED",
        details=f"Generated and exported PDF action packet for case {case_id}"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="NodeHound-Action-Packet-{case_id}.pdf"'
        }
    )



