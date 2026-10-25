"""SpendSense API (FastAPI). Read-only analytics over the existing `spendsense` MySQL database."""
from __future__ import annotations

import csv
import io
import logging
import os
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

import db
from sqlguard import SqlRejected, run_readonly

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("spendsense.api")

app = FastAPI(title="SpendSense API", version="1.0.0", description="Read-only analytics API for the SpendSense MySQL database.")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-DB-Time-Ms", "X-DB-Queries", "Content-Disposition"],
)


@app.middleware("http")
async def measure_db_time(request: Request, call_next):
    token = db.trace.set([])
    try:
        response = await call_next(request)
        times = db.trace.get() or []
        response.headers["X-DB-Time-Ms"] = f"{sum(times):.1f}"
        response.headers["X-DB-Queries"] = str(len(times))
        return response
    finally:
        db.trace.reset(token)


@app.exception_handler(SQLAlchemyError)
async def sql_error_handler(request: Request, exc: SQLAlchemyError):
    code, hint, is_conn = db.db_error_info(exc)
    log.exception("Database error on %s (mysql code %s)", request.url.path, code)  # technical detail stays in the log
    return JSONResponse(status_code=503 if is_conn else 500, content={"detail": hint, "mysql_code": code})


@app.exception_handler(SqlRejected)
async def sql_rejected_handler(request: Request, exc: SqlRejected):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Unexpected server error. See the backend log."})


# --------------------------------------------------------------------------- shared SQL
MONTHLY_EXPR = (
    "CASE s.billing_cycle WHEN 'WEEKLY' THEN s.current_price * 52 / 12 "
    "WHEN 'MONTHLY' THEN s.current_price WHEN 'QUARTERLY' THEN s.current_price / 3 "
    "WHEN 'YEARLY' THEN s.current_price / 12 END"
)
RECURRING_VIEW = "v_recurring_payment_candidates"
UNUSED_VIEW = "v_unused_subscriptions"

# What each page needs from the database (shown in Settings and the README).
REQUIRED_OBJECTS = [
    ("users", "table", "All pages (user filter)"),
    ("transactions", "table", "Overview, Transactions, Analytics, Anomalies"),
    ("merchants", "table", "Overview, Transactions, Subscriptions, Analytics"),
    ("categories", "table", "Overview, Transactions, Analytics"),
    ("subscriptions", "table", "Overview, Subscriptions, Recurring Payments"),
    ("recurring_groups", "table", "Database Explorer"),
    ("usage_logs", "table", "Subscriptions (unused detection)"),
    ("subscription_price_history", "table", "Subscriptions (price changes)"),
    ("anomaly_flags", "table", "Overview, Anomaly Detection"),
    ("alerts", "table", "Anomaly Detection"),
    ("v_monthly_category_spending", "view", "Database Explorer (demo view)"),
    (RECURRING_VIEW, "view", "Recurring Payments"),
    (UNUSED_VIEW, "view", "Subscriptions - Unused (optional; live query used if absent)"),
]


def _i(v: Any) -> int:
    return int(v or 0)


def _check_range(date_from: Optional[date], date_to: Optional[date]) -> None:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to.")


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _tx_where(q, user_id, category_id, tx_type, date_from, date_to) -> tuple[str, dict]:
    where = [
        "(:u IS NULL OR t.user_id = :u)",
        "(:c IS NULL OR t.category_id = :c)",
        "(:tt IS NULL OR t.transaction_type = :tt)",
        "(:df IS NULL OR t.transaction_date >= :df)",
        "(:dt IS NULL OR t.transaction_date <= :dt)",
    ]
    p: dict[str, Any] = {"u": user_id, "c": category_id, "tt": tx_type, "df": date_from, "dt": date_to}
    if q:
        where.append("(m.merchant_name LIKE :q OR t.description LIKE :q)")
        p["q"] = _like(q)
    return " AND ".join(where), p


TX_FROM = (
    "FROM transactions t JOIN users u ON u.user_id = t.user_id "
    "JOIN merchants m ON m.merchant_id = t.merchant_id "
    "JOIN categories c ON c.category_id = t.category_id "
    "LEFT JOIN subscriptions s ON s.subscription_id = t.subscription_id"
)
TX_COLS = (
    "t.transaction_id, t.user_id, u.full_name AS user_name, t.transaction_date, t.amount, "
    "t.transaction_type, t.description, t.source, t.created_at, t.subscription_id, "
    "s.subscription_name, m.merchant_name, c.category_name"
)
TX_SORT = {"date": "t.transaction_date", "amount": "t.amount", "merchant": "m.merchant_name", "id": "t.transaction_id"}

