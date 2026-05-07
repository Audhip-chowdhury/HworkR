"""Server-side PDF rendering for certificates (fpdf2)."""

from __future__ import annotations

import unicodedata

from pathlib import Path

from fpdf import FPDF

from app.services.certificate_logo import png_pixel_size

# Standard 14 Helvetica only covers Latin-1; avoid "?" from errors="replace".


def _pdf_text(text: str, *, max_len: int = 200, empty_fallback: str = "") -> str:
    """Strip combining marks (e.g. José → Jose), then keep Latin-1 printable only."""
    t = (text or "")[:max_len]
    nfd = unicodedata.normalize("NFD", t)
    folded = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    out = folded.encode("latin-1", errors="ignore").decode("latin-1")
    return out.strip() or empty_fallback


def render_certificate_pdf(
    *,
    recipient_name: str,
    company_name: str,
    track_name: str,
    level: str,
    score: float,
    verification_id: str,
    issued_at_label: str,
    logo_path: Path | None = None,
) -> bytes:
    recipient_name = _pdf_text(recipient_name, max_len=80, empty_fallback="Recipient")
    company_name = _pdf_text(company_name, max_len=120, empty_fallback="Organization")
    track_name = _pdf_text(track_name, max_len=120, empty_fallback="Program")
    level = _pdf_text(level, max_len=32, empty_fallback="-")
    issued_at_label = _pdf_text(issued_at_label, max_len=64, empty_fallback="-")
    vid = _pdf_text(verification_id, max_len=64, empty_fallback="-")

    program_line = _pdf_text(
        f'has successfully completed "{track_name}" ({level}).',
        max_len=500,
    )

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Page — warm paper tone, thin frame
    pdf.set_fill_color(252, 250, 245)
    pdf.rect(0, 0, 210, 297, "F")
    pdf.set_draw_color(180, 160, 120)
    pdf.set_line_width(0.4)
    pdf.rect(14, 14, 182, 269)

    y_body = 24.0
    if logo_path is not None and logo_path.is_file():
        logo_w = 52.0
        dims = png_pixel_size(logo_path)
        logo_h = logo_w * dims[1] / dims[0] if dims else 13.0
        try:
            pdf.image(str(logo_path), x=(210 - logo_w) / 2, y=y_body, w=logo_w)
            y_body = y_body + logo_h + 8.0
        except (OSError, ValueError):
            y_body = 40.0
    else:
        y_body = 40.0

    pdf.set_y(y_body)
    pdf.set_text_color(110, 90, 50)
    pdf.set_font("Helvetica", style="", size=11)
    pdf.cell(0, 7, txt="Certificate of Achievement", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(200, 175, 120)
    pdf.set_line_width(0.25)
    pdf.line(42, pdf.get_y() + 2, 168, pdf.get_y() + 2)
    pdf.ln(10)

    pdf.set_text_color(55, 55, 60)
    pdf.set_font("Helvetica", style="", size=10)
    pdf.cell(0, 6, txt="Presented to", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    pdf.set_text_color(20, 24, 40)
    pdf.set_font("Helvetica", style="B", size=22)
    pdf.cell(0, 14, txt=recipient_name, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    pdf.set_text_color(105, 102, 96)
    pdf.set_font("Helvetica", style="", size=9)
    pdf.cell(0, 5, txt="Issuing organization", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_text_color(26, 36, 54)
    pdf.set_font("Helvetica", style="B", size=17)
    pdf.multi_cell(0, 8.5, txt=company_name, align="C")
    pdf.ln(10)

    pdf.set_font("Helvetica", style="", size=11)
    pdf.set_text_color(55, 55, 62)
    pdf.multi_cell(0, 6.5, txt=program_line, align="C")
    pdf.ln(10)

    pdf.set_fill_color(245, 242, 235)
    pdf.set_draw_color(210, 200, 180)
    y = pdf.get_y()
    pdf.rect(36, y, 138, 18, style="FD")
    pdf.set_y(y + 4)
    pdf.set_font("Helvetica", style="B", size=12)
    pdf.set_text_color(45, 55, 75)
    pdf.cell(0, 10, txt=f"Overall quality score  {score:.1f} / 100", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(y + 22)

    pdf.set_font("Helvetica", style="", size=9)
    pdf.set_text_color(95, 95, 105)
    pdf.cell(0, 5, txt=f"Issued  {issued_at_label}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", style="", size=8)
    pdf.cell(0, 5, txt=f"Verification  {vid}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14)
    pdf.set_text_color(130, 128, 120)
    pdf.set_font("Helvetica", style="", size=9)
    pdf.cell(0, 5, txt="HworkR", align="C", new_x="LMARGIN", new_y="NEXT")

    out = pdf.output(dest="S")
    return out if isinstance(out, bytes) else bytes(out)
