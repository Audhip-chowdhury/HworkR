"""Unit tests for scoring engine rule helpers."""

from app.models.base import uuid_str
from app.models.recruitment import JobPosting, Requisition
from app.services.scoring_engine.comp_amounts import comp_accuracy_vs_band, min_max_from_salary_band_json
from app.services.scoring_engine.core import merge_worst
from app.services.scoring_engine.employees import profile_completeness_factors
from app.services.scoring_engine.recruitment import job_posting_completeness_factors, requisition_completeness_factors
from app.services.scoring_engine.training import training_assigner_late_mandatory_nudge


def test_requisition_incomplete_drops_completeness():
    r = Requisition(
        id=uuid_str(),
        company_id=uuid_str(),
        created_by=uuid_str(),
        headcount=1,
        status="draft",
    )
    r.job_id = None
    f = requisition_completeness_factors(r)
    assert f["completeness"] < 100


def test_posting_no_description_drops_completeness():
    p = JobPosting(
        id=uuid_str(),
        requisition_id=uuid_str(),
        company_id=uuid_str(),
        title="T",
        description="",
        requirements="reqs",
        deadline="2026-12-01",
    )
    f = job_posting_completeness_factors(p)
    assert f["completeness"] < 100


def test_merge_worst_takes_min_per_dim():
    a = {"completeness": 90, "accuracy": 100, "timeliness": 100, "process_adherence": 100}
    b = {"completeness": 100, "accuracy": 50, "timeliness": 100, "process_adherence": 100}
    m = merge_worst(a, b)
    assert m["completeness"] == 90
    assert m["accuracy"] == 50


def test_comp_accuracy_vs_band_inside_100_outside_softer():
    assert comp_accuracy_vs_band(75_000, 70_000, 80_000) == 100.0
    v = comp_accuracy_vs_band(95_000, 70_000, 80_000)
    assert v < 80


def test_profile_completeness_missing_phone():
    f = profile_completeness_factors({})
    assert f["completeness"] < 100
    assert "timeliness" not in f  # set by activity SLA layer


def test_salary_band_json_parsing():
    lo, hi = min_max_from_salary_band_json({"min_annual": 1, "max_annual": 2})
    assert (lo, hi) == (1.0, 2.0)


def test_assigner_nudge_late_mandatory():
    from datetime import datetime, timezone
    from unittest.mock import MagicMock

    course = MagicMock()
    course.mandatory = True
    course.due_date = "2000-01-01"
    ta = MagicMock()
    ta.assigned_by = uuid_str()
    ta.due_date = "2000-01-01"
    late = datetime(2000, 6, 1, tzinfo=timezone.utc)
    assert training_assigner_late_mandatory_nudge(ta, course, late) is True
    on_time = datetime(1999, 12, 1, tzinfo=timezone.utc)
    assert training_assigner_late_mandatory_nudge(ta, course, on_time) is False
