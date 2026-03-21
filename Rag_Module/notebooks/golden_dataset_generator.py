# %% [markdown]
# # 🏆 Golden Dataset Generator
# **6-Step Pipeline for generating evaluation ground truth from parent chunks**
# 
# 1. Document Ingestion — Load parent chunks with metadata
# 2. Stratified Context Selection — Sample diverse chunks across chapters
# 3. Evolutionary Query Generation — Generate Simple, Reasoning, Multi-context questions
# 4. Ground Truth Synthesis — Generate answers with evidence sentences
# 5. Quality Filtering — Two-pass LLM-as-judge filter
# 6. Dataset Formatting — Export rich JSONL dataset

# %% [markdown]
# ## Step 0: Install Dependencies & Imports

# %%
# !pip install langchain langchain-nvidia-ai-endpoints langchain-chroma ragas

# %%
import os
import re
import json
import random
import hashlib
from collections import defaultdict
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import HumanMessage
from langchain_chroma import Chroma
from langchain.storage import LocalFileStore
from langchain.storage._lc_store import create_kv_docstore

current_dir = os.path.dirname(os.path.abspath("__file__"))
print(f"Working directory: {current_dir}")

# %% [markdown]
# ## Step 1: Document Ingestion — Load Parent Chunks

# %%
# === Load the embedding model (same as your pipeline) ===
local_embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-m3",
    model_kwargs={'device': 'cuda'},
    encode_kwargs={'normalize_embeddings': True}
)

# === Load VectorStore and Parent Store ===
persist_dir = "../chroma_db_local/chroma_db_local"  # Adjust path
parent_store_dir = "../parent_store_local/parent_store_local"  # Adjust path

vectorstore = Chroma(
    collection_name="med_rag_local",
    embedding_function=local_embeddings,
    persist_directory=persist_dir,
)

fs = LocalFileStore(parent_store_dir)
store = create_kv_docstore(fs)

# === Load LLM ===
generator_llm = ChatNVIDIA(
    model="meta/llama-3.3-70b-instruct",
    api_key=os.environ.get("NVIDIA_API_KEY"),
    temperature=0.7,
    max_tokens=2048,
)

judge_llm = ChatNVIDIA(
    model="meta/llama-3.3-70b-instruct",
    api_key=os.environ.get("NVIDIA_API_KEY"),
    temperature=0.0,  # Deterministic for judging
    max_tokens=1024,
)

print("✅ Models and stores loaded")

# %% [markdown]
# ### Load all parent chunks from the vectorstore metadata
# We retrieve parent documents from the store to use as grounding context.

# %%
# Retrieve ALL parent chunks by scanning the store
# First, get all docs from the vectorstore to find parent IDs
all_child_docs = vectorstore.get(include=["metadatas", "documents"])

# Extract unique parent IDs
parent_ids = set()
parent_metadata_map = {}
for i, meta in enumerate(all_child_docs["metadatas"]):
    pid = meta.get("doc_id")
    if pid:
        parent_ids.add(pid)
        if pid not in parent_metadata_map:
            parent_metadata_map[pid] = meta

print(f"📄 Found {len(parent_ids)} unique parent chunks")

# Load parent documents with their metadata
parent_chunks = []
for pid in parent_ids:
    parent_bytes = fs.mget([pid])[0]
    if parent_bytes:
        text = parent_bytes.decode("utf-8") if isinstance(parent_bytes, bytes) else str(parent_bytes)
        meta = parent_metadata_map.get(pid, {})
        parent_chunks.append({
            "parent_id": pid,
            "text": text,
            "chapter": meta.get("chapter", "Unknown"),
            "section": meta.get("section", "Unknown"),
            "section_title": meta.get("section-title", "Unknown"),
            "page_start": meta.get("page_start", None),
            "page_end": meta.get("page_end", None),
            "has_image": bool(re.search(r'!\[', text)),
            "char_length": len(text),
        })

print(f"✅ Loaded {len(parent_chunks)} parent chunks with metadata")

# Preview
for p in parent_chunks[:3]:
    print(f"  [{p['section']}] {p['chapter']} — {p['section_title']} "
          f"(pages {p['page_start']}-{p['page_end']}, {p['char_length']} chars)")

# %% [markdown]
# ## Step 2: Stratified Context Selection
# Sample diverse chunks across chapters, ensuring coverage of images, tables, and varied lengths.

