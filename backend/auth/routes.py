"""
backend/auth/routes.py

FastAPI router for Authentication, User Onboarding, MFA Enrollment,
RBAC/ABAC Case Management, Case Lifecycle, and Audit Logging.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel, EmailStr, Field

from auth.database import get_connection, record_audit_log
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
    organization_email: EmailStr
    investigator_id: str = Field(..., min_length=2)
    department: str = Field(..., min_length=2)
    unit: str = Field(..., min_length=2)
    designation: str = Field(..., min_length=2)
    requested_role: str = Field("INVESTIGATOR")
    password: str = Field(..., min_length=10)
    confirm_password: str


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


class ReviewCaseRequest(BaseModel):
    decision: str  # APPROVED, REJECTED, CHANGES_REQUESTED
    comments: str = Field(..., min_length=3)


class AssignCaseRequest(BaseModel):
    investigator_id: str  # User ID of investigator in same unit


# ─────────────────────────────────────────────────────────────────────────────
# Authentication Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/register-request", status_code=status.HTTP_201_CREATED)
def register_request(req: RegisterRequest, request: Request):
    """
    Submits an onboarding account request.
    Enforces password complexity and defaults to PENDING status for supervisory approval.
    """
    if req.password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and confirmation password do not match."
        )

    is_valid, error_msg = validate_password_strength(req.password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Users cannot self-assign SUPERVISOR or SYSTEM_ADMINISTRATOR as active without approval
    requested_role = req.requested_role.upper()
    if requested_role not in (Role.INVESTIGATOR.value, Role.INVESTIGATION_SUPERVISOR.value):
        requested_role = Role.INVESTIGATOR.value

    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.organization_email.lower(),)).fetchone()
        if existing:
            # Generic error to prevent account enumeration
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to process account registration request."
            )

        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        pwd_hash = hash_password(req.password)

        conn.execute("""
        INSERT INTO users (
            id, email, full_name, investigator_id, department, unit_id, designation,
            role, password_hash, status, mfa_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
        """, (
            user_id,
            req.organization_email.lower(),
            req.full_name.strip(),
            req.investigator_id.strip(),
            req.department.strip(),
            req.unit.strip().upper(),
            req.designation.strip(),
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
        if user["status"] != "ACTIVE":
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
            unit_id, blockchain, seed_address, start_date, end_date, hop_count,
            priority, status, classification, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
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

