# Akash LIS — technical handbook

Canonical technical reference, updated 3 October 2026. It replaces the former
setup, architecture, access, operations and deployment guides. Font licences and
the distinct catalogue/analyzer references remain because they contain required
attribution or clinical guidance rather than duplicate general documentation.

## Scope and release boundary

Implemented: manual registration, optional read-only HMS lookup, investigation
catalogue, sample acceptance/processing, results and CSV import, authorization,
amendments, clinical notes, PDF/print, report design, staff roles/departments,
archival removal, CSV export and backups.

Still site-dependent or pending: confirmed HMS identity mapping/connectivity,
live instrument protocols, payment integration, critical-result acknowledgement,
expanded account/password-change screen, HTTPS and security hardening, clinical
assay approval and client acceptance. Payment must never authorize reports.
Team manages staff today. Do not promise pending features as implemented.

## Startup and troubleshooting

Existing development URL: **http://localhost:8081**. Browser clients use
`http://SERVER-LAN-IP:8081`, not their own localhost. Only the central server runs
Docker/PostgreSQL/backend. Start Docker Desktop and wait for the engine first.

```powershell
cd D:\lis
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LIS.ps1 -OpenBrowser
docker compose ps
```

Check `/health` and `/api/health` at the same URL. If both pass, inspect the failing
browser's exact URL, session and console; try a private window. If setup appears
on an existing installation, verify the project/volume before creating accounts.
`docker compose logs --tail 40 backend` diagnoses configuration/migration errors.
Do not share logs with secrets/patient data. Backup bind-mount directories must
exist. Restart policies work only while Docker itself is running.

Never run `docker compose down -v`, delete database volumes or change the installed
Compose project name to fix startup. That can remove or hide existing data.

## Architecture and junior developer file map

`Browser -> Nginx /api -> routes -> validation/auth -> controller -> service -> PostgreSQL`

Frontend provides interaction; backend is authoritative for permissions,
calculations and report release. Services write business data and audits in
transactions. JSON success is `{ success: true, message: 'Success', data: ... }`.
PDF/CSV endpoints require authentication and are not public static files.

### Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6 and CSS |
| Web/proxy | Nginx serving the frontend and proxying `/api` |
| Backend | Node.js, Express 4, TypeScript and Zod validation |
| Database | PostgreSQL 16 with SQL migrations, `pg` and Prisma 7 |
| Authentication | JSON Web Tokens and bcrypt password hashing |
| Reports | PDFKit with embedded licensed fonts |
| HMS integration | Optional read-only Microsoft SQL Server connector using `mssql` |
| Runtime | Docker Compose with frontend, backend, database and backup services |
| Tests | Node test runner plus focused Playwright browser checks |

| Frontend file under `frontend/src/` | Purpose |
| --- | --- |
| `main.tsx`, `App.tsx` | Entry, shell/session, page and order loading |
| `hooks/useNavigation.ts` | URL navigation and browser history |
| `api.ts`, `types.ts`, `lib.ts` | API/token/downloads, contracts, permissions/formatting |
| `components/AuthScreens.tsx` | First-administrator setup and login |
| `components/RegisterOrder.tsx` | Patient lookup, demographics, bounded investigation list and submission |
| `components/Worklist.tsx` | Sample/workflow queues |
| `components/ResultEntry.tsx` | Value entry, review and authorization |
| `components/PatientDetailsEditor.tsx`, `OrderActions.tsx` | Audited corrections and order actions |
| `components/InvestigationCatalogue.tsx`, `ParameterEditor.tsx` | Tests, fields, methods, units, ranges/formulas |
| `catalogueTemplates.ts`, `catalogueOptions.ts`, `catalogueDraft.ts` | Editable starter templates/options, not patient results |
| `components/Report.tsx` | Report actions, HTML guide and actual PDF viewer |
| `components/ReportDesign.tsx`, `ReportLetterhead.tsx`, `reportTemplate.ts` | Saved design editor and letterhead/contracts |
| `components/DoctorWorkspace.tsx`, `DoctorNotes.tsx` | Published results and clinical notes |
| `components/UserAdmin.tsx`, `RecordsExport.tsx` | Team and controlled CSV export |
| `theme.css`, `styles.css`, `report-letterhead.css` | Shared UI and report styling |

