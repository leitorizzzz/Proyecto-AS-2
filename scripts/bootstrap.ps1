# Bootstrap del Sistema Asilo Cabeza de Algodon para Windows / PowerShell.
# Hace todo lo necesario para que un repo recien clonado quede corriendo:
#   1. Copia .env.example -> .env si no existe
#   2. docker compose up -d --build
#   3. Espera a que SQL Server y los 7 /health respondan
#   4. Semilla el admin inicial
#   5. Instala jest/supertest en la raiz (idempotente)
#   6. Semilla datos de demo
#   7. Imprime URLs y credenciales
#
# Uso:
#   .\scripts\bootstrap.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path "$PSScriptRoot\.."

function Info($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function OK($msg)    { Write-Host "    ok. $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "    aviso: $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "    FALLA: $msg" -ForegroundColor Red; exit 1 }

Info "1/7 Verificando requisitos (docker, node)"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "docker no esta en PATH" }
if (-not (Get-Command node   -ErrorAction SilentlyContinue)) { Fail "node no esta en PATH (se requiere node >= 20)" }
docker version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) { Fail "el daemon de Docker no responde. Abre Docker Desktop y vuelve a correr." }
OK "docker y node disponibles"

Info "2/7 Preparando .env"
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    OK ".env creado desde .env.example (modo dev: credenciales por defecto)"
} else {
    OK ".env ya existe, lo conservo"
}

Info "3/7 Levantando stack docker-compose (puede tardar algunos minutos la primera vez)"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail "docker compose up fallo" }
OK "contenedores arriba"

Info "4/7 Esperando a que los 7 /health respondan 200"
$puertos = @(3000,3001,3002,3003,3004,3005,3006)
$intentos = 40
for ($i=1; $i -le $intentos; $i++) {
    $todosOk = $true
    foreach ($p in $puertos) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$p/health"
            if ($r.StatusCode -ne 200) { $todosOk = $false; break }
        } catch { $todosOk = $false; break }
    }
    if ($todosOk) { OK "los 7 servicios responden"; break }
    Write-Host "    intento $i/$intentos - aun no todos responden" -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
}
if (-not $todosOk) { Fail "algun servicio no respondio en $($intentos*3)s. Revisa docker compose logs." }

Info "5/7 Semilla del admin inicial"
docker compose exec -T auth-service npm run seed
if ($LASTEXITCODE -ne 0) { Warn "seed del admin devolvio error (puede ser que ya exista)" }
else                     { OK "admin seedeado" }

Info "6/7 Instalando devDependencies de la raiz (jest + supertest)"
if (-not (Test-Path node_modules\jest)) {
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Fail "npm install fallo" }
    OK "dependencias instaladas"
} else {
    OK "ya instaladas"
}

Info "7/7 Semilla de datos de demo"
npm run seed:demo
if ($LASTEXITCODE -ne 0) { Warn "seed:demo devolvio error (puede ser idempotente, revisa salida)" }

Write-Host "`nListo. El sistema esta corriendo en:" -ForegroundColor Green
Write-Host "  Frontend:        http://localhost:8090" -ForegroundColor Green
Write-Host "  Auth API:        http://localhost:3000" -ForegroundColor DarkGray
Write-Host "  Pacientes API:   http://localhost:3002" -ForegroundColor DarkGray
Write-Host "  Farmacia API:    http://localhost:3001" -ForegroundColor DarkGray
Write-Host "  Laboratorio API: http://localhost:3003" -ForegroundColor DarkGray
Write-Host "  Financiero API:  http://localhost:3004" -ForegroundColor DarkGray
Write-Host "  Reportes API:    http://localhost:3005" -ForegroundColor DarkGray
Write-Host "  Notificaciones:  http://localhost:3006" -ForegroundColor DarkGray

Write-Host "`nCredenciales de demo (ver scripts/README.md para los demas roles):" -ForegroundColor Green
Write-Host "  admin@asilo.gt / Admin12345" -ForegroundColor Green
Write-Host "  medico.general@asilo.gt / Demo1234" -ForegroundColor Green
Write-Host "  especialista@asilo.gt / Demo1234" -ForegroundColor Green
Write-Host "  coordinador@asilo.gt / Demo1234" -ForegroundColor Green
Write-Host "  farmacia@asilo.gt / Demo1234" -ForegroundColor Green
Write-Host "  laboratorio@asilo.gt / Demo1234" -ForegroundColor Green
Write-Host "  enfermeria@asilo.gt / Demo1234" -ForegroundColor Green

Write-Host "`nSmoke E2E (opcional): npm run test:e2e" -ForegroundColor Cyan
