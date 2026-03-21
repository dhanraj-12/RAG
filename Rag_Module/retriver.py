#!/usr/bin/env python
# coding: utf-8
"""
RAG Pipeline Service
====================
Multimodal RAG pipeline with:
  - HyDE (Hypothetical Document Embedding)
  - Hybrid BM25 + Vector search with Reciprocal Rank Fusion
  - BGE cross-encoder reranking
  - Parent document retrieval
  - Three-layer Redis cache (Query / HyDE / LLM)
  - Flask REST API
"""

# ──────────────────────────────────────────────
# Imports
# ──────────────────────────────────────────────

from langchain_classic.storage import LocalFileStore, create_kv_docstore
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_classic.retrievers import ParentDocumentRetriever, BM25Retriever
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.messages import HumanMessage
from langchain_classic.schema import Document
from sentence_transformers import CrossEncoder
from concurrent.futures import ThreadPoolExecutor
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from flask import Flask, request, jsonify, send_from_directory

import os
import re
import base64
import getpass
import textwrap
import json
import logging
import hashlib
import time
import threading
import redis


# ──────────────────────────────────────────────
# Logger
# ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Embedding Model
# ──────────────────────────────────────────────

local_embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-m3",
    model_kwargs={"device": "cpu"},  # Use 'cuda' if you have an NVIDIA GPU
    encode_kwargs={"normalize_embeddings": True},
)


# ──────────────────────────────────────────────
# QueryCache (Three-Tier: Query / HyDE / LLM)
# ──────────────────────────────────────────────

