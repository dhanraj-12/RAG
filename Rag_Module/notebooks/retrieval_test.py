# %% [markdown]
# # 🧪 RAG Pipeline Evaluation — Retrieval Test
# **4-Stage evaluation pipeline using the golden dataset**
#
# - Stage 0: BM25 vs Vector (individual retriever comparison)
# - Stage 1: After RRF Fusion (combined retrieval)
# - Stage 2: After Reranking (NDCG, MRR, Precision)
# - Stage 3: After LLM Generation (BERTScore, ROUGE-L, Faithfulness)

# %% [markdown]
# ## Step 0: Install Dependencies & Imports

# %%
# !pip install rouge-score bert-score numpy

# %%
import os
import re
import json
import time
import hashlib
import numpy as np
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import HumanMessage
from langchain_chroma import Chroma
from langchain.storage import LocalFileStore
from langchain.storage._lc_store import create_kv_docstore
from langchain_community.retrievers import BM25Retriever
from sentence_transformers import CrossEncoder

current_dir = os.path.dirname(os.path.abspath("__file__"))

# %% [markdown]
# ## Step 1: Load Models, Stores & Golden Dataset

# %%
# === Embedding Model ===
local_embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-m3",
    model_kwargs={'device': 'cuda'},
    encode_kwargs={'normalize_embeddings': True}
)

# === Vector Store ===
persist_dir = "../chroma_db_local/chroma_db_local"  # Adjust path
vectorstore = Chroma(
    collection_name="med_rag_local",
    embedding_function=local_embeddings,
    persist_directory=persist_dir,
)

# === Parent Store ===
parent_store_dir = "../parent_store_local/parent_store_local"  # Adjust path
fs = LocalFileStore(parent_store_dir)
store = create_kv_docstore(fs)

# === Reranker ===
bge_reranker = CrossEncoder("BAAI/bge-reranker-large", device="cuda")

# === LLMs ===
llm = ChatNVIDIA(
    model="meta/llama-3.3-70b-instruct",
    api_key=os.environ.get("NVIDIA_API_KEY"),
    temperature=0.0,
    max_tokens=2048,
)

vision_llm = ChatNVIDIA(
    model="meta/llama-3.2-90b-vision-instruct",
    api_key=os.environ.get("NVIDIA_API_KEY"),
    temperature=0.0,
    max_tokens=2048,
)

print("✅ Models loaded")

# %%
# === Load Golden Dataset ===
golden_path = "../docs/golden_dataset.json"
with open(golden_path, "r", encoding="utf-8") as f:
    golden_dataset = json.load(f)

print(f"✅ Loaded {len(golden_dataset)} golden dataset entries")

# Preview
for entry in golden_dataset[:3]:
    print(f"  [{entry['id']}] {entry['question_type']}: {entry['question'][:60]}...")

# %% [markdown]
# ## Step 2: Load Pipeline Functions
# Import the same retrieval functions from your retriver notebook.

# %%
# === BM25 Retriever ===
# Load all child docs for BM25
all_docs_data = vectorstore.get(include=["documents", "metadatas"])
from langchain.schema import Document

all_child_docs = []
for i, text in enumerate(all_docs_data["documents"]):
    meta = all_docs_data["metadatas"][i] if i < len(all_docs_data["metadatas"]) else {}
    all_child_docs.append(Document(page_content=text, metadata=meta))

my_bm25_retriever = BM25Retriever.from_documents(all_child_docs, k=5)
print(f"✅ BM25 index built with {len(all_child_docs)} documents")

# %%
# === HyDE Generator ===
def generate_hyde_vector(query, llm_client, embedding_model):
    prompt = f"""Given the following question, write a hypothetical, detailed textbook 
passage that directly answers it.
Question: {query}
Hypothetical Textbook Passage:"""
    response = llm_client.invoke([HumanMessage(content=prompt)])
    return embedding_model.embed_query(response.content)


def get_query_vector(query, embedding_model, llm=None, use_hyde=True):
    if use_hyde and llm:
        return generate_hyde_vector(query, llm, embedding_model)
    else:
        return embedding_model.embed_query(query)

# %%
# === Retrieval Functions ===
def retrieve_bm25_only(query, bm25_retriever, top_k=5):
    bm25_retriever.k = top_k
    return bm25_retriever.invoke(query)


