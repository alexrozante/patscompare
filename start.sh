#!/usr/bin/env bash
set -euo pipefail

ROLE=${ROLE:-web}

echo "Iniciando servico [$ROLE]..."
case "$ROLE" in
  web)
    next start
    ;;
  socket)
    node server/socket-server.js
    ;;
  worker)
    node server/worker.js
    ;;
  *)
    echo "Servico nao reconhecido: $ROLE"
    exit 1
    ;;
esac
