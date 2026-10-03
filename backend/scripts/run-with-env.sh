#!/usr/bin/env bash
# Loads .env, then runs the given command with those vars in its environment.
# A variable already set in the caller's environment wins over .env, so
# `SEED_INSTANCE_HOST=host.docker.internal npm run seed` does what it says.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | '#'*) continue ;; esac
  name="${line%%=*}"
  if [ -n "${!name+set}" ]; then continue; fi
  eval "export $line"
done < "$script_dir/.env"

exec "$@"