def retrieve_vector_only(query_vector, vector_store, top_k=5):
    return vector_store.similarity_search_by_vector(query_vector, k=top_k)


def retrieve_and_fuse(query, hyde_vector, bm25_retriever, vector_store, top_k=5):
    bm25_retriever.k = top_k
    with ThreadPoolExecutor(max_workers=2) as executor:
        bm25_future = executor.submit(bm25_retriever.invoke, query)
        vector_future = executor.submit(vector_store.similarity_search_by_vector, hyde_vector, k=top_k)
        bm25_docs = bm25_future.result()
        vector_docs = vector_future.result()

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
    return [item["doc"] for item in reranked], bm25_docs, vector_docs


def rerank_chunks(query, fused_docs, reranker_model, top_n=3):
    if not fused_docs:
        return []
    pairs = [[query, doc.page_content] for doc in fused_docs]
    scores = reranker_model.predict(pairs)
    scored_docs = list(zip(scores, fused_docs))
    scored_docs.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored_docs[:top_n]]


def fetch_and_deduplicate_parents(top_child_chunks, doc_store):
    unique_parent_ids = set()
    final_parent_docs = []
    for child in top_child_chunks:
        parent_id = child.metadata.get('doc_id')
        if parent_id and parent_id not in unique_parent_ids:
            unique_parent_ids.add(parent_id)
            parent_bytes = doc_store.mget([parent_id])[0]
            if parent_bytes:
                parent_text = parent_bytes.decode('utf-8') if isinstance(parent_bytes, bytes) else str(parent_bytes)
                final_parent_docs.append({
                    "text": parent_text,
                    "chapter": child.metadata.get("chapter", "Unknown"),
                    "section": child.metadata.get("section", "Unknown"),
                    "section_title": child.metadata.get("section-title", "Unknown"),
                    "page_start": child.metadata.get("page_start", "N/A"),
                    "page_end": child.metadata.get("page_end", "N/A"),
                })
    return final_parent_docs

# %% [markdown]
# ## Step 3: Evaluation Metrics

# %%
# ==========================================
# RETRIEVAL METRICS (Stage 0, 1, 2)
# ==========================================

def compute_recall_at_k(retrieved_docs, golden_sections, k=5):
    """What fraction of relevant sections appear in the retrieved docs?"""
    retrieved_sections = set()
    for doc in retrieved_docs[:k]:
        sec = doc.metadata.get("section", "")
        if sec:
            retrieved_sections.add(sec)
        # Also check parent section (e.g., "6.3" matches "6.3.1")
        parts = sec.split(".")
        if len(parts) >= 2:
            retrieved_sections.add(f"{parts[0]}.{parts[1]}")

    golden_set = set(golden_sections)
    if not golden_set:
        return 1.0  # No ground truth sections = skip

    hits = len(golden_set & retrieved_sections)
    return hits / len(golden_set)


def compute_hit_rate(retrieved_docs, golden_sections, k=5):
    """Did ANY relevant section appear in top-K?"""
    retrieved_sections = set()
    for doc in retrieved_docs[:k]:
        sec = doc.metadata.get("section", "")
        if sec:
            retrieved_sections.add(sec)
            parts = sec.split(".")
            if len(parts) >= 2:
                retrieved_sections.add(f"{parts[0]}.{parts[1]}")

    golden_set = set(golden_sections)
    if not golden_set:
        return 1.0
    return 1.0 if (golden_set & retrieved_sections) else 0.0


def compute_mrr(retrieved_docs, golden_sections, k=5):
    """Mean Reciprocal Rank — how early does the first relevant chunk appear?"""
    golden_set = set(golden_sections)
    if not golden_set:
        return 1.0

    for rank, doc in enumerate(retrieved_docs[:k], 1):
        sec = doc.metadata.get("section", "")
        parts = sec.split(".")
        parent_sec = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else sec
        if sec in golden_set or parent_sec in golden_set:
            return 1.0 / rank
    return 0.0


def compute_precision_at_k(retrieved_docs, golden_sections, k=3):
    """What fraction of top-K retrieved docs are relevant?"""
    golden_set = set(golden_sections)
    if not golden_set:
        return 1.0

    relevant_count = 0
    for doc in retrieved_docs[:k]:
        sec = doc.metadata.get("section", "")
        parts = sec.split(".")
        parent_sec = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else sec
        if sec in golden_set or parent_sec in golden_set:
            relevant_count += 1
    return relevant_count / k


