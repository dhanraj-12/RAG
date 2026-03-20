"""
LLM initialization and multimodal answer generation.

Handles NVIDIA NIM API client setup and the final answer generation
step that assembles context with images and produces a JSON response.
"""

import os
import re
import base64
import logging
import textwrap
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage
from src.config import Settings

logger = logging.getLogger(__name__)


def init_llms(settings: Settings) -> tuple[ChatNVIDIA, ChatNVIDIA]:
    """
    Initialize text and vision LLM clients via NVIDIA NIM API.

    Args:
        settings: Application settings with API key and model names.

    Returns:
        Tuple of (text_llm, vision_llm) ChatNVIDIA instances.
    """
    if settings.NVIDIA_API_KEY:
        os.environ["NVIDIA_API_KEY"] = settings.NVIDIA_API_KEY

    logger.info(f"Initializing text LLM: {settings.LLM_MODEL}...")
    llm = ChatNVIDIA(
        model=settings.LLM_MODEL,
        temperature=settings.LLM_TEMPERATURE,
        max_tokens=settings.LLM_MAX_TOKENS,
    )

    logger.info(f"Initializing vision LLM: {settings.VISION_LLM_MODEL}...")
    vision_llm = ChatNVIDIA(
        model=settings.VISION_LLM_MODEL,
        temperature=settings.LLM_TEMPERATURE,
        max_completion_tokens=settings.LLM_MAX_TOKENS,
    )

    logger.info("✅ LLMs initialized successfully.")
    return llm, vision_llm


def encode_image_to_base64(image_path: str) -> str:
    """Encode an image file to a base64 string."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def generate_final_answer(
    query: str, parent_docs: list[dict], vision_llm_client: ChatNVIDIA
) -> str:
    """
    Generate the final answer using a vision LLM with assembled context.

    Constructs a detailed prompt with textbook excerpts and embedded images,
    then invokes the vision LLM to produce a JSON response with inline
    citations.

    Args:
        query: The user's question.
        parent_docs: List of parent document dicts with text and metadata.
        vision_llm_client: Initialized vision LLM client.

    Returns:
        Raw JSON string from the LLM containing answer and citations.
    """
    formatted_contexts = []

    for i, doc in enumerate(parent_docs):
        source_tag = f"[Source {i + 1}]"
        meta_line = (
            f"Chapter: {doc['chapter']} | Section: {doc['section']} "
            f"| Title: {doc['section_title']} | Pages: {doc['page_start']}-{doc['page_end']}"
        )
        formatted_contexts.append(
            f"--- {source_tag} ({meta_line}) ---\n{doc['text']}\n"
        )

    combined_context = "\n".join(formatted_contexts)
    image_paths = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", combined_context)

    json_schema = textwrap.dedent("""\
    {
      "answer": "Detailed answer string with inline citations like [Source 1].",
      "citations": [
        {
          "source_tag": "[Source 1]",
          "chapter": "Chapter name",
          "section": "Section number",
          "section_name": "Title of the section",
          "page_start": 1,
          "page_end": 2
        }
      ]
    }""")

    system_prompt = f"""You are an expert academic assistant. Your task is to answer the user's question based strictly on the provided textbook excerpts and any attached images.

### Rules:
1. **Rely Only on Context:** Base your answer entirely on the provided text and images. Do not use outside knowledge.
2. **Handle Missing Info:** If the provided context does not contain the answer, explicitly state: "The retrieved sections of the textbook do not contain enough information to answer this." Do not hallucinate.
3. **Synthesize Visuals:** If an image is provided alongside the text, analyze the raw image and reference its specific details to support your text-based answer.
4. **MANDATORY INLINE CITATIONS:** Every factual claim in your answer MUST be followed by the exact source tag indicating where you found the information (e.g., "Neurons transmit electrical signals [Source 1].").
5. **Structure:** Give all the answer in the given JSON Format.

### JSON Schema:
{json_schema}

### Textbook Context:
{combined_context}

### User Question:
{query}

Answer:"""

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

    logger.info(
        f"Generating answer with {len(parent_docs)} context sources "
        f"and {len(image_paths)} images..."
    )

    response = vision_llm_client.invoke([HumanMessage(content=message_content)])
    return response.content
