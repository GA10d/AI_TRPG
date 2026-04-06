#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
FRONTEND_ROOT="$REPO_ROOT/frontend"
BACKEND_PORT="${BACKEND_PORT:-8788}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
CONDA_ENV_NAME="${CONDA_ENV_NAME:-ai_trpg}"
BACKEND_LOG="$REPO_ROOT/backend.log"
FRONTEND_LOG="$REPO_ROOT/frontend.log"

fail() {
  echo
  echo "[ERROR] $1"
  echo
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

resolve_python_command() {
  if command_exists conda; then
    if conda run -n "$CONDA_ENV_NAME" python --version >/dev/null 2>&1; then
      PYTHON_CMD=(conda run --no-capture-output -n "$CONDA_ENV_NAME" python)
      return
    fi
    fail "Conda environment '$CONDA_ENV_NAME' was not found or is not usable. Create it first, then install requirements."
  fi

  if command_exists python; then
    PYTHON_CMD=(python)
    return
  fi

  fail "Neither conda nor python was found in PATH. Please install Python first."
}

PYTHON_CMD=()

echo "AI_TRPG_616 launcher"
echo "Repo: $REPO_ROOT"
echo

echo "[1/5] Checking Python..."
resolve_python_command
echo "      OK: $("${PYTHON_CMD[@]}" --version 2>&1)"
if command_exists conda; then
  echo "      Env: $CONDA_ENV_NAME"
fi
echo

echo "[2/5] Checking Node/npm..."
if ! command_exists npm; then
  fail "npm was not found in PATH. Please install Node.js first."
fi
echo "      OK: npm $(npm --version)"

if [[ ! -f "$FRONTEND_ROOT/package.json" ]]; then
  fail "frontend/package.json was not found."
fi

if [[ ! -d "$FRONTEND_ROOT/node_modules" ]]; then
  fail "frontend/node_modules was not found. Run 'cd frontend && npm install' first."
fi
echo

echo "[3/5] Starting backend..."
(
  cd "$REPO_ROOT"
  export PYTHONPATH="$REPO_ROOT/Code${PYTHONPATH:+:$PYTHONPATH}"
  "${PYTHON_CMD[@]}" -m trpg_runtime.http_server --port "$BACKEND_PORT"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "      PID: $BACKEND_PID"
echo "      Log: $BACKEND_LOG"

sleep 1

echo
echo "[4/5] Starting frontend..."
(
  cd "$FRONTEND_ROOT"
  npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "      PID: $FRONTEND_PID"
echo "      Log: $FRONTEND_LOG"

sleep 2

echo
echo "[5/5] Opening browser..."
FRONTEND_URL="http://$FRONTEND_HOST:$FRONTEND_PORT/"
if command_exists open; then
  open "$FRONTEND_URL" >/dev/null 2>&1 || true
fi

echo
echo "Started successfully."
echo "Frontend: $FRONTEND_URL"
echo "Backend : http://127.0.0.1:$BACKEND_PORT"
echo
echo "To stop them later:"
echo "kill $BACKEND_PID $FRONTEND_PID"
