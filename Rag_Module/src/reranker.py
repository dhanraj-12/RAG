"""
Cross-encoder reranking and parent document retrieval.

Uses the BGE reranker model to re-score fused chunks and
maps child chunks back to their parent documents.
"""

import logging
from sentence_transformers import CrossEncoder
from langchain_classic.storage import LocalFileStore
from src.config import Settings

logger = logging.getLogger(__name__)


def load_reranker(settings: Settings) -> CrossEncoder:
    """
    Load the BGE cross-encoder reranker model.

    Args:
        settings: Application settings with model name and device.

    Returns:
        Initialized CrossEncoder model.
    """
    logger.info(
        f"Loading reranker '{settings.RERANKER_MODEL_NAME}' "
        f"on device '{settings.RERANKER_DEVICE}'..."
    )

    reranker = CrossEncoder(
        settings.RERANKER_MODEL_NAME,
        device=settings.RERANKER_DEVICE,
    )

    logger.info("✅ Reranker loaded successfully.")
    return reranker


def rerank_chunks(
    query: str, fused_docs: list, reranker_model: CrossEncoder, top_n: int = 3
) -> list:
    """
    Re-rank fused documents using the BGE cross-encoder for precise scoring.

    Args:
        query: The original user query.
        fused_docs: List of Document objects from RRF fusion.
        reranker_model: Initialized CrossEncoder model.
        top_n: Number of top documents to return.

    Returns:
        List of top-N Document objects sorted by reranker score.
    """
    pairs = [[query, doc.page_content] for doc in fused_docs]
    scores = reranker_model.predict(pairs)

    scored_docs = list(zip(scores, fused_docs))
    scored_docs.sort(key=lambda x: x[0], reverse=True)

    top_docs = [doc for _score, doc in scored_docs[:top_n]]

    logger.info(
        f"Reranked {len(fused_docs)} chunks → top {len(top_docs)} selected."
    )
    return top_docs


def fetch_and_deduplicate_parents(
    top_child_chunks: list, store: LocalFileStore
) -> list[dict]:
    """
    Map child chunks to their parent documents and deduplicate.

    Each child chunk has a 'doc_id' in its metadata that references
    the parent document in the LocalFileStore. This function retrieves
    the full parent text and enriches it with metadata.

    Args:
        top_child_chunks: List of top-ranked child Document objects.
        store: LocalFileStore containing parent documents.

    Returns:
        List of dicts with keys: text, chapter, section, section_title,
        page_start, page_end.
    """
    unique_parent_ids: set = set()
    final_parent_docs: list[dict] = []

    for child in top_child_chunks:
        parent_id = child.metadata.get("doc_id")

        if parent_id and parent_id not in unique_parent_ids:
            unique_parent_ids.add(parent_id)

            parent_bytes = store.mget([parent_id])[0]

            if parent_bytes:
                parent_text = parent_bytes.decode("utf-8")
                final_parent_docs.append(
                    {
                        "text": parent_text,
                        "chapter": child.metadata.get("chapter", "Unknown"),
                        "section": child.metadata.get("section", "Unknown"),
                        "section_title": child.metadata.get("section-title", "Unknown"),
                        "page_start": child.metadata.get("page_start", "N/A"),
                        "page_end": child.metadata.get("page_end", "N/A"),
                    }
                )

    logger.info(
        f"Reduced {len(top_child_chunks)} child chunks to "
        f"{len(final_parent_docs)} unique parent chunks."
    )
    return final_parent_docs
