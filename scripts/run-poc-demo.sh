#!/usr/bin/env bash
# DPDPOS backend — bootstrap + Proof-of-Concept demo
#
# One command to show the product story on a live API:
#   ./scripts/run-poc-demo.sh
#
# Flags:
#   --setup-only   Install deps, docker, migrate, seed — do not run demo
#   --demo-only    Assume stack is already up; run narrative HTTP demo only
#   --keep-alive   Leave API + worker running after the demo (default: stop them)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SETUP_ONLY=0
DEMO_ONLY=0
KEEP_ALIVE=0
for arg in "$@"; do
  case "$arg" in
    --setup-only) SETUP_ONLY=1 ;;
    --demo-only) DEMO_ONLY=1 ;;
    --keep-alive) KEEP_ALIVE=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
  esac
done

API_PID=""
WORKER_PID=""
LOG_DIR="$ROOT/.demo-logs"
mkdir -p "$LOG_DIR"

cleanup() {
  if [[ "$KEEP_ALIVE" -eq 1 ]]; then
    echo ""
    echo "Leaving API/worker running (--keep-alive)."
    echo "  API logs:    $LOG_DIR/api.log"
    echo "  Worker logs: $LOG_DIR/worker.log"
    echo "  Stop with:   kill \$(cat $LOG_DIR/api.pid $LOG_DIR/worker.pid 2>/dev/null) 2>/dev/null || true"
    return
  fi
  if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WORKER_PID}" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
  if [[ -f "$LOG_DIR/api.pid" ]]; then
    kill "$(cat "$LOG_DIR/api.pid")" 2>/dev/null || true
  fi
  if [[ -f "$LOG_DIR/worker.pid" ]]; then
    kill "$(cat "$LOG_DIR/worker.pid")" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "════════════════════════════════════════════════════════════"
echo "  DPDPOS — Proof of Concept demo runner"
echo "════════════════════════════════════════════════════════════"

if [[ "$DEMO_ONLY" -eq 0 ]]; then
  if [[ ! -f .env ]]; then
    echo "→ Creating .env from .env.example"
    cp .env.example .env
  else
    echo "→ .env already present"
  fi

  if [[ ! -d node_modules ]]; then
    echo "→ Installing npm dependencies"
    npm install
  else
    echo "→ node_modules present"
  fi

  echo "→ Starting Docker infra (Postgres, Redis, MinIO)"
  if ! docker info >/dev/null 2>&1; then
    echo "" >&2
    echo "Docker daemon is not running." >&2
    echo "Start Docker Desktop, then re-run:  npm run demo" >&2
    exit 1
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f docker/docker-compose.yml up -d
  elif docker compose version >/dev/null 2>&1; then
    docker compose -f docker/docker-compose.yml up -d
  else
    echo "Neither docker-compose nor 'docker compose' is available" >&2
    exit 1
  fi

  echo "→ Waiting for Postgres…"
  for i in $(seq 1 60); do
    if docker exec dpdpos-postgres pg_isready -U dpdpos -d dpdpos >/dev/null 2>&1; then
      echo "  Postgres is ready"
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      echo "Postgres did not become ready in time" >&2
      exit 1
    fi
    sleep 1
  done

  echo "→ Prisma generate + migrate + seed"
  npx prisma generate
  npx prisma migrate deploy
  npm run prisma:seed
fi

if [[ "$SETUP_ONLY" -eq 1 ]]; then
  echo ""
  echo "Setup complete. Start services with:"
  echo "  npm run dev"
  echo "  npm run dev:worker"
  echo "Then run: npm run demo:poc"
  exit 0
fi

# Start API + worker if not already healthy
if ! curl -sf "http://127.0.0.1:3000/readyz" >/dev/null 2>&1; then
  echo "→ Starting API server"
  npm run dev >"$LOG_DIR/api.log" 2>&1 &
  API_PID=$!
  echo "$API_PID" >"$LOG_DIR/api.pid"

  echo "→ Starting background worker (validation + event bus)"
  npm run dev:worker >"$LOG_DIR/worker.log" 2>&1 &
  WORKER_PID=$!
  echo "$WORKER_PID" >"$LOG_DIR/worker.pid"

  echo "→ Waiting for API readiness…"
  for i in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:3000/readyz" >/dev/null 2>&1; then
      echo "  API is ready"
      break
    fi
    if [[ "$i" -eq 90 ]]; then
      echo "API failed to become ready. Tail of api.log:" >&2
      tail -n 40 "$LOG_DIR/api.log" >&2 || true
      exit 1
    fi
    sleep 1
  done
else
  echo "→ API already running on :3000"
  KEEP_ALIVE=1
fi

echo ""
echo "→ Running narrative PoC against live API"
npx tsx scripts/poc-demo.ts

echo ""
echo "Done. Re-run anytime with:  npm run demo:poc"
echo "Full bootstrap again with: ./scripts/run-poc-demo.sh"
