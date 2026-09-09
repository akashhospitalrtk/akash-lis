# Production-readiness checklist

This project is suitable for local evaluation and can be prepared for a small laboratory. It must **not** be treated as ready for live patient reporting until the laboratory owner, qualified medical professional and local IT/security lead have completed the checks below. Local health-data, retention and laboratory regulations determine the final requirements.

## 1. Dedicated, recoverable environment

- Use a dedicated, supported Windows/Linux machine or server; do not run the LIS or PostgreSQL from a personal daily-use computer.
- Put the machine on a UPS, enable automatic time synchronization, and use encrypted disks (for example BitLocker on Windows).
- Keep PostgreSQL and its data directory on a reliable local disk. Do not use an unreliable USB drive or a consumer cloud-sync folder as the live database location.
- Put the browser frontend behind an HTTPS reverse proxy. The API and PostgreSQL must not be reachable from the public internet. Firewall rules should permit only the approved laboratory network.
- Give the operating-system service account and PostgreSQL role only the minimum filesystem/database permissions required. The database password and `.env` file must be readable only by the service administrator.

## 2. Secrets, transport and accounts

- Set `NODE_ENV=production` and a unique random `JWT_SECRET` of at least 32 characters. Never use the example value or commit `.env` to Git.
- Set `CORS_ORIGIN` to the exact HTTPS LIS browser URL when frontend and API are on different origins. If both are behind one reverse proxy URL, leave it blank and do not expose the API directly.
- Use `DATABASE_SSL=true` only for a remote PostgreSQL server with a trusted TLS certificate. A PostgreSQL instance on the same protected machine normally does not need network TLS.
- Create individual accounts only; do not share the administrator login. Assign technician and authorizer roles separately and disable accounts promptly when staff leave.
- Enforce a local password policy, screen lock, endpoint anti-malware, and MFA/VPN for any remote administrative access. Replace the browser-token login with secure HttpOnly-cookie sessions and CSRF protection before any internet-facing deployment.

## 3. Backup and recovery

- Take automated encrypted PostgreSQL backups at least daily, retain them according to the laboratory policy, and keep a copy off the live machine.
- Test restoring a backup to a separate database every month. A backup is not proven until a restore has been checked.
- Record who checks the backup, restore date, result and any corrective action.
- The **Records export** screen creates a review CSV, not a full backup. It does not preserve database schema, user accounts, audit-event integrity or issued-report PDFs.

## 4. Clinical safety and workflow validation

- Have a qualified laboratory professional approve every test, unit, reference interval, calculation, critical threshold and report format before use.
- Validate every analyzer mapping with known samples: patient/sample identifier matching, parameter code mapping, units, decimal separators, flags, calculated values, failed imports and retry handling.
- Do not connect a live analyzer until its vendor protocol (CSV/ASTM/HL7/serial/TCP) and the laboratory validation record are available.
- Write and train staff on downtime, duplicate sample, rejected sample, critical-result notification, amendment and report-delivery procedures.
- Add an acknowledgement record for critical-result notification before relying on the visual critical flag as the complete workflow.

## 5. Software quality and change control

- Pin supported Node.js and PostgreSQL versions, apply security updates on a planned maintenance window, and review dependency advisories.
- Add automated backend API tests, role-permission tests, database-migration tests and browser end-to-end tests before releases.
- Use a staging copy with de-identified data. Test migrations, backups and rollback there before changing the live system.
- Version migrations rather than editing a live database manually; keep a release log showing code version, migration, approver and deployment date.
- Monitor disk space, PostgreSQL health, failed login attempts, application errors and backup failures. Keep logs protected and avoid logging passwords, tokens or full result exports.

## Controlled records export

Administrators can use **Records export** to download a CSV for a selected date range. It contains one row per ordered parameter, with patient/order workflow details and results. Exports are limited to one month, use formula-safe CSV cells, require an administrator session, are not cached by the API, and are written to the system audit log.

Store the downloaded file only in an approved access-controlled location. Do not send it using personal email, personal messaging accounts or unencrypted removable media.
