"""
Retrieval components: HyDE and hybrid search with RRF fusion.

Implements Hypothetical Document Embedding (HyDE) for query
enhancement, dual-stream retrieval (BM25 + Vector), and
Reciprocal Rank Fusion (RRF) for combining results.
"""

import logging
from langchain_chroma import Chroma
from langchain_classic.retrievers import BM25Retriever
from src.config import Settings

logger = logging.getLogger(__name__)


def generate_hyde_vector(query: str, llm, embedding_model) -> list[float]:
    """
    Generate a Hypothetical Document Embedding (HyDE) vector.

    Uses the LLM to generate a hypothetical textbook passage that answers
    the query, then embeds that passage instead of the raw query for
    improved semantic matching.

    Args:
        query: The user's search query.
        llm: Initialized LLM client (e.g., ChatNVIDIA).
        embedding_model: Initialized BGE-M3 embedding model.

    Returns:
        Dense vector embedding of the hypothetical document.
    """
    prompt = (
        f"Given the following question, write a hypothetical, detailed "
        f"textbook passage that directly answers it.\n"
        f"Write in an academic tone, use standard formatting, and include "
        f"specific facts, definitions, and examples.\n"
        f"Do NOT say \"I don't know\" — always generate a plausible, "
        f"informative passage.\n\n"
        f"Question: {query}\n\n"
        f"Hypothetical Textbook Passage:"
    )

    response = llm.invoke(prompt)
    hypothetical_doc = response.content

    logger.debug(
        f"HyDE generated document (first 200 chars): "
        f"{hypothetical_doc[:200]}..."
    )

    hyde_vector = embedding_model.embed_query(hypothetical_doc)
    return hyde_vector


def retrieve_and_fuse(
    query: str,
    hyde_vector: list[float],
    bm25_retriever: BM25Retriever,
    vector_store: Chroma,
    settings: Settings,
) -> list:
    """
    Execute hybrid search and fuse results using Reciprocal Rank Fusion (RRF).

    Performs dual-stream retrieval:
    1. BM25 keyword search using the raw query
    2. Vector similarity search using the HyDE embedding

    Results are combined using RRF to produce a unified ranking.

    Args:
        query: The raw user query string.
        hyde_vector: Dense vector from HyDE generation.
        bm25_retriever: Initialized BM25 retriever.
        vector_store: Initialized Chroma vector store.
        settings: Application settings (top_k, rrf_k).

    Returns:
        List of fused and ranked Document objects.
    """
    top_k = settings.BM25_TOP_K

    # ── BM25 keyword search ──
    bm25_retriever.k = top_k
    bm25_docs = bm25_retriever.invoke(query)

    # ── Vector semantic search (using HyDE embedding) ──
    vector_docs = vector_store.similarity_search_by_vector(
        hyde_vector, k=settings.VECTOR_TOP_K
    )

    logger.info(
        f"Retrieved {len(bm25_docs)} BM25 docs and "
        f"{len(vector_docs)} Vector docs."
    )

    # ── Reciprocal Rank Fusion ──
    fused_scores: dict = {}
    rrf_k = settings.RRF_K

    def score_docs(docs):
        for rank, doc in enumerate(docs):
            doc_id = doc.page_content
            if doc_id not in fused_scores:
                fused_scores[doc_id] = {"doc": doc, "score": 0.0}
            fused_scores[doc_id]["score"] += 1.0 / (rank + rrf_k)

    score_docs(bm25_docs)
    score_docs(vector_docs)

    reranked_results = sorted(
        fused_scores.values(), key=lambda x: x["score"], reverse=True
    )
    final_fused_docs = [item["doc"] for item in reranked_results]

    logger.info(f"Fused into {len(final_fused_docs)} unique child chunks.")
    return final_fused_docs
