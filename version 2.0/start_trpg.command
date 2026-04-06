#!/bin/zsh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

"$SCRIPT_DIR/start_trpg.sh"

echo
read "?Press Enter to close this window..."
