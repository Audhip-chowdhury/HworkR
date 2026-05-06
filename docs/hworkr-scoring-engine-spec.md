# HworkR — Scoring engine specification (from product Q&A)

**Status:** Product intent captured from interactive Q&A, ready for implementation tuning (numeric weights, exact thresholds, and per-company config).

**Code map:** For module-by-module mapping to models, API routes, and hook points in this repository, see [hworkr-scoring-implementation-map.md](./hworkr-scoring-implementation-map.md).

**Version:** 0.1  
**Date:** 2026-04-27

---

## 1. Purpose

This spec defines how HR-related actions in HworkR are translated into a **0–100 quality score** per action (or per review period) using **four quality dimensions**, aligned with the product design: **completeness**, **accuracy**, **timeliness**, and **process adherence**.

It reflects these **product choices**:

- **Recruitment:** missing **key** job or posting information must **always** reduce the score. Because the app prevents large workflow skips, **process** issues that show up only as **gaps or inconsistencies** should **lightly** affect the score.
- **Employee records:** missing **important** personal information should reduce the score **a little** (nudge, not a harsh penalty).
- **Leave & attendance:** how **fast** approvals/denials happen is part of the score (timeliness is **in scope**).
- **Performance & learning:** if **required** training is still incomplete **after the due date**, the score of whoever is responsible for follow-up in the app **should go down** (magnitude: implement as **medium+**; tune numerically).
- **Pay, benefits, compensation:** pay or offer amounts **far outside** the **normal pay range** for the role are **high-severity** accuracy issues (**penalize a lot**).
- **Compliance & policies:** **late** or **missing** policy read/acknowledgment by the expected time is **high-severity** for timeliness/compliance posture (**penalize a lot**).

---

## 2. Global score model (four dimensions)

Each scored event produces a vector:

| Dimension              | Code                  | Role in this spec |
|------------------------|----------------------|--------------------|
| Completeness           | `completeness`        | “Was everything that should be filled, filled?” |
| Accuracy / consistency| `accuracy`            | “Does it match policy, ranges, and invariants?” |
| Timeliness             | `timeliness`          | “Was it within the expected time?” |
| Process adherence     | `process_adherence`   | “Did the work follow the intended order and role rules, within what the app allows?” |

**Composite (example):** use a weighted average of the four dimensions, consistent with the codebase pattern:

- `completeness` 0.25  
- `accuracy` 0.30  
- `timeliness` 0.20  
- `process_adherence` 0.25  

*(Config should live in `ScoringRule` / `scoring_rules` so weights can be adjusted per company without changing this spec’s intent.)*

---

## 3. Severity model (turning “a little / a lot / always” into math)

The Q&A used **plain-English** severity. Implementation should map to **one of** these tiers (exact numbers are suggestions; tune in calibration):

| Tier   | Name          | Approx. impact on a dimension (typical) | When to use (from Q&A) |
|--------|---------------|----------------------------------------|-----------------------------|
| S0     | None / ignore | 0 or not applicable                     | (Not used in current answers) |
| S1     | Nudge         | small deduction                          | Employee profile missing non-critical but important fields; “holes” in hiring that are not true skips |
| S2     | Standard      | moderate                                 | Overdue **required** training (follow-up owner) |
| S3     | Strong        | large                                    | Missing key recruitment fields (**always**); pay far outside band; late/missing policy ack |

**Rules:**

- **“Always”** (recruitment completeness) maps to: **a completeness penalty every time the condition holds**, and at least **S2** on the completeness dimension for that event.
- **“A lot”** (pay out of band; policy ack late/missing) maps to: **S3** on the relevant dimension(s), usually **accuracy** (pay) or **timeliness** (policy by deadline) / **compliance posture** (composite handling through dimensions).
- **“A little”** (profile gaps; hiring holes when skips are not possible) maps to **S1** on the relevant dimension.

---

## 4. Rule catalog (by module)

Each rule: **id**, **dimension (primary)**, **severity when triggered**, **actor scored** (if known from context), **trigger (plain English)**.

### 4.1 Recruitment (job requisitions, postings, pipeline, offers)

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `R-REQ-COMP-01` | completeness     | S2+      | Requisition or posting is missing **key** information (clear description, deadline, or defined “what we need”) | “Always” penalize when incomplete |
| `R-PROC-HOLE-01` | process_adherence / completeness | S1  | Inconsistencies or missing linked info when the app already blocks true stage skips | Small penalty only |

*Implementation hint:* “Key fields” should be a **configurable list** per company. Score on publish/save/transition events.

### 4.2 Employee records (profile, org fields, documents)

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `E-PROF-COMP-01` | completeness     | S1       | Important personal details missing (e.g. contact, address, emergency contact) | “A little” — cumulative rubric is OK |

