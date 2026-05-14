#!/usr/bin/env python3
"""
Ingest Indian labour law PDFs/text into ChromaDB for Legal RAG.

Run from the ``backend`` directory::

    python -m scripts.ingest_legal_docs
    python -m scripts.ingest_legal_docs --reset

Reads legal files **recursively** from the default India corpus dirs (see below), or from
``--source-dir`` when you pass a path. Optional sidecar metadata:
``<stem>.meta.json`` next to each document with keys ``act``, ``section`` (strings).

**Default search roots** (both are used when they exist and are different paths):

1. **Repository:** ``<repo>/data/legal/india/`` (e.g. ``priority_1/*.pdf``)
2. **Backend copy:** ``backend/data/legal/india/`` (docs + README for contributors)

``README.md`` and ``.gitkeep`` are never embedded as corpus text.

Environment: same as the API (``GCP_CREDENTIALS_PATH`` or ``GOOGLE_APPLICATION_CREDENTIALS`` for the service
account JSON, optional ``GCP_PROJECT_ID``, ``GCP_LOCATION``, Chroma paths from Settings).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND.parent
# Many teams store PDFs at repo root ``data/legal/india``; README lives under ``backend/data/legal/india``.
REPO_LEGAL_INDIA = _REPO_ROOT / "data" / "legal" / "india"
BACKEND_LEGAL_INDIA = _BACKEND / "data" / "legal" / "india"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import tiktoken  # noqa: E402
from pypdf import PdfReader  # noqa: E402

from app.config import settings  # noqa: E402
from app.services.llm_client import embed_texts  # noqa: E402

import chromadb  # noqa: E402

CHUNK_MAX = 500
CHUNK_OVERLAP = 50
_SKIP_CORPUS_NAMES = frozenset({"readme.md", ".gitkeep"})


def _read_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text() or ""
            parts.append(t)
        return "\n\n".join(parts)
    if path.suffix.lower() in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="replace")
    return ""


def _load_meta(path: Path) -> dict[str, str]:
    meta_path = path.parent / f"{path.stem}.meta.json"
    if not meta_path.is_file():
        return {}
    try:
        raw = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k in ("act", "section"):
        v = raw.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()
    return out


def chunk_text(text: str, *, max_tokens: int, overlap: int) -> list[str]:
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    if not tokens:
        return []
    step = max(1, max_tokens - overlap)
    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        piece = tokens[start : start + max_tokens]
        chunks.append(enc.decode(piece))
        start += step
    return chunks


def _collect_files_in_root(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.name.lower() in _SKIP_CORPUS_NAMES:
            continue
        if p.suffix.lower() in {".pdf", ".txt", ".md"}:
            out.append(p)
    return out


def default_legal_india_roots() -> list[tuple[Path, str]]:
    """(absolute_dir, short_scope) for stable chunk ids when multiple roots are merged."""
    roots: list[tuple[Path, str]] = []
    try:
        repo = REPO_LEGAL_INDIA.resolve()
    except OSError:
        repo = REPO_LEGAL_INDIA
    try:
        back = BACKEND_LEGAL_INDIA.resolve()
    except OSError:
        back = BACKEND_LEGAL_INDIA
    if repo.is_dir():
        roots.append((repo, "repo"))
    if back.is_dir() and back != repo:
        roots.append((back, "backend"))
    if not roots:
        roots.append((back, "backend"))
    return roots
def _top_level_folder(rel_posix: str) -> str:
    """First path segment under the ingest root (e.g. ``acts/wages.pdf`` → ``acts``)."""
    parts = rel_posix.split("/")
    return parts[0] if len(parts) > 1 else "_root"


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest legal docs into Chroma (india_legal).")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=None,
        help="Ingest only this directory. If omitted, ingests repo ``data/legal/india`` and "
        "``backend/data/legal/india`` when both exist.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete the Chroma collection and recreate before ingest.",
    )
    args = parser.parse_args()

    if not settings.gcp_project_id.strip():
        raise SystemExit(
            "GCP_PROJECT_ID is required for Vertex embeddings, unless set implicitly via "
            "GCP_CREDENTIALS_PATH / GOOGLE_APPLICATION_CREDENTIALS (project_id read from the JSON file).",
        )

    if args.source_dir is not None:
        root = args.source_dir.resolve()
        if not root.is_dir():
            raise SystemExit(f"Source directory not found: {root}")
        source_roots = [(root, "custom")]
        print(f"Source (single): {root}")
    else:
        source_roots = default_legal_india_roots()
        print(
            "Source roots (default): "
            + ", ".join(f"{scope}={path}" for path, scope in source_roots),
        )

    persist = Path(settings.legal_rag_chroma_persist_dir).resolve()
    persist.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist))
    name = settings.legal_rag_collection
    if args.reset:
        try:
            client.delete_collection(name)
            print(f"Deleted collection {name!r}.")
        except Exception:
            pass
    collection = client.get_or_create_collection(name=name)

    files_scoped: list[tuple[Path, str, str, str]] = []
    for root, scope in source_roots:
        if not root.is_dir():
            continue
        for p in _collect_files_in_root(root):
            rel = p.relative_to(root).as_posix()
            logical = f"{scope}/{rel}" if scope != "custom" else rel
            files_scoped.append((p, rel, logical, scope))

    if not files_scoped:
        print("No .pdf/.txt/.md corpus files found under configured roots. Add PDFs under data/legal/india/ …")
        return

    by_folder: Counter[str] = Counter()
    for _p, rel0, _logical, _scope in files_scoped:
        by_folder[_top_level_folder(rel0)] += 1
    print(f"Found {len(files_scoped)} corpus file(s); top-level folder keys (within each root): {dict(sorted(by_folder.items()))}")

    all_ids: list[str] = []
    all_docs: list[str] = []
    all_meta: list[dict[str, str]] = []

    for path, rel, logical, scope in files_scoped:
        folder = _top_level_folder(rel)
        text = _read_text(path).strip()
        if not text:
            size = path.stat().st_size if path.is_file() else 0
            print(
                f"Skip (no extractable text — often scanned/image-only PDFs; size {size:,} bytes): {logical}",
            )
            continue
        side = _load_meta(path)
        act = side.get("act", "Unknown")
        section = side.get("section", "Unknown")
        chunks = chunk_text(text, max_tokens=CHUNK_MAX, overlap=CHUNK_OVERLAP)
        print(f"  {logical}: {len(chunks)} chunk(s), {len(text):,} characters extracted")
        for i, chunk in enumerate(chunks):
            cid = f"{logical}::chunk_{i}"
            all_ids.append(cid)
            all_docs.append(chunk)
            all_meta.append(
                {
                    "act": act,
                    "section": section,
                    "source_doc": path.name,
                    "rel_path": logical,
                    "folder": folder,
                    "source_scope": scope,
                    "chunk_index": str(i),
                },
            )

    if not all_ids:
        print("No chunks produced.")
        return

    batch = max(1, settings.legal_rag_embed_batch_size)
    embeddings: list[list[float]] = []
    for i in range(0, len(all_docs), batch):
        if i > 0 and settings.legal_rag_embed_min_interval_seconds > 0:
            time.sleep(settings.legal_rag_embed_min_interval_seconds)
        batch_docs = all_docs[i : i + batch]
        embeddings.extend(embed_texts(batch_docs))
        print(f"Embedded {min(i + batch, len(all_docs))}/{len(all_docs)} chunks…")

    collection.upsert(ids=all_ids, documents=all_docs, metadatas=all_meta, embeddings=embeddings)
    print(f"Upserted {len(all_ids)} chunks into collection {name!r} at {persist}.")
    print(
        f"Summary: {len(files_scoped)} corpus file(s) scanned → {len(all_ids)} chunk(s). "
        "If a file is missing, it likely has no text layer (scan); use OCR or export to searchable PDF/text.",
    )


if __name__ == "__main__":
    main()
