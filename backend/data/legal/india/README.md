# India legal corpus (RAG)

Place **PDF** or **plain text** (`.txt`, `.md`) files under **either**:

- **`<repository>/data/legal/india/`** (recommended for large PDF sets — e.g. `priority_1/…`), or  
- **`backend/data/legal/india/`** (same layout; often used for the README next to the corpus).

The ingest script (`python -m scripts.ingest_legal_docs` from `backend/`) **scans both locations by default** (when both exist) so PDFs at the repo root are included. Use ``--source-dir <path>`` to ingest a single folder only.

1. Extract text (PDF via `pypdf`).
2. Split into chunks of **~500 tokens** with **50-token overlap** (`tiktoken` `cl100k_base`).
3. Embed with **Vertex AI** `text-multilingual-embedding-002` by default (override with `LEGAL_RAG_EMBEDDING_MODEL`; avoid deprecated `textembedding-gecko@003` if your region returns 404).
4. Upsert vectors into the Chroma collection **`india_legal`** (see `LEGAL_RAG_COLLECTION`). Each chunk records **`folder`** (top-level subfolder under `india/`, or `_root` if the file sits directly in `india/`) and **`rel_path`** for traceability.

## Prerequisites

- **Vertex AI**: set `GCP_PROJECT_ID` and (optionally) `GCP_LOCATION` in `backend/.env`. Use Application Default Credentials or a service account as usual for Google Cloud.
- **Chroma**: persistence directory defaults to `./data/chroma_legal` under the backend working directory (`LEGAL_RAG_CHROMA_PERSIST_DIR`).
- **Large PDF sets**: if ingest hits **429 / quota** on embeddings, lower `LEGAL_RAG_EMBED_BATCH_SIZE` (e.g. `3`) and raise `LEGAL_RAG_EMBED_MIN_INTERVAL_SECONDS` (e.g. `1.0`) in `backend/.env`, then re-run with `--reset` if a previous run stopped halfway.

## PDFs with no text layer

`pypdf` only reads **embedded text**. **Scanned** PDFs (images of pages) extract as empty and are **skipped** — you will see `Skip (no extractable text…)` in the ingest log. Fix by: OCR (e.g. Adobe, Google Document AI), or replace with a **searchable PDF** / **`.txt`** export.

## Optional metadata (Act / section)

For each document `MyAct.pdf`, you may add a sidecar file **`MyAct.meta.json`** in the same directory:

```json
{
  "act": "Industrial Disputes Act, 1947",
  "section": "Section 25F"
}
```

If omitted, chunks are stored with `act` / `section` set to `Unknown` (the model should still use passage text, but citations are weaker).

## Suggested documents

Only add materials you have the **right to use** (public statutes, licensed databases, or your own summaries). Examples of topics HR teams often keep handy:

- Industrial Disputes Act, 1947 (key termination / retrenchment / closure provisions)
- Shops and Establishments Acts (state variants — label the state in `act` metadata)
- Payment of Wages Act, 1936; Minimum Wages Act, 1948; Payment of Bonus Act, 1965
- Employees’ Provident Funds and Miscellaneous Provisions Act, 1952
- Employees’ State Insurance Act, 1948
- Maternity Benefit Act, 1961; Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013
- Contract Labour (Regulation and Abolition) Act, 1970; Building and Other Construction Workers Act, 1996 (as relevant)

**Disclaimer:** HworkR’s Legal assistant is **informational only** and does not replace qualified legal counsel.
