#!/usr/bin/env python3
"""Generate docs/Company_Leave_Policy.pdf from built-in copy. Requires: pip install fpdf2"""

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Company_Leave_Policy.pdf"


class PolicyPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    pdf = PolicyPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(left=18, top=18, right=18)

    # Title
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 30, 35)
    pdf.cell(0, 10, "Company leave policy", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(45, 45, 50)
    intro = (
        "This page summarizes how time off works for everyone in the company. Allocations below are the "
        "standard annual entitlements; your remaining balances appear on the Leave request page."
    )
    pdf.multi_cell(0, 5.5, intro)
    pdf.ln(4)

    def h2(title: str) -> None:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(25, 60, 100)
        pdf.cell(0, 7, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(45, 45, 50)

    # Overview
    h2("Overview")
    pdf.multi_cell(
        0,
        5.5,
        "We use a single annual leave year aligned with the calendar year (1 Jan - 31 Dec). Requests should be "
        "submitted in advance where possible. Managers or HR may approve or decline requests based on coverage and "
        "policy. Public holidays (see Holiday calendar) do not count against your leave balance.",
    )
    pdf.ln(3)

    # Leave types
    h2("Leave types")
    bullets = [
        "Paid leave - Planned vacation and general paid time off. Use for pre-approved absences that are not due to illness.",
        "Sick leave - Short-term illness or medical appointments. Short notice is acceptable; longer spans may require documentation if requested by HR.",
        "Casual leave - Short personal matters (e.g. urgent errands). Subject to the same approval process.",
        "Unpaid leave - Extended time off without pay, subject to approval and business needs.",
    ]
    for line in bullets:
        pdf.set_x(22)
        pdf.multi_cell(0, 5.5, f"- {line}")
    pdf.ln(2)

    # Annual allocation table
    h2("Annual allocation (per employee)")
    pdf.set_font("Helvetica", "I", 9)
    pdf.multi_cell(
        0,
        5,
        "Typical yearly grants below; your exact balances are tracked in the system.",
    )
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 245, 250)
    col_w = (pdf.w - 36) / 2
    pdf.cell(col_w, 7, "Leave type", border=1, fill=True)
    pdf.cell(col_w, 7, "Days per year", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.set_font("Helvetica", "", 10)
    rows = [
        ("Paid", "20"),
        ("Sick", "10"),
        ("Casual", "7"),
        ("Unpaid", "As approved (no fixed grant)"),
    ]
    for a, b in rows:
        pdf.cell(col_w, 7, a, border=1)
        pdf.cell(col_w, 7, b, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # Carry forward
    h2("Carry forward (year end)")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(
        0,
        5.5,
        "Only paid and sick leave balances may roll into the next calendar year, and only up to the caps below. "
        "Other types do not carry forward. Unused amounts above these caps are forfeited unless otherwise agreed "
        "in writing by HR.",
    )
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 245, 250)
    pdf.cell(col_w, 7, "Leave type", border=1, fill=True)
    pdf.cell(col_w, 7, "Maximum carry forward", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.set_font("Helvetica", "", 10)
    for a, b in [
        ("Paid", "Up to 5 days"),
        ("Sick", "Up to 3 days"),
        ("Casual / Unpaid", "Not carried forward"),
    ]:
        pdf.cell(col_w, 7, a, border=1)
        pdf.cell(col_w, 7, b, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)

    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(80, 80, 85)
    pdf.multi_cell(
        0,
        5,
        "This summary is for information only. HR may update detailed rules; check with your manager for "
        "team-specific expectations.",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
