#!/bin/sh
# PostgreSQL client only: this container does not start another database server.
set -eu
umask 077

interval=${BACKUP_INTERVAL_SECONDS:-86400}
case "$interval" in ''|*[!0-9]*) echo 'Invalid backup interval' >&2; exit 1;; esac
[ "$interval" -ge 60 ] && [ "$interval" -le 604800 ] || exit 1

retention_count=${BACKUP_RETENTION_COUNT:-30}
case "$retention_count" in ''|*[!0-9]*) echo 'Invalid backup retention count' >&2; exit 1;; esac
[ "$retention_count" -ge 2 ] && [ "$retention_count" -le 3650 ] || exit 1

prune_backups() {
  count=$(find /backups -maxdepth 1 -type f -name 'lis-*.dump' | wc -l | tr -d ' ')
  [ "$count" -gt "$retention_count" ] || return 0
  remove=$((count - retention_count))
  find /backups -maxdepth 1 -type f -name 'lis-*.dump' -print | sort | head -n "$remove" |
    while IFS= read -r old; do
      [ -n "$old" ] || continue
      rm -f -- "$old" "$old.sha256"
    done
  echo "Backup retention: kept newest $retention_count backup(s)."
}

health() {
  [ -r /backups/last-success ] || return 1
  read -r last file < /backups/last-success
  case "$last" in ''|*[!0-9]*) return 1;; esac
  [ -s "/backups/$file" ] || return 1
  [ ! -e /backups/last-failure ] || return 1
  age=$(( $(date +%s) - last ))
  [ "$age" -ge 0 ] && [ "$age" -lt $((interval + 7200)) ]
}

backup_once() (
  cd /backups
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file="lis-$stamp-$(hostname)-$$.dump"
  partial="$file.partial"
  # Remove only this invocation's incomplete files on failure; keep older backups.
  trap 'rm -f -- "$partial" "$file.sha256.partial" "last-success.$$.tmp"' EXIT
  pg_dump --format=custom --no-password --lock-wait-timeout=60s --file="$partial"
  [ -s "$partial" ]
  pg_restore --list "$partial" >/dev/null
  mv -- "$partial" "$file"
  sha256sum "$file" > "$file.sha256.partial"
  mv -- "$file.sha256.partial" "$file.sha256"
  now=$(date +%s)
  printf '%s %s\n' "$now" "$file" > "last-success.$$.tmp"
  mv -- "last-success.$$.tmp" last-success
  rm -f -- last-failure
  prune_backups
  echo "$stamp Backup saved: $file (archive listing checked; restoration must be tested separately)"
  # Aggregate size only; no names, identifiers or medical information in this CSV.
  if size=$(psql --no-password -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT pg_database_size(current_database())'); then
    [ -e storage-history.csv ] || printf 'utc,database_bytes,backup_bytes\n' > storage-history.csv
    printf '%s,%s,%s\n' "$stamp" "$size" "$(wc -c < "$file" | tr -d ' ')" >> storage-history.csv
  else
    echo 'WARNING: backup succeeded, but database size measurement failed.' >&2
  fi
  df -Pk /backups | awk 'NR==2 { print "Backup disk: " $4 " KiB available; " $5 " used"; if (($5+0)>=80) print "WARNING: backup disk is at least 80% full." }'
)

run_backup() {
  # A separate shell keeps set -e effective even when the caller handles failure.
  if /bin/sh "$0" internal-once; then return 0; fi
  date -u +%Y-%m-%dT%H:%M:%SZ > /backups/last-failure || true
  echo 'ERROR: backup failed. Check database availability, HDD space and permissions.' >&2
  return 1
}

case "${1:-schedule}" in
  health) health ;;
  internal-once) backup_once ;;
  once) run_backup ;;
  schedule)
    trap 'exit 0' TERM INT
    while :; do
      due=1
      if [ -r /backups/last-success ]; then
        read -r last file < /backups/last-success
        case "$last" in ''|*[!0-9]*) last=0;; esac
        now=$(date +%s)
        if [ "$now" -ge "$last" ] && [ $((now - last)) -lt "$interval" ] && [ -s "/backups/$file" ]; then due=0; fi
      fi
      if [ "$due" -eq 1 ] || [ -e /backups/last-failure ]; then run_backup || true; fi
      # Retry failed backups and check for a missed run each minute.
      sleep 60 & wait $! || true
    done
    ;;
  *) echo 'Usage: backup.sh [schedule|once|health]' >&2; exit 1 ;;
esac
