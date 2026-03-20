"""
RAG Module — Retrieval-Augmented Generation Pipeline

A modular Python package for question answering with verifiable citations
from a textbook knowledge base.

Usage:
    from src.config import Settings
    from src.pipeline import RAGPipeline

    settings = Settings()
    pipeline = RAGPipeline(settings)
    result = pipeline.query("What is operant conditioning?")
"""


def __getattr__(name):
    """Lazy imports to avoid loading heavy ML deps on simple config access."""
    if name == "Settings":
        from src.config import Settings
        return Settings
    if name == "RAGPipeline":
        from src.pipeline import RAGPipeline
        return RAGPipeline
    raise AttributeError(f"module 'src' has no attribute {name!r}")


__all__ = ["Settings", "RAGPipeline"]
