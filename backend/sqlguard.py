"""Read-only SQL console guard.

Defence in depth: (1) static validation, (2) the statement runs inside
START TRANSACTION READ ONLY, (3) a server-side execution time limit and a row cap.
For real privilege separation, point the backend at a MySQL user that only has
SELECT (see README).
"""
from __future__ import annotations

import re
import time
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

import db

MAX_ROWS = 500
MAX_SQL_CHARS = 5000
TIMEOUT_MS = 5000


class SqlRejected(ValueError):
    """Raised with a message that is safe to show to the user."""


_LITERALS = re.compile(r"'(?:[^'\\]|\\.|'')*'|\"(?:[^\"\\]|\\.|\"\")*\"|`[^`]*`")
_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|truncate|alter|create|rename|grant|revoke|call|do|handler|"
    r"load|lock|unlock|set|use|prepare|execute|deallocate|kill|shutdown|optimize|analyze|repair|"
    r"flush|reset|purge|install|uninstall|outfile|dumpfile|into|load_file|sleep|benchmark|"
    r"get_lock|release_lock|for\s+update|lock\s+in\s+share\s+mode)\b",
    re.I,
)


def validate(sql: str) -> str:
    s = (sql or "").strip()
    if not s:
        raise SqlRejected("Enter a SELECT query.")
    if len(s) > MAX_SQL_CHARS:
        raise SqlRejected(f"Query is too long (limit {MAX_SQL_CHARS} characters).")
    body = _LITERALS.sub("''", s)
    if body.endswith(";"):
        body, s = body[:-1], s[:-1]
    if ";" in body:
        raise SqlRejected("Only one statement is allowed.")
    if "--" in body or "/*" in body or "#" in body:
        raise SqlRejected("Comments are not allowed in the console.")
    if not re.match(r"^\s*(select|with)\b", body, re.I):
        raise SqlRejected("Only SELECT queries (optionally starting with WITH) are allowed.")
    hit = _FORBIDDEN.search(body)
    if hit:
        word = re.sub(r"\s+", " ", hit.group(0)).upper()
        raise SqlRejected(f"{word} is not allowed in the read-only console.")
    if re.search(r"\b(mysql|performance_schema|sys)\s*\.", body, re.I):
        raise SqlRejected("System schemas are not available in the console.")
    return s


def run_readonly(sql: str, params: Optional[dict[str, Any]] = None) -> dict:
    s = validate(sql)
    params = params or {}
    if len(params) > 20:
        raise SqlRejected("Too many parameters (limit 20).")
    for k, v in params.items():
        if not re.fullmatch(r"[A-Za-z_]\w{0,40}", str(k)):
            raise SqlRejected(f"Invalid parameter name: {k!r}")
        if v is not None and not isinstance(v, (str, int, float, bool)):
            raise SqlRejected(f"Parameter {k!r} must be a string, number, boolean or null.")

    start = time.perf_counter()
    with db.engine.connect() as conn:
        try:
            conn.exec_driver_sql(f"SET SESSION MAX_EXECUTION_TIME={TIMEOUT_MS}")
            conn.exec_driver_sql("START TRANSACTION READ ONLY")
            result = conn.execute(text(s), params)
            columns = list(result.keys())
            fetched = result.fetchmany(MAX_ROWS + 1)
            truncated = len(fetched) > MAX_ROWS
            rows = [{c: db.clean(v) for c, v in zip(columns, r)} for r in fetched[:MAX_ROWS]]
        except SQLAlchemyError as exc:
            orig = getattr(exc, "orig", None)
            msg = str(orig.args[1]) if orig is not None and len(orig.args) > 1 else "The query could not be run."
            raise SqlRejected(f"MySQL: {msg}") from exc
        finally:
            try:
                conn.rollback()
                conn.exec_driver_sql("SET SESSION MAX_EXECUTION_TIME=0")
            except SQLAlchemyError:
                pass
    elapsed = (time.perf_counter() - start) * 1000
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
        "max_rows": MAX_ROWS,
        "elapsed_ms": round(elapsed, 1),
    }
