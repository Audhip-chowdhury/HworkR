"""Validate and persist employee onboarding documents (images + PDF)."""

import mimetypes
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.models.base import uuid_str

# photo + gov_id: images; offer_letter: PDF
ALLOWED_EXTENSIONS: dict[str, frozenset[str]] = {
    "photo": frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"}),
    "gov_id": frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"}),
    "gov_id_2": frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"}),
    "offer_letter": frozenset({".pdf"}),
}

KIND_BY_TYPE: dict[str, str] = {
    "photo": "image",
    "gov_id": "image",
    "gov_id_2": "image",
    "offer_letter": "pdf",
}


async def save_employee_document_file(
    upload: UploadFile,
    doc_type: str,
    *,
    upload_root: Path,
    company_id: str,
    employee_id: str,
    max_bytes: int,
) -> tuple[str, dict[str, Any]]:
    """
    Save file under upload_root/employee_documents/{company_id}/{employee_id}/.
    Returns (public_url_path, meta_json).
    """
    allowed = ALLOWED_EXTENSIONS.get(doc_type)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown document type: {doc_type}",
        )
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must have a filename")

    ext = Path(upload.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"For {doc_type}, file must be one of: {', '.join(sorted(allowed))}",
        )

    data = await upload.read()
    if len(data) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File must be at most {max_bytes // (1024 * 1024)} MiB",
        )

    dest_dir = upload_root / "employee_documents" / company_id / employee_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid_str()}{ext}"
    (dest_dir / filename).write_bytes(data)

    public_path = f"/uploads/employee_documents/{company_id}/{employee_id}/{filename}"
    guessed, _ = mimetypes.guess_type(upload.filename)
    mime = upload.content_type or guessed or ("application/pdf" if ext == ".pdf" else "image/jpeg")
    meta: dict[str, Any] = {
        "kind": KIND_BY_TYPE[doc_type],
        "mime_type": mime,
        "original_filename": upload.filename,
    }
    return public_path, meta