def compute_ndcg_at_k(retrieved_docs, golden_sections, k=3):
    """NDCG@K — measures ranking quality. Higher = relevant docs ranked higher."""
    golden_set = set(golden_sections)
    if not golden_set:
        return 1.0

    # Relevance scores: 1 if relevant, 0 if not
    relevances = []
    for doc in retrieved_docs[:k]:
        sec = doc.metadata.get("section", "")
        parts = sec.split(".")
        parent_sec = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else sec
        rel = 1.0 if (sec in golden_set or parent_sec in golden_set) else 0.0
        relevances.append(rel)

    # DCG
    dcg = sum(rel / np.log2(rank + 2) for rank, rel in enumerate(relevances))

    # Ideal DCG (all relevant docs at the top)
    ideal_rels = sorted(relevances, reverse=True)
    idcg = sum(rel / np.log2(rank + 2) for rank, rel in enumerate(ideal_rels))

    if idcg == 0:
        return 0.0
    return dcg / idcg

# %%
# ==========================================
# GENERATION METRICS (Stage 3)
# ==========================================

def compute_rouge_l(prediction, reference):
    """ROUGE-L F1 score using longest common subsequence."""
    pred_tokens = prediction.lower().split()
    ref_tokens = reference.lower().split()

    if not pred_tokens or not ref_tokens:
        return 0.0

    # LCS using dynamic programming
    m, n = len(pred_tokens), len(ref_tokens)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if pred_tokens[i-1] == ref_tokens[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])

    lcs_length = dp[m][n]
    precision = lcs_length / m if m > 0 else 0
    recall = lcs_length / n if n > 0 else 0

    if precision + recall == 0:
        return 0.0
    f1 = 2 * precision * recall / (precision + recall)
    return round(f1, 4)


def compute_bertscore_simple(prediction, reference, embedding_model):
    """Simplified BERTScore using your existing BGE-M3 embeddings."""
    pred_vec = embedding_model.embed_query(prediction)
    ref_vec = embedding_model.embed_query(reference)

    # Cosine similarity
    pred_arr = np.array(pred_vec)
    ref_arr = np.array(ref_vec)
    cos_sim = np.dot(pred_arr, ref_arr) / (np.linalg.norm(pred_arr) * np.linalg.norm(ref_arr))
    return round(float(cos_sim), 4)


def compute_faithfulness(query, answer, context_text, judge_llm):
    """LLM-as-judge: is the answer grounded in the context?"""
    prompt = f"""Evaluate if this answer is FAITHFUL to the provided context.
A faithful answer uses ONLY information from the context, with no external knowledge.

Question: {query}
Context: {context_text[:3000]}
Answer: {answer}

Score 1-5:
- 1: Completely hallucinated, no grounding in context
- 2: Mostly hallucinated with some correct info
- 3: Mix of grounded and non-grounded claims
- 4: Mostly grounded with minor additions
- 5: Fully grounded, every claim supported by context

Return JSON: {{"faithfulness": N, "reason": "brief explanation"}}
Respond with ONLY JSON."""

    try:
        response = judge_llm.invoke([HumanMessage(content=prompt)])
        result = json.loads(response.content)
        return result
    except Exception:
        return {"faithfulness": 3, "reason": "evaluation failed"}


def compute_completeness(query, answer, ground_truth, judge_llm):
    """LLM-as-judge: does the answer cover all aspects of the ground truth?"""
    prompt = f"""Compare the model's answer against the ground truth answer.
How complete is the model's answer?

Question: {query}
Ground Truth: {ground_truth}
Model Answer: {answer}

Score 1-5:
- 1: Completely misses the point
- 2: Covers <25% of the ground truth
- 3: Covers ~50% of the ground truth
- 4: Covers ~75% of the ground truth
- 5: Covers everything in the ground truth (may have extra correct info)

Return JSON: {{"completeness": N, "reason": "brief explanation"}}
Respond with ONLY JSON."""

    try:
        response = judge_llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content)
    except Exception:
        return {"completeness": 3, "reason": "evaluation failed"}


