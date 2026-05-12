#!/bin/sh
set -eu

LOG_LEVEL_RAW="${STARTUP_LOG_LEVEL:-${WORKER_LOG_LEVEL:-${SCRIPT_LOG_LEVEL:-info}}}"

to_level_num() {
  case "$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')" in
    verbose) echo 10 ;;
    debug) echo 20 ;;
    info) echo 30 ;;
    warn|warning) echo 40 ;;
    error) echo 50 ;;
    silent) echo 100 ;;
    *) echo 30 ;;
  esac
}

LOG_LEVEL_NUM="$(to_level_num "$LOG_LEVEL_RAW")"

log() {
  level="$1"
  shift
  level_num="$(to_level_num "$level")"
  if [ "$level_num" -lt "$LOG_LEVEL_NUM" ]; then
    return 0
  fi

  level_upper="$(printf "%s" "$level" | tr '[:lower:]' '[:upper:]')"
  echo "[startup][$level_upper] $*"
}

migrate_attempts=0
max_attempts=5

until ./node_modules/.bin/prisma migrate deploy --schema /opt/prisma/schema.prisma; do
  migrate_attempts=$((migrate_attempts + 1))
  if [ "$migrate_attempts" -ge "$max_attempts" ]; then
    log error "prisma migrate deploy failed after ${max_attempts} attempts"
    exit 1
  fi
  log warn "prisma migrate deploy failed (attempt ${migrate_attempts}/${max_attempts}), retrying in 3s"
  sleep 3
done

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  log warn "NEXTAUTH_SECRET is missing; auth sessions will fail"
elif [ "${NEXTAUTH_SECRET}" = "NEXTAUTH_SECRET" ] || [ "${NEXTAUTH_SECRET}" = "change-me" ]; then
  log warn "NEXTAUTH_SECRET is still using a placeholder value; auth sessions will fail"
fi

crawler_pid=""
if [ "${ENABLE_PUBG_CRAWLER:-1}" = "1" ]; then
  log info "starting PUBG crawler in background"
  node scripts/pubg-twitch-crawler.mjs &
  crawler_pid=$!
else
  log info "PUBG crawler disabled (ENABLE_PUBG_CRAWLER=${ENABLE_PUBG_CRAWLER:-0})"
fi

cleanup() {
  if [ -n "$crawler_pid" ] && kill -0 "$crawler_pid" 2>/dev/null; then
    log info "stopping PUBG crawler (pid $crawler_pid)"
    kill "$crawler_pid" 2>/dev/null || true
    wait "$crawler_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

log info "starting Next.js server"
node_modules/.bin/next start
