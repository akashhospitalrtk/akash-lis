# Akash LIS

Akash LIS is a local-first Laboratory Information System for patient registration,
investigation ordering, sample processing, result entry, authorization,
amendments, clinical notes, audit history and A4 PDF reports.

## Start the existing installation

From PowerShell on the LIS server:

```powershell
cd D:\lis
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LIS.ps1 -OpenBrowser
docker compose ps
```

Open [http://localhost:8081](http://localhost:8081). Other computers on the
hospital network use `http://SERVER-LAN-IP:8081`; they must not use their own
`localhost` address.

Check both health endpoints when troubleshooting:

- `http://localhost:8081/health`
- `http://localhost:8081/api/health`

Never use `docker compose down -v` on an installed system. It can delete the LIS
database volume.

## Documentation

- [Technical handbook](TECHNICAL.md) — architecture, technology stack, file map,
  configuration, HMS integration, deployment, backup, testing and release limits.
- [Catalogue setup](docs/catalogue-setup.md) — investigation configuration and
  local clinical approval requirements.
- [India catalogue provenance](docs/india-catalogue.md) — catalogue sources and
  limitations.
- [Analyzer integration](docs/analyzer-integration.md) — normalized analyzer
  boundary and requirements for a live instrument connection.

The technical handbook is the single maintained source for general setup and
engineering information. The files under `docs/` are retained only where they
contain distinct clinical, provenance or device-integration material.

## Important boundaries

- Payment must never authorize or release laboratory reports.
- HMS lookup is read-only; submitting an order stores a patient snapshot in LIS.
- Reference ranges, methods, units and catalogue content require approval by the
  laboratory's qualified medical professional before clinical use.
- Do not expose the current local deployment publicly without separate HTTPS,
  secret-management and security-hardening work.