def check_citation_accuracy(result_citations, golden_sections, golden_pages):
    """Check if the RAG citations match the golden dataset."""
    if not result_citations:
        return {"section_match": 0.0, "page_match": 0.0}

    cited_sections = set()
    cited_pages = set()
    for c in result_citations:
        sec = c.get("section", "")
        if sec:
            cited_sections.add(sec)
        ps = c.get("page_start")
        pe = c.get("page_end")
        if ps and pe:
            for p in range(int(ps), int(pe) + 1):
                cited_pages.add(p)

    golden_sec_set = set(golden_sections)
    golden_page_set = set(golden_pages)

    sec_match = len(cited_sections & golden_sec_set) / max(len(golden_sec_set), 1)
    page_match = len(cited_pages & golden_page_set) / max(len(golden_page_set), 1) if golden_page_set else 1.0

    return {"section_match": round(sec_match, 4), "page_match": round(page_match, 4)}

# %% [markdown]
# ## Step 4: Run Full Evaluation Pipeline

# %%
USE_HYDE = True
TOP_K_RETRIEVE = 5
TOP_N_RERANK = 3

results = []
answerable_entries = [e for e in golden_dataset if e.get("answerable", True)]
unanswerable_entries = [e for e in golden_dataset if not e.get("answerable", True)]

print(f"📊 Evaluating {len(answerable_entries)} answerable + "
      f"{len(unanswerable_entries)} unanswerable questions")
print(f"   Config: USE_HYDE={USE_HYDE}, TOP_K={TOP_K_RETRIEVE}, TOP_N_RERANK={TOP_N_RERANK}")
print("=" * 70)

