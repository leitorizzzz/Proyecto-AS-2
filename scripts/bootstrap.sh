#!/usr/bin/env bash
# Bootstrap del Sistema Asilo Cabeza de Algodon (Linux / macOS / Git Bash).
# Equivalente de scripts/bootstrap.ps1.
#
# Uso: ./scripts/bootstrap.sh

set -euo pipefail
cd "$(dirname "$0")/.."

cyan() { printf '\033[1;36m%s\033[0m\n' "$*"; }
green(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
yel()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
red()  { printf '\033[1;31m%s\033[0m\n' "$*"; }

info() { echo; cyan "==> $*"; }
ok()   { green "    ok. $*"; }
warn() { yel  "    aviso: $*"; }
fail() { red  "    FALLA: $*"; exit 1; }

info "1/7 Verificando requisitos (docker, node)"
command -v docker >/dev/null || fail "docker no esta en PATH"
command -v node   >/dev/null || fail "node no esta en PATH (se requiere node >= 20)"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 \
  || fail "el daemon de Docker no responde."
ok "docker y node disponibles"

info "2/7 Preparando .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  ok ".env creado desde .env.example (modo dev: credenciales por defecto)"
else
  ok ".env ya existe, lo conservo"
fi

info "3/7 Levantando stack docker-compose (puede tardar algunos minutos la primera vez)"
docker compose up -d --build
ok "contenedores arriba"

info "4/7 Esperando a que los 7 /health respondan 200"
puertos=(3000 3001 3002 3003 3004 3005 3006)
for i in $(seq 1 40); do
  todos_ok=1
  for p in "${puertos[@]}"; do
    if ! curl -s -o /dev/null -m 2 -w '%{http_code}' "http://localhost:$p/health" | grep -q '200'; then
      todos_ok=0; break
    fi
  done
  if (( todos_ok )); then ok "los 7 servicios responden"; break; fi
  echo "    intento $i/40 - aun no todos responden"
  sleep 3
done
(( todos_ok )) || fail "algun servicio no respondio en 120s"

info "5/7 Semilla del admin inicial"
docker compose exec -T auth-service npm run seed || warn "seed del admin devolvio error (puede ya existir)"

info "6/7 Instalando devDependencies de la raiz (jest + supertest)"
if [[ ! -d node_modules/jest ]]; then
  npm install --silent
  ok "dependencias instaladas"
else
  ok "ya instaladas"
fi

info "7/7 Semilla de datos de demo"
npm run seed:demo || warn "seed:demo devolvio error (puede ser idempotente)"

cat <<'EOF'

Listo. El sistema esta corriendo en:
  Frontend:        http://localhost:8090
  Auth API:        http://localhost:3000
  Pacientes API:   http://localhost:3002
  Farmacia API:    http://localhost:3001
  Laboratorio API: http://localhost:3003
  Financiero API:  http://localhost:3004
  Reportes API:    http://localhost:3005
  Notificaciones:  http://localhost:3006

Credenciales (ver scripts/README.md para los demas roles):
  admin@asilo.gt / Admin12345
  medico.general@asilo.gt / Demo1234
  especialista@asilo.gt   / Demo1234
  coordinador@asilo.gt    / Demo1234
  farmacia@asilo.gt       / Demo1234
  laboratorio@asilo.gt    / Demo1234
  enfermeria@asilo.gt     / Demo1234

Smoke E2E (opcional): npm run test:e2e
EOF
