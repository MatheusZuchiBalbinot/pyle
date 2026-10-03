#!/usr/bin/env bash
# One entry point for the whole pyle stack: checks the machine, prepares the env files and
# dependencies, brings up the infrastructure, migrates and seeds the database, and runs the
# control plane, the gateway and the console. Run `./entrypoint.sh help` for every command.
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKEND_DIR="$ROOT_DIR/backend"
readonly FRONTEND_DIR="$ROOT_DIR/frontend"
readonly KEYS_FILE="$BACKEND_DIR/consumer-keys.local.json"

readonly MIN_NODE_MAJOR=22
readonly CONTROL_PLANE_PORT=3000
readonly GATEWAY_PORT=8080
readonly GATEWAY_ADMIN_PORT=8090
readonly CONSOLE_PORT=5173
readonly CONTAINER_CONSOLE_PORT=8081
readonly READY_TIMEOUT_S=180
readonly POLL_INTERVAL_S=2

readonly CONTROL_PLANE_READY_URL="http://localhost:$CONTROL_PLANE_PORT/health/ready"
readonly GATEWAY_READY_URL="http://localhost:$GATEWAY_ADMIN_PORT/health/ready"
readonly CONSOLE_URL="http://localhost:$CONSOLE_PORT"
readonly MANAGED_CONTAINER_LABEL="pyle.managed=true"
readonly EXAMPLE_SECRET_MARKER="change-me"

# Child process groups started by `up`, stopped together on exit.
CHILD_PIDS=()

# ---------- output ----------

