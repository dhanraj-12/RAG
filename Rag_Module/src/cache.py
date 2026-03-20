"""
Two-tier query cache: Redis (exact match) + ChromaDB (semantic match).

Caches RAG pipeline results to avoid re-running the expensive pipeline
for repeated or semantically similar queries.
"""

import hashlib
import json
import os
import logging
from typing import Optional
import redis
from langchain_chroma import Chroma
from src.config import Settings

logger = logging.getLogger(__name__)


class QueryCache:
    """
    Two-tier cache: exact string match (Redis) + semantic similarity (ChromaDB).

    Tier 1 (Redis): SHA-256 hash-based exact match with TTL expiration.
    Tier 2 (ChromaDB): Embedding-based semantic similarity search.
    """

    def __init__(self, embedding_model, settings: Settings):
        """
        Initialize the two-tier cache.

        Args:
            embedding_model: Initialized embedding model for semantic search.
            settings: Application settings with Redis and cache config.
        """
        self.embedding_model = embedding_model
        self.settings = settings
        self.cache_dir = settings.CACHE_DIR
        self.semantic_threshold = settings.CACHE_SEMANTIC_THRESHOLD
        self.ttl_seconds = settings.CACHE_TTL_SECONDS
        self.key_prefix = "rag_cache:"

        # Redis connection
        self.redis = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            password=settings.REDIS_PASSWORD or None,
            decode_responses=True,
        )

        try:
            self.redis.ping()
            logger.info(
                f"✅ Cache connected to Redis at "
                f"{settings.REDIS_HOST}:{settings.REDIS_PORT}"
            )
        except redis.ConnectionError:
            raise ConnectionError(
                f"Cannot connect to Redis at "
                f"{settings.REDIS_HOST}:{settings.REDIS_PORT}. "
                f"Run: sudo systemctl start redis"
            )

        # ChromaDB for semantic similarity
        os.makedirs(self.cache_dir, exist_ok=True)
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=embedding_model,
            persist_directory=os.path.join(self.cache_dir, "semantic_db"),
        )

        count = len(self.redis.keys(f"{self.key_prefix}*"))
        logger.info(f"✅ QueryCache initialized — {count} cached entries")

    @staticmethod
    def _hash_query(query: str) -> str:
        normalized = query.strip().lower()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _redis_key(self, query_hash: str) -> str:
        return f"{self.key_prefix}{query_hash}"

    def get(self, query: str) -> Optional[dict]:
        """
        Look up cache. Returns dict if hit, None if miss.

        Checks Tier 1 (exact match) first, then Tier 2 (semantic match).
        """
        query_hash = self._hash_query(query)
        redis_key = self._redis_key(query_hash)

        # Tier 1: Exact match in Redis
        cached_data = self.redis.get(redis_key)
        if cached_data:
            result = json.loads(cached_data)
            result["_cache_type"] = "exact"
            logger.info("⚡ Cache HIT (exact match)")
            return result

        # Tier 2: Semantic match via ChromaDB
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
                        logger.info(
                            f"⚡ Cache HIT (semantic, score={score:.4f}) "
                            f"matched: \"{doc.page_content}\""
                        )
                        return result
        except Exception:
            pass

        logger.debug("Cache MISS")
        return None

    def put(self, query: str, response: dict) -> None:
        """Store query-response pair in both Redis and semantic cache."""
        query_hash = self._hash_query(query)
        redis_key = self._redis_key(query_hash)

        clean_response = {k: v for k, v in response.items() if not k.startswith("_")}

        # Store in Redis with TTL
        self.redis.setex(redis_key, self.ttl_seconds, json.dumps(clean_response))

        # Store in ChromaDB for semantic matching
        self.semantic_store.add_texts(
            texts=[query.strip()],
            metadatas=[{"query_hash": query_hash}],
            ids=[query_hash],
        )

        logger.debug(f"Cached: \"{query[:60]}\"")

    def clear(self) -> None:
        """Flush entire cache."""
        keys = self.redis.keys(f"{self.key_prefix}*")
        if keys:
            self.redis.delete(*keys)

        self.semantic_store.delete_collection()
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=self.embedding_model,
            persist_directory=os.path.join(self.cache_dir, "semantic_db"),
        )
        logger.info("🗑️ Cache cleared")

    def stats(self) -> dict:
        """Return cache statistics."""
        keys = self.redis.keys(f"{self.key_prefix}*")
        ttls = [self.redis.ttl(k) for k in keys]
        return {
            "total_entries": len(keys),
            "avg_ttl_remaining_hours": round(
                sum(ttls) / max(len(ttls), 1) / 3600, 1
            ),
        }