class QueryCache:
    """Three-tier cache: Query (exact + semantic) + HyDE + LLM Response."""

    def __init__(
        self,
        embedding_model,
        redis_host="localhost",
        redis_port=6379,
        redis_db=0,
        redis_password=None,
        cache_dir="./cache",
        semantic_threshold=0.92,
        ttl_seconds=86400 * 7,
        key_prefix="rag_cache:",
    ):
        self.embedding_model = embedding_model
        self.cache_dir = cache_dir
        self.semantic_threshold = semantic_threshold
        self.ttl_seconds = ttl_seconds
        self.key_prefix = key_prefix

        self.redis = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            password=redis_password,
            decode_responses=True,
        )

        try:
            self.redis.ping()
            print(f"✅ Connected to Redis at {redis_host}:{redis_port}")
        except redis.ConnectionError:
            raise ConnectionError(
                f"❌ Cannot connect to Redis at {redis_host}:{redis_port}. "
                f"Run: sudo systemctl start redis"
            )

        os.makedirs(cache_dir, exist_ok=True)
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=embedding_model,
            persist_directory=os.path.join(cache_dir, "semantic_db"),
        )

        count = len(self.redis.keys(f"{self.key_prefix}*"))
        print(f"✅ QueryCache initialized — {count} cached entries in Redis")

    # ── helpers ──

    @staticmethod
    def _hash_query(query):
        normalized = query.strip().lower()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _redis_key(self, prefix, hash_val):
        return f"{self.key_prefix}{prefix}:{hash_val}"

    # ── LAYER 1: Query Cache (Exact + Semantic) ──

    def get_query(self, query):
        """Layer 1: Check exact match, then semantic match."""
        query_hash = self._hash_query(query)
        key = self._redis_key("query", query_hash)

        # Exact match
        cached = self.redis.get(key)
        if cached:
            result = json.loads(cached)
            result["_cache_type"] = "exact"
            print("⚡ Layer 1 HIT (exact match)")
            return result

        # Semantic match
        try:
            results = self.semantic_store.similarity_search_with_relevance_scores(query, k=1)
            if results:
                doc, score = results[0]
                if score >= self.semantic_threshold:
                    similar_hash = doc.metadata.get("query_hash")
                    cached = self.redis.get(self._redis_key("query", similar_hash))
                    if cached:
                        result = json.loads(cached)
                        result["_cache_type"] = "semantic"
                        result["_similar_query"] = doc.page_content
                        result["_similarity_score"] = round(score, 4)
                        print(f"⚡ Layer 1 HIT (semantic, score={score:.4f})")
                        print(f'   Matched: "{doc.page_content}"')
                        return result
        except Exception:
            pass

        print("❌ Layer 1 MISS")
        return None

    def put_query(self, query, response):
        """Layer 1: Store final response."""
        query_hash = self._hash_query(query)
        clean = {k: v for k, v in response.items() if not k.startswith("_")}

        self.redis.setex(
            self._redis_key("query", query_hash),
            self.ttl_seconds,
            json.dumps(clean),
        )

        self.semantic_store.add_texts(
            texts=[query.strip()],
            metadatas=[{"query_hash": query_hash}],
            ids=[query_hash],
        )
        print(f'💾 Layer 1 cached: "{query[:60]}"')

    # ── LAYER 2: HyDE Vector Cache ──

    def get_hyde(self, query):
        """Layer 2: Check if HyDE vector for this query is cached."""
        query_hash = self._hash_query(query)
        key = self._redis_key("hyde", query_hash)

        cached = self.redis.get(key)
        if cached:
            print("⚡ Layer 2 HIT (HyDE vector cached)")
            return json.loads(cached)

        print("❌ Layer 2 MISS (HyDE)")
        return None

    def put_hyde(self, query, hyde_vector):
        """Layer 2: Store HyDE vector."""
        query_hash = self._hash_query(query)
        key = self._redis_key("hyde", query_hash)

        self.redis.setex(key, self.ttl_seconds, json.dumps(hyde_vector))
        print("💾 Layer 2 cached: HyDE vector")

    # ── LAYER 3: LLM Response Cache ──

    def get_llm_response(self, query, context_docs):
        """Layer 3: Check if LLM already answered this query with this context."""
        context_str = json.dumps(context_docs, sort_keys=True, default=str)
        combined = f"{query.strip().lower()}||{context_str}"
        combined_hash = hashlib.sha256(combined.encode("utf-8")).hexdigest()
        key = self._redis_key("llm", combined_hash)

        cached = self.redis.get(key)
        if cached:
            print("⚡ Layer 3 HIT (LLM response cached)")
            return json.loads(cached)

        print("❌ Layer 3 MISS (LLM)")
        return None

    def put_llm_response(self, query, context_docs, response):
        """Layer 3: Store LLM response keyed by query + context."""
        context_str = json.dumps(context_docs, sort_keys=True, default=str)
        combined = f"{query.strip().lower()}||{context_str}"
        combined_hash = hashlib.sha256(combined.encode("utf-8")).hexdigest()
        key = self._redis_key("llm", combined_hash)

        clean = {k: v for k, v in response.items() if not k.startswith("_")}
        self.redis.setex(key, self.ttl_seconds, json.dumps(clean))
        print("💾 Layer 3 cached: LLM response")

    # ── UTILITIES ──

    def clear(self):
        """Flush all cache layers."""
        keys = self.redis.keys(f"{self.key_prefix}*")
        if keys:
            self.redis.delete(*keys)
        self.semantic_store.delete_collection()
        self.semantic_store = Chroma(
            collection_name="query_cache_semantic",
            embedding_function=self.embedding_model,
            persist_directory=os.path.join(self.cache_dir, "semantic_db"),
        )
        print("🗑️ All cache layers cleared")

    def stats(self):
        """Return per-layer cache statistics."""
        all_keys = self.redis.keys(f"{self.key_prefix}*")
        query_keys = [k for k in all_keys if ":query:" in k]
        hyde_keys = [k for k in all_keys if ":hyde:" in k]
        llm_keys = [k for k in all_keys if ":llm:" in k]
        return {
            "layer_1_query_cache": len(query_keys),
            "layer_2_hyde_cache": len(hyde_keys),
            "layer_3_llm_cache": len(llm_keys),
            "total": len(all_keys),
        }


# ──────────────────────────────────────────────
# Initialize Cache
# ──────────────────────────────────────────────

cache = QueryCache(
    embedding_model=local_embeddings,
    redis_host="localhost",
    redis_port=6379,
    cache_dir="./cache",
    semantic_threshold=0.92,
    ttl_seconds=86400 * 7,
)


# ──────────────────────────────────────────────
# Vector DB & Parent Document Retriever
# ──────────────────────────────────────────────

current_dir = os.getcwd()

