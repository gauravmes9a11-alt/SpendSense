"""Database layer: pooled MySQL engine, query helpers and metadata helpers.

All SQL in this project is executed through `query()` with bound parameters.
Credentials come from environment variables (backend/.env) and are never
returned to the frontend.
"""
from __future__ import annotations

import datetime as dt
import decimal
import logging
import os
import time
from contextvars import ContextVar
from typing import Any, Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

load_dotenv()
log = logging.getLogger("spendsense.db")

DB_NAME = os.getenv("MYSQL_DATABASE", "spendsense")

engine = create_engine(
    URL.create(
        "mysql+pymysql",
        username=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD") or None,
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        database=DB_NAME,
        query={"charset": "utf8mb4"},
    ),
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,   # transparently replaces dead connections
    pool_recycle=1800,
    connect_args={"connect_timeout": 5, "read_timeout": 30},
)

# Per-request list of measured query durations (ms); read by a middleware.
trace: ContextVar[Optional[list]] = ContextVar("db_trace", default=None)


def clean(v: Any) -> Any:
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).decode("utf-8", "replace")
    if isinstance(v, dt.timedelta):
        return str(v)
    return v


def query(sql: str, params: Optional[dict] = None) -> list[dict]:
    start = time.perf_counter()
    with engine.connect() as conn:
        res = conn.execute(text(sql), params or {})
        rows = [{k: clean(v) for k, v in r._mapping.items()} for r in res]
    ms = (time.perf_counter() - start) * 1000
    t = trace.get()
    if t is not None:
        t.append(ms)
    return rows


def one(sql: str, params: Optional[dict] = None) -> dict:
    rows = query(sql, params)
    return rows[0] if rows else {}


def scalar(sql: str, params: Optional[dict] = None) -> Any:
    row = one(sql, params)
    return next(iter(row.values()), None)


def objects() -> dict[str, str]:
    """Return {name: 'table' | 'view'} for the current schema, from MySQL metadata."""
    rows = query(
        "SELECT TABLE_NAME AS name, TABLE_TYPE AS kind FROM information_schema.tables "
        "WHERE TABLE_SCHEMA = DATABASE()"
    )
    return {r["name"]: ("view" if r["kind"] == "VIEW" else "table") for r in rows}


def columns_of(name: str) -> list[str]:
    rows = query(
        "SELECT COLUMN_NAME AS name FROM information_schema.columns "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t ORDER BY ORDINAL_POSITION",
        {"t": name},
    )
    return [r["name"] for r in rows]


def db_error_info(exc: BaseException) -> tuple[Optional[int], str, bool]:
    """(mysql_error_code, user-safe hint, is_connection_problem). Never leaks secrets."""
    orig = getattr(exc, "orig", None)
    code = orig.args[0] if orig is not None and orig.args and isinstance(orig.args[0], int) else None
    hints = {
        1045: "MySQL rejected the username or password. Check MYSQL_USER and MYSQL_PASSWORD in backend/.env.",
        1044: "This MySQL user has no access to the database.",
        1698: "MySQL rejected this login (the account may use socket authentication). Create a normal MySQL user with a password and put it in backend/.env.",
        1049: "The database named in MYSQL_DATABASE does not exist.",
        2002: "Cannot reach MySQL. Is the MySQL service running?",
        2003: "Cannot reach MySQL at MYSQL_HOST:MYSQL_PORT. Is the MySQL service running?",
        2006: "The MySQL connection was closed. Retry in a moment.",
        2013: "Lost connection to MySQL during the query.",
        1146: "A table or view this page needs does not exist in the database.",
        1054: "A column this page expects is missing from the table or view.",
        3024: "The query ran longer than the allowed time and was stopped.",
    }
    connection_codes = {1044, 1045, 1698, 1049, 2002, 2003, 2006, 2013}
    hint = hints.get(code, "The database reported an error. Check the backend log for details.")
    return code, hint, code in connection_codes
