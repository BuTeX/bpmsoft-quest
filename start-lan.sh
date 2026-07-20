#!/bin/sh
set -eu

PORT="${1:-4173}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

cd "$SCRIPT_DIR"

echo "Академия Гуд программ"
echo "Локально: http://127.0.0.1:$PORT"

for interface in en0 en1; do
  address=$(ipconfig getifaddr "$interface" 2>/dev/null || true)
  if [ -n "$address" ]; then
    echo "Локальная сеть: http://$address:$PORT"
  fi
done

echo "Для остановки нажмите Ctrl+C"
PORT="$PORT" exec node server.js
