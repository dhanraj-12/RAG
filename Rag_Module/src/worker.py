"""
Redis job queue worker.

Consumes RAG pipeline jobs from a Redis list (BLPOP),
processes them, and writes results back keyed by job ID.

Supports two job types:
  - query:     Run RAG pipeline (default)
  - ingestion: Load marker-pdf, process PDF, unload to free VRAM

Job Format (pushed by Node.js backend):
    {"job_id": "uuid", "query": "user question"}
    {"job_id": "uuid", "type": "ingestion", "file_path": "/path/to/doc.pdf"}

Status transitions: queued → processing → completed / failed
"""

import json
import signal
import logging
import time
import redis
from src.config import Settings
from src.pipeline import RAGPipeline
from src.model_manager import ModelManager

logger = logging.getLogger(__name__)


class Worker:
    """
    Redis job queue consumer for the RAG pipeline.

    Listens on a Redis list for incoming jobs, processes them
    through the RAG pipeline, and writes results back to Redis.
    """

    def __init__(
        self,
        pipeline: RAGPipeline,
        settings: Settings,
        model_manager: ModelManager = None,
    ):
        self.pipeline = pipeline
        self.settings = settings
        self.models = model_manager
        self._running = False

        # Redis connection for job queue
        self.redis = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            password=settings.REDIS_PASSWORD or None,
            decode_responses=True,
        )

        try:
            self.redis.ping()
            logger.info(
                f"✅ Worker connected to Redis at "
                f"{settings.REDIS_HOST}:{settings.REDIS_PORT}"
            )
        except redis.ConnectionError:
            raise ConnectionError(
                f"Cannot connect to Redis at "
                f"{settings.REDIS_HOST}:{settings.REDIS_PORT}"
            )

        # Optional cache
        self.cache = None
        if settings.CACHE_ENABLED:
            try:
                from src.cache import QueryCache
                embeddings = self.models.get_embeddings() if self.models else None
                if embeddings:
                    self.cache = QueryCache(embeddings, settings)
                    logger.info("✅ Query cache enabled.")
            except Exception as e:
                logger.warning(f"Cache init failed, continuing without: {e}")

    def _set_job_status(self, job_id: str, status: str, data: dict = None) -> None:
        """Update the status of a job in Redis."""
        key = f"{self.settings.JOB_RESULT_PREFIX}{job_id}"
        payload = {"status": status}
        if data:
            payload.update(data)

        self.redis.setex(
            key,
            self.settings.JOB_RESULT_TTL,
            json.dumps(payload),
        )

    def _process_query_job(self, job_id: str, query: str) -> None:
        """Process a RAG query job."""
        logger.info(f"📋 Query job {job_id}: \"{query[:80]}\"")
        self._set_job_status(job_id, "processing")

        try:
            # Check cache first
            if self.cache:
                cached = self.cache.get(query)
                if cached:
                    result = {k: v for k, v in cached.items() if not k.startswith("_")}
                    self._set_job_status(job_id, "completed", {"result": result})
                    logger.info(f"✅ Job {job_id} completed (cached).")
                    return

            # Run pipeline
            result = self.pipeline.query(query)

            # Cache the result
            if self.cache:
                self.cache.put(query, result)

            self._set_job_status(job_id, "completed", {"result": result})
            logger.info(f"✅ Job {job_id} completed.")

        except Exception as e:
            logger.exception(f"❌ Job {job_id} failed: {e}")
            self._set_job_status(job_id, "failed", {"error": str(e)})

    def _process_ingestion_job(self, job_id: str, file_path: str) -> None:
        """Process a document ingestion job (load marker-pdf, process, unload)."""
        logger.info(f"📄 Ingestion job {job_id}: {file_path}")
        self._set_job_status(job_id, "processing")

        if not self.models:
            self._set_job_status(job_id, "failed", {"error": "ModelManager not available"})
            return

        try:
            # Load heavy ingestion model on demand
            converter = self.models.get_ingestion_converter()

            # Convert PDF
            logger.info(f"Converting {file_path} to markdown...")
            rendered = converter(file_path)
            markdown_text = rendered.markdown

            self._set_job_status(job_id, "completed", {
                "result": {
                    "markdown": markdown_text,
                    "pages": len(rendered.pages) if hasattr(rendered, 'pages') else 0,
                }
            })
            logger.info(f"✅ Ingestion job {job_id} completed.")

        except Exception as e:
            logger.exception(f"❌ Ingestion job {job_id} failed: {e}")
            self._set_job_status(job_id, "failed", {"error": str(e)})

        finally:
            # Always unload heavy models to free VRAM
            self.models.unload_ingestion_models()

    def _process_job(self, job_data: dict) -> None:
        """Route a job to the appropriate handler."""
        job_id = job_data.get("job_id")
        job_type = job_data.get("type", "query")

        if not job_id:
            logger.error(f"Invalid job data (missing job_id): {job_data}")
            return

        if job_type == "ingestion":
            file_path = job_data.get("file_path")
            if not file_path:
                self._set_job_status(job_id, "failed", {"error": "Missing file_path"})
                return
            self._process_ingestion_job(job_id, file_path)

        else:  # default: query
            query = job_data.get("query")
            if not query:
                self._set_job_status(job_id, "failed", {"error": "Missing query"})
                return
            self._process_query_job(job_id, query)

    def start(self) -> None:
        """
        Start the worker loop (BLPOP on Redis list).
        Handles graceful shutdown via SIGINT/SIGTERM.
        """
        self._running = True

        def _shutdown(signum, _frame):
            sig_name = signal.Signals(signum).name
            logger.info(f"Received {sig_name}, shutting down gracefully...")
            self._running = False

        signal.signal(signal.SIGINT, _shutdown)
        signal.signal(signal.SIGTERM, _shutdown)

        logger.info("=" * 60)
        logger.info(f"🚀 Worker listening on '{self.settings.JOB_QUEUE_KEY}'...")
        logger.info("   Press Ctrl+C to stop.")
        logger.info("=" * 60)

        while self._running:
            try:
                result = self.redis.blpop(self.settings.JOB_QUEUE_KEY, timeout=1)

                if result is None:
                    continue

                _queue_name, raw_job = result

                try:
                    job_data = json.loads(raw_job)
                except json.JSONDecodeError as e:
                    logger.error(f"Bad job JSON: {e} | Raw: {raw_job}")
                    continue

                self._process_job(job_data)

            except redis.ConnectionError as e:
                logger.error(f"Redis connection lost: {e}. Retrying in 5s...")
                time.sleep(5)

            except Exception as e:
                if self._running:
                    logger.exception(f"Worker loop error: {e}")

        logger.info("Worker stopped.")
