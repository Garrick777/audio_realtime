param(
  [string]$PythonCmd = "python"
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$venvPath = Join-Path $repoRoot ".venv"

Write-Host "Creating virtual environment at $venvPath"
& $PythonCmd -m venv $venvPath

$venvPython = Join-Path $venvPath "Scripts\python.exe"

Write-Host "Installing dependencies from requirements.txt"
try {
  & $venvPython -m pip install --upgrade pip
} catch {
  Write-Warning "pip upgrade failed, continuing with current pip."
}

& $venvPython -m pip install -r (Join-Path $repoRoot "requirements.txt")

Write-Host "Setup complete."
