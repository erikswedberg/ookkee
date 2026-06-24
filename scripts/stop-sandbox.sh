#!/usr/bin/env bash
# stop-sandbox.sh — stop the Ookkee backend + frontend started by start-sandbox.sh.
# Kills tracked PIDs and, as a safety net, anything still holding the dev ports
# (go run / npm spawn child processes that can outlive the wrapper).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="config/.envrc.sandbox"
BE_PID=/tmp/ookkee-backend.pid
FE_PID=/tmp/ookkee-frontend.pid

c_green='\033[0;32m'; c_yellow='\033[1;33m'; c_nc='\033[0m'
info() { echo -e "${c_green}[stop-sandbox]${c_nc} $*"; }
warn() { echo -e "${c_yellow}[stop-sandbox]${c_nc} $*"; }

# Backend port (default 8081) from env file if present.
SERVER_PORT=8081
if [ -f "$ENV_FILE" ]; then
  p=$(grep -E '^SERVER_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2)
  [ -n "${p:-}" ] && SERVER_PORT="$p"
fi

is_running() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_one() {
  local pidfile="$1" name="$2"
  if is_running "$pidfile"; then
    local pid; pid="$(cat "$pidfile")"
    info "stopping $name (pid $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  else
    warn "$name not tracked/running"
  fi
  rm -f "$pidfile"
}

free_port() {
  local port="$1"
  local pids; pids=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
  for p in $pids; do
    warn "freeing port $port (orphan pid $p)"
    kill "$p" 2>/dev/null || true
  done
  sleep 1
  pids=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
}

stop_one "$FE_PID" frontend
stop_one "$BE_PID" backend
free_port "$SERVER_PORT"
free_port 5173
info "stopped."
