#!/usr/bin/env bash
# start-sandbox.sh — run Ookkee backend + frontend natively on the sandbox VM.
# The Postgres DB is expected to run in Docker on the HOST (`docker compose up db`)
# and is reached over the host gateway. Config comes from config/.envrc.sandbox.
#
# Usage:
#   ./scripts/start-sandbox.sh         # start BE + FE
#   ./scripts/start-sandbox.sh stop    # stop whatever this script started
#   ./scripts/start-sandbox.sh status  # show status
#
# Logs:  /tmp/ookkee-backend.log  /tmp/ookkee-frontend.log
# PIDs:  /tmp/ookkee-backend.pid  /tmp/ookkee-frontend.pid

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="config/.envrc.sandbox"
BE_LOG=/tmp/ookkee-backend.log
FE_LOG=/tmp/ookkee-frontend.log
BE_PID=/tmp/ookkee-backend.pid
FE_PID=/tmp/ookkee-frontend.pid

c_green='\033[0;32m'; c_yellow='\033[1;33m'; c_red='\033[0;31m'; c_nc='\033[0m'
info()  { echo -e "${c_green}[start-sandbox]${c_nc} $*"; }
warn()  { echo -e "${c_yellow}[start-sandbox]${c_nc} $*"; }
err()   { echo -e "${c_red}[start-sandbox]${c_nc} $*" >&2; }

is_running() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_one() {
  local pidfile="$1" name="$2"
  if is_running "$pidfile"; then
    local pid; pid="$(cat "$pidfile")"
    info "stopping $name (pid $pid)"
    kill "$pid" 2>/dev/null || true
    # give it a moment, then hard-kill the group if needed
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  else
    warn "$name not running"
  fi
  rm -f "$pidfile"
}

cmd_stop() {
  exec "$ROOT/scripts/stop-sandbox.sh"
}

cmd_status() {
  for pair in "backend:$BE_PID" "frontend:$FE_PID"; do
    name="${pair%%:*}"; pidfile="${pair##*:}"
    if is_running "$pidfile"; then
      info "$name RUNNING (pid $(cat "$pidfile"))"
    else
      warn "$name stopped"
    fi
  done
}

load_env() {
  [ -f "$ENV_FILE" ] || { err "missing $ENV_FILE"; exit 1; }
  set -a
  # shellcheck disable=SC1090
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    eval "$line"
  done < "$ENV_FILE"
  set +a

  # The frontend talks to the backend through Vite's dev-server proxy (relative
  # /api), so no backend IP or CORS origin needs to be known here. Point the
  # proxy at the local backend port.
  export VITE_PROXY_TARGET="http://localhost:${SERVER_PORT}"
}

check_db() {
  info "checking DB at ${DB_HOST}:${DB_PORT} ..."
  if nc -z -w3 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    info "DB reachable."
  else
    err "cannot reach ${DB_HOST}:${DB_PORT}."
    err "On the HOST run:  source ./env.sh docker && docker compose up db"
    exit 1
  fi
}

start_backend() {
  if is_running "$BE_PID"; then warn "backend already running (pid $(cat "$BE_PID"))"; return; fi
  # Build first, then exec the binary directly so the tracked PID IS the server.
  # (`go run` forks a child binary that survives killing the wrapper.)
  info "building backend ..."
  ( cd "$ROOT/backend" && go build -o /tmp/ookkee-backend . ) >"$BE_LOG" 2>&1 || {
    err "backend build failed; tail of $BE_LOG:"; tail -n 30 "$BE_LOG"; exit 1; }
  info "starting backend on :${SERVER_PORT} -> log $BE_LOG"
  ( cd "$ROOT/backend" && exec /tmp/ookkee-backend ) >>"$BE_LOG" 2>&1 &
  echo $! > "$BE_PID"
  # wait for health
  for i in $(seq 1 30); do
    if curl -fsS "http://localhost:${SERVER_PORT}/api/health" >/dev/null 2>&1; then
      info "backend healthy."
      return
    fi
    is_running "$BE_PID" || { err "backend died on startup; tail of $BE_LOG:"; tail -n 30 "$BE_LOG"; exit 1; }
    sleep 1
  done
  warn "backend not healthy after 30s; check $BE_LOG"
}

start_frontend() {
  if is_running "$FE_PID"; then warn "frontend already running (pid $(cat "$FE_PID"))"; return; fi
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    info "installing frontend deps (npm install) ..."
    ( cd "$ROOT/frontend" && npm install ) >>"$FE_LOG" 2>&1
  fi
  info "starting frontend on :5173 -> log $FE_LOG"
  ( cd "$ROOT/frontend" && exec npm run dev -- --host 0.0.0.0 ) >>"$FE_LOG" 2>&1 &
  echo $! > "$FE_PID"
  for i in $(seq 1 30); do
    if curl -fsS "http://localhost:5173" >/dev/null 2>&1; then
      info "frontend up."
      return
    fi
    is_running "$FE_PID" || { err "frontend died on startup; tail of $FE_LOG:"; tail -n 30 "$FE_LOG"; exit 1; }
    sleep 1
  done
  warn "frontend not up after 30s; check $FE_LOG"
}

case "${1:-start}" in
  stop)   cmd_stop ;;
  status) cmd_status ;;
  start)
    load_env
    check_db
    start_backend
    start_frontend
    echo
    info "Ookkee is up:"
    info "  frontend  http://localhost:5173"
    info "  backend   http://localhost:${SERVER_PORT}/api/health"
    info "  logs      tail -f $BE_LOG $FE_LOG"
    info "  stop      ./scripts/start-sandbox.sh stop"
    ;;
  *) err "unknown command: $1 (use: start | stop | status)"; exit 1 ;;
esac
