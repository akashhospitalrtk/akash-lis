param([ValidateRange(1024,65535)][int]$Port = 8081)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root '.env'
if (Test-Path -LiteralPath $destination) { throw 'Existing .env detected. Refusing to replace installation credentials.' }
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$example = Get-Content -LiteralPath (Join-Path $root '.env.example') -Raw
$example = $example -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$(New-Secret)"
$example = $example -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$(New-Secret)"
$example = $example -replace '(?m)^FRONTEND_PORT=.*$', "FRONTEND_PORT=$Port"
$example = $example -replace '(?m)^HOSPITAL_PATIENT_PROVIDER=.*$', 'HOSPITAL_PATIENT_PROVIDER=disabled'
$example += "`r`nCOMPOSE_PROJECT_NAME=akash-lis`r`n"
[IO.File]::WriteAllText($destination, $example, (New-Object Text.UTF8Encoding $false))
New-Item -ItemType Directory -Path (Join-Path $root 'backups') -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $destination /inheritance:r /grant:r "${identity}:(F)" '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Configuration created, but could not restrict its permissions. Ask IT to protect .env before starting.' }
Write-Output 'Created fresh private credentials. Edit hospital details and backup destination in .env; do not share its contents.'
