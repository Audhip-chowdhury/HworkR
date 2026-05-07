"""Resolve company logos for certificates (uploaded files + bundled static assets).

Canonical source: ``companies.logo_url`` (see :class:`app.models.company.Company`).
"""

from __future__ import annotations

import struct
from pathlib import Path

from app.models.company import Company

APP_DIR = Path(__file__).resolve().parent.parent
BRANDING_DIR = APP_DIR / "assets" / "branding"


def png_pixel_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def normalize_logo_reference(url: str | None) -> str | None:
    """Normalize DB / config values to a public ref (path or absolute URL)."""
    u = (url or "").strip()
    if not u:
        return None
    lu = u.lower()
    if lu.startswith(("http://", "https://")):
        return u
    if u.startswith("/"):
        return u
    # Some clients store without leading slash (relative to site root)
    if u.startswith("uploads/"):
        return "/" + u
    return None


def company_logo_public_ref(company: Company) -> str | None:
    """Value suitable for ``<img src>`` (same-origin path or http(s) URL)."""
    ref = normalize_logo_reference(company.logo_url)
    if ref:
        return ref
    cfg = company.config_json
    if isinstance(cfg, dict):
        v = cfg.get("logo_url")
        if isinstance(v, str):
            r = normalize_logo_reference(v)
            if r:
                return r
        br = cfg.get("branding")
        if isinstance(br, dict):
            v2 = br.get("logo_url")
            if isinstance(v2, str):
                return normalize_logo_reference(v2)
    return None


def resolve_certificate_logo_path(*, company: Company, upload_dir: Path) -> Path | None:
    """Filesystem path for PDF embedding; ``None`` if none or only remote URL."""
    upload_root = upload_dir.resolve()
    branding_root = BRANDING_DIR.resolve()
    ref = company_logo_public_ref(company)
    if not ref:
        return None
    if ref.startswith(("http://", "https://")):
        return None

    if ref.startswith("/uploads/"):
        rel = ref.removeprefix("/uploads/").lstrip("/").replace("..", "")
        p = (upload_root / rel).resolve()
        if str(p).startswith(str(upload_root)) and p.is_file():
            return p
        return None

    if ref.startswith("/branding-assets/"):
        rel = ref.removeprefix("/branding-assets/").lstrip("/").replace("..", "")
        bpath = (BRANDING_DIR / rel).resolve()
        if str(bpath).startswith(str(branding_root)) and bpath.is_file():
            return bpath

    return None


def certificate_logo_img_src(*, company: Company) -> str | None:
    """Public URL/path for `<img src>` on HTML certificates."""
    return company_logo_public_ref(company)
