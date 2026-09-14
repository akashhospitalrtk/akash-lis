# Minimal LIS MVP

A deliberately small Laboratory Information System for a low-volume hospital laboratory. It supports quick registration, profile-based test ordering, keyboard-friendly result entry, authorization, audit history, a daily worklist, and clean A4 reports.

See [the architecture and directory guide](docs/architecture.md) for routes/controllers/services, shared errors and responses, database versus frontend seed data, Docker integration, and type-safety limits. Registration also supports **Submit & enter values**; reports support editing through the amendment workflow when authorized. Browser Back/Forward and reload restore the current page and saved order.

Doctors can use **Patients** to search hospital-wide, check order status, view published results, print/download PDF reports and append attributed clinical notes that appear on reports. Administrators and hospital IT manage staff roles and departments through **Team**. See [doctor access and staff administration](docs/doctor-access.md) for permissions, deployment and the end-to-end workflow.

## Workflow and data model

`Registration → order tests → enter/review results → authorize → print`

Each laboratory order stores the patient details needed to make the report a permanent clinical record. If the hospital has a master patient system, the order instead keeps only the external source and patient identifier as its link; a read-only adapter retrieves details from that system during registration. This avoids creating a competing master-patient database.

The core tables are:

| Table | Purpose |
| --- | --- |
| `users` | Administrator, technician, and report-authorizer accounts |
| `test_profiles` / `profile_parameters` | Reusable investigations, parameters, units, ranges and result types |
| `lab_orders` | One accession/sample and its report-ready patient snapshot |
| `order_tests` / `test_results` | Ordered profile snapshots and values entered for each parameter |
| `audit_events` | Who created, changed, imported, authorized or printed a record |

The analyzer boundary is intentionally small: `backend/src/services/analyzerService.ts` accepts normalized results, while transport adapters can later translate serial, TCP/IP, ASTM, HL7, or vendor formats into it. The MVP includes manual entry and a CSV importer. Actual analyzer communication is deferred until its exact model and communication documentation are available.

## Investigation catalogue and clinical safety

An administrator can open **Investigations** to create and maintain any laboratory panel or single test. A test can contain numeric, free-text, positive/negative, or controlled-list fields; numeric fields can have separate sex/age reference intervals and safe calculated results. The starter catalogue includes CBC, LFT, KFT, thyroid, HbA1c, beta-hCG/UPT, urine, malaria, dengue, semen analysis, Pap smear, HBsAg/HIV and common viral markers.

The catalogue is intentionally administrator-only. Test and parameter codes are editable while their internal IDs stay stable; update external analyzer mappings after a rename, removed fields are made inactive rather than deleting clinical history, and every catalogue change is audited. Technicians can register and enter results but cannot alter result fields or reference ranges. Only an authorizer or administrator can authorize and print a completed report; authorized reports are read-only. Reference intervals and result options must be verified and approved locally by the laboratory's qualified medical professional before clinical use.

## Run

1. Create the root environment file and replace its `JWT_SECRET` placeholder with a unique random value of at least 32 characters. Docker Compose runs the backend in production mode and will deliberately refuse to start with the placeholder secret:

   ```bash
   Copy-Item .env.example .env
   ```

   `backend/.env.example` and `frontend/.env.example` are available for non-Docker local development.

2. Start the complete system:

   ```bash
   docker compose up --build
   ```