persist_dir = os.path.join(current_dir, "chroma_db_local", "chroma_db_local")
parent_store_dir = os.path.join(current_dir, "parent_store_local", "parent_store_local")

# Load persistent parent and child storage
fs = LocalFileStore(parent_store_dir)
store = create_kv_docstore(fs)

vectorstore = Chroma(
    collection_name="med_rag_local",
    embedding_function=local_embeddings,
    persist_directory=persist_dir,
)

child_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=store,
    child_splitter=child_splitter,
)


# ──────────────────────────────────────────────
# NVIDIA LLMs
# ──────────────────────────────────────────────


if "NVIDIA_API_KEY" not in os.environ:
    os.environ["NVIDIA_API_KEY"]  = "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"

print("🚀 Initializing Llama-3.3-70B via NVIDIA API...")
llm = ChatNVIDIA(
    model="meta/llama-3.3-70b-instruct",
    temperature=0.2,
    max_completion_tokens=1024,
)

print("🚀 Initializing Llama-3.1-70B-Instruct via NVIDIA API...")
vision_llm = ChatNVIDIA(
    model="meta/llama-3.1-70b-instruct",
    temperature=0.2,
    max_completion_tokens=1024,
)


# ──────────────────────────────────────────────
# HyDE (Hypothetical Document Embedding)
# ──────────────────────────────────────────────

def generate_hyde_vector(query: str, llm_client, embedding_model) -> list[float]:
    """Generate a hypothetical document and return its vector embedding."""
    prompt = (
        "Given the following question, write a hypothetical, detailed textbook passage "
        "that directly answers it. Write in an academic tone, use standard formatting, "
        "and include relevant domain keywords that might appear in a textbook.\n\n"
        f"Question: {query}\n\n"
        "Hypothetical Textbook Passage:"
    )

    response = llm_client.invoke([HumanMessage(content=prompt)])
    hypothetical_doc = response.content

    hyde_vector = embedding_model.embed_query(hypothetical_doc)
    return hyde_vector


def get_query_vector(query, embedding_model, llm_model=None, use_hyde=True):
    """
    Generate query vector using either HyDE or direct embedding.

    Args:
        query: The user's question.
        embedding_model: BGE-M3 embedding model.
        llm_model: LLM for HyDE generation (required if use_hyde=True).
        use_hyde: True = HyDE (slower, better retrieval) | False = direct embed (faster).

    Returns:
        query_vector (list[float])
    """
    if use_hyde:
        if llm_model is None:
            raise ValueError("LLM is required when use_hyde=True")
        print("🔍 Using HyDE (generating hypothetical passage)...")
        return generate_hyde_vector(query, llm_model, embedding_model)

    print("⚡ Using direct query embedding (fast mode)...")
    return embedding_model.embed_query(query)


# ──────────────────────────────────────────────
# BM25 Retriever
# ──────────────────────────────────────────────

chroma_data = vectorstore.get()

child_chunks = []
for i in range(len(chroma_data["documents"])):
    doc = Document(
        page_content=chroma_data["documents"][i],
        metadata=chroma_data["metadatas"][i] if chroma_data["metadatas"] else {},
    )
    child_chunks.append(doc)

print(f"Loaded {len(child_chunks)} child chunks directly from ChromaDB.")

my_bm25_retriever = BM25Retriever.from_documents(child_chunks)


# ──────────────────────────────────────────────
# Hybrid Retrieval (BM25 + Vector) with RRF
# ──────────────────────────────────────────────

def retrieve_and_fuse(query, hyde_vector, bm25_retriever, vector_store, top_k=5):
    """Hybrid search with PARALLEL BM25 + Vector retrieval, fused using RRF."""
    bm25_retriever.k = top_k

    with ThreadPoolExecutor(max_workers=2) as executor:
        bm25_future = executor.submit(bm25_retriever.invoke, query)
        vector_future = executor.submit(
            vector_store.similarity_search_by_vector, hyde_vector, k=top_k
        )

        bm25_docs = bm25_future.result()
        vector_docs = vector_future.result()

    print(f"Retrieved {len(bm25_docs)} BM25 + {len(vector_docs)} Vector docs (parallel)")

    # Reciprocal Rank Fusion
    fused_scores = {}
    rrf_k = 60

    def score_docs(docs):
        for rank, doc in enumerate(docs):
            doc_id = doc.page_content
            if doc_id not in fused_scores:
                fused_scores[doc_id] = {"doc": doc, "score": 0.0}
            fused_scores[doc_id]["score"] += 1.0 / (rank + rrf_k)

    score_docs(bm25_docs)
    score_docs(vector_docs)

    reranked = sorted(fused_scores.values(), key=lambda x: x["score"], reverse=True)
    final_docs = [item["doc"] for item in reranked]

    print(f"Fused into {len(final_docs)} unique child chunks.")
    return final_docs


