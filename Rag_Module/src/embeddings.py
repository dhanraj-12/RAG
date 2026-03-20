"""
Embedding model loader.

Initializes the BGE-M3 embedding model from HuggingFace
with configurable device (cuda/cpu).
"""

import logging
from langchain_huggingface import HuggingFaceEmbeddings
from src.config import Settings

logger = logging.getLogger(__name__)


def load_embeddings(settings: Settings) -> HuggingFaceEmbeddings:
    """
    Load and return the BGE-M3 embedding model.

    Args:
        settings: Application settings containing model name and device.

    Returns:
        Initialized HuggingFaceEmbeddings instance.
    """
    logger.info(
        f"Loading embedding model '{settings.EMBEDDING_MODEL_NAME}' "
        f"on device '{settings.EMBEDDING_DEVICE}'..."
    )

    embeddings = HuggingFaceEmbeddings(
        model_name=settings.EMBEDDING_MODEL_NAME,
        model_kwargs={"device": settings.EMBEDDING_DEVICE},
        encode_kwargs={"normalize_embeddings": True},
    )

    logger.info("✅ Embedding model loaded successfully.")
    return embeddings