# %%
def stratified_sample(parent_chunks, target_count=80):
    """
    Sample chunks ensuring:
    - Equal representation across chapters
    - Mix of short/long chunks
    - Include chunks with images
    - Skip very short chunks (< 200 chars, likely headers only)
    """
    # Filter out very short chunks
    viable = [c for c in parent_chunks if c["char_length"] >= 200]
    print(f"Viable chunks (>200 chars): {len(viable)} / {len(parent_chunks)}")

    # Group by chapter
    by_chapter = defaultdict(list)
    for chunk in viable:
        by_chapter[chunk["chapter"]].append(chunk)

    # Calculate per-chapter quota
    num_chapters = len(by_chapter)
    per_chapter = max(2, target_count // num_chapters)
    print(f"Sampling ~{per_chapter} chunks from each of {num_chapters} chapters")

    sampled = []
    for chapter, chunks in sorted(by_chapter.items()):
        # Sort by length to get diversity
        chunks_sorted = sorted(chunks, key=lambda x: x["char_length"])

        # Pick from different length ranges
        n = min(per_chapter, len(chunks))
        if n >= 3:
            # Take 1 short, some medium, 1 long
            indices = [0]  # shortest
            indices.append(len(chunks_sorted) - 1)  # longest
            # Fill rest from middle
            middle = chunks_sorted[1:-1]
            random.shuffle(middle)
            indices_mid = list(range(1, min(n - 2 + 1, len(chunks_sorted) - 1)))
            random.shuffle(indices_mid)
            indices.extend(indices_mid[:n - 2])
        else:
            indices = list(range(n))

        for idx in indices:
            if idx < len(chunks_sorted):
                sampled.append(chunks_sorted[idx])

        print(f"  📖 {chapter}: sampled {min(n, len(indices))}/{len(chunks)} chunks")

    # Ensure we have some image-containing chunks
    image_chunks = [c for c in viable if c["has_image"] and c not in sampled]
    if image_chunks:
        extra = random.sample(image_chunks, min(5, len(image_chunks)))
        sampled.extend(extra)
        print(f"  🖼️ Added {len(extra)} extra image-containing chunks")

    # Trim to target
    if len(sampled) > target_count:
        sampled = random.sample(sampled, target_count)

    print(f"\n✅ Final sample: {len(sampled)} chunks")
    return sampled


sampled_chunks = stratified_sample(parent_chunks, target_count=80)

# %% [markdown]
# ## Step 3: Evolutionary Query Generation
# Generate 3 types: Simple, Reasoning, Multi-context + Unanswerable

# %%
def generate_simple_question(chunk, llm):
    """Generate a straightforward factual question from a single chunk."""
    prompt = f"""Based on the following textbook passage, generate ONE factual question 
that can be directly answered from this text. The question should require a specific, 
detailed answer (not just yes/no).

Passage:
{chunk['text'][:2000]}

Generate a JSON response:
{{
    "question": "Your factual question here",
    "question_type": "simple"
}}

Respond with ONLY the JSON, no other text."""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content)
    except Exception as e:
        print(f"  ⚠️ Error generating simple question: {e}")
        return None


def generate_reasoning_question(chunk, llm):
    """Generate a question requiring analysis/reasoning about the content."""
    prompt = f"""Based on the following textbook passage, generate ONE question that 
requires REASONING or ANALYSIS to answer. The question should ask about causes, effects, 
comparisons, or explanations — not just direct recall.

Examples of reasoning questions:
- "How does X affect Y?"
- "Why is X considered more effective than Y?"
- "What would happen if X were removed from the process?"

Passage:
{chunk['text'][:2000]}

Generate a JSON response:
{{
    "question": "Your reasoning question here",
    "question_type": "reasoning"
}}

Respond with ONLY the JSON, no other text."""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content)
    except Exception as e:
        print(f"  ⚠️ Error generating reasoning question: {e}")
        return None


def generate_multi_context_question(chunk1, chunk2, llm):
    """Generate a question requiring info from TWO different chunks."""
    prompt = f"""Based on the following TWO textbook passages, generate ONE question that 
requires information from BOTH passages to answer fully. The question should bridge 
concepts across the two passages.

Passage 1 (Section {chunk1['section']} — {chunk1['section_title']}):
{chunk1['text'][:1500]}

Passage 2 (Section {chunk2['section']} — {chunk2['section_title']}):
{chunk2['text'][:1500]}

Generate a JSON response:
{{
    "question": "Your multi-context question here",
    "question_type": "multi_context"
}}

Respond with ONLY the JSON, no other text."""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content)
    except Exception as e:
        print(f"  ⚠️ Error generating multi-context question: {e}")
        return None


