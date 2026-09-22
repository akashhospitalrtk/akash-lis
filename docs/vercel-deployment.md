# Deploy the LIS on Vercel

The browser pages and API are configured as **two Vercel projects from the same Git repository**. PostgreSQL is a separate hosted service. Docker remains the local hospital deployment; Vercel does not use this repository's Compose startup or backup container.

```text
Browser -> LIS frontend on Vercel
        -> LIS API on Vercel -> hosted PostgreSQL
```

This configuration prepares the code. It does not create Vercel projects, provision a database, transfer existing records, or publish the LIS.

## 1. Prepare PostgreSQL

### Database through Vercel versus your own

Vercel's former **Vercel Postgres** product is no longer offered. New databases are connected through Marketplace providers such as Neon. Connecting a managed provider directly instead of through Marketplace still gives you that provider's PostgreSQL service; integration, billing, and provisioning differ. It is not a special database format, and this LIS uses its normal PostgreSQL connection URL. [Vercel Postgres documentation](https://vercel.com/docs/postgres)

| Choice | Growth and limits | Operations |
| --- | --- | --- |
| Managed PostgreSQL through Vercel Marketplace | Storage, compute usage, connections and restore history depend on the provider plan; upgrade as usage grows | Provider runs the database infrastructure; you configure access, backups/retention and verify restores |
| Managed PostgreSQL purchased directly | Same kinds of provider limits; does not bypass Vercel API limits | You connect it using `DATABASE_URL` and manage the provider account separately |
| PostgreSQL on your own server/VPS | Limited by disk, memory, CPU and network; expand or migrate when needed | You handle patches, monitoring, replication, backups, restores and uptime |

There is no universal expiry date imposed on all databases connected through Vercel. Free plans can have usage caps, idle suspension, and provider-specific retention rules. For example, Neon's plans differ in compute, storage, autoscaling and restore windows; check the current terms rather than assuming a free tier is unlimited. A database's restore-history window is how far back you can recover older states, not how long current patient records are kept. [Neon plans](https://neon.com/docs/introduction/plans)

**Request duration is a different limit.** Whether the database is managed or yours, an API hosted on Vercel still has Vercel's function duration, payload and resource limits. This project sets a 60-second function duration; that is not a 60-second database lifetime. More storage does not extend that request timeout. [Vercel function limits](https://vercel.com/docs/functions/limitations)

For a cloud deployment, managed PostgreSQL reduces server-maintenance work. For hospital LAN operation during internet outages, keep the frontend, API and database available locally; a Vercel frontend alone does not provide an offline LIS.

### Database setup

Create a dedicated PostgreSQL database with trusted TLS, connection pooling, and scheduled backups. Keep the API region close to the database region. Use separate databases for production and previews; a preview must not use the hospital production database.

The existing local Docker database is not reachable as `db:5432` or `localhost` from Vercel. Do not expose the hospital PostgreSQL port to make it reachable. Moving existing records requires a separate backup/restore migration and verification; connecting an empty cloud database does not move them.

Initialize a new deployment database from a trusted checkout with `DATABASE_URL` set to that database's **direct migration connection**, and `DATABASE_SSL=true`. From `backend/`, run:

```powershell
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run migrate
```

This repository uses `database/001_schema.sql` through its own migration script, not `prisma migrate deploy`. Review and back up an existing database before applying schema changes. `npm.cmd run seed` is optional for a fresh catalogue and requires local review of the starter tests and reference intervals. No migration or seed runs automatically during a Vercel build or HTTP request.

## 2. Create the API project

Import the repository into Vercel and name the project, for example, `akash-lis-api`.

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Include source files outside of the Root Directory in the Build Step | **Enabled**; the build copies the shared report descriptions |
| Framework | Express |
| Node.js version | 22.x |
| Install command | `npm ci` (configured in `backend/vercel.json`) |
| Build command | `npm run prisma:generate && node scripts/prepare-vercel.mjs` (configured) |
| Output directory | Leave unset; this is an Express function, not a static website |
| Function region | Choose the same/nearest available region as PostgreSQL in project settings |

Add these environment variables in **the API project's** settings:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your hosted PostgreSQL **pooled** connection URL |
| `DATABASE_SSL` | `true` for a database with a trusted TLS certificate; do not disable certificate verification |
| `DATABASE_POOL_MAX` | `5` initially; the limit is per function instance, so also use provider-side pooling |
| `JWT_SECRET` | A new private random secret of at least 32 characters |
| `CORS_ORIGIN` | Exact frontend origin, for example `https://akash-lis.vercel.app`; no path or trailing slash |
| `HOSPITAL_NAME`, `HOSPITAL_ADDRESS`, `HOSPITAL_PHONE` | Your real report details |
| `HOSPITAL_PATIENT_PROVIDER` | `disabled` unless a reachable hospital integration is configured |

Do not paste credentials into source code or frontend variables. Set the connection URL and TLS parameters according to your database provider; URL SSL parameters must not override certificate verification with an insecure mode. Redeploy after changing environment variables.

`src/app.ts` exports the Express application for Vercel. `src/server.ts` continues to start the listener for Docker/local use. The function includes `assets/**`, including PDF fonts and a build-time copy of `database/report-descriptions.json`. Report PDFs are generated in memory.

After deploying, open `https://YOUR-API.vercel.app/api/health`. It must return `success: true` with `database: connected`. Opening the API's `/` is not a frontend test; the API routes begin with `/api`.

## 3. Create the frontend project

Import the same repository again, for example as `akash-lis`.

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Include source files outside of the Root Directory in the Build Step | **Enabled**; the Tests page imports `docs/catalogue-setup.md` |
| Framework | Vite |
| Node.js version | 22.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| `VITE_API_URL` | `https://YOUR-API.vercel.app/api` — no trailing slash |

The settings and SPA rewrite are in `frontend/vercel.json`. The rewrite lets direct visits and reloads of `/tests`, `/samples`, and report routes load the application. API calls go to `VITE_API_URL`, not to the frontend rewrite. A Vercel build fails with a clear message if this URL is missing or invalid.

Set the final frontend address in the API project's `CORS_ORIGIN`, then redeploy the API. Multiple explicitly approved origins can be comma-separated. For previews, use a stable staging frontend/API pair and a separate database rather than allowing all `*.vercel.app` origins.

Ensure Vercel deployment protection does not redirect browser API requests to a Vercel sign-in page. Use appropriate project access settings; do not embed a protection bypass secret in `VITE_*`. Complete the first-administrator setup under controlled access before making a new installation publicly available. Existing migrated installations retain their users.

## 4. Verify the deployment

1. Check the API `/api/health` endpoint and sign in through the frontend.
2. Open Tests, create an approved test in staging, reload, and confirm it persists.
3. Test registration, results, authorization, doctor permissions, and PDF download with synthetic staging records.
4. Reload `/tests`, `/samples`, and a report URL directly. Inspect the browser Network tab: API responses must be JSON, not the frontend HTML or a Vercel protection page.
5. Verify backups and an isolated restore before using the hosted database for hospital records.

Local browser tests can verify the UI and submission payload without creating records. They do not prove cloud database persistence. A passing local build does not prove a live Vercel deployment.

Local checks used for this configuration:

```powershell
# From backend/, after npm.cmd run build:
node scripts/prepare-vercel.mjs
node test/vercel-runtime.mjs
node test/catalogue-http-browser.mjs
```

The runtime check copies the compiled app and assets into a temporary standalone folder and checks the default app export, PDF fonts/descriptions, pool configuration, CORS/preflight, and unauthenticated-route protection. It does not connect to a database. The browser check uses a non-secure HTTP hostname and 25 synthetic catalogue items to check pagination, full-catalogue search, editing, submission, mobile layout and page reloads. The backend schema validates the submitted test; API responses are intercepted.

## Local Tests page and stale tabs

The catalogue formerly called `crypto.randomUUID()` on ordinary LAN HTTP origins, causing a blank page. Draft keys now work without that secure-context API. If an already-open tab still reports it, close that tab and open `http://lis.akashhospital:8081/tests?refresh=2`, or use Ctrl+Shift+R. Docker now serves HTML with `Cache-Control: no-store`; a running tab still needs one reload after deployment.

`ERR_CONNECTION_REFUSED` is separate: the browser could not reach the host/port. Check that Docker is running and the hostname points to the current server IP. Verify `/api/health` from that same workstation. Refreshing code cannot fix a stopped server or an incorrect address.

## Hospital integrations and alternative hosting

A Vercel function cannot directly reach hospital-private SQL Server addresses or analyzer serial/TCP connections. Use a separately configured secure integration service, or keep the API on the hospital/server network and deploy only the frontend. For that option, point `VITE_API_URL` at the reachable HTTPS API and set its `CORS_ORIGIN` to the Vercel frontend. Manual LIS workflows work with the optional HMS provider disabled.

For cloud operation, replace the Docker backup schedule with database-provider backups and restore checks. Long-running exports and large PDFs must be checked against the chosen function limits; this API configuration sets a 60-second maximum duration.

## References

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Monorepo source files outside the root directory](https://vercel.com/docs/monorepos/monorepo-faq)
- [Vercel database pool management](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Function asset inclusion and project configuration](https://vercel.com/docs/project-configuration/vercel-json)