UserId = Query(None, ge=1, description="Limit to one user")


# --------------------------------------------------------------------------- health / meta
@app.get("/api/health")
def health():
    """Reports Connected only after a real round-trip to MySQL succeeds."""
    checked = datetime.now(timezone.utc).isoformat()
    try:
        row = db.one("SELECT VERSION() AS version, DATABASE() AS db")
        return {"status": "connected", "database": row.get("db"), "server_version": row.get("version"), "checked_at": checked}
    except SQLAlchemyError as exc:
        code, hint, is_conn = db.db_error_info(exc)
        log.error("Health check failed (mysql code %s)", code)
        return JSONResponse(
            status_code=503,
            content={"status": "disconnected" if is_conn else "error", "message": hint, "mysql_code": code, "checked_at": checked},
        )


@app.get("/api/meta")
def meta():
    present = db.objects()
    return {
        "currency": "INR",
        "users": db.query("SELECT user_id, full_name FROM users ORDER BY user_id"),
        "categories": db.query("SELECT category_id, category_name, category_type FROM categories ORDER BY category_name"),
        "objects": [
            {"name": n, "kind": k, "exists": present.get(n) == k, "used_by": u} for n, k, u in REQUIRED_OBJECTS
        ],
    }


@app.get("/api/settings")
def settings():
    return {
        "database": db.DB_NAME,
        "server_version": db.scalar("SELECT VERSION()"),
        "currency": "INR",
        "pool_size": db.engine.pool.size() if hasattr(db.engine.pool, "size") else None,
        "console_limits": {"max_rows": 500, "timeout_ms": 5000},
    }


# --------------------------------------------------------------------------- dashboard
@app.get("/api/dashboard/summary")
def dashboard_summary(user_id: Optional[int] = UserId):
    p = {"u": user_id}
    tx = db.one(
        """SELECT COUNT(*) AS total_transactions,
                  COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount END), 0) AS total_expenses,
                  COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' THEN amount END), 0) AS total_income
           FROM transactions WHERE (:u IS NULL OR user_id = :u)""",
        p,
    )
    subs = db.one(
        f"""SELECT COUNT(*) AS active_subscriptions,
                   ROUND(COALESCE(SUM({MONTHLY_EXPR}), 0), 2) AS monthly_recurring_estimate
            FROM subscriptions s WHERE s.status = 'ACTIVE' AND (:u IS NULL OR s.user_id = :u)""",
        p,
    )
    an = db.one(
        """SELECT COUNT(*) AS total_anomalies,
                  COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_anomalies
           FROM anomaly_flags WHERE (:u IS NULL OR user_id = :u)""",
        p,
    )
    return {
        "currency": "INR",
        "total_transactions": _i(tx.get("total_transactions")),
        "total_expenses": tx.get("total_expenses", 0),
        "total_income": tx.get("total_income", 0),
        "active_subscriptions": _i(subs.get("active_subscriptions")),
        "monthly_recurring_estimate": subs.get("monthly_recurring_estimate", 0),
        "total_anomalies": _i(an.get("total_anomalies")),
        "open_anomalies": _i(an.get("open_anomalies")),
    }


@app.get("/api/dashboard/monthly-spending")
def monthly_spending(user_id: Optional[int] = UserId):
    rows = db.query(
        """SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
                  SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END) AS expense,
                  SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END) AS income,
                  COUNT(*) AS tx_count
           FROM transactions WHERE (:u IS NULL OR user_id = :u)
           GROUP BY DATE_FORMAT(transaction_date, '%Y-%m') ORDER BY month""",
        {"u": user_id},
    )
    return {"items": rows}


@app.get("/api/dashboard/category-spending")
def category_spending(user_id: Optional[int] = UserId, date_from: Optional[date] = None, date_to: Optional[date] = None):
    _check_range(date_from, date_to)
    rows = db.query(
        """SELECT c.category_id, c.category_name, SUM(t.amount) AS total, COUNT(*) AS tx_count
           FROM transactions t JOIN categories c ON c.category_id = t.category_id
           WHERE t.transaction_type = 'EXPENSE' AND (:u IS NULL OR t.user_id = :u)
             AND (:df IS NULL OR t.transaction_date >= :df) AND (:dt IS NULL OR t.transaction_date <= :dt)
           GROUP BY c.category_id, c.category_name ORDER BY total DESC""",
        {"u": user_id, "df": date_from, "dt": date_to},
    )
    grand = sum(r["total"] for r in rows) or 0
    for r in rows:
        r["share_pct"] = round(100 * r["total"] / grand, 1) if grand else 0
    return {"items": rows}


