# HworkR

HR training and certification platform (Phase 0: foundation).

## Stack

- **Backend:** FastAPI, SQLAlchemy 2 (sync), PostgreSQL, JWT auth, `pbkdf2_sha256` password hashing
- **Frontend:** React 18, TypeScript, Vite, React Router

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

- API: `http://127.0.0.1:8080`
- OpenAPI docs: `http://127.0.0.1:8080/docs`
- Database: PostgreSQL from `DATABASE_URL` (tables created on first run)

**Default platform admin** (seeded once):

- Email: `admin@example.com`
- Password: `admin123`

Override secrets with a `backend/.env` file:

```env
SECRET_KEY=your-long-random-string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hworkr
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

**Legal assistant (India RAG, optional):** point Vertex at your GCP project using either a **service account JSON path** (recommended) or `GCP_PROJECT_ID`. Add PDFs/TXT under **`data/legal/india/`** at the repo root and/or `backend/data/legal/india/` (ingest scans **both** by default; see `backend/data/legal/india/README.md`), then run `python -m scripts.ingest_legal_docs` from `backend/`. The company UI exposes **Legal** in the sidebar; chat calls `POST /api/v1/companies/{company_id}/legal/chat`.

```env
# Option A: service account file (sets GOOGLE_APPLICATION_CREDENTIALS; project_id read from JSON if GCP_PROJECT_ID omitted)
GCP_CREDENTIALS_PATH=C:/path/to/your-service-account.json

# Option B: explicit project (still use GCP_CREDENTIALS_PATH for auth unless you use gcloud ADC)
GCP_PROJECT_ID=your-gcp-project
GCP_LOCATION=asia-south1
LEGAL_RAG_LLM_MODEL=gemini-2.5-flash
LEGAL_RAG_EMBEDDING_MODEL=text-multilingual-embedding-002
LEGAL_RAG_CHROMA_PERSIST_DIR=./data/chroma_legal
LEGAL_RAG_COLLECTION=india_legal
# Large ingests: smaller batches + pauses reduce Vertex 429 embedding quota errors (tune if needed).
LEGAL_RAG_EMBED_BATCH_SIZE=5
LEGAL_RAG_EMBED_MIN_INTERVAL_SECONDS=0.4
LEGAL_RAG_EMBED_MAX_RETRIES=12
```

If you change the seeded admin email in existing data, either delete and recreate the database or remove that user row before restarting.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/health` to the backend (default `http://127.0.0.1:8080`).

### If you see `WinError 10013` (socket access denied)

Windows sometimes blocks or reserves ports (especially **8000**). Try:

1. Use another port, e.g. **8080** (default above) or **8765**:
   `uvicorn app.main:app --reload --host 127.0.0.1 --port 8765`
2. Point the frontend at the same port by setting when starting Vite:
   `set VITE_API_ORIGIN=http://127.0.0.1:8765` (PowerShell: `$env:VITE_API_ORIGIN="http://127.0.0.1:8765"`)
3. See what is using a port: `netstat -ano | findstr :8000`
4. Check excluded port ranges (Hyper-V / NAT): run in an elevated CMD:
   `netsh interface ipv4 show excludedportrange protocol=tcp`

## Phase 0 scope

- Multi-tenant companies (`company_id` on all scoped data; access enforced in the API layer)
- Users, JWT login/register
- Platform admin: create companies, assign members (by registered email) with a **practice track** (which HworkR modules they use: TA, HR Ops, L&D, Comp, Employee, or company admin)
- Company admin: update company, manage departments, locations, job catalog
- **Company org roles:** tenant-defined roles (e.g. job titles), mapped to departments (many roles per department); see API `GET /api/v1/companies/{id}/org-roles` and `GET .../departments-with-org-roles`
- Seed demo employees (optional)
- Stubs: notifications list, inbox tasks, workflow templates (empty until later phases)
- Audit trail writes on key mutations

After pulling changes, restart the API once so new tables (`org_roles`, `department_org_roles`) are created.

## Next phases

Talent acquisition, HR operations, L&D, compensation (SimCash), scoring, certification, and full employee self-service per the design documents in this repo.
