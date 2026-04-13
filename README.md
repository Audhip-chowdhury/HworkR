# HworkR

HR training and certification platform (Phase 0: foundation).

## Stack

- **Backend:** FastAPI, SQLAlchemy 2 (sync), SQLite (WAL mode), JWT auth, `pbkdf2_sha256` password hashing
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
- SQLite file: `backend/hworkr.db` (created on first run)

**Default platform admin** (seeded once):

- Email: `admin@example.com`
- Password: `admin123`

Override secrets with a `backend/.env` file:

```env
SECRET_KEY=your-long-random-string
DATABASE_URL=sqlite:///./hworkr.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

If you change the seeded admin email, delete `hworkr.db` and restart so tables are recreated.

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

After pulling changes, restart the API once so new SQLite tables (`org_roles`, `department_org_roles`) are created.

## Next phases

Talent acquisition, HR operations, L&D, compensation (SimCash), scoring, certification, and full employee self-service per the design documents in this repo.
