#!/bin/sh
set -eu

migrate_attempts=0
max_attempts=5

until ./node_modules/.bin/prisma migrate deploy --schema /opt/prisma/schema.prisma; do
  migrate_attempts=$((migrate_attempts + 1))
  if [ "$migrate_attempts" -ge "$max_attempts" ]; then
    echo "[startup] prisma migrate deploy failed after ${max_attempts} attempts"
    exit 1
  fi
  echo "[startup] prisma migrate deploy failed (attempt ${migrate_attempts}/${max_attempts}), retrying in 3s"
  sleep 3
done

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  echo "[startup] warning: NEXTAUTH_SECRET is missing; auth sessions will fail"
elif [ "${NEXTAUTH_SECRET}" = "NEXTAUTH_SECRET" ] || [ "${NEXTAUTH_SECRET}" = "change-me" ]; then
  echo "[startup] warning: NEXTAUTH_SECRET is still using a placeholder value; auth sessions will fail"
fi

crawler_pid=""
if [ "${ENABLE_PUBG_CRAWLER:-1}" = "1" ]; then
  echo "[startup] starting PUBG crawler in background"
  node scripts/pubg-twitch-crawler.mjs &
  crawler_pid=$!
else
  echo "[startup] PUBG crawler disabled (ENABLE_PUBG_CRAWLER=${ENABLE_PUBG_CRAWLER:-0})"
fi

cleanup() {
  if [ -n "$crawler_pid" ] && kill -0 "$crawler_pid" 2>/dev/null; then
    echo "[startup] stopping PUBG crawler (pid $crawler_pid)"
    kill "$crawler_pid" 2>/dev/null || true
    wait "$crawler_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

echo "[startup] starting Next.js server"
node_modules/.bin/next start
