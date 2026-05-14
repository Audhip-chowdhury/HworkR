"""Vertex AI: embeddings (TextEmbeddingModel) + Gemini JSON generation for Legal RAG."""

from __future__ import annotations

import json
import logging
import random
import time
from typing import Any

from google.api_core import exceptions as google_exceptions

from app.config import settings

logger = logging.getLogger(__name__)

# Vertex may return 429 as ResourceExhausted or TooManyRequests (api_core version-dependent).
_EMBED_RETRYABLE: tuple[type[BaseException], ...] = (google_exceptions.ResourceExhausted,)
if hasattr(google_exceptions, "TooManyRequests"):
    _EMBED_RETRYABLE = _EMBED_RETRYABLE + (google_exceptions.TooManyRequests,)

_vertex_inited: bool = False


def _ensure_vertex() -> None:
    global _vertex_inited
    if _vertex_inited:
        return
    if not settings.gcp_project_id.strip():
        raise RuntimeError(
            "Vertex AI is not configured: set GCP_PROJECT_ID, or set GCP_CREDENTIALS_PATH / "
            "GOOGLE_APPLICATION_CREDENTIALS to a service account JSON (project_id is read from the file if omitted).",
        )
    import vertexai  # type: ignore[import-untyped]

    vertexai.init(project=settings.gcp_project_id.strip(), location=settings.gcp_location.strip())
    _vertex_inited = True


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return embedding vectors for each input string (Vertex ``TextEmbeddingModel``).

    Retries with exponential backoff on rate limits (429 / RESOURCE_EXHAUSTED).
    For large ingests, use small batches (``legal_rag_embed_batch_size``) and spacing in the caller.
    """
    if not texts:
        return []
    _ensure_vertex()
    from vertexai.language_models import TextEmbeddingModel  # type: ignore[import-untyped]

    model = TextEmbeddingModel.from_pretrained(settings.legal_rag_embedding_model)
    max_retries = max(1, settings.legal_rag_embed_max_retries)
    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            embeddings = model.get_embeddings(texts)
            return [list(e.values) for e in embeddings]
        except _EMBED_RETRYABLE as e:
            last_err = e
        wait = min(120.0, (2**attempt) * 0.75 + random.uniform(0, 0.6))
        logger.warning(
            "Vertex embedding rate limited (batch size=%s, attempt %s/%s); retry in %.1fs",
            len(texts),
            attempt + 1,
            max_retries,
            wait,
        )
        time.sleep(wait)
    assert last_err is not None
    raise last_err


def generate_legal_json_response(*, system_instruction: str, user_content: str) -> dict[str, Any]:
    """Call Gemini on Vertex; response must be JSON (answer + citations)."""
    _ensure_vertex()
    from vertexai.generative_models import (  # type: ignore[import-untyped]
        GenerationConfig,
        GenerativeModel,
    )

    model = GenerativeModel(settings.legal_rag_llm_model, system_instruction=system_instruction)
    resp = model.generate_content(
        user_content,
        generation_config=GenerationConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )
    raw = (resp.text or "").strip()
    if not raw:
        raise RuntimeError("Empty response from language model")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("LLM returned non-JSON: %s", raw[:500])
        raise RuntimeError("Model returned invalid JSON") from e
