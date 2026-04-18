# Recruitment integration (8020 + public apply)

**Outbound:** HworkR POSTs pipeline updates to an external URL (often port **8020**).  
**Inbound:** Candidates apply without login: **`POST /api/v1/recruitment/public-apply/{req_code}`** on the HworkR API.

---

## A. Outbound webhook (HworkR → your service)

**Config:** env `RECRUITMENT_STATUS_WEBHOOK_URL` — default  
`http://127.0.0.1:8020/recruitment/application-status`. Empty string disables POSTs.  
(Code: `backend/app/config.py`, `backend/app/services/recruitment_external_status.py`.)

**When:** After the DB commit when the backend sends a pipeline notification. Failures are logged only; the HworkR API still returns success.

**Request:** `POST` with `Content-Type: application/json`.

| Field | Meaning |
|-------|---------|
| `recruitment_external_applicant_id` | Candidate’s platform user id (UUID), same as `applications.candidate_user_id`. |
| `status` | One string: usually pipeline **stage**; if only the row **status** changed (stage unchanged), that value (e.g. `negotiating`). See `external_status_notify_value()` in `recruitment_external_status.py`. |
| `job_posting_code` | 6-character alphanumeric requisition code for this posting, or `null` if missing (legacy). |

Example:

```json
{
  "recruitment_external_applicant_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  "status": "interview",
  "job_posting_code": "A1B2C3"
}
```

**Response:** Return **2xx** (body ignored). Client timeout **5s**; non-2xx or errors are warned in logs.

**Typical `status` values:** Stages like `applied`, `screened`, `interview`, `offer`, `hired`, `rejected`, plus row statuses such as `negotiating`, `accepted`, `declined` when those drive the notification.

**Triggers (typical `status`):**

| Flow | `status` |
|------|----------|
| `POST .../recruitment/applications` | `applied` |
| `POST .../recruitment/public-apply/{req_code}` | `applied` |

### Offer letter (same external port **8020**)

When HR creates an offer, HworkR **POST**s the full offer JSON to your service (default **`http://127.0.0.1:8020/recruitment/offer-created`**). Configure with **`RECRUITMENT_OFFER_WEBHOOK_URL`**; empty string disables. Implementation: `backend/app/services/recruitment_offer_webhook.py`. Payload and fields: **`docs/external_offer_webhook.md`**.

---

## B. Public apply (candidate → HworkR)

**`POST /api/v1/recruitment/public-apply/{req_code}`** — no auth. Success **201**.  
Example base: `http://127.0.0.1:8080/api/v1/...` (prefix `/api/v1`).

**`req_code`:** Exactly **6** alphanumeric characters; globally unique; normalized to uppercase; invalid → **400**. Resolves to one requisition → its job posting (must be **`open`**).

**Body:** `email`, `password` (≥8), `name`; optional `resume_url`.

```json
{
  "email": "candidate@example.com",
  "password": "SecurePass1",
  "name": "Jane Applicant",
  "resume_url": "https://example.com/cv.pdf"
}
```

**Response (`201 Created`, JSON):** Top-level keys are `application`, `access_token`, `token_type`. The candidate’s platform user id is **`application.candidate_user_id`** (not a separate root field). The application row id is **`application.id`**.

```json
{
  "application": {
    "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "posting_id": "11111111-2222-3333-4444-555555555555",
    "company_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
    "candidate_user_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    "resume_url": null,
    "status": "active",
    "stage": "applied",
    "notes": null,
    "applied_at": "2026-04-18T15:00:00.000000+00:00",
    "updated_at": "2026-04-18T15:00:00.000000+00:00"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Errors (common):** **400** bad code / no posting / not open · **401** wrong password for existing email · **403** email is staff on that company · **404** unknown code · **409** duplicate application.

**Side effects:** Creates user if needed, ensures employee membership, creates application. If the webhook is configured, Part A runs with `applied` and `job_posting_code` = path `req_code`.

---

Company **Webhooks** UI (`app/services/webhooks.py`) is separate from this 8020 integration unless you point it at the same URL.

**Schema details:** `backend/app/schemas/recruitment.py` (`PublicApplyByReqCodeRequest`, `PublicApplyByReqCodeResponse`, `ApplicationOut`).

**See also:** full **offer letter** push to your server when HR creates an offer — `docs/external_offer_webhook.md` (`RECRUITMENT_OFFER_WEBHOOK_URL`).
