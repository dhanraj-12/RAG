"""
Centralized configuration for the RAG pipeline.
All settings are loaded from environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv


load_dotenv()


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int = 0) -> int:
    return int(os.environ.get(key, default))


def _env_float(key: str, default: float = 0.0) -> float:
    return float(os.environ.get(key, default))


def _env_bool(key: str, default: bool = False) -> bool:
    return os.environ.get(key, str(default)).lower() in ("true", "1", "yes")


@dataclass
class Settings:
    """Immutable configuration loaded once at startup."""

    # ── LLM ──
    NVIDIA_API_KEY: str = field(default_factory=lambda: _env("NVIDIA_API_KEY"))
    LLM_MODEL: str = field(default_factory=lambda: _env("LLM_MODEL", "meta/llama-3.3-70b-instruct"))
    VISION_LLM_MODEL: str = field(default_factory=lambda: _env("VISION_LLM_MODEL", "meta/llama-3.2-90b-vision-instruct"))
    LLM_TEMPERATURE: float = field(default_factory=lambda: _env_float("LLM_TEMPERATURE", 0.2))
    LLM_MAX_TOKENS: int = field(default_factory=lambda: _env_int("LLM_MAX_TOKENS", 1024))

    # ── Embedding Model ──
    EMBEDDING_MODEL_NAME: str = field(default_factory=lambda: _env("EMBEDDING_MODEL_NAME", "BAAI/bge-m3"))
    EMBEDDING_DEVICE: str = field(default_factory=lambda: _env("EMBEDDING_DEVICE", "cuda"))

    # ── Reranker ──
    RERANKER_MODEL_NAME: str = field(default_factory=lambda: _env("RERANKER_MODEL_NAME", "BAAI/bge-reranker-large"))
    RERANKER_DEVICE: str = field(default_factory=lambda: _env("RERANKER_DEVICE", "cuda"))
    RERANKER_TOP_N: int = field(default_factory=lambda: _env_int("RERANKER_TOP_N", 3))

    # ── Vector Store ──
    CHROMA_PERSIST_DIR: str = field(default_factory=lambda: _env("CHROMA_PERSIST_DIR", "./chroma_db_local/chroma_db_local"))
    PARENT_STORE_DIR: str = field(default_factory=lambda: _env("PARENT_STORE_DIR", "./parent_store_local/parent_store_local"))
    CHROMA_COLLECTION_NAME: str = field(default_factory=lambda: _env("CHROMA_COLLECTION_NAME", "med_rag_local"))

    # ── Retrieval ──
    BM25_TOP_K: int = field(default_factory=lambda: _env_int("BM25_TOP_K", 5))
    VECTOR_TOP_K: int = field(default_factory=lambda: _env_int("VECTOR_TOP_K", 5))
    RRF_K: int = field(default_factory=lambda: _env_int("RRF_K", 60))

    # ── Redis ──
    REDIS_HOST: str = field(default_factory=lambda: _env("REDIS_HOST", "localhost"))
    REDIS_PORT: int = field(default_factory=lambda: _env_int("REDIS_PORT", 6379))
    REDIS_DB: int = field(default_factory=lambda: _env_int("REDIS_DB", 0))
    REDIS_PASSWORD: str = field(default_factory=lambda: _env("REDIS_PASSWORD", ""))

    # ── Job Queue ──
    JOB_QUEUE_KEY: str = field(default_factory=lambda: _env("JOB_QUEUE_KEY", "rag:jobs"))
    JOB_RESULT_PREFIX: str = field(default_factory=lambda: _env("JOB_RESULT_PREFIX", "rag:job:"))
    JOB_RESULT_TTL: int = field(default_factory=lambda: _env_int("JOB_RESULT_TTL", 3600))

    # ── Cache ──
    CACHE_ENABLED: bool = field(default_factory=lambda: _env_bool("CACHE_ENABLED", False))
    CACHE_SEMANTIC_THRESHOLD: float = field(default_factory=lambda: _env_float("CACHE_SEMANTIC_THRESHOLD", 0.92))
    CACHE_TTL_SECONDS: int = field(default_factory=lambda: _env_int("CACHE_TTL_SECONDS", 604800))
    CACHE_DIR: str = field(default_factory=lambda: _env("CACHE_DIR", "./cache"))
