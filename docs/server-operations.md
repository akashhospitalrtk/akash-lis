# LIS server: settings, backups, HDD and HMS

These instructions apply to Docker Compose in `D:\lis`. Run commands in PowerShell on the server. Staff PCs use the browser; they need no database credentials or Docker installation.

## Which environment file?

| How you start LIS | Settings used |
| --- | --- |
| `docker compose ...` from `D:\lis` | `D:\lis\.env`, passed to containers by `docker-compose.yml` |
| `npm run dev` inside backend | `backend/.env` |
| `npm run dev` inside frontend | `frontend/.env` |

Compose passes only variables referenced in the Compose file. Adding an arbitrary new variable to root `.env` does not automatically pass it to the backend. Shell environment variables can override root `.env`; `docker compose --env-file ...` can select a different file. Avoid sharing the full output of `docker compose config`, because it includes secrets. `docker compose config --quiet` validates without printing them.

Frontend `VITE_*` values become visible in browser JavaScript. Never put database passwords, JWT secrets or HMS tokens in them. Frontend/backend `.env` files are excluded from Docker build context.

### Change the browser port

Edit root `.env`:

```dotenv
FRONTEND_PORT=8082
VITE_API_URL=/api
```

Then run:

```powershell
cd D:\lis
docker compose up -d --no-deps frontend
```

Open `http://localhost:8082` on the server or `http://SERVER-LAN-IP:8082` on a staff PC. Update the server's LAN firewall rule for that port. Do not forward it through the internet router. A Compose fallback such as `${FRONTEND_PORT:-8080}` applies only when the variable is unset or empty; root `FRONTEND_PORT=8081` overrides that fallback. No frontend `.env`, Nginx or backend port change is needed.

Changing root environment values requires `docker compose up -d ...` to recreate the affected container. `docker compose restart` does not load new container environment values. Changing `VITE_API_URL` requires rebuilding the frontend because it is compiled into JavaScript.

## What Nginx does

Nginx is already inside the frontend image; no separate Windows installation is required. Configuration: `docker/nginx.conf`, copied into the image by `frontend/Dockerfile`.

```text
Staff browser -> SERVER:8081 -> Nginx:80
                                 /tests, /reports -> React frontend
                                 /api/orders      -> backend:4044/api/orders
                                                        -> PostgreSQL db:5432
```

`backend` and `db` are private Docker service names. Nginx serves HTML/CSS/JavaScript, forwards API requests, and returns `index.html` for browser routes so reloads work. Authentication, permissions and database operations belong to the backend. Current Nginx configuration is HTTP; HTTPS certificates/TLS are a separate deployment task.

Current API forwarding:

```nginx
location /api/ {
  proxy_pass http://backend:4044/api/;
  # Existing HTTP version and forwarding headers remain here.
}
```

| Requested change | What to edit |
| --- | --- |
| Browser port `8081` to `8082` | Root `.env` `FRONTEND_PORT`; recreate frontend |
| Add API endpoint `/api/example` | Appropriate `backend/src/routes/` route, controller and service; frontend caller as needed. Nginx already forwards `/api/` |
| Change backend internal port `4044` | Compose backend `PORT`, `expose`, backend health check, and Nginx `proxy_pass` together |
| Change API prefix `/api` everywhere | Root `VITE_API_URL`, Nginx location/proxy URI, `backend/src/app.ts` mount and Compose backend health-check URL; review other hardcoded `/api` references and tests |
| Change HMS connection details | Root `.env` API or SQL Server settings; recreate backend |

After editing Nginx, rebuild because its configuration is copied into the image:

```powershell
docker compose up -d --build frontend
docker compose exec frontend nginx -t
Invoke-RestMethod http://localhost:8081/health
Invoke-RestMethod http://localhost:8081/api/health
```

