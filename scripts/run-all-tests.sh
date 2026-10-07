#!/usr/bin/env bash
# Corre todas las pruebas automatizadas del sistema (jest + supertest).
#
# No necesita el stack docker arriba: las pruebas son unitarias contra
# las capas de servicio, con mocks en los repositorios, y las de RBAC
# usan una app Express minima (sin BD).
#
# Uso:
#   ./scripts/run-all-tests.sh
#
# Requiere node >= 20 y haber corrido `npm install` en la raiz.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "=============================================="
echo " Sistema Asilo Cabeza de Algodon - Suite jest"
echo "=============================================="
echo

node --version
npx jest --version
echo

npx jest --runInBand --colors "$@"