# ──────────────────────────────────────────────
# Cross-Encoder Reranker (BGE Reranker Large)
# ──────────────────────────────────────────────

bge_reranker = CrossEncoder("BAAI/bge-reranker-large", device="cpu")


def rerank_chunks(query: str, fused_docs: list, reranker_model, top_n: int = 3, min_score=0.01) -> list:
    """Rerank with score threshold to filter low-relevance chunks."""
    if not fused_docs:
        return []

    pairs = [[query, doc.page_content] for doc in fused_docs]
    scores = reranker_model.predict(pairs)

    scored_docs = [(s, d) for s, d in zip(scores, fused_docs) if s > min_score]
    scored_docs.sort(key=lambda x: x[0], reverse=True)

    kept = [doc for _, doc in scored_docs[:top_n]]

    filtered_out = len(fused_docs) - len(scored_docs)
    if filtered_out > 0:
        print(f"  🔍 Filtered out {filtered_out} low-relevance chunks")

    return kept


# ──────────────────────────────────────────────
# Parent Chunk Fetcher
# ──────────────────────────────────────────────

parent_store = LocalFileStore(
    os.path.join(current_dir, "parent_store_local", "parent_store_local")
)


def fetch_and_deduplicate_parents(top_child_chunks: list, file_store) -> list:
    """Map child chunks to parents and drop duplicates. Includes page metadata."""
    unique_parent_ids = set()
    final_parent_docs = []

    for child in top_child_chunks:
        parent_id = child.metadata.get("doc_id")

        if parent_id and parent_id not in unique_parent_ids:
            unique_parent_ids.add(parent_id)

            parent_bytes = file_store.mget([parent_id])[0]

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

    print(f"Reduced {len(top_child_chunks)} child chunks to {len(final_parent_docs)} unique parent chunks.")
    return final_parent_docs


# ──────────────────────────────────────────────
# Image Encoding
# ──────────────────────────────────────────────

def encode_image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# ──────────────────────────────────────────────
# Final Answer Generation
# ──────────────────────────────────────────────

def generate_final_answer(query, parent_docs, vision_llm_client):
    """Generate answer with strict faithfulness guardrails."""
    formatted_contexts = []
    for i, doc in enumerate(parent_docs):
        source_tag = f"[Source {i + 1}]"
        meta_line = (
            f"Chapter: {doc['chapter']} | Section: {doc['section']} "
            f"| Title: {doc['section_title']} | Pages: {doc['page_start']}-{doc['page_end']}"
        )
        formatted_contexts.append(f"--- {source_tag} ({meta_line}) ---\n{doc['text']}\n")

    combined_context = "\n".join(formatted_contexts)
    image_paths = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", combined_context)

    json_schema = textwrap.dedent("""\
    {
      "answer": "Detailed answer with inline citations like [Source 1].",
      "citations": [
        {
          "source_tag": "[Source 1]",
          "chapter": "Chapter name",
          "section": "Section number",
          "section_name": "Title",
          "page_start": 1,
          "page_end": 2
        }
      ]
    }""")

    system_prompt = f"""You are an expert academic assistant.

STRICT RULES:
1. ONLY use information from the provided textbook context below. DO NOT use your own knowledge.
2. Every factual claim MUST have an inline citation like [Source 1].
3. If a claim cannot be directly supported by the context, DO NOT include it.
4. If the context does not contain enough information to answer fully, explicitly state: "The retrieved sections do not contain sufficient information to fully answer this question."
5. Prefer quoting or closely paraphrasing the textbook rather than adding your own interpretation.
6. Structure your response in the JSON format below.

JSON Schema:
{json_schema}

Textbook Context:
{combined_context}

Question: {query}

Answer (use ONLY the textbook context above, cite every claim):"""

    message_content = [{"type": "text", "text": system_prompt}]

    for path in image_paths:
        if os.path.exists(path):
            base64_image = encode_image_to_base64(path)
            message_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                }
            )

    print(f"Passing context ({len(parent_docs)} sources, {len(image_paths)} images) to Llama Vision...")
    response = vision_llm_client.invoke([HumanMessage(content=message_content)])
    return response.content


