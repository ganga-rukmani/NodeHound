"""
backend/auth/authorization.py

Centralized Role-Based Access Control (RBAC) and Attribute-Based Access
Control (ABAC) Policy Engine for NodeHound.

Enforces:
- Separation of duties (investigator cannot approve own case)
- Unit-level containment for supervisors
- Strict IDOR / BOLA protection
- Fail-closed evaluation
"""

from enum import Enum
from typing import Dict, Any, Tuple, Optional, Set
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth.database import get_connection, record_audit_log
from auth.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


class Role(str, Enum):
    INVESTIGATOR = "INVESTIGATOR"
    INVESTIGATION_SUPERVISOR = "INVESTIGATION_SUPERVISOR"
    SYSTEM_ADMINISTRATOR = "SYSTEM_ADMINISTRATOR"


# Explicit Role-to-Permissions Mapping (RBAC)
ROLE_PERMISSIONS: Dict[Role, Set[str]] = {
    Role.INVESTIGATOR: {
        "case:create",
        "case:view_own",
        "case:view_assigned",
        "case:view",
        "case:update_own",
        "case:update",
        "trace:execute",
        "trace:view",
        "candidate:view",
        "fundflow:view",
        "replay:view",
        "report:generate",
        "evidence:export_authorized",
        "evidence:export",
        "case:submit_review",
        "packet:generate",
        "packet:view",
        "packet:submit",
        "packet:export",
        "typology:update",
    },
    Role.INVESTIGATION_SUPERVISOR: {
        "case:view_unit",
        "case:view",
        "case:assign",
        "case:reassign",
        "case:review",
        "case:approve",
        "case:reject",
        "case:request_changes",
        "case:close",
        "case:archive",
        "team:view_activity",
        "audit:view_authorized",
        "trace:execute",
        "trace:view",
        "candidate:view",
        "fundflow:view",
        "replay:view",
        "report:generate",
        "evidence:export_authorized",
        "evidence:export",
        "case:update",
        "packet:generate",
        "packet:view",
        "packet:review",
        "packet:approve",
        "packet:export",
        "typology:update",
    },
    Role.SYSTEM_ADMINISTRATOR: {
        "user:manage",
        "role:manage",
        "platform:configure",
        "health:view",
        "audit:view_authorized",
    },
}


def has_rbac_permission(role_name: str, permission: str) -> bool:
    """Checks if the given role has the explicit permission."""
    try:
        role = Role(role_name)
        return permission in ROLE_PERMISSIONS.get(role, set())
    except ValueError:
        return False


