"""
backend/auth/security.py

Cryptographic security primitives, password hashing with Argon2id,
JWT signing, refresh token rotation, and TOTP Multi-Factor Authentication.
"""

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any

import argon2
from jose import jwt, JWTError
import pyotp

# Password Hasher configured for Argon2id
_hasher = argon2.PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=argon2.Type.ID
)

# JWT Security Settings
JWT_SECRET_KEY = os.environ.get("NODEHOUND_JWT_SECRET", "nh_secops_59b48f1c8e7a2b9d038294a5c6e7f8a1")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# Common weak passwords dictionary
COMMON_WEAK_PASSWORDS = {
    "password123", "password1234", "admin12345", "welcome123",
    "nodehound123", "qwertyuiop", "letmein1234", "changeme123",
    "iloveyou123", "blockchain123", "investigator1"
}


def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against its Argon2id hash. Returns False safely on error."""
    try:
        return _hasher.verify(password_hash, password)
    except (argon2.exceptions.VerifyMismatchError, argon2.exceptions.VerificationError, Exception):
        return False


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Enforces strict forensic platform password standards:
    - Minimum 10 characters
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 digit
    - At least 1 special character
    - Not in known common weak passwords
    """
    if len(password) < 10:
        return False, "Password must be at least 10 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one numerical digit."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=/~`]", password):
        return False, "Password must contain at least one special character."
    if password.lower() in COMMON_WEAK_PASSWORDS:
        return False, "Password matches a common weak pattern. Choose a stronger passphrase."
    return True, ""


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates a signed, short-lived JWT access token with minimal claims."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": secrets.token_hex(16)
    })
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT access token. Returns None on signature failure or expiration."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_refresh_token() -> str:
    """Generates an unguessable high-entropy refresh token."""
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Hashes a refresh token with SHA-256 for secure storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_mfa_secret() -> str:
    """Generates a standard base32 TOTP secret."""
    return pyotp.random_base32()


def get_mfa_provisioning_uri(secret: str, email: str) -> str:
    """Generates an otpauth:// URI for authenticator app enrollment."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="NodeHound Forensic SOC")


def verify_mfa_code(secret: str, code: str) -> bool:
    """Verifies a 6-digit TOTP code against the secret with 1-step tolerance."""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=1)