def generate_unanswerable_question(chunk, llm):
    """Generate a question that sounds related but CANNOT be answered from the text."""
    prompt = f"""Based on this textbook passage about psychology, generate ONE question that:
1. Sounds plausible and related to the topic
2. CANNOT be answered from the given text
3. Would require information NOT present in this passage

Passage:
{chunk['text'][:1500]}

Generate a JSON response:
{{
    "question": "Your unanswerable question here",
    "question_type": "unanswerable"
}}

Respond with ONLY the JSON, no other text."""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content)
    except Exception as e:
        print(f"  ⚠️ Error generating unanswerable question: {e}")
        return None

# %%
# === Generate Questions ===
random.seed(42)
random.shuffle(sampled_chunks)

# Distribution: 40% simple, 25% reasoning, 20% multi-context, 15% unanswerable
n_total = len(sampled_chunks)
n_simple = int(n_total * 0.40)
n_reasoning = int(n_total * 0.25)
n_multi = int(n_total * 0.20)
n_unanswerable = n_total - n_simple - n_reasoning - n_multi

print(f"🎯 Target: {n_simple} simple, {n_reasoning} reasoning, "
      f"{n_multi} multi-context, {n_unanswerable} unanswerable")

generated_pairs = []
idx = 0

# Simple questions
print("\n📗 Generating Simple questions...")
for i in range(n_simple):
    chunk = sampled_chunks[idx % len(sampled_chunks)]
    idx += 1
    print(f"  [{i+1}/{n_simple}] {chunk['section']}...", end=" ")
    qa = generate_simple_question(chunk, generator_llm)
    if qa:
        qa["source_chunks"] = [chunk]
        qa["answerable"] = True
        generated_pairs.append(qa)
        print("✅")
    else:
        print("❌")

# Reasoning questions
print("\n🧠 Generating Reasoning questions...")
for i in range(n_reasoning):
    chunk = sampled_chunks[idx % len(sampled_chunks)]
    idx += 1
    print(f"  [{i+1}/{n_reasoning}] {chunk['section']}...", end=" ")
    qa = generate_reasoning_question(chunk, generator_llm)
    if qa:
        qa["source_chunks"] = [chunk]
        qa["answerable"] = True
        generated_pairs.append(qa)
        print("✅")
    else:
        print("❌")

# Multi-context questions
print("\n🔗 Generating Multi-context questions...")
for i in range(n_multi):
    c1 = sampled_chunks[idx % len(sampled_chunks)]
    idx += 1
    # Pick a second chunk from a DIFFERENT chapter
    others = [c for c in sampled_chunks if c["chapter"] != c1["chapter"]]
    c2 = random.choice(others) if others else sampled_chunks[(idx + 1) % len(sampled_chunks)]
    print(f"  [{i+1}/{n_multi}] {c1['section']} + {c2['section']}...", end=" ")
    qa = generate_multi_context_question(c1, c2, generator_llm)
    if qa:
        qa["source_chunks"] = [c1, c2]
        qa["answerable"] = True
        generated_pairs.append(qa)
        print("✅")
    else:
        print("❌")

# Unanswerable questions
print("\n🚫 Generating Unanswerable questions...")
for i in range(n_unanswerable):
    chunk = sampled_chunks[idx % len(sampled_chunks)]
    idx += 1
    print(f"  [{i+1}/{n_unanswerable}] {chunk['section']}...", end=" ")
    qa = generate_unanswerable_question(chunk, generator_llm)
    if qa:
        qa["source_chunks"] = [chunk]
        qa["answerable"] = False
        generated_pairs.append(qa)
        print("✅")
    else:
        print("❌")

print(f"\n✅ Generated {len(generated_pairs)} question-answer pairs")

# %% [markdown]
# ## Step 4: Ground Truth Synthesis
# Generate "perfect" answers using ONLY the source chunks as context.