def evaluate_case_abac(user: Dict[str, Any], case: Dict[str, Any], action: str) -> Tuple[bool, str]:
    """
    Attribute-Based Access Control evaluator combining user attributes,
    case attributes, requested action, and separation-of-duties rules.
    """
    user_id = user["id"]
    role = user["role"]
    user_unit = user.get("unit_id", "")
    case_unit = case.get("unit_id", "")
    created_by = case.get("created_by", "")
    assigned_to = case.get("assigned_investigator")
    status_val = case.get("status", "DRAFT")

    # 1. Base RBAC Check
    if not has_rbac_permission(role, action):
        return False, f"Role '{role}' is not granted permission for '{action}'."

    # 2. System Administrator Separation: Tech role has no case-level investigative authority
    if role == Role.SYSTEM_ADMINISTRATOR.value:
        return False, "System Administrators are prohibited from accessing case forensic data (Separation of Duties)."

    # 3. Viewing Cases / Investigation Evidence / Action Packets
    if action in (
        "case:view", "trace:view", "candidate:view", "fundflow:view",
        "replay:view", "report:generate", "evidence:export_authorized", "evidence:export",
        "packet:view", "packet:generate", "packet:export"
    ):
        if role == Role.INVESTIGATOR.value:
            # Investigator can only view if creator or assigned
            if created_by == user_id or (assigned_to and assigned_to == user_id):
                return True, "Authorized as case owner or assigned investigator."
            return False, "Unauthorized: Investigator is not the creator or assigned to this case."
        
        elif role == Role.INVESTIGATION_SUPERVISOR.value:
            # Supervisor can view if case is within their unit
            if user_unit and user_unit == case_unit:
                return True, "Authorized as unit supervisor."
            return False, f"Unauthorized: Case belongs to unit '{case_unit}', but supervisor is assigned to '{user_unit}'."

    # 4. Updating Cases / Typology
    if action in ("case:update", "case:update_own", "typology:update"):
        if role == Role.INVESTIGATOR.value:
            if created_by != user_id and assigned_to != user_id:
                return False, "Unauthorized: Only creator or assigned investigator can edit case."
            if status_val in ("APPROVED", "CLOSED", "ARCHIVED"):
                return False, f"Cannot edit case in '{status_val}' state without supervisor reopening."
            return True, "Authorized to update case."
        
        elif role == Role.INVESTIGATION_SUPERVISOR.value:
            if user_unit != case_unit:
                return False, "Supervisor cannot update case outside their unit."
            return True, "Authorized to update case."

    # 5. Submitting for Review
    if action in ("case:submit_review", "packet:submit"):
        if role != Role.INVESTIGATOR.value:
            return False, "Only investigators submit cases or packets for review."
        if created_by != user_id and assigned_to != user_id:
            return False, "Only owner or assigned investigator can submit case or packet for review."
        if action == "case:submit_review" and status_val not in ("DRAFT", "ACTIVE", "CHANGES_REQUESTED"):
            return False, f"Cannot submit case for review from status '{status_val}'."
        return True, "Authorized to submit for review."

    # 6. Review Actions: APPROVAL, REJECTION, CHANGES REQUESTED
    if action in ("case:approve", "case:reject", "case:request_changes", "case:review", "packet:review", "packet:approve"):
        if role != Role.INVESTIGATION_SUPERVISOR.value:
            return False, "Only Investigation Supervisors can review or approve cases or packets."
        if user_unit != case_unit:
            return False, "Supervisor cannot review cases outside their authorized unit."
        
        # STRICT SELF-APPROVAL PREVENTION
        if action == "case:approve" and created_by == user_id:
            return False, "Separation of duties violation: A supervisor who created this case cannot approve their own investigation."
        if action in ("packet:approve", "packet:review") and created_by == user_id:
            return False, "Separation of duties violation: An investigator or supervisor cannot approve their own action packet."
        
        if action in ("case:approve", "case:reject", "case:request_changes", "case:review") and status_val != "UNDER_REVIEW":
            return False, f"Case must be in 'UNDER_REVIEW' state to approve or request changes (currently '{status_val}')."
        return True, "Authorized to perform supervisory review."

    # 7. Assignment & Closure
    if action in ("case:assign", "case:reassign", "case:close", "case:archive"):
        if role != Role.INVESTIGATION_SUPERVISOR.value:
            return False, "Only Investigation Supervisors manage case assignment or closure."
        if user_unit != case_unit:
            return False, "Supervisor cannot manage cases outside their unit."
        if action == "case:close" and status_val not in ("APPROVED", "ACTIVE"):
            return False, f"Case must be in 'APPROVED' or 'ACTIVE' status before closure (currently '{status_val}')."
        return True, "Authorized supervisory case management action."

    return False, "Denied by default fail-closed security policy."


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Dict[str, Any]:
    """FastAPI dependency to extract and validate the authenticated user from JWT Bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    conn = get_connection()
    try:
        user_row = conn.execute(
            "SELECT id, email, full_name, investigator_id, department, unit_id, designation, role, status FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account no longer exists.",
            )

        user = dict(user_row)
        if user["status"] != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is currently {user['status'].lower()}. Contact a supervisor.",
            )

        return user
    finally:
        conn.close()


def require_permission(permission: str):
    """Dependency factory enforcing explicit RBAC permission."""
    def _checker(current_user: Dict[str, Any] = Depends(get_current_user)):
        if not has_rbac_permission(current_user["role"], permission):
            record_audit_log(
                user_id=current_user["id"],
                action=permission,
                resource_type="permission",
                resource_id=permission,
                outcome="DENIED",
                details=f"Role '{current_user['role']}' lacked permission."
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action prohibited: role lacks permission '{permission}'."
            )
        return current_user
    return _checker


def check_case_authorization(case_id: str, action: str, user: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
    """
    Fetches the case and evaluates ABAC.
    Enforces IDOR / BOLA protection by returning 404/403 without leaking case existence.
    """
    conn = get_connection()
    try:
        case_row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        if not case_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Case '{case_id}' not found."
            )

        case = dict(case_row)
        allowed, reason = evaluate_case_abac(user, case, action)

        ip = request.client.host if request and request.client else None
        record_audit_log(
            user_id=user["id"],
            action=action,
            resource_type="case",
            resource_id=case_id,
            outcome="ALLOWED" if allowed else "DENIED",
            details=reason,
            ip_address=ip
        )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: {reason}"
            )

        return case
    finally:
        conn.close()