| Backend/infrastructure location | Purpose |
| --- | --- |
| `backend/src/app.ts`, `server.ts` | Assemble Express; start/stop server |
| `backend/src/routes/`, `controllers/` | Route permissions/validation; HTTP translation |
| `backend/src/services/orderWorkflowService.ts` | Registration, values, authorization/amendments |
| `backend/src/services/orderService.ts`, `orderRevisionService.ts` | Order reads and revision helpers |
| `backend/src/services/recordDeletionService.ts` | Archival removal/approval/throttling |
| `backend/src/services/authService.ts`, `permissionService.ts` | Accounts, current roles and permission unions |
| `backend/src/services/reportPdfService.ts` | Canonical A4 PDF renderer/pagination |
| `backend/src/services/reportTemplateService.ts` | Template revisions and audit |
| `backend/src/services/clinicalService.ts` | Published projections, notes and protected PDF access |
| `backend/src/services/resultService.ts`, `analyzerService.ts` | Range matching/results and normalized imports |
| `backend/src/integrations/hospitalSqlServer.ts` | Parameterized read-only SQL Server view search |
| `backend/src/schemas/`, `middleware/`, `core/` | Zod validation, authentication, shared responses/errors |
| `backend/src/database/`, `types/`, `utils/` | Pool/transactions/Prisma, types and shared utilities |
| `backend/src/scripts/` | Schema, seed, catalogue import and connectivity tools |
| `backend/src/config/reportTemplate.defaults.json` | Shared defaults; saved templates take precedence |
| `database/001_schema.sql`, `002_seed_profiles.sql` | Idempotent schema and empty-catalogue seed |
| `backend/prisma/schema.prisma` | ORM model; keep aligned with SQL |
| `backend/assets/`, `frontend/public/letterhead/` | Fonts/licences and letterhead assets |
| `docker-compose.yml`, `docker/nginx.conf`, `docker/backup.sh` | Services, proxy, backup scheduler |
| `backend/test/`, `scripts/` | Synthetic tests, startup/storage/backup checks and packaging |
| `Modern-List-Design/` | Separate design reference, not deployed frontend |

Do not edit generated `dist/`, `backend/generated/`, `node_modules/` or image
archives. Change source, verify, rebuild and recreate the affected service.

## Data and permissions

`lab_orders` stores accession and patient snapshot; `order_tests`/`test_results`
preserve ordered metadata/results; `test_profiles`/`profile_parameters` store the
catalogue. Accounts live in `users`, `departments`, `user_departments`. Audit
tables, `report_amendments`, `clinical_notes`, `report_template` preserve history.

Submit sample leaves registration awaiting processing. Submit & enter values
records acceptance/processing. Results start blank. Authorization freezes values.
Amendments preserve the previous version, require a reason and reauthorization;
doctors cannot see draft amended values. Clinical notes are attributed append-only
records independent of lab authorization. `sample_date` means registration, not
collection; missing collection remains Not recorded.

Roles combine: ADMIN all administration; TECHNICIAN registration/entry;
AUTHORIZER review/release; DOCTOR published results/notes; IT delegated staff;
CATALOGUE_MANAGER investigations. IT cannot grant ADMIN, IT or CATALOGUE_MANAGER.
Account state/roles reload on each API request. Combined technician/authorizer
roles allow the same person to enter and authorize.

Registration deletion is archival: ADMIN needs no password/accession/reason;
AUTHORIZER needs remarks and an active administrator's password; other roles are
blocked. Five failed approval attempts cause 15-minute throttling. Results/audits
remain; HMS patients and sibling orders are unaffected. Printed copies cannot
be recalled. Never replace this with a hard-delete cleanup job.

## Reports and catalogue

Report design edits fonts, copy, colours, spacing, alignment and patient labels.
The live guide uses synthetic data and is not final pagination proof. **Preview
defaults** changes only the editor until **Save design** is used; a save creates
the audited template used by later renders. Reload before saving if another
administrator has changed the design. PDF preview/download/print share the same
renderer. Print from the PDF viewer at A4/100%; physical margins/colours depend
on the printer. Previously downloaded PDFs retain their previous design.
Letterhead/footer and right-aligned signatory repeat on every page. Investigations
that fit a page stay together; larger panels break between complete parameters.
A parameter longer than an entire usable page must continue without truncation.
Patient labels are heavier; amendment wording stays internal.

