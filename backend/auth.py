"""Authentication and Role-Based Access Control (RBAC) module for SpendSense.

Provides:
- Secure password hashing and verification using bcrypt
- Cryptographically signed JWT access tokens (HS256) with configurable expiration
- User data ownership enforcement (CUSTOMER vs ADMIN)
- FastAPI dependencies: get_current_user, require_admin, require_authenticated_user
- Safe, non-destructive schema migration for `role` and `password_hash` in `users`
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

import db

log = logging.getLogger("spendsense.auth")

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "spendsense-production-secret-key-2026-secure-auth-jwt-token-hash")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

security_bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------- Password Security
def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt."""
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception as e:
        log.warning("Password verification exception: %s", e)
        return False


# --------------------------------------------------------------------------- JWT Generation & Decoding
def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a signed JWT token.
    
    Raises HTTPException(401) on invalid signature, expiration, or format.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --------------------------------------------------------------------------- Non-Destructive Schema Setup
def ensure_auth_schema() -> None:
    """Safely add `role` and `password_hash` to `users` if missing, and seed initial passwords."""
    try:
        cols = [c["Field"] for c in db.query("SHOW COLUMNS FROM users")]
        with db.engine.connect() as conn:
            if "role" not in cols:
                log.info("Adding 'role' column to users table...")
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN role ENUM('ADMIN', 'CUSTOMER') NOT NULL DEFAULT 'CUSTOMER'")
                )
            if "password_hash" not in cols:
                log.info("Adding 'password_hash' column to users table...")
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL")
                )
            conn.commit()

        # Seed or ensure default demo users have secure credentials
        users_without_pw = db.query("SELECT user_id, email FROM users WHERE password_hash IS NULL OR password_hash = ''")
        if users_without_pw:
            default_hash = hash_password("SpendSense@2026")
            with db.engine.connect() as conn:
                for u in users_without_pw:
                    email = u["email"].lower()
                    assigned_role = "ADMIN" if "gaurav" in email or "admin" in email else "CUSTOMER"
                    conn.execute(
                        text("UPDATE users SET password_hash = :ph, role = :role WHERE user_id = :uid"),
                        {"ph": default_hash, "role": assigned_role, "uid": u["user_id"]},
                    )
                conn.commit()
            log.info("Seeded initial secure password hashes for %d user accounts.", len(users_without_pw))
    except Exception as e:
        log.warning("Could not execute auth schema check: %s", e)


# --------------------------------------------------------------------------- FastAPI Dependencies
def get_current_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> dict[str, Any]:
    """Retrieve and verify the authenticated user from the Bearer token or cookie.
    
    Validates token signature, expiration, and ensures user exists in MySQL.
    """
    token: Optional[str] = None
    if auth and auth.credentials:
        token = auth.credentials
    else:
        # Check cookie fallback
        token = request.cookies.get("spendsense_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token: missing subject identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch live record from DB to verify active status and latest role
    user = db.one(
        "SELECT user_id, full_name, email, role FROM users WHERE user_id = :uid",
        {"uid": user_id},
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user["permissions"] = (
        ["READ", "WRITE", "EXPORT", "AUDIT_LOGS", "ADMIN_PANEL"]
        if user["role"] == "ADMIN"
        else ["READ", "EXPORT"]
    )
    return user


def get_optional_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[dict[str, Any]]:
    """Retrieve user if valid token is provided, or return None if unauthenticated."""
    token: Optional[str] = None
    if auth and auth.credentials:
        token = auth.credentials
    else:
        token = request.cookies.get("spendsense_token")

    if not token:
        return None

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            return None
        user = db.one(
            "SELECT user_id, full_name, email, role FROM users WHERE user_id = :uid",
            {"uid": user_id},
        )
        if user:
            user["permissions"] = (
                ["READ", "WRITE", "EXPORT", "AUDIT_LOGS", "ADMIN_PANEL"]
                if user["role"] == "ADMIN"
                else ["READ", "EXPORT"]
            )
        return user
    except Exception:
        return None


def require_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Dependency ensuring the authenticated user has the ADMIN role."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Forbidden: ADMIN role required to perform this action.",
        )
    return current_user


def require_authenticated_user(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Dependency ensuring the user is authenticated (CUSTOMER or ADMIN)."""
    return current_user