# %%
# === Run evaluation on ANSWERABLE questions ===
for i, entry in enumerate(answerable_entries):
    query = entry["question"]
    golden_sections = entry.get("relevant_sections", [])
    golden_pages = entry.get("relevant_pages", [])
    ground_truth = entry.get("ground_truth", "")

    print(f"\n[{i+1}/{len(answerable_entries)}] {query[:60]}...")
    eval_result = {"id": entry["id"], "question": query, "type": entry["question_type"]}
    timings = {}

    # ── Query Vector ──
    t0 = time.time()
    query_vec = get_query_vector(query, local_embeddings, llm, use_hyde=USE_HYDE)
    timings["query_vector"] = round(time.time() - t0, 3)

    # ── STAGE 0: Individual Retrievers ──
    t0 = time.time()
    bm25_docs = retrieve_bm25_only(query, my_bm25_retriever, top_k=TOP_K_RETRIEVE)
    timings["bm25"] = round(time.time() - t0, 3)

    t0 = time.time()
    vector_docs = retrieve_vector_only(query_vec, vectorstore, top_k=TOP_K_RETRIEVE)
    timings["vector"] = round(time.time() - t0, 3)

    eval_result["stage_0"] = {
        "bm25_recall@k": compute_recall_at_k(bm25_docs, golden_sections, TOP_K_RETRIEVE),
        "bm25_hit_rate": compute_hit_rate(bm25_docs, golden_sections, TOP_K_RETRIEVE),
        "vector_recall@k": compute_recall_at_k(vector_docs, golden_sections, TOP_K_RETRIEVE),
        "vector_hit_rate": compute_hit_rate(vector_docs, golden_sections, TOP_K_RETRIEVE),
    }
    print(f"  Stage 0: BM25 Recall={eval_result['stage_0']['bm25_recall@k']:.2f} | "
          f"Vector Recall={eval_result['stage_0']['vector_recall@k']:.2f}")

    # ── STAGE 1: After RRF Fusion ──
    t0 = time.time()
    fused_docs, _, _ = retrieve_and_fuse(query, query_vec, my_bm25_retriever, vectorstore, TOP_K_RETRIEVE)
    timings["fusion"] = round(time.time() - t0, 3)

    eval_result["stage_1"] = {
        "fused_recall@k": compute_recall_at_k(fused_docs, golden_sections, TOP_K_RETRIEVE),
        "fused_hit_rate": compute_hit_rate(fused_docs, golden_sections, TOP_K_RETRIEVE),
        "context_precision": compute_precision_at_k(fused_docs, golden_sections, TOP_K_RETRIEVE),
    }
    print(f"  Stage 1: Fused Recall={eval_result['stage_1']['fused_recall@k']:.2f} | "
          f"Precision={eval_result['stage_1']['context_precision']:.2f}")

    # ── STAGE 2: After Reranking ──
    t0 = time.time()
    reranked_docs = rerank_chunks(query, fused_docs, bge_reranker, top_n=TOP_N_RERANK)
    timings["reranking"] = round(time.time() - t0, 3)

    eval_result["stage_2"] = {
        "ndcg@k": compute_ndcg_at_k(reranked_docs, golden_sections, TOP_N_RERANK),
        "mrr": compute_mrr(reranked_docs, golden_sections, TOP_N_RERANK),
        "precision@k": compute_precision_at_k(reranked_docs, golden_sections, TOP_N_RERANK),
    }
    print(f"  Stage 2: NDCG={eval_result['stage_2']['ndcg@k']:.2f} | "
          f"MRR={eval_result['stage_2']['mrr']:.2f} | "
          f"Precision={eval_result['stage_2']['precision@k']:.2f}")

    # ── Fetch Parents ──
    parent_docs = fetch_and_deduplicate_parents(reranked_docs, store)
    context_text = "\n\n".join([d["text"][:1500] for d in parent_docs])

    # ── STAGE 3: LLM Generation + Evaluation ──
    t0 = time.time()

    # Build prompt (same as your retriver.ipynb)
    formatted_contexts = []
    for ci, doc in enumerate(parent_docs):
        source_tag = f"[Source {ci+1}]"
        meta_line = (f"Chapter: {doc['chapter']} | Section: {doc['section']} "
                     f"| Title: {doc['section_title']} | Pages: {doc['page_start']}-{doc['page_end']}")
        formatted_contexts.append(f"--- {source_tag} ({meta_line}) ---\n{doc['text']}\n")
    combined_context = "\n".join(formatted_contexts)

    import textwrap
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

    system_prompt = f"""You are an expert academic assistant. Answer based strictly on the provided context.
Use inline citations like [Source 1]. Return JSON with the schema:
{json_schema}

Context:
{combined_context}

Question: {query}

Answer:"""

    try:
        response = vision_llm.invoke([HumanMessage(content=[{"type": "text", "text": system_prompt}])])
        raw_answer = response.content
        parsed = json.loads(raw_answer)
        model_answer = parsed.get("answer", raw_answer)
        model_citations = parsed.get("citations", [])
    except Exception:
        model_answer = raw_answer if 'raw_answer' in dir() else ""
        model_citations = []

    timings["llm_generation"] = round(time.time() - t0, 3)

    # Compute Stage 3 metrics
    rouge_l = compute_rouge_l(model_answer, ground_truth)
    bert_score = compute_bertscore_simple(model_answer, ground_truth, local_embeddings)
    faithfulness_result = compute_faithfulness(query, model_answer, context_text, llm)
    completeness_result = compute_completeness(query, model_answer, ground_truth, llm)
    citation_acc = check_citation_accuracy(model_citations, golden_sections, golden_pages)

    eval_result["stage_3"] = {
        "rouge_l": rouge_l,
        "bert_score": bert_score,
        "faithfulness": faithfulness_result.get("faithfulness", 0),
        "faithfulness_reason": faithfulness_result.get("reason", ""),
        "completeness": completeness_result.get("completeness", 0),
        "completeness_reason": completeness_result.get("reason", ""),
        "citation_section_match": citation_acc["section_match"],
        "citation_page_match": citation_acc["page_match"],
    }

    eval_result["timings"] = timings
    eval_result["model_answer"] = model_answer

    print(f"  Stage 3: ROUGE-L={rouge_l:.3f} | BERTScore={bert_score:.3f} | "
          f"Faith={eval_result['stage_3']['faithfulness']}/5 | "
          f"Complete={eval_result['stage_3']['completeness']}/5")
    print(f"  ⏱️ Timings: {timings}")

    results.append(eval_result)

# %%
# === Run evaluation on UNANSWERABLE questions ===
print(f"\n{'='*70}")
print(f"🚫 Evaluating {len(unanswerable_entries)} UNANSWERABLE questions")
print("=" * 70)

