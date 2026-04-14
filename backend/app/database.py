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
        _sqlite_add_column_if_missing("payslips", "earnings_json", "TEXT")
        _sqlite_add_column_if_missing("pay_runs", "department_id", "VARCHAR(36)")

    with SessionLocal() as session:
        _seed_platform_admin(session)


def _sqlite_add_column_if_missing(table: str, column: str, ddl_type: str) -> None:
    """SQLite has limited ALTER — add nullable columns for existing dev DBs."""
    with engine.connect() as conn:
        r = conn.execute(text(f"PRAGMA table_info({table})"))
        cols = {row[1] for row in r.fetchall()}
        if column not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
            conn.commit()


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
