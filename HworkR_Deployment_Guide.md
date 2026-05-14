# HworkR — Railway + Vercel Deployment Guide (PostgreSQL Only)

> **Target stack:** FastAPI backend + PostgreSQL + optional ChromaDB/Vertex Legal RAG on Railway, React/Vite frontend on Vercel.

---

## Overview

```text
GitHub
  ├─ Railway (root: backend)
  │    └─ FastAPI API + PostgreSQL + optional Chroma persistence
  └─ Vercel (root: frontend)
       └─ Vite React app
```

---

## Part 1 — Prepare code for PostgreSQL-only deployment

### 1.1 Backend entrypoint (use current app path)

Use this command in Railway:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`app.main:app` is required for this repo.

### 1.2 Required backend environment variables

Set these in Railway backend service variables:

```env
DATABASE_URL=postgresql://postgres:password@host:5432/railway
SECRET_KEY=replace-with-random-secret
CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Optional but recommended:

```env
UPLOAD_DIR=/data/uploads
```

Generate secret key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 1.3 Frontend API variable must be `VITE_API_BASE`

Current frontend client uses:

```ts
import.meta.env.VITE_API_BASE ?? '/api/v1'
```

So in Vercel set:

```env
VITE_API_BASE=https://your-backend.railway.app/api/v1
```

### 1.4 Health endpoint already exists

The backend already exposes:

- `GET /health`
- `GET /docs`

No code changes required.

---

## Part 2 — Deploy backend on Railway (PostgreSQL)

### 2.1 Create backend service

1. Sign in to [railway.app](https://railway.app) with GitHub.
2. Create a new project from this repo.
3. Set backend **Root Directory** to `backend`.
4. Set **Start Command** to:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### 2.2 Add PostgreSQL service

1. In Railway project, click **+ New**.
2. Select **Database → PostgreSQL**.
3. Copy the generated PostgreSQL `DATABASE_URL`.
4. Set this value on the backend service `DATABASE_URL` variable.

### 2.3 Add backend variables

Minimum:

```env
DATABASE_URL=<paste PostgreSQL URL>
SECRET_KEY=<random strong key>
CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Optional for uploads and legal vectors persistence:

```env
UPLOAD_DIR=/data/uploads
LEGAL_RAG_CHROMA_PERSIST_DIR=/data/chroma_legal
LEGAL_RAG_COLLECTION=india_legal
```

### 2.4 Optional Legal RAG (Vertex AI)

If legal assistant is enabled, also set:

```env
GCP_CREDENTIALS_PATH=/app/secrets/service-account.json
# OR GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/service-account.json
GCP_PROJECT_ID=your-gcp-project
GCP_LOCATION=asia-south1
LEGAL_RAG_LLM_MODEL=gemini-2.5-flash
LEGAL_RAG_EMBEDDING_MODEL=text-multilingual-embedding-002
```

### 2.5 Volume for uploads/chroma (optional but recommended)

PostgreSQL itself is managed by Railway DB service, but local file storage still needs persistence.

Create one volume on backend service:

- **Mount path:** `/data`

This supports:

- `/data/uploads` via `UPLOAD_DIR`
- `/data/chroma_legal` via `LEGAL_RAG_CHROMA_PERSIST_DIR`

### 2.6 Validate backend deployment

After deploy and domain generation, test:

- `https://<backend>.railway.app/health`
- `https://<backend>.railway.app/docs`

---

## Part 3 — Deploy frontend on Vercel

### 3.1 Import frontend

1. Sign in to [vercel.com](https://vercel.com).
2. Import the same repository.
3. Set **Root Directory** to `frontend`.
4. Confirm framework is **Vite**.

### 3.2 Set frontend environment variable

In Vercel project variables:

```env
VITE_API_BASE=https://<backend>.railway.app/api/v1
```

Deploy the app.

### 3.3 Final CORS update in Railway

Ensure backend `CORS_ORIGINS` includes your final Vercel URL:

```env
CORS_ORIGINS=https://<frontend>.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Redeploy backend after env update.

---

## Part 4 — Legal corpus ingestion (optional)

If using legal assistant, ingest corpus after backend is live.

Default source scan paths:

- `data/legal/india/`
- `backend/data/legal/india/`

Run:

```bash
cd backend
python -m scripts.ingest_legal_docs --reset
```

If ingest hits quota (`429`):

- lower `LEGAL_RAG_EMBED_BATCH_SIZE`
- increase `LEGAL_RAG_EMBED_MIN_INTERVAL_SECONDS`

---

## Part 5 — Production checks

```text
□ Backend health works:   https://<backend>.railway.app/health
□ Backend docs load:      https://<backend>.railway.app/docs
□ Frontend loads:         https://<frontend>.vercel.app
□ Login/auth works
□ No CORS errors in browser network tab
□ PostgreSQL data persists after redeploy/restart
□ Legal chat works (if Vertex + corpus + Chroma configured)
```

---

## Troubleshooting

- **Backend fails on DB connection:** verify `DATABASE_URL` is PostgreSQL URL from Railway DB service.
- **`No module named psycopg2`:** ensure `psycopg2-binary` is in `backend/requirements.txt`.
- **CORS errors:** include full Vercel origin in `CORS_ORIGINS` and redeploy.
- **Frontend blank/API fails:** verify `VITE_API_BASE` points to `https://<backend>.railway.app/api/v1`.
- **Legal ingest skips PDFs:** those files are likely image-only scans; run OCR/searchable export first.
- **Railway start error:** use `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

---

*Guide aligned to current HworkR app conventions with PostgreSQL-only production database setup.*