for i, entry in enumerate(unanswerable_entries):
    query = entry["question"]
    print(f"\n[{i+1}/{len(unanswerable_entries)}] {query[:60]}...")

    eval_result = {"id": entry["id"], "question": query, "type": "unanswerable"}

    query_vec = get_query_vector(query, local_embeddings, llm, use_hyde=USE_HYDE)
    fused_docs, _, _ = retrieve_and_fuse(query, query_vec, my_bm25_retriever, vectorstore, TOP_K_RETRIEVE)
    reranked_docs = rerank_chunks(query, fused_docs, bge_reranker, top_n=TOP_N_RERANK)
    parent_docs = fetch_and_deduplicate_parents(reranked_docs, store)
    context_text = "\n\n".join([d["text"][:1500] for d in parent_docs])

    formatted_contexts = []
    for ci, doc in enumerate(parent_docs):
        source_tag = f"[Source {ci+1}]"
        formatted_contexts.append(f"--- {source_tag} ---\n{doc['text']}\n")
    combined_context = "\n".join(formatted_contexts)

    import textwrap
    json_schema = textwrap.dedent("""\
    {
      "answer": "Answer or state the info is not available.",
      "citations": []
    }""")

    prompt = f"""You are an expert academic assistant. Answer based strictly on the context.
If the answer is NOT in the context, explicitly state that.
Return JSON: {json_schema}

Context: {combined_context}
Question: {query}
Answer:"""

    try:
        response = vision_llm.invoke([HumanMessage(content=[{"type": "text", "text": prompt}])])
        parsed = json.loads(response.content)
        model_answer = parsed.get("answer", response.content)
    except Exception:
        model_answer = response.content if 'response' in dir() else ""

    # Check if model correctly refused to answer
    refusal_keywords = [
        "not contain", "not available", "cannot be answered",
        "does not", "no information", "not enough", "not found",
        "not mentioned", "not provided", "not present",
        "insufficient", "outside the scope"
    ]
    correctly_refused = any(kw in model_answer.lower() for kw in refusal_keywords)

    eval_result["stage_3"] = {
        "correctly_refused": correctly_refused,
        "model_answer": model_answer[:200],
    }
    eval_result["model_answer"] = model_answer

    status = "✅ Correctly refused" if correctly_refused else "❌ HALLUCINATED (should have refused)"
    print(f"  {status}")

    results.append(eval_result)

# %% [markdown]
# ## Step 5: Aggregate Results & Report

# %%
# === Aggregate Scores ===
answerable_results = [r for r in results if r["type"] != "unanswerable"]
unanswerable_results = [r for r in results if r["type"] == "unanswerable"]

def avg(values):
    return round(sum(values) / max(len(values), 1), 4)

print("=" * 70)
print("📊 EVALUATION REPORT")
print("=" * 70)

# Stage 0
if answerable_results:
    s0 = [r["stage_0"] for r in answerable_results if "stage_0" in r]
    print(f"\n── Stage 0: Individual Retrievers ──")
    print(f"  BM25   Recall@{TOP_K_RETRIEVE}: {avg([x['bm25_recall@k'] for x in s0]):.4f}")
    print(f"  BM25   Hit Rate:    {avg([x['bm25_hit_rate'] for x in s0]):.4f}")
    print(f"  Vector Recall@{TOP_K_RETRIEVE}: {avg([x['vector_recall@k'] for x in s0]):.4f}")
    print(f"  Vector Hit Rate:    {avg([x['vector_hit_rate'] for x in s0]):.4f}")

    # Stage 1
    s1 = [r["stage_1"] for r in answerable_results if "stage_1" in r]
    print(f"\n── Stage 1: After RRF Fusion ──")
    print(f"  Fused Recall@{TOP_K_RETRIEVE}:  {avg([x['fused_recall@k'] for x in s1]):.4f}")
    print(f"  Fused Hit Rate:     {avg([x['fused_hit_rate'] for x in s1]):.4f}")
    print(f"  Context Precision:  {avg([x['context_precision'] for x in s1]):.4f}")

    # Stage 2
    s2 = [r["stage_2"] for r in answerable_results if "stage_2" in r]
    print(f"\n── Stage 2: After Reranking ──")
    print(f"  NDCG@{TOP_N_RERANK}:        {avg([x['ndcg@k'] for x in s2]):.4f}")
    print(f"  MRR:            {avg([x['mrr'] for x in s2]):.4f}")
    print(f"  Precision@{TOP_N_RERANK}:    {avg([x['precision@k'] for x in s2]):.4f}")

    # Stage 3
    s3 = [r["stage_3"] for r in answerable_results if "stage_3" in r]
    print(f"\n── Stage 3: LLM Generation ──")
    print(f"  ROUGE-L:         {avg([x['rouge_l'] for x in s3]):.4f}")
    print(f"  BERTScore:       {avg([x['bert_score'] for x in s3]):.4f}")
    print(f"  Faithfulness:    {avg([x['faithfulness'] for x in s3]):.2f} / 5.0")
    print(f"  Completeness:    {avg([x['completeness'] for x in s3]):.2f} / 5.0")
    print(f"  Citation (Sec):  {avg([x['citation_section_match'] for x in s3]):.4f}")
    print(f"  Citation (Page): {avg([x['citation_page_match'] for x in s3]):.4f}")

