"""
Vector store and parent document store loaders.

Handles ChromaDB vector store initialization, parent document
store loading, and BM25 index construction.
"""

import logging
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_classic.storage import LocalFileStore, create_kv_docstore
from langchain_classic.retrievers import BM25Retriever
from langchain_classic.schema import Document
from src.config import Settings

logger = logging.getLogger(__name__)


def load_vectorstore(embeddings: HuggingFaceEmbeddings, settings: Settings) -> Chroma:
    """
    Load the persisted ChromaDB vector store.

    Args:
        embeddings: Initialized embedding model.
        settings: Application settings with Chroma paths.

    Returns:
        Initialized Chroma vector store instance.
    """
    logger.info(
        f"Loading ChromaDB from '{settings.CHROMA_PERSIST_DIR}' "
        f"(collection: '{settings.CHROMA_COLLECTION_NAME}')..."
    )

    vectorstore = Chroma(
        collection_name=settings.CHROMA_COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=settings.CHROMA_PERSIST_DIR,
    )

    logger.info("✅ ChromaDB loaded successfully.")
    return vectorstore


def load_parent_store(settings: Settings) -> LocalFileStore:
    """
    Load the persistent parent document store.

    Args:
        settings: Application settings with parent store path.

    Returns:
        LocalFileStore instance for parent document retrieval.
    """
    logger.info(f"Loading parent store from '{settings.PARENT_STORE_DIR}'...")

    store = LocalFileStore(settings.PARENT_STORE_DIR)

    logger.info("✅ Parent store loaded successfully.")
    return store


def build_bm25_index(vectorstore: Chroma) -> BM25Retriever:
    """
    Extract all child chunks from ChromaDB and build a BM25 index.

    This reconstructs LangChain Document objects from ChromaDB data
    so BM25 can operate on them for keyword-based retrieval.

    Args:
        vectorstore: Initialized Chroma vector store.

    Returns:
        BM25Retriever instance built from all child chunks.
    """
    logger.info("Building BM25 index from ChromaDB child chunks...")

    chroma_data = vectorstore.get()

    child_chunks = []
    for i in range(len(chroma_data["documents"])):
        doc = Document(
            page_content=chroma_data["documents"][i],
            metadata=chroma_data["metadatas"][i] if chroma_data["metadatas"] else {},
        )
        child_chunks.append(doc)

    logger.info(f"Loaded {len(child_chunks)} child chunks from ChromaDB.")

    bm25_retriever = BM25Retriever.from_documents(child_chunks)

    logger.info("✅ BM25 index built successfully.")
    return bm25_retriever
