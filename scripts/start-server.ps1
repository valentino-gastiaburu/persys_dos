# Persys — levanta el server en segundo plano.
# Uso:   npm run server            → modo producción (build + next start)
#        npm run server:dev        → modo desarrollo (next dev, recarga en vivo)
#        npm run server:dev -Clean → modo desarrollo limpiando antes la cache .next
#        (o: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-server.ps1)
#
# Garantías anti-404:
#  - En modo producción SIEMPRE compila (next build) antes de next start: así las
#    rutas sirven del build recién generado y nunca de una cache .next vieja.
#  - En modo dev, si la cache .next quedó obsoleta (código más nuevo que la cache,
#    p. ej. por un apagón brusco o un kill a media escritura) se elimina antes de
#    arrancar para que next dev recompile todo. Con -Clean se fuerza siempre.
#  - Antes de arrancar, espera a que el puerto quede libre (sin carreras con el
#    proceso anterior).
#
# IMPORTANTE: corre este script en TU propia terminal (PowerShell/CMD), NO dentro
# de la sesión del asistente: el server queda desacoplado y el comando devuelve
# de inmediato. Si lo lanza el asistente, su tool queda esperando (parece que se
# cuelga) porque el proceso queda heredando handles de la consola.

param(
  [int]$Port = 3000,
  [switch]$Dev,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:TEMP 'opencode'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$outLog = Join-Path $logDir 'persys-out.log'
$errLog = Join-Path $logDir 'persys-err.log'

# --- Detiene cualquier "next" previo en el puerto (evita EADDRINUSE) ---
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match 'node') {
      Write-Host "Deteniendo server anterior (PID $($proc.Id))..."
      Stop-Process -Id $proc.Id -Force
    }
  }

# Espera hasta que el puerto quede libre (máx ~5s) antes de arrancar.
$free = $false
for ($i = 0; $i -lt 20; $i++) {
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
    $free = $true
    break
  }
  Start-Sleep -Milliseconds 250
}
if (-not $free) { throw "El puerto $Port no se libero despues de detener el server anterior." }

# --- Cache .next: funciones de deteccion de staleness ---
function Get-NewestMtime([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return [datetime]::MinValue }
  $m = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object -Property LastWriteTime -Maximum
  if ($m) { return $m.Maximum } else { return [datetime]::MinValue }
}

$nextDir = Join-Path $root '.next'
$doClean = $false
if (Test-Path -LiteralPath $nextDir) {
  if ($Clean) {
    $doClean = $true
  } else {
    $newestSrc = [datetime]::MinValue
    foreach ($p in @('src', 'next.config.ts', 'next.config.js', 'package.json', 'tsconfig.json', 'public')) {
      $m = Get-NewestMtime (Join-Path $root $p)
      if ($m -gt $newestSrc) { $newestSrc = $m }
    }
    $newestNext = Get-NewestMtime $nextDir
    if ($newestSrc -gt $newestNext) { $doClean = $true }
  }
  if ($doClean) {
    Write-Host "Eliminando cache .next obsoleta..."
    Remove-Item -LiteralPath $nextDir -Recurse -Force
  }
}

$next = Join-Path $root 'node_modules\next\dist\bin\next'

if ($Dev) {
  $argsList = @($next, 'dev', '-p', "$Port")
} else {
  # Produccion: SIEMPRE compilar antes de servir (garantiza rutas frescas).
  Write-Host "Compilando (next build)..."
  & node $next build
  if ($LASTEXITCODE -ne 0) { throw "next build fallo (exit $LASTEXITCODE). No se inicia el server." }
  $argsList = @($next, 'start', '-p', "$Port")
}

$p = Start-Process -FilePath 'node' -ArgumentList $argsList `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

$mode = if ($Dev) { 'dev' } else { 'production' }
Write-Host "Server ($mode) iniciado (PID $($p.Id)) en http://localhost:$Port"
Write-Host "Logs: $outLog / $errLog"
