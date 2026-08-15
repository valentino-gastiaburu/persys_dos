# Persys — levanta el server en segundo plano.
# Uso:   npm run server            → modo producción (next start)
#        npm run server:dev        → modo desarrollo (next dev, recarga en vivo)
#        (o: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-server.ps1)
# Nota: en modo producción ejecuta `npm run build` primero si cambiaste código.
#
# IMPORTANTE: corre este script en TU propia terminal (PowerShell/CMD), NO dentro
# de la sesión del asistente: el server queda desacoplado y el comando devuelve
# de inmediato. Si lo lanza el asistente, su tool queda esperando (parece que se
# cuelga) porque el proceso queda heredando handles de la consola.

param(
  [int]$Port = 3000,
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:TEMP 'opencode'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$outLog = Join-Path $logDir 'persys-out.log'
$errLog = Join-Path $logDir 'persys-err.log'

# Detiene cualquier "next" previo en el puerto (evita EADDRINUSE)
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match 'node') {
      Write-Host "Deteniendo server anterior (PID $($proc.Id))..."
      Stop-Process -Id $proc.Id -Force
    }
  }

Start-Sleep -Milliseconds 800

$next = Join-Path $root 'node_modules\next\dist\bin\next'
$mode = if ($Dev) { 'dev' } else { 'start' }
$argsList = if ($Dev) { @($next, 'dev', '-p', "$Port") } else { @($next, 'start', '-p', "$Port") }

$p = Start-Process -FilePath 'node' -ArgumentList $argsList `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Server ($mode) iniciado (PID $($p.Id)) en http://localhost:$Port"
Write-Host "Logs: $outLog / $errLog"
