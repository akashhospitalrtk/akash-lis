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
COMMIT;
'@ | docker compose exec -T db sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw 'Database storage check failed.' }
    # Backups are separate from database size; report totals without listing files.
    docker compose exec -T backup sh -c 'du -sk /backups; df -Pk /backups'
    if ($LASTEXITCODE -ne 0) { throw 'Backup disk check failed.' }
} finally {
    Pop-Location
}
