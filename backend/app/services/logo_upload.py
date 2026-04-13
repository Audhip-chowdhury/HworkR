from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.models.base import uuid_str

ALLOWED_LOGO_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp"})


async def save_company_logo(
    upload: UploadFile,
    *,
    upload_root: Path,
    max_bytes: int,
) -> str:
    """Persist logo under upload_root/logos and return public URL path (e.g. /uploads/logos/xxx.png)."""
    if not upload.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logo file must have a filename",
        )
    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Logo must be one of: {', '.join(sorted(ALLOWED_LOGO_EXTENSIONS))}",
        )
    data = await upload.read()
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Logo must be at most {max_bytes // 1024} KiB",
        )
    if len(data) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo file is empty")

    logos = upload_root / "logos"
    logos.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid_str()}{ext}"
    (logos / filename).write_bytes(data)
    return f"/uploads/logos/{filename}"
