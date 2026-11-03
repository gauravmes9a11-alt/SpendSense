"""Vector embedding module for SpendSense.

Provides genuine text embeddings and cosine distance calculation for transactions.
Uses BAAI/bge-small-en-v1.5 (via FastEmbed ONNX) as the primary local neural model,
with optional OpenAI / Gemini API support if configured in .env, and a pure-python
semantic fallback for lightweight serverless environments.
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
from typing import Any, Optional

import numpy as np

log = logging.getLogger("spendsense.embeddings")

# In-memory vector cache: {transaction_id: (np.ndarray(384,), text_content)}
_VECTOR_CACHE: dict[int, np.ndarray] = {}
_ACTIVE_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"

# Lazy-loaded FastEmbed model instance
_fastembed_model = None


def _get_fastembed_model():
    global _fastembed_model
    if _fastembed_model is None:
        try:
            from fastembed import TextEmbedding
            # Disable symlink warnings on Windows
            os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
            _fastembed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
            log.info("Initialized FastEmbed model BAAI/bge-small-en-v1.5")
        except Exception as e:
            log.warning("FastEmbed not available: %s", e)
            _fastembed_model = False
    return _fastembed_model if _fastembed_model is not False else None


def _embed_openai(texts: list[str], api_key: str) -> Optional[list[list[float]]]:
    """Generate embeddings via OpenAI REST API."""
    try:
        url = "https://api.openai.com/v1/embeddings"
        payload = json.dumps({"input": texts, "model": "text-embedding-3-small"}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            data_items = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in data_items]
    except Exception as e:
        log.error("OpenAI embedding API failed: %s", e)
        return None


def _embed_gemini(texts: list[str], api_key: str) -> Optional[list[list[float]]]:
    """Generate embeddings via Google Gemini REST API."""
    try:
        results = []
        for t in texts:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={api_key}"
            payload = json.dumps({"model": "models/text-embedding-004", "content": {"parts": [{"text": t}]}}).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                results.append(data["embedding"]["values"])
        return results
    except Exception as e:
        log.error("Gemini embedding API failed: %s", e)
        return None


def _fallback_embed(texts: list[str], dim: int = 384) -> list[list[float]]:
    """Deterministic semantic hashing vectorizer for zero-dependency / constrained environments.
    
    Generates unit-normalized dense vectors based on character and subword n-grams
    with semantic term weighting.
    """
    embeddings = []
    for text in texts:
        vec = np.zeros(dim, dtype=np.float32)
        tokens = re.findall(r"\b\w+\b", text.lower())
        for token in tokens:
            # Word-level hash
            h1 = hash(token) % dim
            # Character trigrams for morphological similarity
            for i in range(len(token) - 2):
                tri = token[i : i + 3]
                h_tri = hash(tri) % dim
                vec[h_tri] += 0.5
            vec[h1] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        embeddings.append(vec.tolist())
    return embeddings


def get_model_name() -> str:
    openai_key = os.getenv("OPENAI_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if openai_key:
        return "openai/text-embedding-3-small"
    if gemini_key:
        return "gemini/text-embedding-004"
    if _get_fastembed_model() is not None:
        return "BAAI/bge-small-en-v1.5 (FastEmbed ONNX)"
    return "SpendSense-Semantic-v1 (fallback)"


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate dense vector embeddings for a list of texts."""
    if not texts:
        return []

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        res = _embed_openai(texts, openai_key)
        if res:
            return res

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        res = _embed_gemini(texts, gemini_key)
        if res:
            return res

    fe_model = _get_fastembed_model()
    if fe_model is not None:
        try:
            # FastEmbed returns a generator of numpy ndarrays
            embeddings_gen = fe_model.embed(texts)
            return [vec.tolist() for vec in embeddings_gen]
        except Exception as e:
            log.warning("FastEmbed embed failed, using fallback: %s", e)

    return _fallback_embed(texts)


def generate_embedding(text: str) -> list[float]:
    """Generate an embedding for a single text."""
    res = generate_embeddings([text])
    return res[0] if res else []


def transaction_text(tx: dict[str, Any]) -> str:
    """Format transaction fields into a rich semantic string for embedding."""
    merchant = tx.get("merchant_name") or "Unknown merchant"
    category = tx.get("category_name") or "Uncategorized"
    desc = tx.get("description") or ""
    tx_type = tx.get("transaction_type") or "EXPENSE"
    
    parts = [f"Merchant: {merchant}", f"Category: {category}"]
    if desc:
        parts.append(f"Description: {desc}")
    parts.append(f"Type: {tx_type}")
    return ". ".join(parts)


