"""
RAG Pipeline orchestrator.

Initializes all models lazily via ModelManager, then provides
a clean `query()` method to run the full 5-step pipeline.
"""

import json
import logging
from src.config import Settings
from src.model_manager import ModelManager
from src.retrieval import generate_hyde_vector, retrieve_and_fuse
from src.reranker import rerank_chunks, fetch_and_deduplicate_parents
from src.generator import generate_final_answer

logger = logging.getLogger(__name__)


class RAGPipeline:
    """
    Encapsulates the full Retrieval-Augmented Generation pipeline.

    Uses ModelManager for lazy model loading — models are loaded
    on first query, not at construction time.
    """

    def __init__(self, settings: Settings, model_manager: ModelManager = None):
        """
        Initialize the RAG pipeline.

        Args:
            settings: Application settings.
            model_manager: Optional shared ModelManager. Created if not provided.
        """
        self.settings = settings
        self.models = model_manager or ModelManager(settings)

        logger.info("RAG Pipeline initialized (models will load lazily on first query).")

    def _ensure_retrieval_models(self):
        """Load all models needed for retrieval (on first call only)."""
        logger.info("Loading retrieval models...")
        self.models.get_embeddings()
        self.models.get_vectorstore()
        self.models.get_parent_store()
        self.models.get_bm25_retriever()
        self.models.get_reranker()
        self.models.get_llms()
        logger.info("✅ All retrieval models ready.")

    def query(self, question: str) -> dict:
        """
        Run the full RAG pipeline for a given question.

        Pipeline steps:
        1. Generate HyDE vector
        2. Hybrid retrieval (BM25 + Vector) with RRF fusion
        3. Cross-encoder reranking
        4. Parent chunk fetch and deduplication
        5. Multimodal answer generation

        Args:
            question: The user's question string.

        Returns:
            Dict with 'answer' (str) and 'citations' (list of dicts).
        """
        logger.info(f"🔎 Processing query: {question}")

        # Ensure all retrieval models are loaded
        self._ensure_retrieval_models()

        try:
            # Grab model references
            embeddings = self.models.get_embeddings()
            llm, vision_llm = self.models.get_llms()
            bm25 = self.models.get_bm25_retriever()
            vectorstore = self.models.get_vectorstore()
            reranker = self.models.get_reranker()
            parent_store = self.models.get_parent_store()

            # Step 1: HyDE
            logger.info("Step 1/5: Generating HyDE vector...")
            hyde_vec = generate_hyde_vector(question, llm, embeddings)

            # Step 2: Hybrid retrieval + RRF
            logger.info("Step 2/5: Retrieving and fusing (BM25 + Vector)...")
            fused_children = retrieve_and_fuse(
                question, hyde_vec, bm25, vectorstore, self.settings
            )

            # Step 3: Cross-encoder reranking
            logger.info("Step 3/5: Re-ranking with cross-encoder...")
            top_children = rerank_chunks(
                question, fused_children, reranker,
                top_n=self.settings.RERANKER_TOP_N
            )

            # Step 4: Parent fetch + dedup
            logger.info("Step 4/5: Fetching parent chunks...")
            final_parents = fetch_and_deduplicate_parents(
                top_children, parent_store
            )

            # Step 5: Generate answer
            logger.info("Step 5/5: Generating final answer...")
            raw_answer = generate_final_answer(
                question, final_parents, vision_llm
            )

            # Parse the JSON response from the LLM
            result = json.loads(raw_answer)

            logger.info("✅ Query processed successfully.")
            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.debug(f"Raw response: {raw_answer}")
            return {
                "answer": raw_answer,
                "citations": [],
                "_parse_error": str(e),
            }

        except Exception as e:
            logger.exception(f"Pipeline error for query: {question}")
            raise
