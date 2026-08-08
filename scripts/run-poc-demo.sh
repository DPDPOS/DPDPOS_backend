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
SERVICES_STARTED=0
LOG_DIR="$ROOT/.demo-logs"
mkdir -p "$LOG_DIR"

# Stop leftover API/worker so prisma generate can rewrite the query-engine DLL (Windows EPERM).
stop_demo_services() {
  echo "→ Stopping any previous demo API/worker"

  for f in "$LOG_DIR/api.pid" "$LOG_DIR/worker.pid"; do
    if [[ -f "$f" ]]; then
      local old_pid
      old_pid="$(tr -d '[:space:]' <"$f" || true)"
      if [[ -n "${old_pid}" ]]; then
        kill "$old_pid" 2>/dev/null || true
        if command -v taskkill.exe >/dev/null 2>&1; then
          taskkill.exe //PID "$old_pid" //F >/dev/null 2>&1 || true
        fi
      fi
      rm -f "$f"
    fi
  done

  if [[ -n "${API_PID}" ]]; then
    kill "$API_PID" 2>/dev/null || true
    API_PID=""
  fi
  if [[ -n "${WORKER_PID}" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
    WORKER_PID=""
  fi

  # Windows host (common when bash is WSL/Git Bash but Node is Windows)
  if command -v powershell.exe >/dev/null 2>&1; then
    local ps1="$ROOT/scripts/stop-demo-services.ps1"
    # Convert /mnt/e/... to E:\... for Windows PowerShell when needed
    local win_ps1="$ps1"
    if [[ "$ps1" == /mnt/* ]]; then
      local drive rest
      drive="$(echo "$ps1" | cut -d/ -f3 | tr '[:lower:]' '[:upper:]')"
      rest="$(echo "$ps1" | cut -d/ -f4- | tr '/' '\\')"
      win_ps1="${drive}:\\${rest}"
    elif [[ "$ps1" =~ ^/([a-zA-Z])/(.*) ]]; then
      win_ps1="${BASH_REMATCH[1]^}:\\${BASH_REMATCH[2]//\//\\}"
    fi
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$win_ps1" >/dev/null 2>&1 || true
  fi

  # Native Linux/WSL listeners on :3000
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 3000/tcp >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    # shellcheck disable=SC2046
    kill -9 $(lsof -ti:3000) 2>/dev/null || true
  fi

  sleep 1
}

cleanup() {
  if [[ "$KEEP_ALIVE" -eq 1 && "$SERVICES_STARTED" -eq 1 ]]; then
    echo ""
    echo "Leaving API/worker running (--keep-alive)."
    echo "  API logs:    $LOG_DIR/api.log"
    echo "  Worker logs: $LOG_DIR/worker.log"
    echo "  Stop with:   kill \$(cat $LOG_DIR/api.pid $LOG_DIR/worker.pid 2>/dev/null) 2>/dev/null || true"
    echo "           or: powershell -File scripts/stop-demo-services.ps1"
    return
  fi
  if [[ "$SERVICES_STARTED" -eq 1 ]]; then
    stop_demo_services
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

  # Must free query_engine-windows.dll.node before prisma generate on Windows
  stop_demo_services

  echo "→ Prisma generate + migrate + seed"
  if ! npx prisma generate; then
    echo "  prisma generate failed (often a file lock). Retrying after another stop…" >&2
    stop_demo_services
    sleep 2
    npx prisma generate
  fi
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

# Candidate URLs for readiness probes.
# On WSL, Windows-hosted Node is often unreachable via 127.0.0.1 from Linux curl,
# but reachable via the Windows host IP from /etc/resolv.conf.
api_probe_urls() {
  local urls=("http://127.0.0.1:3000" "http://localhost:3000")
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    local win_host
    win_host="$(grep -m1 '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}')"
    if [[ -n "${win_host}" ]]; then
      urls+=("http://${win_host}:3000")
    fi
    urls+=("http://host.docker.internal:3000")
  fi
  printf '%s\n' "${urls[@]}"
}

api_http_ready() {
  local base="$1"
  curl -sf --connect-timeout 1 --max-time 2 "${base}/readyz" >/dev/null 2>&1
}

# DEMO_BASE_URL is for Node (npx/tsx), which usually shares the API's network
# namespace — keep loopback unless the caller overrides it.
export DEMO_BASE_URL="${DEMO_BASE_URL:-http://127.0.0.1:3000}"

api_already_up=0
while IFS= read -r base; do
  if api_http_ready "$base"; then
    api_already_up=1
    break
  fi
done < <(api_probe_urls)

if [[ "$api_already_up" -eq 0 ]]; then
  echo "→ Starting API server"
  : >"$LOG_DIR/api.log"
  # Use plain tsx (not watch) so Prisma engine stays unlockable on re-runs
  npx tsx src/server.ts >"$LOG_DIR/api.log" 2>&1 &
  API_PID=$!
  echo "$API_PID" >"$LOG_DIR/api.pid"

  echo "→ Starting background worker (validation + event bus)"
  : >"$LOG_DIR/worker.log"
  npx tsx src/worker.ts >"$LOG_DIR/worker.log" 2>&1 &
  WORKER_PID=$!
  echo "$WORKER_PID" >"$LOG_DIR/worker.pid"
  SERVICES_STARTED=1

  echo "→ Waiting for API readiness…"
  ready=0
  for i in $(seq 1 90); do
    while IFS= read -r base; do
      if api_http_ready "$base"; then
        echo "  API is ready (${base}/readyz)"
        ready=1
        break
      fi
    done < <(api_probe_urls)
    if [[ "$ready" -eq 1 ]]; then
      break
    fi
    # Fallback: API logged listening but this shell cannot curl it (WSL↔Windows).
    # Node-based poc-demo still reaches 127.0.0.1 on the Windows side.
    if grep -q 'api.listening' "$LOG_DIR/api.log" 2>/dev/null; then
      echo "  API is ready (detected via log; curl to localhost may be blocked from this shell)"
      ready=1
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
  SERVICES_STARTED=1
fi

echo ""
echo "→ Running narrative PoC against live API"
npx tsx scripts/poc-demo.ts

echo ""
echo "Done. Re-run anytime with:  npm run demo:poc"
echo "Full bootstrap again with: ./scripts/run-poc-demo.sh"
echo ""
echo "Evaluator visual dashboard:"
echo "  http://127.0.0.1:3000/demo"
echo "Database browser (optional):"
echo "  npm run prisma:studio"
