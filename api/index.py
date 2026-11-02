"""Vercel serverless entry-point — wraps the FastAPI app with Mangum (ASGI → Lambda handler)."""
import sys
import os

# Make the backend directory importable when Vercel runs this file
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from main import app  # noqa: F401
from mangum import Mangum

handler = Mangum(app, lifespan="off")
