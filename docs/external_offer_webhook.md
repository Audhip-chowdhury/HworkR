# External offer letter webhook (integrator guide)

HworkR **pushes** a complete offer record to **your HTTP server** when an HR user creates an offer in the app. Your team implements **one receiving endpoint** (POST). No authentication is included in v1—use a private URL, VPN, or mutual TLS in production.

---

## What you implement

| Item | Detail |
|------|--------|
| Method | `POST` |
| Path | Your route on the external service. HworkR default points at **`http://127.0.0.1:8020/recruitment/offer-created`** (same host/port as other recruitment webhooks). |
| Request body | JSON object described below (`Content-Type: application/json`) |
| Success | Respond with **HTTP 2xx** (e.g. `200 OK`). Response body is **ignored**. |
| Failure handling on HworkR side | Non-2xx or network errors are **logged only**; the offer **remains created** in HworkR. |

**Timeout:** HworkR waits up to **15 seconds** before treating the call as failed.

---

## Configure HworkR

| Setting | Environment variable | Notes |
|---------|----------------------|--------|
| Offer webhook URL | `RECRUITMENT_OFFER_WEBHOOK_URL` | Full URL to your POST endpoint. **Default:** `http://127.0.0.1:8020/recruitment/offer-created` (external API **port 8020**, aligned with `RECRUITMENT_STATUS_WEBHOOK_URL`). Set to **empty string** to disable. |

Backend field: `settings.recruitment_offer_webhook_url` in `backend/app/config.py`.

---

## When HworkR sends this POST

Immediately **after** the offer is committed in the database for:

`POST /api/v1/companies/{company_id}/recruitment/offers`

(authenticated HR: `company_admin` or `talent_acquisition`).

This runs **after** the separate pipeline-status notification (`RECRUITMENT_STATUS_WEBHOOK_URL`) that sends `status: "offer"`.

---

## Request JSON (schema)

Top-level object:

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Always `"offer.created"`. |
| `company_id` | `string` (UUID) | Company that owns the offer. |
| `recruitment_external_applicant_id` | `string` (UUID) | Candidate’s platform user id (`users.id`), same identifier used in pipeline webhooks. |
| `job_posting_code` | `string` or `null` | Six-character alphanumeric requisition code for the posting, or `null` if missing. |
| `offer` | `object` | Offer payload — see below. |

### `offer` object

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Offer id (primary key in HworkR). |
| `application_id` | `string` (UUID) | Linked application id. |
| `company_id` | `string` (UUID) | Same as top-level `company_id`. |
| `candidate_user_id` | `string` (UUID) | Same as `recruitment_external_applicant_id`. |
| `start_date` | `string` or `null` | Intended joining / start date (ISO date string as stored, e.g. `YYYY-MM-DD`). |
| `status` | `string` | Initial value is typically `"sent"`. |
| `sent_at` | `string` or `null` | ISO-8601 timestamp when the offer row was created. |
| `compensation_json` | `object` or `null` | **Full offer letter content** from the HR form (structured). See next section. |

---

## `compensation_json` — offer letter structure (v1)

The HR UI submits a structured letter. Current shape:

```json
{
  "schema_version": 1,
  "offer_letter": {
    "candidate": {
      "full_name": "string",
      "letter_date": "YYYY-MM-DD",
      "address_or_email": "string | null"
    },
    "role": {
      "job_title": "string",
      "department_id": "string | null",
      "department_name": "string | null",
      "reporting_manager_employee_id": "string | null",
      "reporting_manager_name": "string | null",
      "employment_type": "full_time | contract | part_time",
      "work_location_mode": "onsite | remote | hybrid"
    },
    "compensation": {
      "annual_ctc": "string",
      "fixed_variable_split": "string",
      "pay_frequency": "monthly | biweekly | weekly",
      "bonus_incentive": "string | null",
      "stock_esop": "string | null"
    },
    "joining": {
      "date_of_joining": "YYYY-MM-DD",
      "offer_expiry": "YYYY-MM-DD",
      "probation": "string",
      "notice_period": "string"
    },
    "compliance": {
      "background_verification": "string",
      "confidentiality_nda": "string | null",
      "non_compete": "string | null",
      "documents_on_joining": "string | null"
    },
    "signoff": {
      "company_name": "string",
      "include_logo_seal": true,
      "candidate_signature_line": "string"
    }
  },
  "prefill": {
    "application_id": "uuid",
    "job_grade": "string | null"
  }
}
```

`schema_version` may evolve; accept unknown keys under `offer_letter` defensively.

---

## Example POST body

```json
{
  "event": "offer.created",
  "company_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
  "recruitment_external_applicant_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  "job_posting_code": "A1B2C3",
  "offer": {
    "id": "11111111-2222-3333-4444-555555555555",
    "application_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "company_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
    "candidate_user_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    "start_date": "2026-05-01",
    "status": "sent",
    "sent_at": "2026-04-18T12:00:00.000000+00:00",
    "compensation_json": {
      "schema_version": 1,
      "offer_letter": {
        "candidate": {
          "full_name": "Jane Applicant",
          "letter_date": "2026-04-18",
          "address_or_email": null
        },
        "role": {
          "job_title": "Senior Analyst",
          "department_id": "dept-uuid",
          "department_name": "Finance",
          "reporting_manager_employee_id": null,
          "reporting_manager_name": null,
          "employment_type": "full_time",
          "work_location_mode": "hybrid"
        },
        "compensation": {
          "annual_ctc": "INR 24,00,000",
          "fixed_variable_split": "70% fixed / 30% variable",
          "pay_frequency": "monthly",
          "bonus_incentive": null,
          "stock_esop": null
        },
        "joining": {
          "date_of_joining": "2026-05-01",
          "offer_expiry": "2026-04-30",
          "probation": "6 months",
          "notice_period": "During probation: 15 days. After confirmation: 60 days."
        },
        "compliance": {
          "background_verification": "This offer is contingent upon satisfactory completion of background checks.",
          "confidentiality_nda": null,
          "non_compete": null,
          "documents_on_joining": "Government ID, education certificates…"
        },
        "signoff": {
          "company_name": "Acme Corp",
          "include_logo_seal": true,
          "candidate_signature_line": "I have read and understood the terms above."
        }
      },
      "prefill": {
        "application_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "job_grade": "L5"
      }
    }
  }
}
```

---

## Checklist for your service

1. Expose **HTTPS POST** (or HTTP for local dev) at the URL provided to the HworkR operator.
2. Parse JSON; persist or route using `offer.id` as an idempotent key if you retry.
3. Map **`recruitment_external_applicant_id`** / `candidate_user_id` to your candidate record.
4. Render the dashboard from **`offer.compensation_json.offer_letter`** (and related fields).
5. Return **2xx** quickly if you queue work asynchronously.

---

## Related (HworkR internal)

| Piece | Location |
|-------|----------|
| Outbound POST implementation | `backend/app/services/recruitment_offer_webhook.py` |
| Trigger | `create_offer` in `backend/app/api/v1/recruitment.py` |
| Pipeline status webhook (separate) | `docs/external_api_port_8020.md` |

Candidate accept/decline inside HworkR remains `PATCH .../recruitment/offers/{offer_id}/respond` with a logged-in candidate; syncing decisions **back** from your system into HworkR would be a separate integration if needed later.