# ──────────────────────────────────────────────
# Full RAG Pipeline
# ──────────────────────────────────────────────

def run_multimodal_rag_pipeline(
    query,
    llm_model,
    vision_llm_model,
    bge_m3_embedder,
    bm25_index,
    vector_db,
    reranker,
    parent_retriever_store,
):
    """Run the full multimodal RAG pipeline (without caching)."""
    logger.info("🚀 Starting Multimodal RAG Pipeline")
    logger.info("🔎 Query: %s", query)

    try:
        logger.info("1️⃣ Generating HyDE vector...")
        hyde_vec = generate_hyde_vector(query, llm_model, bge_m3_embedder)
        logger.info("✅ HyDE vector generated successfully")

        logger.info("2️⃣ Retrieving and fusing child chunks (BM25 + Vector)...")
        fused_children = retrieve_and_fuse(query, hyde_vec, bm25_index, vector_db)
        logger.info("✅ Retrieved & fused %d child chunks", len(fused_children))

        logger.info("3️⃣ Re-ranking fused chunks with Cross-Encoder...")
        top_children = rerank_chunks(query, fused_children, reranker)
        logger.info("✅ Re-ranked top %d chunks", len(top_children))

        logger.info("4️⃣ Fetching and deduplicating Parent Chunks...")
        final_parents = fetch_and_deduplicate_parents(top_children, parent_retriever_store)
        logger.info("✅ Retrieved %d unique parent chunks", len(final_parents))

        logger.info("5️⃣ Generating final multimodal answer...")
        answer = generate_final_answer(query, final_parents, vision_llm_model)

        logger.info("🎉 Pipeline completed successfully")
        return answer

    except Exception:
        logger.exception("❌ Error occurred during RAG pipeline execution")
        raise


# ──────────────────────────────────────────────
# Pretty Print
# ──────────────────────────────────────────────

def display_rag_answer(result: dict, width: int = 100):
    """Pretty prints RAG answer + citations with page numbers."""
    print("\n" + "=" * width)
    print("📘 FINAL ANSWER".center(width))
    print("=" * width + "\n")

    wrapped_answer = textwrap.fill(result["answer"], width=width)
    print(wrapped_answer)

    print("\n" + "-" * width)
    print("📚 SOURCES".center(width))
    print("-" * width + "\n")

    for idx, citation in enumerate(result["citations"], 1):
        print(f"{idx}. {citation['source_tag']}")
        print(f"   📖 Chapter : {citation['chapter']}")
        print(f"   📑 Section : {citation['section']}")
        print(f"   🏷️ Title   : {citation['section_name']}")
        print(f"   📄 Pages   : {citation.get('page_start', 'N/A')} - {citation.get('page_end', 'N/A')}")
        print()

    print("=" * width + "\n")


# ──────────────────────────────────────────────
# Cached Pipeline Entry Point
# ──────────────────────────────────────────────

USE_HYDE = True
TOP_K = 7
TOP_N_RERANK = 3


def give_final_answer(query):
    """Run the full pipeline with all three cache layers."""
    # Layer 1: Full response cache
    cached = cache.get_query(query)
    if cached:
        return cached

    # Layer 2: HyDE cache
    hyde_vec = cache.get_hyde(query)
    if hyde_vec is None:
        hyde_vec = get_query_vector(query, local_embeddings, llm, use_hyde=USE_HYDE)
        cache.put_hyde(query, hyde_vec)

    # Retrieval + Reranking
    fused_children = retrieve_and_fuse(query, hyde_vec, my_bm25_retriever, vectorstore, top_k=TOP_K)
    top_children = rerank_chunks(query, fused_children, bge_reranker, top_n=TOP_N_RERANK, min_score=0.01)
    final_parents = fetch_and_deduplicate_parents(top_children, parent_store)

    # Layer 3: LLM response cache
    result = cache.get_llm_response(query, final_parents)
    if result is None:
        final_answer = generate_final_answer(query, final_parents, vision_llm)
        result = json.loads(final_answer)
        cache.put_llm_response(query, final_parents, result)

    # Store in Layer 1
    cache.put_query(query, result)
    return result



