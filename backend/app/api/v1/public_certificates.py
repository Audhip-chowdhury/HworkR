"""Public certificate verification (no auth)."""

from __future__ import annotations

import html
from datetime import timezone
from typing import Annotated
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.certification import Certificate, CertTrack
from app.models.company import Company
from app.models.user import User
from app.config import settings
from app.schemas.certification import PublicCertificateOut
from app.services.certificate_logo import certificate_logo_img_src, resolve_certificate_logo_path
from app.services.certificate_pdf import render_certificate_pdf

router = APIRouter(prefix="/certificates", tags=["public-certificates"])


def _load_certificate_bundle(db: Session, verification_id: str) -> tuple[Certificate, Company, User | None, CertTrack | None]:
    cert = db.execute(
        select(Certificate).where(Certificate.verification_id == verification_id)
    ).scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    company = db.execute(select(Company).where(Company.id == cert.company_id)).scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    user = db.execute(select(User).where(User.id == cert.user_id)).scalar_one_or_none()
    track = db.execute(select(CertTrack).where(CertTrack.id == cert.track_id)).scalar_one_or_none()
    return cert, company, user, track


@router.get("/verify/{verification_id}", response_model=PublicCertificateOut)
def verify_certificate_public(verification_id: str, db: Annotated[Session, Depends(get_db)]) -> PublicCertificateOut:
    cert, company, user, track = _load_certificate_bundle(db, verification_id)
    return PublicCertificateOut(
        verification_id=cert.verification_id,
        approval_status=cert.approval_status,
        recipient_name=(user.name if user else "Recipient"),
        company_name=company.name,
        track_name=track.name if track else "Certification",
        level=cert.level,
        score=float(cert.score),
        issued_at=cert.issued_at,
    )


@router.get("/verify/{verification_id}/page", response_class=HTMLResponse)
def verify_certificate_html_page(
    verification_id: str,
    db: Annotated[Session, Depends(get_db)],
    embed: Annotated[str | None, Query(description="Set to 1 when loaded in an iframe; hides duplicate PDF actions")] = None,
) -> HTMLResponse:
    cert, company, user, track = _load_certificate_bundle(db, verification_id)
    name = html.escape(user.name if user else "Recipient")
    cname = html.escape(company.name or "")
    tname = html.escape(track.name if track else "Certification")
    level_e = html.escape(cert.level or "")
    issued = cert.issued_at.astimezone(timezone.utc).strftime("%B %d, %Y")
    vid = html.escape(cert.verification_id)
    approved = cert.approval_status == "approved"
    status_note = (
        ""
        if approved
        else '<p class="pending">This credential is pending review. The downloadable certificate is not yet available.</p>'
    )
    vid_for_url = quote(cert.verification_id, safe="")
    hide_chrome = embed == "1"
    pdf_link = (
        ""
        if hide_chrome
        else (
            f'<p class="dl"><a href="/api/v1/certificates/verify/{vid_for_url}/pdf" '
            f'target="_blank" rel="noopener noreferrer">Download PDF</a></p>'
            if approved
            else ""
        )
    )
    img_src = certificate_logo_img_src(company=company)
    logo_block = (
        '<div class="org-logo"><img src="' + html.escape(img_src, quote=True) + '" alt="" loading="lazy" /></div>'
        if img_src
        else ""
    )
    page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Certificate</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: clamp(16px, 4vw, 40px);
    background: #e8e4dc;
    font-family: "Georgia", "Times New Roman", serif;
    color: #2c2c32;
  }}
  .sheet {{
    width: 100%; max-width: 640px;
    background: #fcfaf6;
    border: 1px solid #c9b896;
    box-shadow: 0 12px 40px rgba(40, 35, 25, 0.12);
    padding: clamp(28px, 5vw, 48px) clamp(24px, 4vw, 44px);
    text-align: center;
  }}
  .org-name {{ font-size: clamp(1.2rem, 3.5vw, 1.55rem); font-weight: 600; color: #111827; margin: 0 0 6px;
    letter-spacing: 0.03em; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.2; }}
  .kicker {{ font-size: 0.72rem; letter-spacing: 0.28em; text-transform: uppercase; color: #7a6b52; margin: 0 0 10px; }}
  .rule {{ width: 120px; height: 1px; background: #c9b896; margin: 0 auto 22px; }}
  .presented {{ font-size: 0.95rem; color: #5c564c; margin: 0 0 8px; font-family: system-ui, sans-serif; }}
  .recipient {{ font-size: clamp(1.5rem, 4vw, 1.85rem); font-weight: 600; margin: 0 0 22px; line-height: 1.25; color: #1a1d26; }}
  .body {{ font-size: 1rem; line-height: 1.55; color: #45424a; margin: 0 0 24px; max-width: 34em; margin-left: auto; margin-right: auto;
    font-family: system-ui, -apple-system, sans-serif; }}
  .score {{
    display: inline-block; padding: 10px 28px; margin: 0 0 20px;
    background: #f3f0e8; border: 1px solid #ddd5c4;
    font-family: system-ui, sans-serif; font-size: 0.95rem; font-weight: 600; color: #2a3142;
  }}
  .footer {{ font-size: 0.75rem; color: #7a7570; font-family: ui-monospace, monospace; line-height: 1.6; }}
  .brand {{ margin-top: 28px; font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: #9a9288; }}
  .pending {{ font-size: 0.85rem; color: #7a4a1e; font-family: system-ui, sans-serif; margin: 0 0 12px; }}
  .dl {{ margin: 16px 0 0; font-family: system-ui, sans-serif; font-size: 0.88rem; }}
  .dl a {{ color: #1d4ed8; text-decoration: none; border-bottom: 1px solid rgba(29, 78, 216, 0.35); }}
  .dl a:hover {{ border-bottom-color: #1d4ed8; }}
  .org-logo {{ margin: 0 auto 14px; max-width: min(260px, 88vw); }}
  .org-logo img {{ width: 100%; height: auto; display: block; margin: 0 auto; }}
</style></head><body>
  <article class="sheet">
    {logo_block}
    <p class="org-name">{cname}</p>
    <p class="kicker">Certificate of achievement</p>
    <div class="rule"></div>
    <p class="presented">Presented to</p>
    <h1 class="recipient">{name}</h1>
    <p class="body">For successfully completing <strong>{tname}</strong> ({level_e}).</p>
    <p class="score">Overall quality score &nbsp;{cert.score:.1f} / 100</p>
    {status_note}
    {pdf_link}
    <p class="footer">Issued {issued}<br/>Verification {vid}</p>
    <p class="brand">HworkR</p>
  </article>
</body></html>"""
    return HTMLResponse(content=page)


@router.get("/verify/{verification_id}/pdf")
def verify_certificate_pdf_public(verification_id: str, db: Annotated[Session, Depends(get_db)]) -> Response:
    cert, company, user, track = _load_certificate_bundle(db, verification_id)
    if cert.approval_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PDF is available after the certificate is approved",
        )
    issued = cert.issued_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    logo_path = resolve_certificate_logo_path(company=company, upload_dir=Path(settings.upload_dir))
    pdf_bytes = render_certificate_pdf(
        recipient_name=user.name if user else "Recipient",
        company_name=company.name,
        track_name=track.name if track else "Certification",
        level=cert.level,
        score=float(cert.score),
        verification_id=cert.verification_id,
        issued_at_label=issued,
        logo_path=logo_path,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="certificate-{cert.verification_id[:8]}.pdf"'},
    )