Methods, units, ranges, formulas and critical thresholds require qualified local
approval. No matching range does not mean normal. Preserve neonatal age units.
Catalogue edits do not silently modify existing orders. Reference refresh is
audited, preserves values and requires amendment for authorized orders. H360 is
three-part differential; do not relabel MID/GRAN as individual cell types.

Distinct references: [catalogue setup](docs/catalogue-setup.md),
[catalogue provenance](docs/india-catalogue.md),
[analyzer boundary](docs/analyzer-integration.md). Live analyzer communication is
not included merely because CSV import or an analyzer template exists.

## HMS SQL Server: exact remaining steps

LIS keeps its own PostgreSQL database. HMS is a read-only patient source, not
payment confirmation. The relationship among `Patient_reg.PM_NO`,
`Patient_InformationMaster.PR_NO` and `Reg_No` is UNCONFIRMED. Do not guess joins
or assume a visit number is the permanent UHID.

1. Confirm server Security > Logins > lis-user is enabled and mapped to the HMS
   database user. An authorized DBA can reset its forgotten password locally.
2. Have HMS IT confirm stable identity and create `dbo.LisPatientLookup` from the
   real schema. Grant SELECT on that view only, not db_owner/sysadmin/write access.
3. Test the view using lis-user. Normalize aliases/types to the contract below.
4. Enable TCP/IP and determine the actual fixed instance port. Schedule any SQL
   Server restart with HMS IT. Restrict firewall access to the LIS server only.
5. Run `Test-NetConnection HMS-IP -Port ACTUAL-PORT` from the LIS host, then test
   inside the backend container too. Host connectivity alone is insufficient.
6. Edit root `.env`, recreate the backend and test Hospital master lookup using
   an approved test patient. Confirm identity/demographics before saving an order.

View aliases: `id` stable unique string <=120; `uhid` string <=80 or NULL;
`name` string 2–160; `age` numeric or NULL; `age_unit` days/weeks/months/years;
`gender` Male/Female/Other or NULL; `mobile` string <=30 or NULL;
`referringDoctor` string <=160 or NULL; `patientType` OPD/IPD/Emergency/Health check
or NULL. Cast numeric identifiers to text; avoid duplicate patients from visits.

```dotenv
HOSPITAL_PATIENT_PROVIDER=mssql
HMS_SQL_SERVER=HMS-SERVER-IP
HMS_SQL_PORT=1433
HMS_SQL_DATABASE=Akash_Hospital_Fbd_Sql
HMS_SQL_USER=lis-user
HMS_SQL_PASSWORD=enter-locally
HMS_SQL_PATIENT_VIEW=dbo.LisPatientLookup
HMS_SQL_ENCRYPT=true
HMS_SQL_TRUST_SERVER_CERTIFICATE=false
```

1433 is an example: verify the actual port. Docker Desktop connecting to SQL
Server on the same Windows PC uses `host.docker.internal`, not container localhost.
Use a trusted TLS certificate; do not silently disable validation. The connector
uses explicit host/port, not instance discovery. Timeouts suggest networking;
login failures suggest auth/mapping; invalid object suggests database/view;
mapping errors suggest aliases/types. `scripts/Inspect-HMS.sql` reads metadata
only and does not expose passwords or patient records.

## Client delivery and upgrade

`scripts/Build-ClientPackage.ps1` builds versioned images and a runtime-only
package under `releases/`. It includes PostgreSQL, portable Compose, schema,
startup/initialization/check scripts, README and SHA256 checksums. It excludes
live credentials, accounts, patients, backups, source dependencies and Git.
Treat `1.2.0-rc.3` as a release candidate until acceptance, not a go-live guarantee.

Fresh installations get starter catalogue/design defaults. The saved local
catalogue/design is database configuration and is NOT copied by an image export.
To reproduce that configuration or transfer records, arrange an approved
configuration/data migration separately; never mix hospitals' records.

On a compatible Windows x64 server with Docker Desktop Linux containers:

```powershell
cd D:\Akash-LIS
# Verify supplied SHA256SUMS.txt before loading images.
docker image load -i images.tar
powershell -ExecutionPolicy Bypass -File .\scripts\Initialize-Client.ps1
# Edit hospital details and protected backup location in .env.
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LIS.ps1 -OpenBrowser
```

