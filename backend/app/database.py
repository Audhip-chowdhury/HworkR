from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Sync engine — avoids greenlet/async SQLAlchemy issues on some Windows setups
connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
database_url = settings.database_url.replace("sqlite+aiosqlite", "sqlite")
engine = create_engine(database_url, echo=settings.debug, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models import Base  # noqa: PLC0415

    Base.metadata.create_all(bind=engine)
    if database_url.startswith("sqlite"):
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
            conn.commit()
        _sqlite_add_column_if_missing("companies", "location", "VARCHAR(255)")
        _sqlite_add_column_if_missing("employees", "onboarding_checklist_json", "TEXT")
        _sqlite_add_column_if_missing("employees", "position_id", "VARCHAR(36)")
        _sqlite_add_column_if_missing("goals", "kpi_definition_id", "VARCHAR(36)")
        _sqlite_add_column_if_missing("goals", "actual_achievement", "TEXT")
        _sqlite_add_column_if_missing("goals", "manager_rating", "INTEGER")
        _sqlite_add_column_if_missing("goals", "manager_comment", "TEXT")
        _sqlite_add_column_if_missing("review_cycles", "goals_deadline", "VARCHAR(32)")
        _sqlite_add_column_if_missing("requisitions", "req_code", "VARCHAR(6)")
        _sqlite_add_column_if_missing("job_postings", "posted", "INTEGER NOT NULL DEFAULT 0")
        _sqlite_add_column_if_missing("job_postings", "posting_ref", "VARCHAR(128)")
        _sqlite_create_unique_index_if_missing("uq_job_postings_requisition_id", "job_postings", "requisition_id")
        _sqlite_migrate_req_code_global_unique()

    with SessionLocal() as session:
        _seed_platform_admin(session)
        _migrate_employee_document_doc_types(session)
        _backfill_employee_documents(session)
        _backfill_requisition_req_codes(session)


def _migrate_employee_document_doc_types(session: Session) -> None:
    """
    Rename legacy id_proof → gov_id.

    If both id_proof and gov_id rows exist (e.g. after adding gov_id backfill), a blind UPDATE
    violates UNIQUE(employee_id, doc_type). We merge id_proof into gov_id when needed, then delete id_proof.
    """
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.employee_document import EmployeeDocument  # noqa: PLC0415

    id_proofs = session.execute(
        select(EmployeeDocument).where(EmployeeDocument.doc_type == "id_proof")
    ).scalars().all()

    for old in id_proofs:
        gov = session.execute(
            select(EmployeeDocument).where(
                EmployeeDocument.employee_id == old.employee_id,
                EmployeeDocument.doc_type == "gov_id",
            )
        ).scalar_one_or_none()

        if gov is None:
            old.doc_type = "gov_id"
            continue

        if old.status == "submitted" and gov.status != "submitted":
            gov.status = old.status
            gov.file_url = old.file_url
            gov.notes = old.notes
            gov.meta_json = old.meta_json
            gov.submitted_at = old.submitted_at
        session.delete(old)

    session.flush()

    if database_url.startswith("sqlite"):
        try:
            session.execute(
                text("""
                    UPDATE inbox_tasks
                    SET context_json = json_set(context_json, '$.doc_type', 'gov_id')
                    WHERE type = 'document_required'
                      AND json_extract(context_json, '$.doc_type') = 'id_proof'
                """)
            )
        except Exception:
            pass
    session.commit()


def _backfill_employee_documents(session: Session) -> None:
    """Ensure photo, gov_id, offer_letter rows exist for every employee (Option B table)."""
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.employee import Employee  # noqa: PLC0415
    from app.services.employee_document_sync import ensure_default_document_rows  # noqa: PLC0415

    r = session.execute(select(Employee.id, Employee.company_id))
    for eid, cid in r.all():
        ensure_default_document_rows(session, cid, eid)
    session.commit()


def _backfill_requisition_req_codes(session: Session) -> None:
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.recruitment import Requisition  # noqa: PLC0415
    from app.services.requisition_codes import backfill_req_codes_for_company  # noqa: PLC0415

    rows = list(session.execute(select(Requisition).where(Requisition.req_code.is_(None))).scalars().all())
    if not rows:
        return
    by_company: dict[str, list[Requisition]] = {}
    for req in rows:
        by_company.setdefault(req.company_id, []).append(req)
    for cid, lst in by_company.items():
        backfill_req_codes_for_company(session, cid, lst)
    session.commit()


def _sqlite_add_column_if_missing(table: str, column: str, ddl_type: str) -> None:
    """SQLite has limited ALTER — add nullable columns for existing dev DBs."""
    with engine.connect() as conn:
        r = conn.execute(text(f"PRAGMA table_info({table})"))
        cols = {row[1] for row in r.fetchall()}
        if column not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
            conn.commit()


def _sqlite_migrate_req_code_global_unique() -> None:
    """Replace composite (company_id, req_code) unique index with global unique on req_code."""
    if not database_url.startswith("sqlite"):
        return
    with engine.connect() as conn:
        try:
            conn.execute(text("DROP INDEX IF EXISTS uq_requisitions_company_req_code"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_requisitions_req_code ON requisitions(req_code)"))
            conn.commit()
        except Exception:
            conn.rollback()


def _sqlite_create_unique_index_if_missing(name: str, table: str, column: str) -> None:
    """Enforce one job posting per requisition on existing SQLite DBs (new installs get this from metadata)."""
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND name=:n"), {"n": name})
        if r.fetchone():
            return
        try:
            conn.execute(text(f"CREATE UNIQUE INDEX {name} ON {table}({column})"))
            conn.commit()
        except Exception:
            conn.rollback()


def _seed_platform_admin(session: Session) -> None:
    from sqlalchemy import select  # noqa: PLC0415

    from app.core.security import get_password_hash  # noqa: PLC0415
    from app.models.base import uuid_str  # noqa: PLC0415
    from app.models.user import User  # noqa: PLC0415

    r = session.execute(select(User).where(User.email == "admin@example.com"))
    if r.scalar_one_or_none():
        return
    admin = User(
        id=uuid_str(),
        email="admin@example.com",
        password_hash=get_password_hash("admin123"),
        name="Platform Admin",
        is_platform_admin=True,
    )
    session.add(admin)
    session.commit()
