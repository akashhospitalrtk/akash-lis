$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$databaseContainer = "lis-backup-test-$suffix"
$schedulerContainer = "lis-scheduler-test-$suffix"
$artifactPath = Join-Path $repo "backend/test-results/backup-$suffix"
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
function Invoke-Docker {
    $output = & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker test command failed (exit $LASTEXITCODE)" }
    return $output
}
$clientArgs = @('--rm', '--network', "container:$databaseContainer", '-e', 'PGHOST=127.0.0.1', '-e', 'PGUSER=lis_test', '-e', 'PGPASSWORD=synthetic-only', '-e', 'PGDATABASE=lis_backup_test', '-e', 'BACKUP_INTERVAL_SECONDS=60', '--mount', "type=bind,source=$artifactPath,target=/backups", '--mount', "type=bind,source=$repo/docker/backup.sh,target=/opt/lis/backup.sh,readonly", '--entrypoint', '/bin/sh', 'postgres:16-alpine', '/opt/lis/backup.sh')
try {
    Invoke-Docker run -d --rm --name $databaseContainer -e POSTGRES_USER=lis_test -e POSTGRES_PASSWORD=synthetic-only -e POSTGRES_DB=lis_backup_test postgres:16-alpine | Out-Null
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        & docker exec $databaseContainer pg_isready -U lis_test -d lis_backup_test *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Disposable PostgreSQL did not become ready.' }
    Invoke-Docker exec $databaseContainer psql -U lis_test -d lis_backup_test -v ON_ERROR_STOP=1 -c "CREATE TABLE backup_probe (id int primary key, note text); INSERT INTO backup_probe VALUES (1, 'synthetic restore proof');" | Out-Null
    Invoke-Docker run @clientArgs once
    if (@(Get-ChildItem $artifactPath -Filter '*.dump').Count -ne 1) { throw 'Expected one successful dump.' }
    Invoke-Docker run @clientArgs health
    $dump = Get-ChildItem $artifactPath -Filter '*.dump' | Select-Object -First 1
    Invoke-Docker cp $dump.FullName "${databaseContainer}:/tmp/restore.dump"
    Invoke-Docker exec $databaseContainer createdb -U lis_test lis_restore_test
    Invoke-Docker exec $databaseContainer pg_restore -U lis_test -d lis_restore_test --exit-on-error --no-owner /tmp/restore.dump
    $proof = Invoke-Docker exec $databaseContainer psql -U lis_test -d lis_restore_test -At -c 'SELECT note FROM backup_probe WHERE id = 1'
    if ($proof -ne 'synthetic restore proof') { throw 'Restored row did not match.' }
    $digest = (Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if (!(Get-Content "$($dump.FullName).sha256").StartsWith($digest)) { throw 'Checksum mismatch.' }
    # Failure must preserve the existing successful dump and mark health unhealthy.
    $failedArgs = $clientArgs -replace '^PGDATABASE=lis_backup_test$', 'PGDATABASE=missing_test'
    & docker run @failedArgs once
    if ($LASTEXITCODE -eq 0) { throw 'Backup incorrectly succeeded against a missing database.' }
    & docker run @clientArgs health
    if ($LASTEXITCODE -eq 0) { throw 'Health incorrectly accepted a failed backup.' }
    if (@(Get-ChildItem $artifactPath -Filter '*.dump').Count -ne 1) { throw 'Failed backup altered completed archives.' }
    if (@(Get-ChildItem $artifactPath -Filter '*.partial').Count -ne 0) { throw 'Failed backup left partial files.' }
    # Scheduler must catch up immediately after failure, then run again at its interval.
    Invoke-Docker run -d --name $schedulerContainer @clientArgs schedule | Out-Null
    $scheduled = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (@(Get-ChildItem $artifactPath -Filter '*.dump').Count -ge 3) { $scheduled = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$scheduled) { throw 'Scheduler did not recover and repeat the backup.' }
    Invoke-Docker run @clientArgs health
    Write-Output "PASS: dump, checksum, restored row, failure preservation, health, catch-up and repeated scheduling. Synthetic artifacts: $artifactPath"
} finally {
    # Only the uniquely named disposable test containers are stopped; --rm cleans their data.
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & docker stop $schedulerContainer $databaseContainer 2>$null | Out-Null
    $ErrorActionPreference = $savedPreference
}
