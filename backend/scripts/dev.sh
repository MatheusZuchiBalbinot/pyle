#!/usr/bin/env bash
# Control plane and gateway in one terminal, each line tagged with its
# process. Ctrl+C stops all of them. The load bot is the Compose "bot"
# service (docker compose up -d); npm run bot runs it by hand.
set -euo pipefail
trap 'kill 0' EXIT

# Under WSL2 with Docker Desktop, host.docker.internal is the Windows host, not this
# distro, so the bot container cannot reach the processes started here. Point it at the
# distro's own address, which changes on every reboot, and recreate it if that moved.
# Elsewhere the Compose default already works. Best effort: without Docker, no bot.
point_bot_at_this_host() {
	if ! grep -qi microsoft /proc/version 2>/dev/null; then
		return
	fi

	local address
	address=$(hostname -I | awk '{print $1}')
	BOT_GATEWAY_URL="http://$address:8080" BOT_CONTROL_PLANE_URL="http://$address:3000" \
		docker compose -f "$(dirname "$0")/../../docker-compose.yml" up -d --no-build bot >/dev/null 2>&1 ||
		echo "bot container not (re)started: is Docker running?" >&2
}

run() {
	local name=$1
	shift
	"$@" 2>&1 | sed -u "s/^/$(printf '%-13s' "$name") | /" &
}

# The control plane runs compiled (Nest needs decorator metadata), so it reads
# @pyle/shared's dist: build it once, then keep it rebuilding. The gateway
# runs its sources through tsx.
npm run build -w @pyle/shared
run shared npm run dev -w @pyle/shared
run control-plane npm run start:dev
# A readable name on the console instead of gw-<hostname>-<pid>; one gateway here.
GATEWAY_ID="${GATEWAY_ID:-gw-local}" run gateway npm run start:gateway
point_bot_at_this_host
wait
