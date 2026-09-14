# Doctor access and staff administration

## Agreed workflow

Doctors have hospital-wide access to patient/order status. Only authorized lab results are released for viewing, printing and PDF download. A treating doctor can append clinical notes; notes appear on the report with their author and timestamp, separately from laboratory authorization. Notes cannot overwrite laboratory values or earlier notes.

Preview: **Patients & status → Patient/order → Published results → Print / Download PDF**, with **Clinical notes** beneath the patient details. **Team → Create/edit staff → Role + departments** is available to administrators and IT.

## Permissions

- Doctor: `patient.view`, `status.view`, `result.view`, `report.print`, `report.download`, `clinical_notes.write`.
- Administrator: existing laboratory administration plus staff/department management and clinical access.
- IT: staff/department management only. IT cannot grant or modify ADMIN/IT accounts, including its own account; an administrator manages those roles.
- Technician and authorizer: retain existing laboratory workflow access and can read clinical notes. Authorizers can print/download released reports.

Departments describe staff affiliation and do not restrict patient visibility in this hospital-wide configuration. Accounts may have multiple departments. No department or staff accounts are created automatically.

Roles, department membership and active status are read from the database on every authenticated request, so disabling an account or changing its role affects existing sessions on the next request. Changes to staff access are audited without passwords. Users cannot disable or change the role of their own account.

## Clinical notes and reports

Notes are append-only entries linked to a lab order (patient snapshot), not a full longitudinal EMR. Corrections use a new note referring to the earlier entry. Author name/designation are captured at creation. Notes can be written before release, but draft lab values remain hidden from doctors. Report print/download includes all notes present when generated. Notes added after laboratory authorization are clearly identified as independently authored clinical notes; laboratory authorization covers laboratory results, not later notes. Existing downloaded copies remain unchanged.

## Async operation handling

All clinical and staff controllers use the shared `asyncHandler`, which forwards rejected promises to the centralized error middleware. Zod validates inputs before service calls. Services use `async/await` with transactional rollback; frontend operations use `try/catch/finally` and explicit loading/error state. Patient searches cancel stale requests. A 401 clears the browser session and returns the user to sign-in. PDF generation resolves only after the document stream ends and propagates stream errors.

## How to use

1. Sign in as an administrator and open **Team**.
2. Add departments, then create individual doctor, technician, authorizer or IT accounts. Assign one or more departments as appropriate.
3. To update an existing account, choose **Edit access**, change its role/departments/active state, and choose **Save access**. IT can manage clinical staff; administrator/IT accounts require an administrator.
4. Doctors sign in on the same login page and land on **Patients**. Search across all dates by patient name, UHID or accession, or filter report status. Each row represents a laboratory order/patient snapshot.
5. Open a patient to check progress or add a clinical note. **View results & report** becomes available after lab authorization. **Download PDF** saves a real PDF; **Print report** rechecks release status and opens the browser print dialog.
6. During a laboratory amendment, new doctor requests for results/print/download are blocked until reauthorization. Previously downloaded copies are not revoked.

Reports include English, common medical symbols and Hindi text using bundled OFL-licensed Noto fonts. Printing is audited as a request; browsers cannot confirm that a physical printer produced a page. Download events identify the lab revision and included clinical-note IDs.

## Validation

Use a disposable PostgreSQL database to verify actual login, admin/IT assignment boundaries, doctor draft-result denial, hospital-wide search, publication, note attribution, PDF output, forbidden lab mutations, account disablement, role changes and audit events. Build both applications and exercise doctor and administrator screens in the browser with synthetic records.

Backend commands (set `DATABASE_URL` to a fresh local database ending in `_test`, never the hospital database):

```powershell
npm.cmd run build
node --test test/doctor-access.integration.test.js
node --test test/doctor-pdf.test.js
```

Run `test/doctor-browser.mjs` against a separate fresh `_test` database after building the frontend. It uses `PLAYWRIGHT_MODULE_PATH` for an installed Playwright module and writes only synthetic screenshots/PDFs to the ignored `backend/test-results/` folder. The PDF test consumes the PDF created by the integration test.

After updating the running Docker installation, startup runs the idempotent schema migration automatically:

```powershell
docker compose up -d --build backend frontend
```

The current local URL is `http://localhost:8081`; LAN clients use the server's IP with the same port. A non-Docker installation needs `npm.cmd run migrate` in `backend` before starting the new backend.

Existing Docker/LAN ports are preserved. No public internet deployment or identity-provider integration is included in this change.