if [[ -t 1 ]]; then
	readonly BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' CYAN=$'\033[36m' RESET=$'\033[0m'
else
	readonly BOLD='' DIM='' RED='' GREEN='' YELLOW='' CYAN='' RESET=''
fi

step() {
	printf '\n%s==>%s %s%s%s\n' "$CYAN" "$RESET" "$BOLD" "$*" "$RESET"
}

info() {
	printf '    %s\n' "$*"
}

ok() {
	printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"
}

warn() {
	printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2
}

die() {
	printf '\n%serro:%s %s\n' "$RED" "$RESET" "$*" >&2
	exit 1
}

usage() {
	cat <<EOF
${BOLD}pyle: entrypoint${RESET}

Uso: ./entrypoint.sh [comando] [opções]

Comandos:
  up            (padrão) prepara tudo e roda control plane, gateway e console.
                Ctrl+C para os processos; a infraestrutura continua de pé.
  setup         só prepara: confere a máquina, cria os .env, instala as
                dependências, sobe a infraestrutura e roda as migrations.
  seed          cria os dados de demo (precisa do control plane no ar).
  reset         apaga os dados de demo e cria de novo (precisa do control plane).
  containers    roda a stack inteira em containers (perfil app, NODE_ENV=production).
  status        mostra o que está no ar.
  down          derruba os containers (infraestrutura, réplicas e perfil app).
                Os dados do Postgres ficam no volume.
  help          esta ajuda.

Opções de "up":
  --no-frontend    não sobe o console.
  --skip-install   não roda npm ci, mesmo com dependências desatualizadas.
  --no-seed        não roda o seed, mesmo num banco vazio.

Depois do up:
  Console          $CONSOLE_URL  (admin@pyle.local / pyle-admin-dev)
  Gateway          http://localhost:$GATEWAY_PORT
  Swagger          http://localhost:$CONTROL_PLANE_PORT/api-docs
  Métricas         http://localhost:$GATEWAY_ADMIN_PORT/metrics
EOF
}

# ---------- checks ----------

require_command() {
	local command_name=$1
	local hint=$2

	if ! command -v "$command_name" >/dev/null 2>&1; then
		die "$command_name não encontrado. $hint"
	fi
}

is_wsl() {
	grep -qi microsoft /proc/version 2>/dev/null
}

check_machine() {
	step "Conferindo a máquina"

	require_command node "Instale o Node $MIN_NODE_MAJOR ou mais novo (https://nodejs.org)."
	require_command npm "Ele vem junto com o Node."
	require_command curl "Instale o curl pelo gerenciador de pacotes do sistema."
	require_command docker "Instale o Docker (no WSL, ligue a integração no Docker Desktop)."

	local node_major
	node_major=$(node -p 'process.versions.node.split(".")[0]')

	if ((node_major < MIN_NODE_MAJOR)); then
		die "o projeto precisa do Node $MIN_NODE_MAJOR ou mais novo; este é o $(node -v)."
	fi

	ok "Node $(node -v), npm $(npm -v)"

	if ! docker compose version >/dev/null 2>&1; then
		die "o plugin docker compose (v2) não está disponível."
	fi

	if ! docker info >/dev/null 2>&1; then
		if is_wsl; then
			die "o Docker não responde. Abra o Docker Desktop no Windows e espere o motor subir."
		fi

		die "o Docker não responde. Inicie o serviço do Docker e tente de novo."
	fi

	ok "Docker $(docker version --format '{{.Server.Version}}'), $(docker compose version --short | sed 's/^/compose /')"
}

is_port_busy() {
	local port=$1

	(echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

check_ports_free() {
	local port

	for port in "$@"; do
		if is_port_busy "$port"; then
			die "a porta $port já está em uso. Outra cópia da stack está rodando? Veja ./entrypoint.sh status."
		fi
	done
}

# ---------- env files ----------

copy_env_if_missing() {
	local target=$1
	local example="$target.example"
	local label=${target#"$ROOT_DIR"/}

	if [[ -f "$target" ]]; then
		ok "$label já existe (não mexi)"

		return
	fi

	[[ -f "$example" ]] || die "$example não existe."
	cp "$example" "$target"
	ok "$label criado a partir de $label.example"
}

prepare_env_files() {
	step "Arquivos de ambiente"

	copy_env_if_missing "$ROOT_DIR/.env"
	copy_env_if_missing "$BACKEND_DIR/.env"
	copy_env_if_missing "$FRONTEND_DIR/.env"

	if ! grep -qE '^AI_API_KEY=.+' "$BACKEND_DIR/.env"; then
		info "${DIM}Sem AI_API_KEY em backend/.env: tudo funciona, menos as funções de IA.${RESET}"
	fi
}

# Reads KEY=value from an env file, without the surrounding quotes.
env_value() {
	local file=$1
	local key=$2

	grep -E "^$key=" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

# ---------- dependencies ----------

# npm ci only when node_modules is missing or older than the lockfile (npm writes
# node_modules/.package-lock.json on every install).
install_dependencies_in() {
	local dir=$1
	local label=${dir#"$ROOT_DIR"/}
	local installed_lock="$dir/node_modules/.package-lock.json"

	if [[ -f "$installed_lock" && "$installed_lock" -nt "$dir/package-lock.json" ]]; then
		ok "$label: dependências em dia"

		return
	fi

	info "$label: npm ci..."
	(cd "$dir" && npm ci --no-audit --no-fund --loglevel=error)
	ok "$label: dependências instaladas"
}

install_dependencies() {
	local should_install=$1

	step "Dependências"

	if [[ "$should_install" != true ]]; then
		info "pulei (--skip-install)"

		return
	fi

	install_dependencies_in "$BACKEND_DIR"
	install_dependencies_in "$FRONTEND_DIR"
}

# ---------- infrastructure ----------

# Under WSL 2 with Docker Desktop, host.docker.internal is the Windows host, so the bot
# container must be pointed at this distro's address (it changes on every reboot).
export_bot_urls() {
	if ! is_wsl; then
		return
	fi

	local address
	address=$(hostname -I | awk '{print $1}')
	export BOT_GATEWAY_URL="http://$address:$GATEWAY_PORT"
	export BOT_CONTROL_PLANE_URL="http://$address:$CONTROL_PLANE_PORT"
}

# In containers mode the gateway port is published by Docker, and the Compose default
# (host.docker.internal) already reaches it; only the dev processes need the WSL address.
start_infrastructure() {
	local mode=$1

	step "Infraestrutura (Postgres, Redis, Centrifugo, instâncias de demo, bot de carga)"

	if [[ "$mode" == dev ]]; then
		export_bot_urls
	fi

	(cd "$ROOT_DIR" && docker compose up -d --wait)
	ok "containers no ar"
}

migrate_database() {
	step "Migrations do banco"

	(cd "$BACKEND_DIR" && npm run --silent db:migrate)
	ok "schema em dia"
}

# ---------- processes ----------

wait_for_url() {
	local url=$1
	local label=$2
	local waited=0

	until curl -fsS -o /dev/null "$url" 2>/dev/null; do
		if ((waited >= READY_TIMEOUT_S)); then
			die "$label não respondeu em ${READY_TIMEOUT_S}s ($url). Veja as linhas acima."
		fi

		sleep "$POLL_INTERVAL_S"
		waited=$((waited + POLL_INTERVAL_S))
	done

	ok "$label pronto"
}

# Runs a command in its own process group, every output line tagged with a name.
start_process() {
	local name=$1
	shift

	setsid bash -c '"$@" 2>&1 | sed -u "s/^/$(printf "%-9s" "$0") | /"' "$name" "$@" &
	CHILD_PIDS+=("$!")
}

stop_processes() {
	local pid

	trap - EXIT INT TERM

	if ((${#CHILD_PIDS[@]} == 0)); then
		return
	fi

	printf '\n%s==>%s parando os processos...\n' "$CYAN" "$RESET"

	for pid in "${CHILD_PIDS[@]}"; do
		kill -TERM -- "-$pid" 2>/dev/null || true
	done

	wait 2>/dev/null || true
	info "A infraestrutura continua no ar. Para derrubar: ./entrypoint.sh down"
}

run_seed() {
	step "Dados de demo"

	(cd "$BACKEND_DIR" && npm run --silent seed)
	ok "serviços, rotas, consumidores e 24 h de histórico"

	# The bot reads the consumer keys once, when it starts; restart keeps its URLs.
	(cd "$ROOT_DIR" && docker compose restart bot >/dev/null)
	ok "bot de carga reiniciado com as chaves novas"
}

print_summary() {
	local has_frontend=$1

	printf '\n%s%s pyle no ar %s\n' "$BOLD" "$GREEN" "$RESET"

	if [[ "$has_frontend" == true ]]; then
		info "Console    $CONSOLE_URL   ($(env_value "$BACKEND_DIR/.env" DEV_ADMIN_EMAIL) / $(env_value "$BACKEND_DIR/.env" DEV_ADMIN_PASSWORD))"
	fi

	info "Gateway    http://localhost:$GATEWAY_PORT"
	info "Swagger    http://localhost:$CONTROL_PLANE_PORT/api-docs"
	info "Métricas   http://localhost:$GATEWAY_ADMIN_PORT/metrics"
	info "Chaves     backend/consumer-keys.local.json"
	info ""
	info "${DIM}curl -H \"Authorization: Bearer \$(node -p \"require('./backend/consumer-keys.local.json')['web-app'][0]\")\" http://localhost:$GATEWAY_PORT/api/orders/1${RESET}"
	info "${DIM}Ctrl+C para os processos; ./entrypoint.sh down derruba a infraestrutura.${RESET}"
	printf '\n'
}

# ---------- commands ----------

command_setup() {
	local should_install=$1

	check_machine
	prepare_env_files
	install_dependencies "$should_install"
	start_infrastructure dev
	migrate_database
}

command_up() {
	local has_frontend=true
	local should_install=true
	local should_seed=true

	while (($# > 0)); do
		case $1 in
			--no-frontend) has_frontend=false ;;
			--skip-install) should_install=false ;;
			--no-seed) should_seed=false ;;
			*) die "opção desconhecida para up: $1 (veja ./entrypoint.sh help)" ;;
		esac

		shift
	done

	check_ports_free "$CONTROL_PLANE_PORT" "$GATEWAY_PORT" "$GATEWAY_ADMIN_PORT"

	if [[ "$has_frontend" == true ]]; then
		check_ports_free "$CONSOLE_PORT"
	fi

	command_setup "$should_install"

	step "Control plane e gateway"
	trap stop_processes EXIT
	trap 'exit 130' INT TERM
	start_process backend npm --prefix "$BACKEND_DIR" run dev
	wait_for_url "$CONTROL_PLANE_READY_URL" "control plane"
	wait_for_url "$GATEWAY_READY_URL" "gateway"

	# Seeding twice is safe (it skips what exists), but it only runs on its own when the
	# demo keys were never written.
	if [[ "$should_seed" == true && ! -f "$KEYS_FILE" ]]; then
		run_seed
	fi

	if [[ "$has_frontend" == true ]]; then
		step "Console"
		start_process console npm --prefix "$FRONTEND_DIR" run dev -- --port "$CONSOLE_PORT" --strictPort
		wait_for_url "$CONSOLE_URL" "console"
	fi

	print_summary "$has_frontend"
	wait
}

require_control_plane() {
	if ! curl -fsS -o /dev/null "$CONTROL_PLANE_READY_URL" 2>/dev/null; then
		die "o control plane não está no ar. Rode ./entrypoint.sh up em outro terminal antes."
	fi
}

command_seed() {
	require_control_plane
	run_seed
}

command_reset() {
	require_control_plane
	step "Apagando os dados de demo"
	(cd "$BACKEND_DIR" && npm run --silent seed:clean)
	ok "dados de demo apagados"
	run_seed
}

# The app profile runs with NODE_ENV=production, which refuses the example secrets.
check_production_env() {
	local root_env="$ROOT_DIR/.env"
	local backend_env="$BACKEND_DIR/.env"

	if grep -qE "^[A-Z_]+=.*$EXAMPLE_SECRET_MARKER" "$root_env"; then
		warn "Estes valores do .env da raiz ainda são de exemplo:"
		grep -E "^[A-Z_]+=.*$EXAMPLE_SECRET_MARKER" "$root_env" | cut -d= -f1 | sed 's/^/      /' >&2
		info "Gere valores reais com:"
		info "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
		die "troque os segredos de exemplo antes de rodar em containers."
	fi

	if [[ "$(env_value "$root_env" ADMIN_API_TOKEN)" != "$(env_value "$backend_env" ADMIN_API_TOKEN)" ]]; then
		die "ADMIN_API_TOKEN precisa ser igual no .env da raiz e em backend/.env (o seed usa o de backend/.env)."
	fi

	local socket_gid
	socket_gid=$(stat -c %g /var/run/docker.sock 2>/dev/null || echo '')

	if [[ -n "$socket_gid" && "$(env_value "$root_env" DOCKER_GID)" != "$socket_gid" ]]; then
		warn "DOCKER_GID no .env da raiz não é o grupo do socket ($socket_gid): a escala pelo console vai falhar."
	fi

	ok "segredos e tokens conferidos"
}

command_containers() {
	check_machine
	prepare_env_files
	step "Conferindo o .env para produção"
	check_production_env
	install_dependencies_in "$BACKEND_DIR"
	start_infrastructure containers
	migrate_database

	step "Control plane, gateway e console em containers"
	(cd "$ROOT_DIR" && docker compose --profile app up -d --build --wait)
	ok "containers da aplicação no ar"

	if [[ ! -f "$KEYS_FILE" ]]; then
		step "Dados de demo"
		(cd "$BACKEND_DIR" && SEED_INSTANCE_HOST=host.docker.internal npm run --silent seed)
		(cd "$ROOT_DIR" && docker compose restart bot >/dev/null)
		ok "dados de demo criados e bot reiniciado"
	fi

	printf '\n%s%s pyle no ar em containers %s\n' "$BOLD" "$GREEN" "$RESET"
	info "Console    http://localhost:$CONTAINER_CONSOLE_PORT"
	info "Gateway    http://localhost:$GATEWAY_PORT"
	info "Swagger    http://localhost:$CONTROL_PLANE_PORT/api-docs"
	info "Para derrubar: ./entrypoint.sh down"
}

print_status_line() {
	local label=$1
	local url=$2

	if curl -fsS -o /dev/null "$url" 2>/dev/null; then
		ok "$label  ${DIM}$url${RESET}"

		return
	fi

	warn "$label fora do ar  ${DIM}$url${RESET}"
}

command_status() {
	step "Containers"

	if docker info >/dev/null 2>&1; then
		(cd "$ROOT_DIR" && docker compose --profile app ps --format 'table {{.Service}}\t{{.Status}}')
		local managed_count
		managed_count=$(docker ps -q --filter "label=$MANAGED_CONTAINER_LABEL" | wc -l)
		info "réplicas gerenciadas: $managed_count"
	else
		warn "o Docker não responde"
	fi

	step "Processos"
	print_status_line "control plane" "$CONTROL_PLANE_READY_URL"
	print_status_line "gateway      " "$GATEWAY_READY_URL"
	print_status_line "console      " "$CONSOLE_URL"

	if [[ -f "$KEYS_FILE" ]]; then
		ok "dados de demo criados (backend/consumer-keys.local.json)"
	else
		warn "sem dados de demo: rode ./entrypoint.sh seed com o control plane no ar"
	fi
}

command_down() {
	step "Derrubando os containers"

	local managed
	managed=$(docker ps -aq --filter "label=$MANAGED_CONTAINER_LABEL")

	if [[ -n "$managed" ]]; then
		# shellcheck disable=SC2086 # one id per word, on purpose
		docker rm -f $managed >/dev/null
		ok "réplicas gerenciadas removidas"
	fi

	(cd "$ROOT_DIR" && docker compose --profile app down)
	ok "tudo parado; os dados do Postgres continuam no volume"
	info "${DIM}Para apagar também os dados: docker compose --profile app down -v${RESET}"
}

main() {
	local command=${1:-up}

	if (($# > 0)); then
		shift
	fi

	case $command in
		up) command_up "$@" ;;
		setup) command_setup true ;;
		seed) command_seed ;;
		reset) command_reset ;;
		containers) command_containers ;;
		status) command_status ;;
		down) command_down ;;
		help | -h | --help) usage ;;
		*)
			usage
			die "comando desconhecido: $command"
			;;
	esac
}

main "$@"
