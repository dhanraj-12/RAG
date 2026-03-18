"""
Query + Semantic Cache (Layer 1) — Redis Backend

Two levels of caching:
  1. Exact match  — hash(query) lookup in Redis  (~0ms)
  2. Semantic match — cosine similarity on cached query embeddings via ChromaDB  (~5-10ms)

Requirements:
  pip install redis
"""

import hashlib
import json
import os
import time
from typing import Optional

import redis
from langchain_chroma import Chroma


class QueryCache:
    """Two-tier cache: exact string match (Redis) + semantic similarity (ChromaDB)."""

    def __init__(
        self,
        embedding_model,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 0,
        redis_password: str = None,
        cache_dir: str = "./cache",
        semantic_threshold: float = 0.92,
        ttl_seconds: int = 86400 * 7,  # 7 days default
        key_prefix: str = "rag_cache:",
    ):
        """
        Args:
            embedding_model: The same HuggingFaceEmbeddings instance used in the pipeline.
            redis_host: Redis server host.
            redis_port: Redis server port.
            redis_db: Redis database number.
            redis_password: Redis password (if required).
            cache_dir: Directory for ChromaDB semantic cache files.
            semantic_threshold: Cosine similarity threshold for semantic hits (0-1).
            ttl_seconds: Time-to-live for cache entries in seconds.
            key_prefix: Prefix for all Redis keys (namespace isolation).
        """
        self.embedding_model = embedding_model
        self.cache_dir = cache_dir
        self.semantic_threshold = semantic_threshold
        self.ttl_seconds = ttl_seconds
        self.key_prefix = key_prefix

        # --- Redis connection ---
        self.redis = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            password=redis_password,
            decode_responses=True,  # Auto-decode bytes → str
        )

        # Test connection
        try:
            self.redis.ping()
            print(f"✅ Connected to Redis at {redis_host}:{redis_port}")
        except redis.ConnectionError:
            raise ConnectionError(
                f"❌ Cannot connect to Redis at {redis_host}:{redis_port}. "
                f"Make sure Redis is running: sudo systemctl start redis"
            )

        # --- ChromaDB for semantic similarity search ---
        os.makedirs(cache_dir, exist_ok=True)
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=embedding_model,
            persist_directory=os.path.join(cache_dir, "semantic_db"),
        )

        # Load count
        count = len(self.redis.keys(f"{self.key_prefix}*"))
        print(f"✅ QueryCache initialized — {count} cached entries in Redis")

    @staticmethod
    def _hash_query(query: str) -> str:
        """Normalize and hash the query for exact matching."""
        normalized = query.strip().lower()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _redis_key(self, query_hash: str) -> str:
        """Build the full Redis key with prefix."""
        return f"{self.key_prefix}{query_hash}"

    def get(self, query: str) -> Optional[dict]:
        """
        Look up a query in the cache.

        Returns:
            dict with the cached response if found, None if cache miss.
        """
        query_hash = self._hash_query(query)
        redis_key = self._redis_key(query_hash)

        # --- Tier 1: Exact match in Redis ---
        cached_data = self.redis.get(redis_key)

        if cached_data:
            result = json.loads(cached_data)
            result["_cache_type"] = "exact"
            print(f"⚡ Cache HIT (exact match)")
            return result

        # --- Tier 2: Semantic match via ChromaDB ---
        try:
            results = self.semantic_store.similarity_search_with_relevance_scores(
                query, k=1
            )
            if results:
                doc, score = results[0]
                if score >= self.semantic_threshold:
                    similar_hash = doc.metadata.get("query_hash")
                    similar_key = self._redis_key(similar_hash)
                    cached_data = self.redis.get(similar_key)

                    if cached_data:
                        result = json.loads(cached_data)
                        result["_cache_type"] = "semantic"
                        result["_similar_query"] = doc.page_content
                        result["_similarity_score"] = round(score, 4)
                        print(
                            f"⚡ Cache HIT (semantic match, score={score:.4f})\n"
                            f"   Matched: \"{doc.page_content}\""
                        )
                        return result
        except Exception:
            pass

        print(f"❌ Cache MISS")
        return None

    def put(self, query: str, response: dict) -> None:
        """Store a query-response pair in both Redis and semantic cache."""
        query_hash = self._hash_query(query)
        redis_key = self._redis_key(query_hash)

        # Remove internal cache keys before storing
        clean_response = {k: v for k, v in response.items() if not k.startswith("_")}

        # Store in Redis with TTL
        self.redis.setex(
            redis_key,
            self.ttl_seconds,
            json.dumps(clean_response),
        )

        # Store in ChromaDB for semantic matching
        self.semantic_store.add_texts(
            texts=[query.strip()],
            metadatas=[{"query_hash": query_hash}],
            ids=[query_hash],
        )

        print(f"💾 Cached response for: \"{query[:60]}\"")

    def clear(self) -> None:
        """Flush the entire cache."""
        # Clear Redis keys with our prefix
        keys = self.redis.keys(f"{self.key_prefix}*")
        if keys:
            self.redis.delete(*keys)

        # Clear semantic store
        self.semantic_store.delete_collection()
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=self.embedding_model,
            persist_directory=os.path.join(self.cache_dir, "semantic_db"),
        )
        print("🗑️ Cache cleared")

    def stats(self) -> dict:
        """Return cache statistics."""
        keys = self.redis.keys(f"{self.key_prefix}*")
        ttls = [self.redis.ttl(k) for k in keys]
        return {
            "total_entries": len(keys),
            "avg_ttl_remaining_hours": round(sum(ttls) / max(len(ttls), 1) / 3600, 1),
        }