# %%
def generate_ground_truth(qa_pair, llm):
    """Generate a ground truth answer with evidence sentences."""

    source_texts = "\n\n---\n\n".join([c["text"][:2000] for c in qa_pair["source_chunks"]])

    if not qa_pair["answerable"]:
        # For unanswerable questions, ground truth is the refusal
        qa_pair["ground_truth"] = (
            "The provided textbook sections do not contain sufficient "
            "information to answer this question."
        )
        qa_pair["evidence_sentences"] = []
        return qa_pair

    prompt = f"""You are a textbook expert. Answer the following question using ONLY the 
provided textbook passages. Your answer must be comprehensive and accurate.

Question: {qa_pair['question']}

Textbook Passages:
{source_texts}

Provide your response as JSON:
{{
    "ground_truth": "Your detailed, accurate answer based only on the passages above.",
    "evidence_sentences": [
        "Exact sentence or phrase from the passage that supports your answer.",
        "Another supporting sentence from the passage."
    ]
}}

Rules:
- Include 2-4 evidence sentences copied EXACTLY from the passages
- The answer must be FULLY supported by the evidence sentences
- Do NOT add any information not in the passages

Respond with ONLY the JSON, no other text."""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        result = json.loads(response.content)
        qa_pair["ground_truth"] = result["ground_truth"]
        qa_pair["evidence_sentences"] = result.get("evidence_sentences", [])
        return qa_pair
    except Exception as e:
        print(f"  ⚠️ Error generating ground truth: {e}")
        qa_pair["ground_truth"] = None
        qa_pair["evidence_sentences"] = []
        return qa_pair

# %%
print("📝 Generating ground truth answers...")
for i, qa in enumerate(generated_pairs):
    print(f"  [{i+1}/{len(generated_pairs)}] {qa['question_type']}: "
          f"{qa['question'][:60]}...", end=" ")

    qa = generate_ground_truth(qa, generator_llm)

    if qa["ground_truth"]:
        print("✅")
    else:
        print("❌")

# Remove failed entries
generated_pairs = [qa for qa in generated_pairs if qa.get("ground_truth")]
print(f"\n✅ Ground truth generated for {len(generated_pairs)} pairs")

# %% [markdown]
# ## Step 5: Quality Filtering (Two-Pass LLM-as-Judge)

# %%
def quality_filter(qa_pair, judge_llm):
    """Two-pass quality check using LLM-as-judge."""

    source_texts = "\n\n".join([c["text"][:1500] for c in qa_pair["source_chunks"]])

    if not qa_pair["answerable"]:
        # For unanswerable: just check the question is clear
        prompt = f"""Evaluate this question for clarity and plausibility:
Question: {qa_pair['question']}
Related Context: {source_texts[:500]}

Score 1-5:
1. clarity: Is the question clear and unambiguous?
2. plausibility: Does it sound like a real student question?
3. unanswerable: Is it truly NOT answerable from the context?

Return JSON: {{"clarity": N, "plausibility": N, "unanswerable": N}}
Respond with ONLY JSON."""

        try:
            response = judge_llm.invoke([HumanMessage(content=prompt)])
            scores = json.loads(response.content)
            qa_pair["quality_scores"] = scores
            return (
                scores.get("clarity", 0) >= 3 and
                scores.get("plausibility", 0) >= 3 and
                scores.get("unanswerable", 0) >= 4
            )
        except Exception:
            return True  # Keep on error

    # For answerable questions: full two-pass check
    prompt = f"""Evaluate this question-answer pair for quality:

Question: {qa_pair['question']}
Answer: {qa_pair['ground_truth']}
Source Context: {source_texts[:2000]}

Score each criterion 1-5 (1=terrible, 5=perfect):

1. answerable: Can this question be fully answered from the context?
2. grounded: Is the answer 100% based on the context (no external info)?
3. difficulty: How challenging is this question? (1=trivial, 5=expert-level)
4. clarity: Is the question clear and unambiguous?
5. completeness: Does the answer fully address the question?

Return JSON:
{{"answerable": N, "grounded": N, "difficulty": N, "clarity": N, "completeness": N}}
Respond with ONLY JSON."""

    try:
        response = judge_llm.invoke([HumanMessage(content=prompt)])
        scores = json.loads(response.content)
        qa_pair["quality_scores"] = scores

        passes = (
            scores.get("answerable", 0) >= 4 and
            scores.get("grounded", 0) >= 4 and
            scores.get("difficulty", 0) >= 2 and   # Drop trivial
            scores.get("clarity", 0) >= 3 and
            scores.get("completeness", 0) >= 3
        )
        return passes
    except Exception as e:
        print(f"  ⚠️ Judge error: {e}")
        return True  # Keep on error

