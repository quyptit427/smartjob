#!/bin/sh
set -eu
export GATEWAY_PORT="${PORT:-3000}"
export RESUME_STORAGE="${RESUME_STORAGE:-gridfs}"
pids=""

shutdown() {
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
  wait
  exit 0
}
trap shutdown TERM INT

run() {
  "$@" &
  pids="$pids $!"
}

LISTEN_HOST=127.0.0.1 run node services/user-service/src/index.js
LISTEN_HOST=127.0.0.1 run node services/job-service/src/index.js
LISTEN_HOST=127.0.0.1 run node services/application-service/src/index.js
LISTEN_HOST=127.0.0.1 run node services/recommendation-service/src/index.js
LISTEN_HOST=127.0.0.1 run node services/resume-service/src/index.js
run python3 -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port "${AI_PORT:-3006}"
LISTEN_HOST=0.0.0.0 run node api-gateway/src/index.js

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  node deploy/reindex.mjs &
fi

wait