### 4.3 Leave & attendance

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `L-APR-TIME-01` | timeliness        | S2*      | Time from request created to approve/deny decision exceeds policy SLA | User said this **should** be scored; *exact SLA is a config* |

*`*`* Tune numeric severity with HR (e.g. 24h vs 48h).

### 4.4 Performance & learning (goals, reviews, training)

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `T-DUE-OWN-01`  | timeliness + completeness | S2+ | **Required** training still not completed by **due date** for work owned by a role the app can attribute (assigner / HR / manager per product rules) | User: score of responsible party **should go down** |

*Clarify in implementation:* who is the “owner” in data (e.g. HR who assigned, vs employee) — the engine must use **one** consistent rule; if ambiguous, prefer **lowest** penalty or **split** metrics.

### 4.5 Pay, benefits, compensation (offers, pay runs, structures)

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `C-PAY-BAND-01` | accuracy          | S3       | Stated comp (offer or salary change) is **far outside** the company’s **normal pay range** for that job/grade | “A lot” — consider hard cap on dimension score for severe outliers |

*Implementation hint:* use job catalog **salary band** (or equivalent) vs offer/payroll payload fields that represent annualized comp.

### 4.6 Compliance & policies (policy documents, acknowledgments, audit)

| Rule ID        | Primary dimension | Severity | Trigger (product) | Notes |
|----------------|------------------|----------|--------------------|--------|
| `A-POL-ACK-01` | timeliness        | S3       | User has **not** acknowledged a policy by the **expected time** (or acknowledges **late**) | “A lot” for late/missing |

*Optional follow-up (not in Q&A but compatible):* separate rule for `process_adherence` if ack must happen before system access; scope as needed.

---

## 5. How events produce scores (pipeline)

1. **Detect** a business event (e.g. posting saved, leave decided, offer created, week-end training check, policy due date passed).
2. **Evaluate** applicable rules in §4 for that module and event type.
3. **Set dimension scores (0–100)** per dimension using severity tiers and any continuous formulas (e.g. SLA overage curve for `L-APR-TIME-01` and `A-POL-ACK-01`).
4. **Merge** with defaults when a dimension is not applicable (either omit from weighted average for that event or set neutral 85–100 per existing code patterns; align with `activity_tracking` / `ScoringRule`).
5. **Compute** composite using configured weights; persist to `activity_logs.quality_score` and `quality_factors_json`.

---

## 6. SLAs to configure (defaults TBD in implementation)

| Topic              | Suggested start | Owner            | Tied rules        |
|--------------------|-----------------|------------------|-------------------|
| Leave decision     | 24h calendar    | HR/approver      | `L-APR-TIME-01`   |
| Policy acknowledgment | 14d from publish | all members  | `A-POL-ACK-01`   |
| Overdue training   | due date EOD   | follow-up role   | `T-DUE-OWN-01`   |

*Replace with your company’s real values.*

---

## 7. What this spec does **not** lock yet (implementation pass)

- Exact **numeric** curves (linear vs step) for S1/S2/S3.  
- **Per-company** required-field lists for `R-REQ-COMP-01` and `E-PROF-COMP-01`.  
- **Who** is the training “owner” in every edge case.  
- **Recruitment** rules already partially enforced by the UI; detection of “holes” may require **inference** (missing optional linked records) — document heuristics in code comments when implemented.

---

## 8. Traceability to Q&A (for audits)

| Topic | Your answer (summary) | Spec anchor |
|-------|------------------------|-------------|
| Key info missing on job requisition / posting | Always lower score | `R-REQ-COMP-01` |
| Skips blocked; only holes possible | Only small impact | `R-PROC-HOLE-01` |
| Employee personal details missing | A little | `E-PROF-COMP-01` |
| Leave approval speed | Yes, score it | `L-APR-TIME-01` |
| Required training past due (follow-up) | Should go down | `T-DUE-OWN-01` |
| Pay far outside normal range for role | A lot | `C-PAY-BAND-01` |
| Policy read/ack late or missing | A lot | `A-POL-ACK-01` |

---

## 9. Suggested next steps (engineering)

1. Add **rule keys** in config (`criteria_json` on `ScoringRule` or a new `scoring_rule_definitions` table).  
2. Map each **rule** to a **scoring function** in `app/services/scoring_rules/` (or similar) with unit tests.  
3. Enqueue **time-based** rules (`T-DUE-OWN-01`, `A-POL-ACK-01` grace windows) on a **scheduler** or **daily job** as needed.  
4. Run a **pilot** with 2–3 companies, tune S1–S3 numeric mappings against sample data.

---

*End of spec.*
