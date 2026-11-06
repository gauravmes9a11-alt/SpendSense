"""Comprehensive test suite for SpendSense Authentication, RBAC, Data Ownership, and Vector Embeddings.

Covers all 12 security scenarios required by Specification Section 6.7 and Section 10.
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import timedelta

# Ensure backend modules are loadable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
import numpy as np

import auth
import db
import embeddings
import nosql_vector
from main import app


class TestSpendSenseSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        auth.ensure_auth_schema()
        embeddings.ensure_schema()
        embeddings.load_vector_cache()

    # -------------------------------------------------------------------------
    # Authentication & RBAC Tests (12 scenarios)
    # -------------------------------------------------------------------------
    def test_01_valid_customer_login(self):
        """1. Valid customer login returns JWT token and CUSTOMER role."""
        resp = self.client.post("/api/auth/login", json={
            "email": "harshitha.demo@example.com",
            "password": "SpendSense@2026"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["user"]["role"], "CUSTOMER")
        self.assertEqual(data["user"]["email"], "harshitha.demo@example.com")
        self.assertNotIn("password", data["user"])
        self.assertNotIn("password_hash", data["user"])

    def test_02_valid_admin_login(self):
        """2. Valid admin login returns JWT token and ADMIN role with elevated permissions."""
        resp = self.client.post("/api/auth/login", json={
            "email": "gaurav.demo@example.com",
            "password": "SpendSense@2026"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "ADMIN")
        self.assertIn("ADMIN_PANEL", data["user"]["permissions"])

    def test_03_invalid_password(self):
        """3. Invalid password rejected with HTTP 401."""
        resp = self.client.post("/api/auth/login", json={
            "email": "gaurav.demo@example.com",
            "password": "WrongPassword123"
        })
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Invalid email or password", resp.json()["detail"])

    def test_04_unknown_email(self):
        """4. Unknown email rejected with HTTP 401 (generic message, prevents enumeration)."""
        resp = self.client.post("/api/auth/login", json={
            "email": "nonexistent.user@example.com",
            "password": "SpendSense@2026"
        })
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Invalid email or password", resp.json()["detail"])

    def test_05_missing_token_on_protected_endpoint(self):
        """5. Missing token on /api/auth/me returns HTTP 401."""
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 401)

    def test_06_invalid_token(self):
        """6. Tampered/invalid JWT token returns HTTP 401."""
        headers = {"Authorization": "Bearer invalid.fake.token.signature"}
        resp = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(resp.status_code, 401)

    def test_07_expired_token(self):
        """7. Expired JWT token returns HTTP 401."""
        expired_token = auth.create_access_token(
            {"sub": "1", "role": "ADMIN", "email": "gaurav.demo@example.com"},
            expires_delta=timedelta(seconds=-10)  # expired in the past
        )
        headers = {"Authorization": f"Bearer {expired_token}"}
        resp = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(resp.status_code, 401)
        self.assertIn("expired", resp.json()["detail"].lower())

    def test_08_customer_attempting_admin_endpoint(self):
        """8. CUSTOMER attempting to access /api/admin/system-stats returns HTTP 403 FORBIDDEN."""
        cust_token = auth.create_access_token(
            {"sub": "2", "role": "CUSTOMER", "email": "harshitha.demo@example.com"}
        )
        headers = {"Authorization": f"Bearer {cust_token}"}
        resp = self.client.get("/api/admin/system-stats", headers=headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("ADMIN role required", resp.json()["detail"])

    def test_09_admin_accessing_admin_endpoint(self):
        """9. ADMIN accessing /api/admin/system-stats succeeds with HTTP 200."""
        admin_token = auth.create_access_token(
            {"sub": "1", "role": "ADMIN", "email": "gaurav.demo@example.com"}
        )
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = self.client.get("/api/admin/system-stats", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["rbac_status"], "Authorized (ADMIN)")
        self.assertEqual(data["authenticated_admin"], "gaurav.demo@example.com")
        self.assertGreaterEqual(data["total_registered_users"], 1)

    def test_10_customer_attempting_to_read_other_user_transactions(self):
        """10. CUSTOMER attempting to query another user's transactions returns HTTP 403 FORBIDDEN."""
        cust_token = auth.create_access_token(
            {"sub": "2", "role": "CUSTOMER", "email": "harshitha.demo@example.com"}
        )
        headers = {"Authorization": f"Bearer {cust_token}"}
        # Customer (user_id=2) requests user_id=1
        resp = self.client.get("/api/transactions?user_id=1", headers=headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Forbidden", resp.json()["detail"])

    def test_11_customer_attempting_to_read_other_user_receipts(self):
        """11. CUSTOMER attempting to read another user's receipt document returns HTTP 403 FORBIDDEN."""
        cust_token = auth.create_access_token(
            {"sub": "2", "role": "CUSTOMER", "email": "harshitha.demo@example.com"}
        )
        headers = {"Authorization": f"Bearer {cust_token}"}
        # rec_001 belongs to user_id=1
        resp = self.client.get("/api/nosql/receipts/rec_001", headers=headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("do not own this receipt", resp.json()["detail"])

    def test_12_logout_behavior(self):
        """12. Logout endpoint returns success response for client disposal."""
        resp = self.client.post("/api/auth/logout")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["authenticated"])

    # -------------------------------------------------------------------------
    # Embedding & Vector Search Tests
    # -------------------------------------------------------------------------
    def test_13_fallback_hash_reproducibility(self):
        """13. Deterministic fallback embedding produces identical vectors across calls."""
        text = "Starbucks monthly coffee subscription cafe"
        v1 = embeddings._fallback_embed([text], dim=384)[0]
        v2 = embeddings._fallback_embed([text], dim=384)[0]
        self.assertEqual(len(v1), 384)
        self.assertTrue(np.allclose(v1, v2), "Fallback embeddings must be bit-exact reproducible!")

    def test_14_cosine_distance_mathematics(self):
        """14. Cosine distance strictly evaluates to 1.0 - Cosine Similarity."""
        # Identical vector -> distance = 0.0
        v = [0.5, 0.5, 0.5, 0.5] + [0.0]*380
        dist_self = embeddings.cosine_distance(v, v)
        self.assertAlmostEqual(dist_self, 0.0, places=4)

        # Zero vector -> distance = 1.0 safely
        z = [0.0] * 384
        dist_zero = embeddings.cosine_distance(v, z)
        self.assertEqual(dist_zero, 1.0)

        # Orthogonal vectors -> distance = 1.0
        o1 = [1.0, 0.0] + [0.0]*382
        o2 = [0.0, 1.0] + [0.0]*382
        dist_ortho = embeddings.cosine_distance(o1, o2)
        self.assertAlmostEqual(dist_ortho, 1.0, places=4)

        # Dimension mismatch -> safely return 1.0 without exception
        mismatch = [1.0, 0.0]
        self.assertEqual(embeddings.cosine_distance(v, mismatch), 1.0)

    def test_15_embeddings_info_endpoint(self):
        """15. /api/embeddings/info returns accurate active model and dimension data."""
        resp = self.client.get("/api/embeddings/info")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("active_provider", data)
        self.assertIn("model", data)
        self.assertIn("dimensions", data)
        self.assertIn("embedded_transactions", data)
        self.assertIn("total_transactions", data)
        self.assertIn("stored_models", data)
        self.assertEqual(data["dimensions"], 384)

    def test_16_embeddings_sync_endpoint(self):
        """16. /api/embeddings/sync returns structured synchronization metrics."""
        resp = self.client.post("/api/embeddings/sync")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("inserted", data)
        self.assertIn("updated", data)
        self.assertIn("skipped", data)
        self.assertIn("failed", data)
        self.assertIn("active_model", data)

    def test_17_transactions_semantic_search_with_vector_distance(self):
        """17. GET /api/transactions with semantic=true returns vector_distance for each match."""
        resp = self.client.get("/api/transactions?q=groceries&semantic=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)
        self.assertGreater(len(data["items"]), 0)
        first_item = data["items"][0]
        self.assertIn("vector_distance", first_item)
        if first_item["vector_distance"] is not None:
            self.assertIsInstance(first_item["vector_distance"], (int, float))
            self.assertGreaterEqual(first_item["vector_distance"], 0.0)


if __name__ == "__main__":
    unittest.main()
