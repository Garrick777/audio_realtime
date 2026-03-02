$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (Test-Path $venvPython) {
  $pythonCmd = $venvPython
} else {
  $pythonCmd = "python"
}

Write-Host "Checking required imports..."
& $pythonCmd -c "import aiohttp, websockets, dotenv; print('imports:ok')"

Write-Host "Compiling backend source..."
& $pythonCmd -m compileall (Join-Path $repoRoot "web_version\backend")

Write-Host "Environment verification complete."
