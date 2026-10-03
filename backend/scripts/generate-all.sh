#!/usr/bin/env bash
# Regenerates the control-plane Prisma client.
# Runs automatically after `npm install` — node_modules/@prisma/* is pruned
# and regenerated on every install, since npm treats hand-generated files
# under node_modules as extraneous.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$script_dir/.env" ]; then
  echo "Skipping Prisma client generation: $script_dir/.env not found yet (see README)." >&2
  exit 0
fi

# shellcheck disable=SC1091
set -a
source "$script_dir/.env"
set +a

npx prisma generate --schema "$script_dir/prisma/control-plane"