3. Open [http://localhost:8080](http://localhost:8080). The first screen lets you create the first administrator account.

4. Stop it when finished:

   ```bash
   docker compose down
   ```

Database migrations run automatically when the backend starts. Common-test seed data is loaded only into an empty catalogue so edits survive restarts. See [the catalogue setup guide](docs/catalogue-setup.md) for H360, Chem 7, report templates, methods, values and LOINC codes. To run them manually inside the container:

```bash
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

## Users, database access, and login

There are two different types of credentials:

- **Database credentials** are used by the backend to connect to PostgreSQL. They are stored in `backend/.env` as `DATABASE_URL`.
- **LIS user credentials** are used by people to sign in through the browser. They are stored in the LIS `users` table and are created from the application.

### First-time login and administrator creation

The database must be running, the backend must be connected to it, and the schema must have been migrated before the first account can be created. Open the frontend URL. If there are no LIS users, the application shows **Create the laboratory administrator**. Complete that form and submit it. This creates the first `ADMIN` account and signs you in automatically.

There is no general public signup page. After the first administrator signs in, open **Users** to create technician and authorizer accounts. Those users sign in from the **Welcome back** screen with the username and password assigned by the administrator.

### Local development without Docker

PostgreSQL can be managed with pgAdmin, the `psql` command-line tool, or a PostgreSQL service started by another tool. pgAdmin is not required.

1. Create a PostgreSQL database named `lis` and a login role named `lis` with password `lis_dev_password`. The role must have **Can login** enabled and own or have access to the `lis` database.
2. Create `backend/.env` from `backend/.env.example` and set:

   ```env
   DATABASE_URL=postgresql://lis:lis_dev_password@localhost:5432/lis
   JWT_SECRET=local-development-secret
   ```

3. Install and initialize the backend:

   ```powershell
   cd backend
   npm install
   npm run migrate
   npm run seed
   npm run dev
   ```

4. In another terminal, create `frontend/.env` with the direct local API URL and start the frontend:

   ```env
   VITE_API_URL=http://localhost:4000/api
   ```

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

5. Open the Vite URL, usually `http://localhost:5173`, and create the first administrator from the setup screen.

To verify the backend before opening the frontend, visit `http://localhost:4000/api/health` (standalone development) or `http://localhost:4044/api/health` (Docker). A working setup returns `{"success":true,"message":"Success","data":{"status":"ok","database":"connected"}}`.

### Using pgAdmin

In pgAdmin, register the local PostgreSQL server using the PostgreSQL administrator credentials created during PostgreSQL installation. The pgAdmin master password is only for pgAdmin and is not the LIS database password.

To configure the application role without SQL, expand **Login/Group Roles**, right-click `lis`, select **Properties**, set the password on **Definition**, set **Can login?** to **Yes** on **Privileges**, and save. The values must match `backend/.env`.

You do not need to create LIS tables manually. `npm run migrate` creates the tables, and `npm run seed` loads the test laboratory profiles.

### Common login and setup errors

- `role "lis" is not permitted to log in`: enable **Can login?** for the `lis` PostgreSQL role.
- `password authentication failed for user "lis"`: reset the role password to match `DATABASE_URL`.
- `database "lis" does not exist`: create the PostgreSQL database named `lis`.
- `Request failed (404)` from a local Vite frontend: set `VITE_API_URL=http://localhost:4000/api` in `frontend/.env` and restart Vite. `/api` by itself is for Docker's Nginx proxy.
- `database: disconnected`: PostgreSQL is stopped, the database credentials are wrong, or the backend is using a different `DATABASE_URL`.

## Operations

- Logs: `docker compose logs -f backend` or `docker compose logs -f frontend`
- Backup: `docker compose exec -T db pg_dump -U lis lis > lis-backup.sql`
- Restore: `Get-Content lis-backup.sql | docker compose exec -T db psql -U lis lis`
- Environment values: edit `backend/.env` for database/JWT/hospital details and optional external patient lookup. Rebuild after changing frontend build-time variables.
- Docker health checks: backend `http://localhost:4044/api/health`; frontend `http://localhost:8080/health` (use the root `.env` `FRONTEND_PORT` override if set, currently 8081 locally).

## External patient lookup

Set `HOSPITAL_PATIENT_API_URL` to a hospital read-only endpoint that accepts `?query=UHID-or-name` and returns an array of `{ id, uhid, name, age, gender, mobile, referringDoctor, patientType }`. Set `HOSPITAL_PATIENT_API_TOKEN` if required. The API is only queried during lookup; no external patient row is created locally.

## Project layout

- `frontend/` — React user interface
- `backend/` — Express API, authorization, workflow and integrations
- `database/` — PostgreSQL migrations and clinical-profile seed data
- `docker/` — Nginx configuration
- `docs/` — data model and analyzer integration notes

See [docs/analyzer-integration.md](docs/analyzer-integration.md) before connecting a CBC analyzer.