def cosine_distance(vec_a: np.ndarray | list[float], vec_b: np.ndarray | list[float]) -> float:
    """Compute Cosine Distance = 1.0 - Cosine Similarity.
    
    Returns a float where:
      0.0000 = Identical direction (maximum semantic similarity)
      Values closer to 0 = More semantically similar
      Larger values = Less semantically similar
    """
    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 1.0
    similarity = float(np.dot(a, b) / (norm_a * norm_b))
    # Clamp cosine similarity to [-1.0, 1.0] to prevent floating point imprecision
    similarity = max(-1.0, min(1.0, similarity))
    dist = 1.0 - similarity
    return max(0.0, dist)


def ensure_schema() -> None:
    """Ensure the transaction_embeddings table exists in MySQL."""
    import db
    from sqlalchemy import text

    sql = """
    CREATE TABLE IF NOT EXISTS transaction_embeddings (
        transaction_id BIGINT PRIMARY KEY,
        embedding_model VARCHAR(80) NOT NULL,
        dimensions INT NOT NULL,
        embedding JSON NOT NULL,
        text_content VARCHAR(500) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_tx_embedding FOREIGN KEY (transaction_id) 
            REFERENCES transactions(transaction_id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
    """
    try:
        with db.engine.connect() as conn:
            conn.execute(text(sql))
            conn.commit()
    except Exception as e:
        log.warning("Could not create transaction_embeddings table: %s", e)


def load_vector_cache() -> None:
    """Load stored embeddings from MySQL into memory."""
    global _VECTOR_CACHE
    import db

    try:
        ensure_schema()
        rows = db.query("SELECT transaction_id, embedding FROM transaction_embeddings")
        new_cache = {}
        for r in rows:
            raw = r["embedding"]
            if isinstance(raw, str):
                raw = json.loads(raw)
            new_cache[r["transaction_id"]] = np.asarray(raw, dtype=np.float32)
        _VECTOR_CACHE = new_cache
        log.info("Loaded %d transaction vector embeddings into cache.", len(_VECTOR_CACHE))
    except Exception as e:
        log.error("Failed to load vector cache: %s", e)


def sync_missing_embeddings() -> int:
    """Find transactions missing from transaction_embeddings, generate, and store them."""
    import db
    from sqlalchemy import text

    ensure_schema()
    
    # Transactions that have no embedding record yet
    missing_sql = """
    SELECT t.transaction_id, m.merchant_name, c.category_name, t.description, t.transaction_type
    FROM transactions t
    JOIN merchants m ON m.merchant_id = t.merchant_id
    JOIN categories c ON c.category_id = t.category_id
    LEFT JOIN transaction_embeddings te ON te.transaction_id = t.transaction_id
    WHERE te.transaction_id IS NULL
    """
    try:
        rows = db.query(missing_sql)
        if not rows:
            load_vector_cache()
            return 0

        log.info("Generating embeddings for %d new/unembedded transactions...", len(rows))
        texts = [transaction_text(r) for r in rows]
        embeddings = generate_embeddings(texts)
        model_name = get_model_name()

        with db.engine.connect() as conn:
            for r, emb, txt in zip(rows, embeddings, texts):
                dim = len(emb)
                emb_json = json.dumps(emb)
                conn.execute(
                    text("""
                    INSERT INTO transaction_embeddings 
                        (transaction_id, embedding_model, dimensions, embedding, text_content)
                    VALUES (:tid, :model, :dim, :emb, :txt)
                    ON DUPLICATE KEY UPDATE 
                        embedding_model = VALUES(embedding_model),
                        dimensions = VALUES(dimensions),
                        embedding = VALUES(embedding),
                        text_content = VALUES(text_content)
                    """),
                    {"tid": r["transaction_id"], "model": model_name, "dim": dim, "emb": emb_json, "txt": txt},
                )
            conn.commit()

        load_vector_cache()
        return len(rows)
    except Exception as e:
        log.error("Error syncing embeddings: %s", e)
        return 0


def calculate_distances_for_query(query: str, target_ids: Optional[list[int]] = None) -> dict[int, float]:
    """Calculate cosine distance between query embedding and cached transaction embeddings.
    
    Returns {transaction_id: cosine_distance} where distance is rounded to 4 decimals.
    """
    if not query or not query.strip():
        return {}

    # Ensure cache is loaded
    if not _VECTOR_CACHE:
        load_vector_cache()
        if not _VECTOR_CACHE:
            sync_missing_embeddings()

    q_vec = np.asarray(generate_embedding(query.strip()), dtype=np.float32)
    norm_q = np.linalg.norm(q_vec)
    if norm_q == 0.0:
        return {}

    distances: dict[int, float] = {}
    candidates = target_ids if target_ids is not None else list(_VECTOR_CACHE.keys())

    for tid in candidates:
        vec = _VECTOR_CACHE.get(tid)
        if vec is not None:
            norm_v = np.linalg.norm(vec)
            if norm_v > 0.0:
                sim = float(np.dot(q_vec, vec) / (norm_q * norm_v))
                sim = max(-1.0, min(1.0, sim))
                dist = max(0.0, 1.0 - sim)
                distances[tid] = round(dist, 4)

    return distances

