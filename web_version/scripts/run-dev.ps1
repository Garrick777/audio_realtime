$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$backendDir = Join-Path $repoRoot "web_version\backend"
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (Test-Path $venvPython) {
  $pythonCmd = $venvPython
} else {
  $pythonCmd = "python"
}

Push-Location $backendDir
try {
  & $pythonCmd "server.py"
} finally {
  Pop-Location
}
