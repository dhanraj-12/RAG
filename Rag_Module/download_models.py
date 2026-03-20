"""
Model Download Script.

Pre-downloads all required models to local disk (~/.cache/huggingface)
so that the main pipeline can load them instantly without network access.

Usage:
    python download_models.py
    python download_models.py --models embeddings reranker
    python download_models.py --models all

No GPU required — this only downloads files to SSD.
"""

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

MODELS = {
    "embeddings": {
        "name": "BAAI/bge-m3",
        "size": "~2.3 GB",
        "desc": "BGE-M3 embedding model",
    },
    "reranker": {
        "name": "BAAI/bge-reranker-large",
        "size": "~1.3 GB",
        "desc": "BGE cross-encoder reranker",
    },
    "marker": {
        "name": "marker-pdf",
        "size": "~3-4 GB",
        "desc": "PDF to Markdown converter models",
    },
}


def download_embeddings():
    """Download the BGE-M3 embedding model."""
    logger.info("📥 Downloading BGE-M3 embeddings (~2.3 GB)...")
    from sentence_transformers import SentenceTransformer
    SentenceTransformer("BAAI/bge-m3")
    logger.info("✅ BGE-M3 downloaded.")


def download_reranker():
    """Download the BGE cross-encoder reranker model."""
    logger.info("📥 Downloading BGE-reranker-large (~1.3 GB)...")
    from sentence_transformers import CrossEncoder
    CrossEncoder("BAAI/bge-reranker-large")
    logger.info("✅ BGE-reranker-large downloaded.")


def download_marker():
    """Download marker-pdf conversion models."""
    logger.info("📥 Downloading marker-pdf models (~3-4 GB)...")
    try:
        from marker.converters.pdf import PdfConverter
        from marker.config.parser import ConfigParser

        config_parser = ConfigParser({"output_format": "markdown"})
        converter = PdfConverter(config=config_parser.generate_config_dict())
        del converter
        logger.info("✅ marker-pdf models downloaded.")
    except ImportError:
        logger.warning(
            "⚠️  marker-pdf not installed. Install with: pip install marker-pdf"
        )
        logger.warning("   Skipping marker-pdf download.")


def main():
    parser = argparse.ArgumentParser(
        description="Download models for the RAG pipeline (no GPU required)."
    )
    parser.add_argument(
        "--models",
        nargs="+",
        choices=["embeddings", "reranker", "marker", "all"],
        default=["all"],
        help="Which models to download (default: all)",
    )
    args = parser.parse_args()

    targets = args.models
    if "all" in targets:
        targets = ["embeddings", "reranker", "marker"]

    logger.info("=" * 50)
    logger.info("Model Download Script")
    logger.info(f"Targets: {', '.join(targets)}")
    logger.info("=" * 50)

    downloaders = {
        "embeddings": download_embeddings,
        "reranker": download_reranker,
        "marker": download_marker,
    }

    failed = []
    for target in targets:
        try:
            downloaders[target]()
        except Exception as e:
            logger.error(f"❌ Failed to download {target}: {e}")
            failed.append(target)

    print()
    if failed:
        logger.error(f"Failed: {', '.join(failed)}")
        sys.exit(1)
    else:
        logger.info("🎉 All models downloaded successfully!")
        logger.info("You can now start the pipeline with: python main.py")


if __name__ == "__main__":
    main()
