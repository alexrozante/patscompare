#!/usr/bin/env bash
##
# PATSCompare
# entrypoint.sh
# Script de execucao para containers 
# PATS Technologies
# 16/06/2026
##
set -euo pipefail

_term() {
  echo "Caught SIGTERM, forwarding..."
  kill -TERM "$child" 2>/dev/null
}

trap _term SIGTERM

./start.sh & 

child=$!
wait "$child"
