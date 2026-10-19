param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (!(Test-Path -LiteralPath '.env')) { throw 'Missing .env. For a new client installation run scripts/Initialize-Client.ps1 first.' }
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not ready. Start Docker Desktop, wait for Engine running, then retry.' }
    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose settings are invalid. Check .env and the configured backup directory.' }
    docker compose up -d --no-build --pull never
    if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Check missing images or backup folder. Do not delete database volumes.' }
    $settings = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^FRONTEND_PORT=\d+$' } | Select-Object -Last 1
    $port = if ($settings) { ($settings -split '=', 2)[1] } else { '8080' }
    $url = "http://localhost:$port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 3
            if ($health.data.database -eq 'connected') { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (!$ready) { throw "LIS did not become ready at $url. Run docker compose ps and docker compose logs --tail 40 backend." }
    Write-Output "LIS ready: $url"
    if ($OpenBrowser) { Start-Process $url }
} finally { Pop-Location }
