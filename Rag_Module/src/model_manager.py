"""
Lazy Model Manager.

Manages model lifecycle — loads models to VRAM only when needed,
keeps lightweight models cached, and unloads heavy models after use.

VRAM budget:
  - Embeddings (BGE-M3):     ~2.3 GB  — loaded on first query, stays loaded
  - Reranker (BGE-reranker): ~1.3 GB  — loaded on first query, stays loaded
  - LLMs (NVIDIA NIM API):      0 GB  — remote API calls
  - marker-pdf (ingestion):  ~3-4 GB  — loaded on demand, unloaded after
"""

import gc
import logging
from typing import Optional

from src.config import Settings

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Lazy model loader that manages VRAM efficiently.

    Models are loaded on first access and cached. Heavy models
    (marker-pdf) can be explicitly unloaded after use.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

        # Cached model instances (None = not yet loaded)
        self._embeddings = None
        self._reranker = None
        self._llm = None
        self._vision_llm = None
        self._vectorstore = None
        self._parent_store = None
        self._bm25_retriever = None
        self._ingestion_converter = None

    # ── Embeddings (stays loaded) ──

    def get_embeddings(self):
        """Load BGE-M3 embeddings on first call, return cached instance."""
        if self._embeddings is None:
            from src.embeddings import load_embeddings
            self._embeddings = load_embeddings(self.settings)
        return self._embeddings

    # ── Reranker (stays loaded) ──

    def get_reranker(self):
        """Load BGE cross-encoder reranker on first call, return cached."""
        if self._reranker is None:
            from src.reranker import load_reranker
            self._reranker = load_reranker(self.settings)
        return self._reranker

    # ── LLMs (API-based, no VRAM) ──

    def get_llms(self):
        """
        Initialize NVIDIA NIM API clients on first call.
        Returns (text_llm, vision_llm) tuple.
        """
        if self._llm is None or self._vision_llm is None:
            from src.generator import init_llms
            self._llm, self._vision_llm = init_llms(self.settings)
        return self._llm, self._vision_llm

    # ── Vector Store & Parent Store ──

    def get_vectorstore(self):
        """Load ChromaDB vector store on first call."""
        if self._vectorstore is None:
            from src.vectorstore import load_vectorstore
            self._vectorstore = load_vectorstore(
                self.get_embeddings(), self.settings
            )
        return self._vectorstore

    def get_parent_store(self):
        """Load parent document store on first call."""
        if self._parent_store is None:
            from src.vectorstore import load_parent_store
            self._parent_store = load_parent_store(self.settings)
        return self._parent_store

    def get_bm25_retriever(self):
        """Build BM25 index from ChromaDB on first call."""
        if self._bm25_retriever is None:
            from src.vectorstore import build_bm25_index
            self._bm25_retriever = build_bm25_index(self.get_vectorstore())
        return self._bm25_retriever

    # ── Ingestion Models (on-demand, unloadable) ──

    def get_ingestion_converter(self):
        """
        Load marker-pdf converter on demand for document ingestion.
        This is GPU-heavy (~3-4 GB VRAM) and should be unloaded after use.
        """
        if self._ingestion_converter is None:
            logger.info("Loading marker-pdf models for ingestion (heavy, ~3-4 GB VRAM)...")
            from marker.converters.pdf import PdfConverter
            from marker.config.parser import ConfigParser

            config_parser = ConfigParser({"output_format": "markdown"})
            self._ingestion_converter = PdfConverter(config=config_parser.generate_config_dict())
            logger.info("✅ marker-pdf models loaded.")
        return self._ingestion_converter

    def unload_ingestion_models(self):
        """Free marker-pdf models from VRAM."""
        if self._ingestion_converter is not None:
            logger.info("Unloading marker-pdf models to free VRAM...")
            del self._ingestion_converter
            self._ingestion_converter = None

            gc.collect()

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("✅ CUDA cache cleared.")
            except ImportError:
                pass

            logger.info("✅ Ingestion models unloaded.")

    # ── Status ──

    def status(self) -> dict:
        """Return which models are currently loaded."""
        return {
            "embeddings": self._embeddings is not None,
            "reranker": self._reranker is not None,
            "llm": self._llm is not None,
            "vision_llm": self._vision_llm is not None,
            "vectorstore": self._vectorstore is not None,
            "parent_store": self._parent_store is not None,
            "bm25_retriever": self._bm25_retriever is not None,
            "ingestion_converter": self._ingestion_converter is not None,
        }