# Unanswerable
if unanswerable_results:
    correct_refusals = sum(1 for r in unanswerable_results if r["stage_3"]["correctly_refused"])
    total_unans = len(unanswerable_results)
    print(f"\n── Hallucination Resistance ──")
    print(f"  Correct Refusals:  {correct_refusals}/{total_unans} ({correct_refusals/total_unans*100:.1f}%)")
    print(f"  Hallucination Rate: {(total_unans-correct_refusals)/total_unans*100:.1f}%")

# Latency
if answerable_results and "timings" in answerable_results[0]:
    timings_all = [r["timings"] for r in answerable_results if "timings" in r]
    print(f"\n── Latency (avg per query) ──")
    for key in timings_all[0]:
        vals = [t.get(key, 0) for t in timings_all]
        print(f"  {key:20s}: {avg(vals):.3f}s")
    total_times = [sum(t.values()) for t in timings_all]
    print(f"  {'TOTAL':20s}: {avg(total_times):.3f}s")

# By question type
print(f"\n── By Question Type ──")
type_groups = defaultdict(list)
for r in answerable_results:
    if "stage_3" in r:
        type_groups[r["type"]].append(r["stage_3"])

for qtype, scores in type_groups.items():
    print(f"  {qtype:15s} | ROUGE-L: {avg([s['rouge_l'] for s in scores]):.3f} | "
          f"BERTScore: {avg([s['bert_score'] for s in scores]):.3f} | "
          f"Faith: {avg([s['faithfulness'] for s in scores]):.1f}")

# %% [markdown]
# ## Step 6: Save Detailed Results

# %%
# Save full results
output_path = "../docs/evaluation_results.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False, default=str)

print(f"✅ Detailed results saved to {output_path}")

# Save summary
summary = {
    "config": {"use_hyde": USE_HYDE, "top_k": TOP_K_RETRIEVE, "top_n_rerank": TOP_N_RERANK},
    "stage_0": {
        "bm25_recall": avg([r["stage_0"]["bm25_recall@k"] for r in answerable_results if "stage_0" in r]),
        "vector_recall": avg([r["stage_0"]["vector_recall@k"] for r in answerable_results if "stage_0" in r]),
    },
    "stage_1": {
        "fused_recall": avg([r["stage_1"]["fused_recall@k"] for r in answerable_results if "stage_1" in r]),
        "context_precision": avg([r["stage_1"]["context_precision"] for r in answerable_results if "stage_1" in r]),
    },
    "stage_2": {
        "ndcg": avg([r["stage_2"]["ndcg@k"] for r in answerable_results if "stage_2" in r]),
        "mrr": avg([r["stage_2"]["mrr"] for r in answerable_results if "stage_2" in r]),
    },
    "stage_3": {
        "rouge_l": avg([r["stage_3"]["rouge_l"] for r in answerable_results if "stage_3" in r]),
        "bert_score": avg([r["stage_3"]["bert_score"] for r in answerable_results if "stage_3" in r]),
        "faithfulness": avg([r["stage_3"]["faithfulness"] for r in answerable_results if "stage_3" in r]),
        "completeness": avg([r["stage_3"]["completeness"] for r in answerable_results if "stage_3" in r]),
    },
    "hallucination_resistance": (
        sum(1 for r in unanswerable_results if r["stage_3"]["correctly_refused"]) / max(len(unanswerable_results), 1)
        if unanswerable_results else None
    ),
}

summary_path = "../docs/evaluation_summary.json"
with open(summary_path, "w") as f:
    json.dump(summary, f, indent=2)

print(f"✅ Summary saved to {summary_path}")
print(json.dumps(summary, indent=2))
