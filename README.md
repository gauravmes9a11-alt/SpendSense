# SpendSense

Smart personal finance and subscription analytics for the `spendsense` MySQL database.
React + TypeScript + Tailwind + Recharts on the front, FastAPI + SQLAlchemy on the back.
The app is read-only: it never creates, alters or drops anything in your database.


## Team Information
| Name | SRN |
|------|-----|
| Harshitha.B.T | PES1UG24AM118 |
| Gaurav Shivakumar | PES1UG24AM104 |


```
frontend/   React app (Vite, port 5173)
backend/    FastAPI app (port 8000), reads credentials from backend/.env
database/   optional_views.sql: only needed if a view is reported missing
```

## Quick Start (One-Click)

If you have already configured `backend/.env`, simply double-click or run:

```bat
run_all.bat
```

This launches both the FastAPI backend (port 8000) and the Vite React frontend (port 5173) in separate terminal windows.

## Before you start

* MySQL 8.0+ running locally with the `spendsense` database already loaded.
  **Do not re-run `spendsense_step1.sql`.** It drops and recreates every table.
* Python 3.10+ (`py --version`) and Node.js 18+ (`node --version`).

## Windows setup (Manual)

### 1. Backend (PowerShell, from the project folder)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

If activation is blocked, run `Set-ExecutionPolicy -Scope Process Bypass` and activate again.

In `.env` set `MYSQL_USER` and `MYSQL_PASSWORD` to the login you use in Workbench. Leave
`MYSQL_DATABASE=spendsense`. Then start the API:

```powershell
uvicorn main:app --reload --port 8000
```

Check it: open <http://127.0.0.1:8000/api/health>. You should see `"status":"connected"`.
Interactive API docs: <http://127.0.0.1:8000/docs>.

### 2. Frontend (a second PowerShell window)

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. In development Vite forwards `/api` to port 8000, so there is nothing to configure.

### Optional: a read-only MySQL user

The console blocks writes in code and runs inside a read-only transaction. For real privilege
separation, run this in Workbench and put the new user in `backend/.env`:

```sql
CREATE USER 'spendsense_ro'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT SELECT, SHOW VIEW ON spendsense.* TO 'spendsense_ro'@'localhost';
```

## What each page needs from the database

| Page | Tables | Views | Columns it relies on |
|---|---|---|---|
| Overview | transactions, categories, merchants, subscriptions, anomaly_flags | none | `transactions.amount, transaction_type, transaction_date`; `subscriptions.current_price, billing_cycle, status`; `anomaly_flags.status` |
| Transactions | transactions, users, merchants, categories, subscriptions | none | all columns listed in the project brief |
| Recurring Payments | subscriptions, merchants | **v_recurring_payment_candidates** | Shows every column your view returns. Include `user_id` and `merchant_id` (or a `merchant_name` column) so rows can be marked Confirmed or Potential |
| Subscriptions: Inventory | subscriptions, merchants, categories, users, usage_logs | none | `subscriptions.*`, `usage_logs.subscription_id, used_on` |
| Subscriptions: Unused | subscriptions, usage_logs, merchants | v_unused_subscriptions (optional) | With the view: `subscription_id` plus any column containing `days` and `last_use`. Without it, a live query applies the same 30 day rule and says so |
| Subscriptions: Price changes | subscription_price_history, subscriptions | none | `subscription_id, old_price, new_price, changed_at` (checked at runtime) |
| Spending Analytics | transactions, categories, merchants | none | as Transactions |
| Anomaly Detection | anomaly_flags, alerts, transactions, subscriptions | none | `anomaly_type, severity, status, explanation, detected_at`; `alerts.alert_title, alert_message, is_read` |
| Database Explorer | any | v_monthly_category_spending (demo) | Reads `information_schema` |

Settings shows which of these objects exist right now.

## Honesty rules built into the app

* **Connected** appears only after the backend runs a real query against MySQL.
* No sample data is ever substituted. A missing view shows a warning naming the view.
* Monthly subscription cost is an estimate: weekly × 52 / 12, monthly as is, quarterly / 3, yearly / 12.
* Stored anomaly flags and anomalies calculated on the page (z-score from `AVG`/`STDDEV_POP` windows, `PERCENT_RANK`, `LAG`) are labelled separately.
* Amounts are INR. There is no currency column, so nothing is converted.
* Each panel has a chip naming its source tables and the MySQL time measured on the server.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Status pill says **Disconnected**, "API is not reachable" | Backend isn't running. Start `uvicorn` and refresh. |
| **Disconnected**, "rejected the username or password" | Fix `MYSQL_USER` / `MYSQL_PASSWORD` in `backend/.env`, then restart uvicorn (`.env` is read at start). |
| "Cannot reach MySQL" | Start the MySQL service (`services.msc`), and check `MYSQL_HOST` / `MYSQL_PORT`. |
| "database ... does not exist" | `MYSQL_DATABASE` must be `spendsense`. |
| Recurring page: view missing | Create `v_recurring_payment_candidates` in Workbench, or see the template in `database/optional_views.sql`. |
| Unused tab says "calculated live" | Expected when `v_unused_subscriptions` doesn't exist. Run the first statement in `database/optional_views.sql` if you want the view. |
| `npm` or `py` not recognised | Install Node.js LTS or Python from their official sites and reopen PowerShell. |
| Cryptography error on login | `pip install cryptography` (needed for MySQL 8 `caching_sha2_password`). |
| Port 8000 or 5173 in use | Start uvicorn with `--port 8001` and set `VITE_API_BASE=http://127.0.0.1:8001` in `frontend/.env`, plus add that origin to `CORS_ORIGINS`. |

## Endpoints

`GET /api/health`, `/api/meta`, `/api/settings`, `/api/dashboard/{summary,monthly-spending,category-spending,top-merchants}`,
`/api/transactions`, `/api/transactions/export`, `/api/recurring-payments`, `/api/subscriptions`,
`/api/subscriptions/{unused,price-changes}`, `/api/anomalies`, `/api/anomalies/dynamic`, `/api/analytics/spending`,
`/api/database/{tables,schema,table-preview}`, and `POST /api/database/query` (read-only console).
All SQL uses bound parameters; table names are checked against `information_schema` before being quoted.
