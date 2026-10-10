param([ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.]+)?$')][string]$Version = '1.2.0-rc.4')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root "releases/lis-$Version"
if (Test-Path -LiteralPath $destination) { throw "Package already exists: $destination. Choose a new version; no overwrite." }
Push-Location $root
try {
    # Example settings only. Never serialize the live .env into a release.
    $priorVersion = $env:LIS_VERSION
    $env:LIS_VERSION = $Version
    try {
        docker compose --env-file .env.example build backend frontend
        if ($LASTEXITCODE -ne 0) { throw 'Release image build failed.' }
        $json = docker compose --env-file .env.example config --no-interpolate --format json
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate runtime Compose.' }
    } finally { $env:LIS_VERSION = $priorVersion }
    $runtime = ($json -join "`n") | ConvertFrom-Json
    $runtime.PSObject.Properties.Remove('name')
    # Never reuse build-machine resolved network/volume names on a client.
    foreach ($network in $runtime.networks.PSObject.Properties) { $network.Value.PSObject.Properties.Remove('name') }
    foreach ($volume in $runtime.volumes.PSObject.Properties) { $volume.Value.PSObject.Properties.Remove('name') }
    foreach ($service in @('backend','frontend')) { $runtime.services.$service.PSObject.Properties.Remove('build') }
    # Compose resolves bind paths to this machine; replace with portable paths.
    $runtime.services.db.volumes[1].source = './database'
    $runtime.services.backup.volumes[0].source = '${LIS_BACKUP_DIR:-./backups}'
    $runtime.services.backup.volumes[1].source = './docker/backup.sh'
    New-Item -ItemType Directory -Path $destination | Out-Null
    [IO.File]::WriteAllText((Join-Path $destination 'docker-compose.yml'), ($runtime | ConvertTo-Json -Depth 30), (New-Object Text.UTF8Encoding $false))
    $example = (Get-Content .env.example -Raw) -replace '(?m)^LIS_VERSION=.*$', "LIS_VERSION=$Version"
    [IO.File]::WriteAllText((Join-Path $destination '.env.example'), $example, (New-Object Text.UTF8Encoding $false))
    foreach ($folder in @('scripts','docker','database','docs')) { New-Item -ItemType Directory -Path (Join-Path $destination $folder) | Out-Null }
    foreach ($file in @('README.md','TECHNICAL.md')) { Copy-Item -LiteralPath $file -Destination $destination }
    foreach ($file in @('catalogue-setup.md','india-catalogue.md','analyzer-integration.md')) { Copy-Item -LiteralPath "docs/$file" -Destination (Join-Path $destination 'docs') }
    foreach ($file in @('Start-LIS.ps1','Initialize-Client.ps1','Test-Storage.ps1','Test-Backup.ps1','Inspect-HMS.sql')) { Copy-Item -LiteralPath "scripts/$file" -Destination (Join-Path $destination 'scripts') }
    Copy-Item -LiteralPath docker/backup.sh -Destination (Join-Path $destination 'docker')
    foreach ($file in @('001_schema.sql','002_seed_profiles.sql')) { Copy-Item -LiteralPath "database/$file" -Destination (Join-Path $destination 'database') }
    $releaseNotes = @"
# Akash LIS $Version

Release candidate packaged on $(Get-Date -Format 'yyyy-MM-dd').

This runtime-only delivery contains versioned backend/frontend Docker images,
PostgreSQL 16 Alpine, portable Docker Compose configuration, installation and
startup scripts, backup/storage checks, starter database schema/catalogue,
README, technical handbook, clinical/integration documentation and SHA-256 hashes.

This refreshed candidate includes the consolidated README and technical handbook.
No hospital database, patient records, staff accounts, backups or live credentials
are exported. Initialize-Client.ps1 generates private credentials on the client.
Saved hospital catalogue/report configuration requires a separate approved transfer.

Install on Windows x64 with Docker Desktop using Linux containers. Verify every
entry in SHA256SUMS.txt, load images.tar, run scripts/Initialize-Client.ps1,
configure hospital details and backup storage, then run scripts/Start-LIS.ps1.
See TECHNICAL.md for full installation, upgrade and recovery instructions.

This is a release candidate. Package creation does not establish hospital
acceptance, clinical approval, printer/LAN compatibility or integration readiness.
Never remove the installed database volume. Back up and verify restoration before
upgrading; keep previous images and assess schema compatibility before rollback.
"@
    [IO.File]::WriteAllText((Join-Path $destination 'RELEASE-NOTES.md'), $releaseNotes, (New-Object Text.UTF8Encoding $false))
    docker image save -o (Join-Path $destination 'images.tar') "akash-lis-backend:$Version" "akash-lis-frontend:$Version" postgres:16-alpine
    if ($LASTEXITCODE -ne 0) { throw 'Image export failed; package is incomplete.' }
    $manifest = Get-ChildItem -LiteralPath $destination -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($destination.Length + 1).Replace('\','/')
        "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
    }
    [IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), $manifest)
    Write-Output "Release candidate prepared: $destination. No records, accounts or live credentials included. Rehearse a fresh install before shipping."
} finally { Pop-Location }