@app.get("/api/dashboard/top-merchants")
def top_merchants(user_id: Optional[int] = UserId, limit: int = Query(6, ge=1, le=50)):
    rows = db.query(
        """SELECT m.merchant_id, m.merchant_name, SUM(t.amount) AS total, COUNT(*) AS tx_count
           FROM transactions t JOIN merchants m ON m.merchant_id = t.merchant_id
           WHERE t.transaction_type = 'EXPENSE' AND (:u IS NULL OR t.user_id = :u)
           GROUP BY m.merchant_id, m.merchant_name ORDER BY total DESC LIMIT :lim""",
        {"u": user_id, "lim": limit},
    )
    return {"items": rows}


# --------------------------------------------------------------------------- transactions
@app.get("/api/transactions")
def list_transactions(
    q: Optional[str] = Query(None, max_length=100),
    user_id: Optional[int] = UserId,
    category_id: Optional[int] = Query(None, ge=1),
    type: Optional[str] = Query(None, pattern="^(EXPENSE|INCOME)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("date", pattern="^(date|amount|merchant|id)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=200),
):
    _check_range(date_from, date_to)
    where, p = _tx_where(q, user_id, category_id, type, date_from, date_to)
    total = db.scalar(f"SELECT COUNT(*) {TX_FROM} WHERE {where}", p)
    order_sql = f"{TX_SORT[sort]} {'ASC' if order == 'asc' else 'DESC'}, t.transaction_id DESC"
    items = db.query(
        f"SELECT {TX_COLS} {TX_FROM} WHERE {where} ORDER BY {order_sql} LIMIT :lim OFFSET :off",
        {**p, "lim": page_size, "off": (page - 1) * page_size},
    )
    total = _i(total)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, -(-total // page_size))}


@app.get("/api/transactions/export")
def export_transactions(
    q: Optional[str] = Query(None, max_length=100),
    user_id: Optional[int] = UserId,
    category_id: Optional[int] = Query(None, ge=1),
    type: Optional[str] = Query(None, pattern="^(EXPENSE|INCOME)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: str = Query("date", pattern="^(date|amount|merchant|id)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """CSV of the currently filtered result set (capped at 50,000 rows)."""
    _check_range(date_from, date_to)
    where, p = _tx_where(q, user_id, category_id, type, date_from, date_to)
    rows = db.query(
        f"SELECT {TX_COLS} {TX_FROM} WHERE {where} "
        f"ORDER BY {TX_SORT[sort]} {'ASC' if order == 'asc' else 'DESC'}, t.transaction_id DESC LIMIT 50000",
        p,
    )
    fields = ["transaction_id", "user_name", "transaction_date", "merchant_name", "category_name", "transaction_type",
              "amount", "description", "source", "subscription_name"]

    def safe(v: Any) -> Any:  # neutralise spreadsheet formula injection
        return "'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@") else v

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(fields)
    for r in rows:
        w.writerow([safe(r.get(f)) if r.get(f) is not None else "" for f in fields])
    name = f"spendsense_transactions_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter(["\ufeff" + buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


# --------------------------------------------------------------------------- recurring payments
def _pick(row: dict, *patterns: str) -> Any:
    for key, val in row.items():
        k = key.lower()
        if any(re.search(p, k) for p in patterns):
            return val
    return None


@app.get("/api/recurring-payments")
def recurring_payments(user_id: Optional[int] = UserId, limit: int = Query(500, ge=1, le=2000)):
    present = db.objects()
    if present.get(RECURRING_VIEW) != "view":
        return {"available": False, "view": RECURRING_VIEW, "columns": [], "rows": [],
                "message": f"The view {RECURRING_VIEW} was not found in the database. Create it in MySQL Workbench; "
                           "the page lists every candidate the view returns."}
    cols = db.columns_of(RECURRING_VIEW)
    sql = f"SELECT * FROM `{RECURRING_VIEW}`"
    params: dict[str, Any] = {"lim": limit}
    if user_id is not None and "user_id" in cols:
        sql += " WHERE user_id = :u"
        params["u"] = user_id
    rows = db.query(sql + " LIMIT :lim", params)

    # Compare against real subscriptions to separate confirmed from potential.
    subs = db.query(
        "SELECT s.user_id, s.merchant_id, m.merchant_name, s.subscription_name, s.status "
        "FROM subscriptions s JOIN merchants m ON m.merchant_id = s.merchant_id WHERE s.status <> 'CANCELLED'"
    )
    by_id = {(s["user_id"], s["merchant_id"]): s for s in subs}
    by_name = {s["merchant_name"].strip().lower(): s for s in subs}
    can_match = ("merchant_id" in cols) or any(re.search("merchant", c.lower()) for c in cols)
    for r in rows:
        match = None
        if "merchant_id" in r and "user_id" in r:
            match = by_id.get((r["user_id"], r["merchant_id"]))
        elif "merchant_id" in r:
            match = next((s for s in subs if s["merchant_id"] == r["merchant_id"]), None)
        else:
            name = _pick(r, r"merchant")
            if isinstance(name, str):
                match = by_name.get(name.strip().lower())
        r["_confirmed"] = bool(match) if can_match else None
        r["_subscription"] = match["subscription_name"] if match else None
    return {"available": True, "view": RECURRING_VIEW, "columns": cols, "rows": rows,
            "confirmed_count": sum(1 for r in rows if r["_confirmed"]),
            "potential_count": sum(1 for r in rows if r["_confirmed"] is False), "match_supported": can_match}


# --------------------------------------------------------------------------- subscriptions
@app.get("/api/subscriptions")
def subscriptions(user_id: Optional[int] = UserId, status: Optional[str] = Query(None, pattern="^(ACTIVE|PAUSED|CANCELLED)$")):
    items = db.query(
        f"""SELECT s.subscription_id, s.user_id, u.full_name AS user_name, s.subscription_name, m.merchant_name,
                   c.category_name, s.current_price, s.billing_cycle, s.started_on, s.status, s.last_used_on,
                   ul.last_logged_use, ROUND({MONTHLY_EXPR}, 2) AS monthly_estimate
            FROM subscriptions s
            JOIN users u ON u.user_id = s.user_id JOIN merchants m ON m.merchant_id = s.merchant_id
            JOIN categories c ON c.category_id = s.category_id
            LEFT JOIN (SELECT subscription_id, MAX(used_on) AS last_logged_use FROM usage_logs GROUP BY subscription_id) ul
                   ON ul.subscription_id = s.subscription_id
            WHERE (:u IS NULL OR s.user_id = :u) AND (:st IS NULL OR s.status = :st)
            ORDER BY s.status, monthly_estimate DESC""",
        {"u": user_id, "st": status},
    )
    active = [i for i in items if i["status"] == "ACTIVE"]
    monthly = round(sum(i["monthly_estimate"] or 0 for i in active), 2)
    by_cat: dict[str, float] = {}
    for i in active:
        by_cat[i["category_name"]] = by_cat.get(i["category_name"], 0) + (i["monthly_estimate"] or 0)
    return {
        "items": items,
        "summary": {
            "active_count": len(active),
            "monthly_estimate": monthly,
            "annual_estimate": round(monthly * 12, 2),
            "by_category": sorted(({"category_name": k, "monthly": round(v, 2)} for k, v in by_cat.items()), key=lambda x: -x["monthly"]),
            "top": [{"subscription_name": i["subscription_name"], "monthly": i["monthly_estimate"]}
                    for i in sorted(active, key=lambda x: -(x["monthly_estimate"] or 0))[:5]],
        },
    }


@app.get("/api/subscriptions/unused")
def unused_subscriptions(
    user_id: Optional[int] = UserId,
    days: int = Query(30, ge=1, le=365),
    as_of: Optional[date] = Query(None, description="Reference date; defaults to today"),
):
    present = db.objects()
    monthly = {r["subscription_id"]: r["monthly_estimate"] for r in db.query(
        f"SELECT s.subscription_id, ROUND({MONTHLY_EXPR}, 2) AS monthly_estimate FROM subscriptions s")}

    if present.get(UNUSED_VIEW) == "view":
        cols = db.columns_of(UNUSED_VIEW)
        sql = f"SELECT * FROM `{UNUSED_VIEW}`"
        params: dict[str, Any] = {}
        if user_id is not None and "user_id" in cols:
            sql += " WHERE user_id = :u"
            params["u"] = user_id
        rows = db.query(sql + " LIMIT 500", params)
        items = []
        for r in rows:
            d = _pick(r, r"days")
            est = monthly.get(r.get("subscription_id")) if "subscription_id" in r else None
            items.append({
                "subscription_id": r.get("subscription_id"),
                "subscription_name": _pick(r, r"subscription_name", r"^name$") or _pick(r, r"merchant"),
                "last_used": _pick(r, r"last_use", r"last_used"),
                "days_since": d,
                "monthly_estimate": est,
                "reason": (f"Returned by {UNUSED_VIEW}: {int(d)} days since the last recorded use."
                           if isinstance(d, (int, float)) else f"Returned by {UNUSED_VIEW}."),
            })
        return {"source": "view", "view": UNUSED_VIEW, "view_available": True, "threshold_days": None, "items": items,
                "columns": cols, **_savings(items)}

    rows = db.query(
        f"""SELECT s.subscription_id, s.user_id, s.subscription_name, m.merchant_name, s.current_price, s.billing_cycle,
                   NULLIF(GREATEST(COALESCE(s.last_used_on, '0001-01-01'), COALESCE(ul.last_log, '0001-01-01')), '0001-01-01') AS last_used,
                   ROUND({MONTHLY_EXPR}, 2) AS monthly_estimate
            FROM subscriptions s JOIN merchants m ON m.merchant_id = s.merchant_id
            LEFT JOIN (SELECT subscription_id, MAX(used_on) AS last_log FROM usage_logs GROUP BY subscription_id) ul
                   ON ul.subscription_id = s.subscription_id
            WHERE s.status = 'ACTIVE' AND (:u IS NULL OR s.user_id = :u)""",
        {"u": user_id},
    )
    ref = as_of or date.today()
    items = []
    for r in rows:
        last = date.fromisoformat(r["last_used"]) if r["last_used"] else None
        gap = (ref - last).days if last else None
        if last is None or gap > days:
            items.append({
                "subscription_id": r["subscription_id"], "subscription_name": r["subscription_name"],
                "merchant_name": r["merchant_name"], "last_used": r["last_used"], "days_since": gap,
                "monthly_estimate": r["monthly_estimate"],
                "reason": ("No usage has been recorded for this subscription." if last is None
                           else f"Last recorded use was {gap} days before {ref.isoformat()}; the limit is {days} days."),
            })
    items.sort(key=lambda x: -(x["monthly_estimate"] or 0))
    return {"source": "live_query", "view": UNUSED_VIEW, "view_available": False, "threshold_days": days,
            "as_of": ref.isoformat(), "items": items, **_savings(items)}


def _savings(items: list[dict]) -> dict:
    m = round(sum(i["monthly_estimate"] or 0 for i in items), 2)
    return {"potential_monthly_savings": m, "potential_annual_savings": round(m * 12, 2)}


@app.get("/api/subscriptions/price-changes")
def price_changes(user_id: Optional[int] = UserId):
    needed = ["subscription_id", "old_price", "new_price", "changed_at"]
    cols = db.columns_of("subscription_price_history")
    missing = [c for c in needed if c not in cols]
    if missing:
        return {"available": False, "missing_columns": missing, "items": [],
                "message": "subscription_price_history is missing columns this page needs: " + ", ".join(missing)}
    items = db.query(
        """SELECT p.price_history_id, p.subscription_id, s.subscription_name, m.merchant_name, p.old_price, p.new_price,
                  p.changed_at, p.change_source, ROUND(p.new_price - p.old_price, 2) AS difference,
                  ROUND(100 * (p.new_price - p.old_price) / NULLIF(p.old_price, 0), 2) AS percent_change,
                  CASE WHEN p.new_price > p.old_price THEN 'INCREASE' WHEN p.new_price < p.old_price THEN 'DECREASE'
                       ELSE 'UNCHANGED' END AS direction
           FROM subscription_price_history p JOIN subscriptions s ON s.subscription_id = p.subscription_id
           JOIN merchants m ON m.merchant_id = s.merchant_id
           WHERE (:u IS NULL OR s.user_id = :u) ORDER BY p.changed_at DESC, p.price_history_id DESC""",
        {"u": user_id},
    )
    return {"available": True, "missing_columns": [], "items": items,
            "increases": sum(1 for i in items if i["direction"] == "INCREASE"),
            "decreases": sum(1 for i in items if i["direction"] == "DECREASE")}


# --------------------------------------------------------------------------- anomalies
@app.get("/api/anomalies")
def anomalies(
    user_id: Optional[int] = UserId,
    status: Optional[str] = Query(None, pattern="^(OPEN|REVIEWED|DISMISSED)$"),
    severity: Optional[str] = Query(None, pattern="^(LOW|MEDIUM|HIGH)$"),
    anomaly_type: Optional[str] = Query(None, pattern="^(UNUSUAL_SPENDING|PRICE_DRIFT|LOW_USAGE_HIGH_COST)$"),
):
    base_p = {"u": user_id}
    summary = {
        "by_severity": db.query("SELECT severity AS label, COUNT(*) AS n FROM anomaly_flags WHERE (:u IS NULL OR user_id = :u) GROUP BY severity", base_p),
        "by_status": db.query("SELECT status AS label, COUNT(*) AS n FROM anomaly_flags WHERE (:u IS NULL OR user_id = :u) GROUP BY status", base_p),
        "by_type": db.query("SELECT anomaly_type AS label, COUNT(*) AS n FROM anomaly_flags WHERE (:u IS NULL OR user_id = :u) GROUP BY anomaly_type", base_p),
    }
    summary["total"] = sum(r["n"] for r in summary["by_status"])
    flags = db.query(
        """SELECT a.anomaly_id, a.user_id, u.full_name AS user_name, a.anomaly_type, a.severity, a.status, a.explanation,
                  a.detected_at, a.transaction_id, t.transaction_date, t.amount, mt.merchant_name,
                  a.subscription_id, s.subscription_name, s.current_price
           FROM anomaly_flags a JOIN users u ON u.user_id = a.user_id
           LEFT JOIN transactions t ON t.transaction_id = a.transaction_id
           LEFT JOIN merchants mt ON mt.merchant_id = t.merchant_id
           LEFT JOIN subscriptions s ON s.subscription_id = a.subscription_id
           WHERE (:u IS NULL OR a.user_id = :u) AND (:st IS NULL OR a.status = :st)
             AND (:sv IS NULL OR a.severity = :sv) AND (:ty IS NULL OR a.anomaly_type = :ty)
           ORDER BY a.detected_at DESC, a.anomaly_id DESC LIMIT 200""",
        {"u": user_id, "st": status, "sv": severity, "ty": anomaly_type},
    )
    alerts = db.query(
        """SELECT al.alert_id, al.anomaly_id, al.alert_title, al.alert_message, al.created_at, al.is_read
           FROM alerts al WHERE (:u IS NULL OR al.user_id = :u) ORDER BY al.created_at DESC, al.alert_id DESC LIMIT 50""",
        base_p,
    )
    return {"summary": summary, "flags": flags, "alerts": alerts,
            "unread_alerts": sum(1 for a in alerts if not a["is_read"])}


@app.get("/api/anomalies/dynamic")
def dynamic_anomalies(
    user_id: Optional[int] = UserId,
    z: float = Query(1.5, ge=0.5, le=5, description="Minimum absolute z-score"),
    min_samples: int = Query(4, ge=3, le=100),
):
    """Computed at request time with window functions. Nothing here is stored in anomaly_flags."""
    outliers = db.query(
        """SELECT x.*, ROUND((x.amount - x.category_mean) / x.category_stddev, 2) AS z_score
           FROM (
             SELECT t.transaction_id, t.user_id, t.transaction_date, t.amount, m.merchant_name, c.category_name,
                    COUNT(*) OVER w AS sample_size,
                    ROUND(AVG(t.amount) OVER w, 2) AS category_mean,
                    STDDEV_POP(t.amount) OVER w AS category_stddev,
                    ROUND(PERCENT_RANK() OVER (PARTITION BY t.user_id, t.category_id ORDER BY t.amount), 3) AS pct_rank
             FROM transactions t JOIN merchants m ON m.merchant_id = t.merchant_id
             JOIN categories c ON c.category_id = t.category_id
             WHERE t.transaction_type = 'EXPENSE' AND (:u IS NULL OR t.user_id = :u)
             WINDOW w AS (PARTITION BY t.user_id, t.category_id)
           ) x
           WHERE x.sample_size >= :n AND x.category_stddev > 0
             AND ABS(x.amount - x.category_mean) / x.category_stddev >= :z
           ORDER BY ABS(x.amount - x.category_mean) / x.category_stddev DESC LIMIT 100""",
        {"u": user_id, "n": min_samples, "z": z},
    )
    for o in outliers:
        o.pop("category_stddev", None)
    changes = db.query(
        """WITH monthly AS (
             SELECT t.subscription_id, DATE_FORMAT(t.transaction_date, '%Y-%m') AS billing_month, SUM(t.amount) AS month_charge
             FROM transactions t
             WHERE t.transaction_type = 'EXPENSE' AND t.subscription_id IS NOT NULL AND (:u IS NULL OR t.user_id = :u)
             GROUP BY t.subscription_id, DATE_FORMAT(t.transaction_date, '%Y-%m')
           ), compared AS (
             SELECT subscription_id, billing_month, month_charge,
                    LAG(month_charge) OVER (PARTITION BY subscription_id ORDER BY billing_month) AS previous_charge
             FROM monthly
           )
           SELECT s.subscription_name, c.billing_month, c.previous_charge, c.month_charge,
                  ROUND(c.month_charge - c.previous_charge, 2) AS change_amount,
                  ROUND(100 * (c.month_charge - c.previous_charge) / NULLIF(c.previous_charge, 0), 2) AS change_pct
           FROM compared c JOIN subscriptions s ON s.subscription_id = c.subscription_id
           WHERE c.previous_charge IS NOT NULL AND c.month_charge <> c.previous_charge
           ORDER BY c.billing_month DESC, s.subscription_name""",
        {"u": user_id},
    )
    return {"method": "Per user and category: z = (amount - AVG) / STDDEV_POP using window functions; PERCENT_RANK shown for context. "
                      "Charge changes use LAG() over monthly subscription charges.",
            "parameters": {"z": z, "min_samples": min_samples}, "outliers": outliers, "charge_changes": changes}


# --------------------------------------------------------------------------- analytics
@app.get("/api/analytics/spending")
def spending_analytics(
    user_id: Optional[int] = UserId,
    category_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    _check_range(date_from, date_to)
    p = {"u": user_id, "c": category_id, "df": date_from, "dt": date_to}
    flt = ("(:u IS NULL OR t.user_id = :u) AND (:c IS NULL OR t.category_id = :c) "
           "AND (:df IS NULL OR t.transaction_date >= :df) AND (:dt IS NULL OR t.transaction_date <= :dt)")
    monthly = db.query(
        f"""WITH m AS (
              SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
                     SUM(CASE WHEN t.transaction_type = 'EXPENSE' THEN t.amount ELSE 0 END) AS expense,
                     SUM(CASE WHEN t.transaction_type = 'INCOME' THEN t.amount ELSE 0 END) AS income,
                     COUNT(*) AS tx_count
              FROM transactions t WHERE {flt} GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m'))
            SELECT month, expense, income, tx_count,
                   LAG(expense) OVER (ORDER BY month) AS previous_expense,
                   ROUND(100 * (expense - LAG(expense) OVER (ORDER BY month)) / NULLIF(LAG(expense) OVER (ORDER BY month), 0), 2) AS mom_pct,
                   ROUND(AVG(expense) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg_3m
            FROM m ORDER BY month""",
        p,
    )
    by_category = db.query(
        f"""SELECT c.category_name, SUM(t.amount) AS total, COUNT(*) AS tx_count, ROUND(AVG(t.amount), 2) AS avg_amount
            FROM transactions t JOIN categories c ON c.category_id = t.category_id
            WHERE t.transaction_type = 'EXPENSE' AND {flt} GROUP BY c.category_id, c.category_name ORDER BY total DESC""", p)
    by_merchant = db.query(
        f"""SELECT m.merchant_name, SUM(t.amount) AS total, COUNT(*) AS tx_count
            FROM transactions t JOIN merchants m ON m.merchant_id = t.merchant_id
            WHERE t.transaction_type = 'EXPENSE' AND {flt} GROUP BY m.merchant_id, m.merchant_name ORDER BY total DESC LIMIT 15""", p)
    by_type = db.query(
        f"""SELECT t.transaction_type, SUM(t.amount) AS total, COUNT(*) AS tx_count
            FROM transactions t WHERE {flt} GROUP BY t.transaction_type""", p)
    recurring = db.query(
        f"""SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
                   SUM(CASE WHEN t.subscription_id IS NOT NULL THEN t.amount ELSE 0 END) AS subscription_linked,
                   SUM(CASE WHEN t.subscription_id IS NULL THEN t.amount ELSE 0 END) AS other
            FROM transactions t WHERE t.transaction_type = 'EXPENSE' AND {flt}
            GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m') ORDER BY month""", p)
    return {"monthly": monthly, "by_category": by_category, "by_merchant": by_merchant, "by_type": by_type,
            "recurring_split": recurring,
            "recurring_note": "Subscription-linked means transactions.subscription_id is set; it is not inferred from merchant names."}


# --------------------------------------------------------------------------- database explorer
def _known(name: str) -> str:
    present = db.objects()
    if name not in present:
        raise HTTPException(status_code=404, detail=f"No table or view named '{name}' in this database.")
    return present[name]


@app.get("/api/database/tables")
def database_tables():
    rows = db.query(
        "SELECT TABLE_NAME AS name, TABLE_TYPE AS kind, ENGINE AS engine FROM information_schema.tables "
        "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_TYPE, TABLE_NAME"
    )
    items = []
    for r in rows:
        n = None
        try:  # exact count; the schema is small. Views are counted too.
            n = _i(db.scalar(f"SELECT COUNT(*) FROM `{r['name']}`"))
        except SQLAlchemyError:
            log.warning("Could not count rows for %s", r["name"])
        items.append({"name": r["name"], "kind": "view" if r["kind"] == "VIEW" else "table", "engine": r["engine"], "row_count": n})
    return {"database": db.DB_NAME, "items": items}


@app.get("/api/database/schema")
def database_schema(table: Optional[str] = Query(None, max_length=64)):
    if table is None:
        rels = db.query(
            """SELECT TABLE_NAME AS `table`, COLUMN_NAME AS `column`, REFERENCED_TABLE_NAME AS ref_table,
                      REFERENCED_COLUMN_NAME AS ref_column, CONSTRAINT_NAME AS constraint_name
               FROM information_schema.key_column_usage
               WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME"""
        )
        return {"relationships": rels}
    kind = _known(table)
    cols = db.query(
        """SELECT COLUMN_NAME AS name, COLUMN_TYPE AS data_type, IS_NULLABLE = 'YES' AS nullable, COLUMN_KEY AS key_type,
                  COLUMN_DEFAULT AS default_value, EXTRA AS extra
           FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t ORDER BY ORDINAL_POSITION""",
        {"t": table},
    )
    fks = db.query(
        """SELECT COLUMN_NAME AS `column`, REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column,
                  CONSTRAINT_NAME AS constraint_name
           FROM information_schema.key_column_usage
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND REFERENCED_TABLE_NAME IS NOT NULL""",
        {"t": table},
    )
    idx_rows = db.query(
        """SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS col, SEQ_IN_INDEX AS seq
           FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t ORDER BY INDEX_NAME, SEQ_IN_INDEX""",
        {"t": table},
    )
    indexes: dict[str, dict] = {}
    for r in idx_rows:
        e = indexes.setdefault(r["name"], {"name": r["name"], "unique": not r["non_unique"], "columns": []})
        e["columns"].append(r["col"])
    definition = None
    if kind == "view":
        try:
            definition = db.scalar("SELECT VIEW_DEFINITION FROM information_schema.views WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t", {"t": table})
        except SQLAlchemyError:
            definition = None
    return {"table": table, "kind": kind, "columns": cols, "primary_key": [c["name"] for c in cols if c["key_type"] == "PRI"],
            "foreign_keys": fks, "indexes": list(indexes.values()), "definition": definition}


@app.get("/api/database/table-preview")
def table_preview(table: str = Query(..., max_length=64), limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    _known(table)  # name must exist in information_schema before it is quoted into SQL
    cols = db.columns_of(table)
    rows = db.query(f"SELECT * FROM `{table}` LIMIT :lim OFFSET :off", {"lim": limit, "off": offset})
    return {"table": table, "columns": cols, "rows": rows, "limit": limit, "offset": offset}


class ConsoleQuery(BaseModel):
    sql: str = Field(..., max_length=5000)
    params: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/database/query")
def console_query(body: ConsoleQuery):
    """Read-only console: validated SELECT, READ ONLY transaction, 5 s limit, 500 rows."""
    return run_readonly(body.sql, body.params)