# %%
print("🔍 Running quality filter...")
filtered_pairs = []
rejected = 0

for i, qa in enumerate(generated_pairs):
    print(f"  [{i+1}/{len(generated_pairs)}] {qa['question'][:50]}...", end=" ")

    passes = quality_filter(qa, judge_llm)

    if passes:
        filtered_pairs.append(qa)
        scores = qa.get("quality_scores", {})
        print(f"✅ (scores: {scores})")
    else:
        rejected += 1
        scores = qa.get("quality_scores", {})
        print(f"❌ REJECTED (scores: {scores})")

print(f"\n✅ Passed: {len(filtered_pairs)} | ❌ Rejected: {rejected}")

# %% [markdown]
# ## Step 6: Dataset Formatting — Export Rich JSONL

# %%
def format_dataset(filtered_pairs):
    """Format into the final golden dataset schema."""
    dataset = []

    for i, qa in enumerate(filtered_pairs):
        entry = {
            "id": f"gt_{i+1:03d}",
            "question": qa["question"],
            "ground_truth": qa["ground_truth"],
            "evidence_sentences": qa.get("evidence_sentences", []),
            "golden_context_ids": [c["parent_id"] for c in qa["source_chunks"]],
            "relevant_sections": list(set(
                c["section"] for c in qa["source_chunks"]
            )),
            "relevant_pages": sorted(set(
                p for c in qa["source_chunks"]
                for p in range(
                    c.get("page_start") or 0,
                    (c.get("page_end") or 0) + 1
                )
                if p > 0
            )),
            "relevant_chapters": list(set(
                c["chapter"] for c in qa["source_chunks"]
            )),
            "question_type": qa["question_type"],
            "answerable": qa["answerable"],
            "difficulty": qa.get("quality_scores", {}).get("difficulty", None),
            "quality_scores": qa.get("quality_scores", {}),
        }
        dataset.append(entry)

    return dataset


golden_dataset = format_dataset(filtered_pairs)

# Save as JSONL
output_path = "../docs/golden_dataset.jsonl"
with open(output_path, "w", encoding="utf-8") as f:
    for entry in golden_dataset:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

# Also save as regular JSON for easy reading
output_json = "../docs/golden_dataset.json"
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(golden_dataset, f, indent=2, ensure_ascii=False)

print(f"✅ Golden dataset saved!")
print(f"   📄 JSONL: {output_path}")
print(f"   📄 JSON:  {output_json}")
print(f"   📊 Total entries: {len(golden_dataset)}")

# %% [markdown]
# ## Step 7: Dataset Statistics & Summary

# %%
from collections import Counter

types = Counter(e["question_type"] for e in golden_dataset)
answerable = sum(1 for e in golden_dataset if e["answerable"])
chapters = Counter(ch for e in golden_dataset for ch in e["relevant_chapters"])
difficulties = [e["difficulty"] for e in golden_dataset if e["difficulty"]]

print("=" * 60)
print("📊 GOLDEN DATASET SUMMARY")
print("=" * 60)
print(f"\nTotal entries: {len(golden_dataset)}")
print(f"Answerable:    {answerable}")
print(f"Unanswerable:  {len(golden_dataset) - answerable}")

print(f"\n📋 Question Type Distribution:")
for qtype, count in types.most_common():
    pct = count / len(golden_dataset) * 100
    bar = "█" * int(pct / 2)
    print(f"  {qtype:15s} {count:3d} ({pct:5.1f}%) {bar}")

print(f"\n📖 Chapter Coverage:")
for chapter, count in chapters.most_common():
    print(f"  {chapter}: {count} questions")

if difficulties:
    avg_diff = sum(difficulties) / len(difficulties)
    print(f"\n🎯 Average Difficulty: {avg_diff:.2f} / 5.0")

print("\n" + "=" * 60)

# %% [markdown]
# ## Preview: Sample Entries

# %%
for entry in golden_dataset[:5]:
    print(f"\n{'─' * 60}")
    print(f"ID:       {entry['id']}")
    print(f"Type:     {entry['question_type']}")
    print(f"Question: {entry['question']}")
    print(f"Answer:   {entry['ground_truth'][:150]}...")
    print(f"Sections: {entry['relevant_sections']}")
    print(f"Pages:    {entry['relevant_pages']}")
    print(f"Scores:   {entry['quality_scores']}")
