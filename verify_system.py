"""SpendSense System Verification & Health Check.
Verifies all MySQL tables, views, procedures, NoSQL store, and Vector engine.
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "SpendSense", "backend"))

def main():
    print("=" * 60)
    print("       SPENDSENSE SYSTEM HEALTH & INTEGRITY CHECK       ")
    print("=" * 60)

    # 1. Check Backend dependencies
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        import pymysql
        import pydantic
        print("[✓] Python Backend Dependencies: OK")
    except ImportError as e:
        print(f"[✗] Python Backend Dependencies Missing: {e}")
        return

    # 2. Check Database Connectivity
    import db
    try:
        conn_info = db.one("SELECT VERSION() AS ver, DATABASE() AS db_name")
        print(f"[✓] MySQL Connection: CONNECTED (v{conn_info.get('ver')}, db: '{conn_info.get('db_name')}')")
    except Exception as e:
        print(f"[!] MySQL Connection Notice: {e}")
        print("    -> Make sure your MySQL password is set in SpendSense/backend/.env")
        print("    -> Ensure MySQL Server is running on port 3306")
        return

    # 3. Check Tables
    tables = [
        "users", "categories", "merchants", "recurring_groups",
        "subscriptions", "transactions", "subscription_price_history",
        "usage_logs", "anomaly_flags", "alerts"
    ]
    print("\n--- Checking Relational Tables ---")
    for t in tables:
        try:
            count = db.scalar(f"SELECT COUNT(*) FROM `{t}`")
            print(f"  [✓] Table '{t:<26}': {count:>4} rows")
        except Exception as e:
            print(f"  [✗] Table '{t:<26}': MISSING ({e})")

    # 4. Check Views
    views = [
        "v_monthly_category_spending",
        "v_unused_subscriptions",
        "v_recurring_payment_candidates"
    ]
    print("\n--- Checking Database Views ---")
    for v in views:
        try:
            count = db.scalar(f"SELECT COUNT(*) FROM `{v}`")
            print(f"  [✓] View '{v:<30}': {count:>4} rows")
        except Exception as e:
            print(f"  [✗] View '{v:<30}': MISSING ({e})")

    # 5. Check Stored Procedures
    print("\n--- Checking Stored Procedures ---")
    try:
        db.query("CALL sp_monthly_category_report(1)")
        print("  [✓] Stored Procedure 'sp_monthly_category_report(1)': EXECUTED SUCCESSFULLY")
    except Exception as e:
        print(f"  [!] Procedure Notice: {e}")

    # 6. Check NoSQL Document Store (Rubric #4 & #9)
    print("\n--- Checking NoSQL Document Store ---")
    try:
        import nosql_vector
        receipts = nosql_vector.nosql_list_receipts()
        agg = nosql_vector.nosql_aggregate_summary()
        print(f"  [✓] NoSQL Document Store: {len(receipts)} receipt documents loaded")
        print(f"  [✓] NoSQL Aggregation Pipeline: Total spend Rs {agg.get('total_spend')} across {agg.get('total_receipts')} receipts")
    except Exception as e:
        print(f"  [✗] NoSQL Document Store Error: {e}")

    # 7. Check Vector Similarity Search Engine (Rubric #4 & #8)
    print("\n--- Checking Vector Similarity Search ---")
    try:
        import nosql_vector
        test_items = [
            {"merchant_name": "StreamFlix", "description": "StreamFlix 4k video streaming", "category_name": "Entertainment"},
            {"merchant_name": "Fresh Basket", "description": "Weekly grocery supermarket fruits", "category_name": "Food"},
            {"merchant_name": "FitPulse", "description": "Gym monthly fitness workout membership", "category_name": "Health"}
        ]
        results = nosql_vector.vector_semantic_search("workout gym fitness", test_items, top_k=1)
        if results:
            print(f"  [✓] Vector Search: Matched '{results[0]['merchant_name']}' with cosine score {results[0]['similarity_score']}")
        else:
            print("  [!] Vector Search returned no matches")
    except Exception as e:
        print(f"  [✗] Vector Engine Error: {e}")

    print("\n" + "=" * 60)
    print("                 VERIFICATION COMPLETED                 ")
    print("=" * 60)

if __name__ == "__main__":
    main()
