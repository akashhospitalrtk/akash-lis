# Lean LIS delivery plan (barcode labelling excluded)

## Current capability audit

| Workflow need | Status | Notes |
| --- | --- | --- |
| Patient registration and external hospital lookup | Present | Manual registration plus an optional read-only hospital adapter. |
| Search-as-you-type worklist | Present | Searches accession, UHID and patient name. |
| Prior-registration lookup | Implemented | Reuses a prior laboratory demographic snapshot; it does not create a competing master-patient record. |
| Sample reception, in-process and delivery tracking | Implemented | Registered → Collected → In process → Results pending → Approved → Delivered, with audit events. |
| Batch sample acceptance | Implemented | Technicians can select registered orders in the worklist and accept them together. |
| Age/sex reference intervals and H/L flags | Present | The configured profile snapshot is used in each order. |
| Calculated results and quick-result templates | Present | Formula fields, controlled lists, common values and numeric controls are supported. |
| Critical value warning | Implemented | An administrator configures numeric critical low/high limits. The result screen and report show CL/CH; staff must follow the hospital notification SOP. |
| Analyzer results | Present for CSV | The normalized import path is ready for a vendor-specific ASTM, HL7, TCP/IP or serial adapter. |
| Authorization, signature label, A4 print and audit | Present | Only an authorizer or administrator can authorize/print. |
| Controlled records export | Implemented | Admin-only, audit-recorded CSV export of all test parameters/results for a selected month. |
| Print queue | Planned | Needs local printer/ward routing requirements. |
| Digital signature image | Planned | The current report uses an approved signature label; image signing needs secure file storage and policy approval. |
| WhatsApp, SMS and email dispatch | Planned | Needs an approved provider, consent rules, delivery logs and credentials. |

## Safe operating sequence

1. Register the order; it starts as **Registered**.
2. At specimen receipt, select one or more orders and choose **Accept samples**. This records **Collected**.
3. The technician marks a collected specimen **In process**, then enters or imports results.
4. When all mandatory values are complete, the sample becomes **Results pending**.
5. The authorizer approves the report; its sample workflow becomes **Approved**.
6. Print or distribute according to the local policy, then mark the report **Delivered**.

## Deployment prerequisites

- A qualified laboratory professional must review every reference interval, calculation formula and critical threshold before use.
- Run `npm run migrate` after the PostgreSQL storage issue is resolved, then restart backend and frontend.
- Do not connect an analyzer until its exact interface specification, patient/sample identity rules, and validation process are documented.
- Do not enable automated dispatch without approved consent, a provider account, delivery-failure handling and a privacy review.
- Before any live patient use, complete the [production-readiness checklist](production-readiness.md). A CSV export is useful for record review but is not a database backup.
