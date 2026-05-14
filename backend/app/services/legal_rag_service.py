"""RAG orchestration: Chroma retrieval + Vertex Gemini answer with citations."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import chromadb  # type: ignore[import-untyped]

from app.config import settings
from app.schemas.legal import LegalCitationOut, LegalChatResponse
from app.services import llm_client

logger = logging.getLogger(__name__)

LEGAL_DEFAULT_REGION = "India"

OFF_TOPIC_REPLY = (
    "Please ask a valid question about Indian labour law or workplace HR. "
    "I cannot respond to such questions."
)

# Whole-message chit-chat (no legal substance).
_CHITCHAT_ONLY = re.compile(
    r"^\s*("
    r"hi+!*|hii+!*|hello+!*|hey+!*|yo+!*|sup+|how\s*are\s*you|what'?s\s*up|"
    r"thanks?!*|thank\s*you!?|thx+|ok+!*|okay+!*|k+\.?|gg+|lol+|lmao+|rofl+|haha+|bye+|cya+|"
    r"good\s*(morning|afternoon|evening|night)|nice\s*to\s*meet\s*you"
    r")[\s!?.]*$",
    re.I | re.X,
)

# Substrings that suggest employment / Indian labour context (English-first; extend as needed).
_LEGAL_TOPIC_TRIGGERS: tuple[str, ...] = (
    "law",
    "legal",
    "labour",
    "labor",
    "statute",
    " act ",
    " act,",
    " act.",
    "section",
    "clause",
    "employee",
    "employer",
    "employment",
    "workplace",
    " human resource",
    " hr ",
    " hr,",
    "wage",
    "salary",
    "remuneration",
    "compensation",
    "payroll",
    "pay ",
    " pay?",
    "leave",
    "holiday",
    "vacation",
    "notice",
    "terminat",
    "dismiss",
    "fired",
    "fire ",
    "retrench",
    "layoff",
    "redundan",
    "resign",
    "reliev",
    "probation",
    "misconduct",
    "disciplin",
    "suspension",
    "grievance",
    "contract",
    "bond",
    "nda",
    "non-compete",
    "confidential",
    " pf",
    "pf ",
    "epf",
    "provident",
    "esi",
    "gratuity",
    "bonus",
    "overtime",
    "minimum wage",
    "maternity",
    "paternity",
    "sexual harassment",
    "posh",
    "discrimination",
    "union",
    "trade union",
    "collective",
    "strike",
    "lockout",
    "industrial dispute",
    "tribunal",
    "conciliation",
    "arbitration",
    "labour court",
    "labor court",
    "factory",
    "workman",
    "standing order",
    "appointment letter",
    "offer letter",
    "working hour",
    "shift",
    "contract labour",
    "principal employer",
    "compliance",
    "notice pay",
    "severance",
    "garden leave",
    "shops",
    "establishment",
    "wages",
)


def _is_plausibly_legal_or_hr(message: str) -> bool:
    raw = message.strip()
    if len(raw) < 3:
        return False
    if _CHITCHAT_ONLY.match(raw):
        return False
    low = raw.lower()
    for t in _LEGAL_TOPIC_TRIGGERS:
        if t in low:
            return True
    if "?" in raw:
        q_lead = any(
            p in low
            for p in (
                "can i ",
                "can we ",
                "can my ",
                "must ",
                "should ",
                "is it legal",
                "is this ",
                "are we ",
                "do i ",
                "does the company",
                "does my employer",
                "what if ",
                "what happens",
                "how do i ",
                "how can ",
            )
        )
        work = any(
            w in low
            for w in (
                "company",
                "employer",
                "employee",
                "boss",
                "manager",
                "office",
                "job",
                "work",
                "staff",
                "team",
                "salary",
                "pay",
                "leave",
                "notice",
                "terminate",
                "contract",
                "policy",
                "hr",
            )
        )
        if q_lead and work:
            return True
    # Long pasted scenarios: require at least one employment/law token.
    if len(raw) >= 220:
        return bool(
            re.search(
                r"\b(section|act|clause|employee|employer|terminat|dismiss|salary|"
                r"leave|notice|pf|esi|gratuity|bonus|contract|workman|labour|labor)\b",
                low,
            ),
        )
    return False


LEGAL_SYSTEM_PROMPT = """You are an HR legal assistant for Indian labour law.
Answer only based on the provided legal context.
Always cite the specific Act and section.
If the answer is not in the context, say so clearly.
Do not give definitive legal advice — always recommend
consulting a qualified lawyer for specific cases.