Use your actual port. `/health` checks Nginx; `/api/health` also checks backend/database. Keep trailing slashes deliberate: Nginx replaces the matching location prefix with the URI in `proxy_pass`. Changing `/api/` to `/` there would change what the backend receives. See [Nginx proxy_pass documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

## Activate daily backups on the destination server

The `backup` Compose service reuses `postgres:16-alpine`. It adds one small container running PostgreSQL client commands, with no additional database server or published port. It does not need another image build.

1. Choose and create a folder on the server HDD, for example:

   ```powershell
   New-Item -ItemType Directory -Force E:\LIS-backups
   ```

2. Add these settings to the server's root `D:\lis\.env` (forward slashes work for Windows paths):

   ```dotenv
   LIS_BACKUP_DIR=E:/LIS-backups
   BACKUP_INTERVAL_SECONDS=86400
   ```

3. Start the database and backup service:

   ```powershell
   cd D:\lis
   docker compose config --quiet
   docker compose up -d db backup
   docker compose logs --tail 30 backup
   docker compose ps
   ```

The first backup runs immediately if no recent successful backup exists. Subsequent backups run about every 24 hours after the previous success, not at a fixed clock time. Failed backups retry every minute. A missed backup runs when Docker/the service resumes. The PC, Docker and database must be running; configure Docker Desktop to start when signing in. Restart policies take effect while Docker is running and do not start Windows/Docker themselves.

If `LIS_BACKUP_DIR` is absent, the default is `D:\lis\backups`. The selected folder must already exist; an unavailable HDD must be fixed before starting the backup service. Backups are sensitive: limit Windows folder access and use an encrypted drive. Keep another protected copy off the server for server/disk failure.

Files include:

- `lis-<UTC timestamp>-<unique suffix>.dump`: compressed PostgreSQL database backup.
- Matching `.sha256`: checksum for detecting changes or copy corruption.
- `last-success`: time and filename of the last completed backup.
- `last-failure`: present after a failed attempt, cleared on the next success.
- `storage-history.csv`: total database bytes and backup bytes at each success; no patient identifiers.

The dump contains LIS tables, users, orders, results and history. HMS SQL Server data, Docker images, root `.env`, cluster-wide PostgreSQL roles and browser-downloaded PDFs require separate handling. Archive listing validation/checksums are performed; they are not a substitute for an actual restore test. [PostgreSQL documents](https://www.postgresql.org/docs/16/app-pgdump.html) that `pg_dump` makes a consistent snapshot while the database is in use.

### Backup now, check status, or change HDD

```powershell
docker compose exec backup /bin/sh /opt/lis/backup.sh once
docker compose exec backup /bin/sh /opt/lis/backup.sh health
docker compose logs --tail 30 backup
```

To change HDD later: create the new folder, change `LIS_BACKUP_DIR`, then run `docker compose up -d --no-deps backup`. New backups go there; existing backup files remain in the old folder. Copy any archives you want to retain and compare checksums. Changing this setting does not move the live database.

Old completed backups are retained; this version does not delete them automatically. Review HDD free space and archive retention regularly. An 80%-full warning appears in backup logs. The backup service becomes unhealthy on a failed attempt or a stale backup, but no email/SMS notification is configured.

### Where the live database lives, and how to move it

Live data is in Docker named volume `lis_postgres_data` (usually `lis_lis_postgres_data` as the actual name), mounted inside PostgreSQL at `/var/lib/postgresql/data`. It is independent of images and dump files.

On Windows/WSL, Docker manages the volume inside its virtual disk. To choose another physical drive, use **Docker Desktop -> Settings -> Resources -> Advanced -> Disk image location**, following the options available in that installation. This moves Docker's managed storage, potentially including other projects; it is different from the backup folder. [Docker WSL storage documentation](https://docs.docker.com/desktop/features/wsl/).

Before moving existing data, complete a dump and verify that it can be restored. Stop LIS during the Docker disk relocation, then start it and check previous reports. Do not replace the PostgreSQL volume mapping with an empty HDD folder: that creates an empty database at the new location. Do not use `docker compose down -v`; it deletes named volume data.

Monitor both the drive containing Docker's virtual disk and the backup HDD:

```powershell
Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free
Import-Csv E:\LIS-backups\storage-history.csv | Select-Object -Last 10
docker compose exec -T db psql -U lis -d lis -c "SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;"
```

Use the actual PostgreSQL user/database if customized. Database size includes table/index overhead; image/build-cache space is separate. At low daily volume, measure monthly growth before estimating capacity; backup history itself also takes space.

### Verify a restore without replacing the live database

Use a separate temporary PostgreSQL container/database with synthetic credentials, copy a chosen dump into it, restore with `pg_restore --exit-on-error`, then check table counts and representative records locally. Do not restore over `lis` to test a backup. The repository's `scripts/Test-Backup.ps1` verifies the backup implementation against disposable synthetic data; it does not verify a particular hospital backup. A hospital backup restore drill needs its own private destination and review before an upgrade or migration.

## HMS lookup: API or SQL Server

`HOSPITAL_PATIENT_API_URL` is an HTTP patient-search endpoint. LIS calls it with `?query=...`. `HOSPITAL_PATIENT_API_TOKEN` is an optional API access key, sent as `Authorization: Bearer <token>` by the backend. It is not a SQL Server login, LIS login or JWT secret. Leave both blank when no API is available.

The optional direct SQL Server connector uses `mssql` with SQL authentication, parameterized searches, a maximum of 20 matches, two pooled connections and five-second connection/query timeouts. The existing **Hospital master** button uses the selected provider. Patient lookup executes SELECT only; enforce that restriction with a SQL login granted SELECT only on the integration view. It requires no separate API container. See [the SQL Server driver's documentation](https://github.com/tediousjs/node-mssql).

Tomorrow, collect these details from the HMS administrator/SSMS:

- SQL Server hostname/IP, instance name and actual TCP port. This connector uses host + explicit TCP port, not instance discovery.
- Database and schema; existing integration table/view name and its column names/types.
- SQL authentication login name and its permissions. Enter its password directly into the server root `.env`, not chat or frontend.
- Mapping for stable patient ID, UHID, full name, current age/DOB, age unit, gender, mobile, referring doctor and visit type.
- Whether the new integration object actually reads current HMS data. An empty integration table does not synchronize itself.
- Server TLS certificate setup and the expected trust chain.

Use a read-only SQL view that exposes these exact aliases/types (map from the real schema after reviewing it):

| View column | Contract |
| --- | --- |
| `id` | Stable unique string, required, at most 120 characters |
| `uhid` | String up to 80 characters, or NULL |
| `name` | Required patient name, 2-160 characters |
| `age` | Numeric current age, or NULL; do not invent missing age |
| `age_unit` | `days`, `weeks`, `months`, or `years` |
| `gender` | `Male`, `Female`, `Other`, or NULL for unknown |
| `mobile` | String up to 30 characters, or NULL |
| `referringDoctor` | String up to 160 characters, or NULL |
| `patientType` | `OPD`, `IPD`, `Emergency`, `Health check`, or NULL |

One row per stable patient ID avoids ambiguous selections. Map numerical IDs to strings, normalize known gender codes, and calculate age accurately from DOB in the view if appropriate. Existing aged copies must be kept current by the HMS integration owner. Do not silently convert unknown gender to Male or interpret a child's months as years.

Once the view and SELECT-only permissions are verified, configure root `.env`:

```dotenv
HOSPITAL_PATIENT_PROVIDER=mssql
HMS_SQL_SERVER=host.docker.internal
HMS_SQL_PORT=1433
HMS_SQL_DATABASE=YOUR_EXISTING_HMS_DATABASE
HMS_SQL_USER=YOUR_EXISTING_READ_ONLY_LOGIN
HMS_SQL_PASSWORD='ENTER_LOCALLY'
HMS_SQL_PATIENT_VIEW=dbo.LisPatientLookup
HMS_SQL_ENCRYPT=true
HMS_SQL_TRUST_SERVER_CERTIFICATE=false
HOSPITAL_PATIENT_API_URL=
HOSPITAL_PATIENT_API_TOKEN=
```

`host.docker.internal` reaches SQL Server installed on the Docker host PC; use the actual private hostname/IP when SQL Server is on another PC. Configure TCP/IP and permit only the LIS server through the SQL Server firewall. SQL authentication must be enabled for this connector. The default verifies TLS certificates; install/trust the hospital certificate correctly. Do not disable encryption or certificate checking to hide a connection problem.

Rebuild/recreate backend after deploying this code, then restart/recreate frontend if necessary so Nginx resolves the new backend container. Test a known permitted patient in **New order -> Hospital master**, verify every mapped field, save a test order and check its report. Test an unavailable HMS connection and manual registration as well. Real HMS connectivity and mapping are pending the hospital details; unit tests do not prove live integration.

For API integration use `HOSPITAL_PATIENT_PROVIDER=api`; to turn off lookup use `disabled`. SQL Server and PostgreSQL stay separate. Searching/selecting a patient fills the form; submitting creates a patient snapshot plus HMS identifier in the LIS PostgreSQL order. LIS does not write back to HMS or continuously synchronize it.

## Verification of this change (2026-09-15)

- Backend and frontend builds passed; Compose configuration validation passed.
- Four SQL Server adapter tests passed: parameter binding/wildcard handling, field validation/projection, optional configuration and sanitized driver failures. SQL connections were mocked; no real HMS was contacted.
- Synthetic browser checks passed for newborn age units, unknown gender/visit type, HMS-linked submission and manual registration after lookup failure. API responses were mocked; this is not hospital database persistence proof.
- A disposable PostgreSQL test created a dump, verified its checksum, restored and checked a row, checked failed-dump preservation/health, then verified retry and repeated scheduling using a 60-second test interval. Default production interval remains 86400 seconds.
- Temporary PostgreSQL/scheduler containers and their synthetic database storage were removed. Synthetic test archives remain under ignored `backend/test-results/`. Existing LIS containers stayed stopped; no live backup schedule or hospital integration was activated.
- Dependency audit reports seven advisories (four high, three moderate) in the existing Express/Prisma dependency trees; none were reported against the newly installed SQL Server driver. Dependency remediation is still pending and no forced major dependency changes were applied.