Initialize refuses existing .env, generates random private secrets, and fixes the
client project name as `akash-lis`. Restrict access to the installer until first
admin setup is complete. Create named staff accounts and approve tests/design.
No host Node/PostgreSQL is needed. Offline install requires Docker already installed
and image archive present. ARM/Windows-container mode are not verified targets.
Confirm runtime licensing with client IT.

Upgrade: backup and verify restore; load new images; set new LIS_VERSION; recreate
backend/frontend with `--no-build --pull never`. Keep project name/data volume.
Retain previous images and a tested backup. Schema compatibility determines
whether image-only rollback is possible. Existing-data migration needs a private
restore rehearsal before cutover, not an overwrite of live data.

## Backup, storage and operations

Daily backup creates compressed dumps/checksums and checks archive listing.
LIS_BACKUP_DIR must exist; use protected encrypted storage plus an off-machine
copy. Live PostgreSQL is in a Docker volume, not the backup folder. Never put live
data in a cloud-sync directory or delete its volume as cleanup.

```powershell
docker compose exec -T backup /bin/sh /opt/lis/backup.sh once
powershell -ExecutionPolicy Bypass -File .\scripts\Test-Storage.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Test-Backup.ps1
```

Test-Backup proves a synthetic restore, not a particular hospital dump. Perform a
private actual-backup restore drill too. CSV export is not a database backup.
Retention is manual pending policy; no automatic clinical/audit deletion. PDFs
generate on demand. Logs rotate; database/WAL/backups/images have separate growth.
The backup job warns at 80% disk use, but no backup-failure email/SMS is currently
configured. `Test-Storage.ps1` reads aggregate database, table, index, backup and
disk usage without removing records; row estimates are not patient counts.
Autovacuum reuses space but does not necessarily shrink files. Do not run
`VACUUM FULL` as routine live-system cleanup. Measure several weeks of database,
index, WAL, image and backup growth before capacity estimates. If attachments are
added later, keep controlled-size files outside PostgreSQL with protected access,
checksums and backup coverage.

## Development, tests and final acceptance

Docker uses root .env; standalone uses backend/frontend examples. Frontend API
URL is build-time; `/api` is correct behind Nginx. Never commit secrets. Backend
4044 and PostgreSQL 5432 stay private inside Compose.

```powershell
cd backend
npm.cmd ci
npm.cmd run build
node --test test/report-header.test.js test/hospital-sql-server.test.js
cd ../frontend
npm.cmd ci
npm.cmd run build
```

`backend/test/run-access-regression.mjs` requires a dedicated localhost PostgreSQL
URL ending `_test`, creates separate synthetic databases and must never target
hospital data. Browser suites need Playwright; supply PLAYWRIGHT_MODULE_PATH and
REPORT_UI_URL when expected. Check skipped cases; a build is not runtime proof.

Handoff gates: fresh install, first admin, staff access/revocation, registration,
sample/entry/review, authorization/amendment, archival removal, multipage reports,
actual printer, LAN browser, reboot, backup/restore, upgrade/rollback, realistic
multi-user load, qualified assay approval, UPS/time sync, encrypted disks,
HTTPS/private access, secret handling, support and downtime procedures.
The shared DB owner/runtime role and localStorage JWT sessions are not hardened
internet deployment. Do not expose publicly without separate security work.

### Release verification on 2 October 2026

Candidate: `releases/lis-1.2.0-rc.3`. The earlier rc.1/rc.2 packaging attempts
are superseded and must not ship. Fixed fresh-install readiness: PostgreSQL
health now checks TCP, not the temporary initialization server's Unix socket.

Passed locally: architecture, catalogue persistence, range matching, multiple
roles/deletion approval, patient correction, doctor publication/notes, report
design API/browser/PDF tests; 13 PDF/HMS-adapter unit tests; report and bounded
registration browser tests. The optional catalogue browser case was skipped in
the API suite. Synthetic backup tests passed dump/checksum/restore, failed-run
preservation and scheduled recovery. A fresh isolated runtime-only candidate
started, bootstrapped, created/authorized a synthetic order and produced a doctor
PDF; restart retained initialized state. These checks are not client-PC, printer,
multi-user load, site security or clinical acceptance evidence.

The existing local LIS answered health and login checks. The reported browser
startup failure was not reproduced; the exact failed URL/error is still needed.
The running local HMS provider was `api` with SQL connection settings absent.
SQL Server mapping/network credentials must be completed locally before lookup.
No real patients or live credentials are in the release package.
