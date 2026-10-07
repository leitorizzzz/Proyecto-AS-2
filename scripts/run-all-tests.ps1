# Equivalente PowerShell de scripts/run-all-tests.sh.
# Uso: ./scripts/run-all-tests.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path "$PSScriptRoot\.."

Write-Host "=============================================="
Write-Host " Sistema Asilo Cabeza de Algodon - Suite jest"
Write-Host "=============================================="
Write-Host ""

node --version
npx jest --version
Write-Host ""

npx jest --runInBand --colors @args
