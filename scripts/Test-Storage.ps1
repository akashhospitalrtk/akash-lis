# Read-only, aggregate measurements. Does not display patient data or credentials.
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    @'
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
SELECT relname AS table_name,
       pg_size_pretty(pg_table_size(relid)) AS data_including_toast,
       pg_size_pretty(pg_indexes_size(relid)) AS indexes,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       n_live_tup AS estimated_rows, n_dead_tup AS estimated_dead_rows,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
SHOW autovacuum;
SELECT state, count(*) AS connections FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;
SHOW max_connections;
SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers', 'work_mem', 'max_wal_size');
SELECT pg_size_pretty(COALESCE(sum(octet_length(content)), 0)::bigint) AS outside_report_file_bytes,
       count(*) AS outside_report_files FROM outside_lab_reports;
COMMIT;
'@ | docker compose exec -T db sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw 'Database storage check failed.' }
    # Backups are separate from database size; report totals without listing files.
    docker compose exec -T backup sh -c 'du -sk /backups; df -Pk /backups'
    if ($LASTEXITCODE -ne 0) { throw 'Backup disk check failed.' }
    docker compose exec -T db sh -c 'df -Pk /var/lib/postgresql/data'
    if ($LASTEXITCODE -ne 0) { throw 'Database disk check failed.' }
    # Docker Desktop's virtual disk may report more space than the Windows drive has.
    Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        $total = $_.Used + $_.Free
        $percentUsed = if ($total -gt 0) { [math]::Round(100 * $_.Used / $total, 1) } else { 0 }
        [pscustomobject]@{ Drive = $_.Name; FreeGB = [math]::Round($_.Free / 1GB, 2); PercentUsed = $percentUsed }
        if ($percentUsed -ge 80 -or ($total -gt 0 -and $_.Free -lt 10GB)) { Write-Warning "Drive $($_.Name): low storage. Expand or move storage before it fills." }
    }
    docker system df
    if ($LASTEXITCODE -ne 0) { throw 'Docker storage check failed.' }
} finally {
    Pop-Location
}
