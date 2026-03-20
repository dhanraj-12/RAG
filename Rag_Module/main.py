"""
RAG Module — Entry Point

Supports multiple modes:
    python main.py                                    # Start Redis worker
    python main.py --query "What is conditioning?"    # Single query via CLI
    python main.py --download                         # Download models
    python main.py --download --models embeddings     # Download specific model
"""

import argparse
import json
import logging
import sys
import textwrap


def setup_logging() -> None:
    """Configure logging format and level."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


def run_worker(settings):
    """Start the Redis job queue worker."""
    from src.model_manager import ModelManager
    from src.pipeline import RAGPipeline
    from src.worker import Worker

    logger = logging.getLogger(__name__)

    logger.info("Initializing model manager...")
    model_manager = ModelManager(settings)

    logger.info("Creating RAG pipeline (lazy — models load on first query)...")
    pipeline = RAGPipeline(settings, model_manager)

    logger.info("Starting worker...")
    worker = Worker(pipeline, settings, model_manager)
    worker.start()


def run_query(settings, question: str):
    """Run a single query via CLI and print the result."""
    from src.model_manager import ModelManager
    from src.pipeline import RAGPipeline

    logger = logging.getLogger(__name__)

    model_manager = ModelManager(settings)
    pipeline = RAGPipeline(settings, model_manager)

    logger.info(f"Running query: {question}")
    result = pipeline.query(question)

    # Pretty print the result
    print("\n" + "=" * 80)
    print("📘 ANSWER".center(80))
    print("=" * 80 + "\n")

    print(textwrap.fill(result.get("answer", "No answer"), width=80))

    citations = result.get("citations", [])
    if citations:
        print("\n" + "-" * 80)
        print("📚 SOURCES".center(80))
        print("-" * 80 + "\n")

        for idx, c in enumerate(citations, 1):
            print(f"  {idx}. {c.get('source_tag', '')}")
            print(f"     📖 Chapter : {c.get('chapter', 'N/A')}")
            print(f"     📑 Section : {c.get('section', 'N/A')}")
            print(f"     🏷️  Title   : {c.get('section_name', 'N/A')}")
            print(f"     📄 Pages   : {c.get('page_start', 'N/A')} - {c.get('page_end', 'N/A')}")
            print()

    print("=" * 80)

    # Also output raw JSON for piping
    print("\n📋 Raw JSON:")
    print(json.dumps(result, indent=2, ensure_ascii=False))


def run_download(models: list):
    """Download specified models."""
    # Delegate to download_models.py
    import download_models
    sys.argv = ["download_models.py", "--models"] + models
    download_models.main()


def main():
    parser = argparse.ArgumentParser(
        description="RAG Module — Retrieval-Augmented Generation Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python main.py                                  Start Redis worker
              python main.py --query "What is memory?"        Run single query
              python main.py --download                       Download all models
              python main.py --download --models embeddings   Download specific model
        """),
    )

    parser.add_argument(
        "--query", "-q",
        type=str,
        help="Run a single query and print the result.",
    )
    parser.add_argument(
        "--download", "-d",
        action="store_true",
        help="Download models to local disk.",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        choices=["embeddings", "reranker", "marker", "all"],
        default=["all"],
        help="Which models to download (used with --download).",
    )

    args = parser.parse_args()

    setup_logging()

    if args.download:
        run_download(args.models)
        return

    # Load config for query/worker modes
    from src.config import Settings
    settings = Settings()

    if args.query:
        run_query(settings, args.query)
    else:
        run_worker(settings)


if __name__ == "__main__":
    main()