def generate_submission_csv(input_path, output_path="submission.csv"):
    with open(input_path, "r", encoding="utf-8") as f:
        queries = json.load(f)

    total_queries = len(queries)
    print(f"🚀 Starting processing of {total_queries} queries...\n")

    with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
        fieldnames = ["query_id", "question", "answer", "citations"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        for idx, item in enumerate(queries, start=1):
            query_id = item["query_id"]
            question = item["question"]

            print(f"⏳ Processing Query {idx}/{total_queries} (ID: {query_id})...")
            result = give_final_answer(question)

            answer_text = result["answer"]

            citation_texts = []
            for c in result["citations"]:
                citation_texts.append(
                    f"{c['source_tag']} | Chapter: {c['chapter']} | "
                    f"Section: {c['section']} | Title: {c['section_name']} | "
                    f"Pages: {c.get('page_start', 'N/A')}-{c.get('page_end', 'N/A')}"
                )

            citations_combined = " || ".join(citation_texts)

            writer.writerow({
                "query_id": query_id,
                "question": question,
                "answer": answer_text,
                "citations": citations_combined
            })

            print(f"✅ Query {idx} done\n")

    print("🎉 submission.csv created successfully!")



# ──────────────────────────────────────────────
# Flask REST API
# ──────────────────────────────────────────────

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "RAG pipeline is running"})


@app.route("/api/query", methods=["POST"])
def handle_query():
    """
    Accepts: {"query": "What is operant conditioning?"}
    Returns: {"answer": "...", "citations": [...], "latency": 5.2}
    """
    data = request.get_json()
    query = data.get("query", "").strip()

    if not query:
        return jsonify({"error": "query is required"}), 400

    print(f"\n🔍 Incoming query: {query}")
    t0 = time.time()

    try:
        result = give_final_answer(query)
        latency: float = round(time.time() - t0, 2)  # type: ignore[call-overload]

        print(f"✅ Answered in {latency}s")

        return jsonify(
            {
                "success": True,
                "answer": result.get("answer", ""),
                "citations": result.get("citations", []),
                "latency": latency,
            }
        )

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/generate_csv", methods=["POST"])
def generate_csv_api():
    """
    Accepts:
    {
        "input_path": "path/to/queries.json",
        "output_path": "submission.csv" (optional)
    }

    Returns:
    {
        "success": True,
        "message": "CSV generated",
        "output_path": "submission.csv"
    }
    """
    data = request.get_json()

    input_path = data.get("input_path")
    output_path = data.get("output_path", "submission.csv")

    if not input_path:
        return jsonify({"error": "input_path is required"}), 400

    print(f"\n📄 Generating CSV from: {input_path}")

    t0 = time.time()

    try:
        generate_submission_csv(input_path, output_path)
        latency: float = round(time.time() - t0, 2)  # type: ignore[call-overload]

        return jsonify({
            "success": True,
            "message": "CSV generated successfully",
            "output_path": output_path,
            "filename": os.path.basename(output_path),
            "download_url": f"/api/download/{os.path.basename(output_path)}",
            "latency": latency
        })

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/download/<filename>", methods=["GET"])
def download_file(filename):
    """Serve the generated CSV file."""
    # Ensure we only serve from the current directory or a specific allowed one
    # For simplicity, we'll use the root of the Rag_Module
    directory = os.getcwd()
    return send_from_directory(directory, filename, as_attachment=True)

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

if __name__ == "__main__":
    print("🚀 RAG API server running at http://localhost:8000")
    print('   POST /api/query   → {"query": "your question"}')
    print("   GET  /api/health  → health check")
    app.run(host="0.0.0.0", port=8001, debug=False, use_reloader=False)