Respond with JSON only, using this shape:
{"answer": "<string>", "citations": [{"act": "<string or null>", "section": "<string or null>", "source_doc": "<string or null>", "excerpt": "<string or null>"}]}
"""


def _chroma_collection():
    persist = Path(settings.legal_rag_chroma_persist_dir)
    persist.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist.resolve()))
    return client.get_or_create_collection(name=settings.legal_rag_collection)


def _query_chunks(query: str, top_k: int) -> list[dict[str, Any]]:
    col = _chroma_collection()
    count = col.count()
    if count == 0:
        return []
    q_emb = llm_client.embed_texts([query])[0]
    res = col.query(
        query_embeddings=[q_emb],
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )
    out: list[dict[str, Any]] = []

    def _row(key: str) -> list[Any]:
        v = res.get(key) if isinstance(res, dict) else getattr(res, key, None)
        if v and len(v) > 0 and isinstance(v[0], list):
            return v[0]
        return []

    row_ids = _row("ids")
    row_docs = _row("documents")
    row_metas = _row("metadatas")
    row_dists = _row("distances")
    for i in range(len(row_docs)):
        meta = row_metas[i] if i < len(row_metas) else None
        if not isinstance(meta, dict):
            meta = {}
        out.append(
            {
                "id": row_ids[i] if i < len(row_ids) else str(i),
                "document": row_docs[i] or "",
                "metadata": meta,
                "distance": row_dists[i] if i < len(row_dists) else None,
            },
        )
    return out


def _format_context(chunks: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for idx, ch in enumerate(chunks, start=1):
        meta = ch.get("metadata") or {}
        act = meta.get("act") or "Unknown Act"
        section = meta.get("section") or "Unknown section"
        folder = meta.get("folder") or ""
        rel_path = meta.get("rel_path") or meta.get("source_doc") or "Unknown path"
        src = meta.get("source_doc") or meta.get("source") or "Unknown source"
        body = (ch.get("document") or "").strip()
        folder_bit = f"Folder: {folder} | " if folder and folder != "_root" else ""
        parts.append(
            f"[{idx}] {folder_bit}Act: {act} | Section: {section} | File: {src} | Path: {rel_path}\n{body}",
        )
    return "\n\n---\n\n".join(parts) if parts else "(No retrieved passages.)"


def _parse_citations(raw: Any) -> list[LegalCitationOut]:
    if not isinstance(raw, list):
        return []
    out: list[LegalCitationOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        out.append(
            LegalCitationOut(
                act=item.get("act") if item.get("act") is not None else None,
                section=item.get("section") if item.get("section") is not None else None,
                source_doc=item.get("source_doc") if item.get("source_doc") is not None else None,
                excerpt=item.get("excerpt") if item.get("excerpt") is not None else None,
            ),
        )
    return out


def legal_chat(*, message: str, region: str | None) -> LegalChatResponse:
    use_region = (region or "").strip() or LEGAL_DEFAULT_REGION
    if use_region != LEGAL_DEFAULT_REGION:
        logger.info("Legal chat requested for non-default region %r; corpus is India-only for now.", use_region)

    if not _is_plausibly_legal_or_hr(message):
        return LegalChatResponse(answer=OFF_TOPIC_REPLY, citations=[], region=use_region)

    chunks = _query_chunks(message, settings.legal_rag_top_k)
    context_block = _format_context(chunks)

    user_content = f"""## Retrieved legal context (Indian labour law corpus)

{context_block}

## User question

Region: {use_region}

{message}
"""

    try:
        parsed = llm_client.generate_legal_json_response(
            system_instruction=LEGAL_SYSTEM_PROMPT,
            user_content=user_content,
        )
    except Exception as e:
        logger.exception("Legal RAG generation failed: %s", e)
        raise

    answer = parsed.get("answer") if isinstance(parsed, dict) else None
    if not isinstance(answer, str) or not answer.strip():
        answer = "The model did not return a usable answer. Please try again or check server logs."

    citations = _parse_citations(parsed.get("citations") if isinstance(parsed, dict) else None)

    return LegalChatResponse(answer=answer.strip(), citations=citations, region=use_region)
