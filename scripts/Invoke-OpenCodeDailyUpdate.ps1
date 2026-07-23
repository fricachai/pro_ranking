[CmdletBinding()]
param(
    [switch]$SkipPreflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Preflight = Join-Path $PSScriptRoot 'Test-OpenCodeHandoff.ps1'
$OpenCode = Get-Command opencode -ErrorAction SilentlyContinue
if (-not $OpenCode) {
    $desktopPath = Join-Path $env:LOCALAPPDATA 'Programs\@opencode-aidesktop\OpenCode.exe'
    if (Test-Path -LiteralPath $desktopPath) {
        throw 'OpenCode Desktop is installed. Use /update-report inside the pro_ranking project. This non-interactive PowerShell wrapper additionally requires the opencode CLI in PATH.'
    }
    throw 'OpenCode was not found. Install OpenCode Desktop, or install the CLI with npm install -g opencode-ai for non-interactive automation.'
}

if (-not $SkipPreflight) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Preflight -RequireCli
    if ($LASTEXITCODE -ne 0) { throw 'OpenCode handoff preflight failed.' }
}

$prompt = @'
Read AGENTS.md and OPENCODE_HANDOFF.md. Start the controlled daily data refresh. Run exactly:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1

Do not edit any file directly. Do not change scoring logic, data sources, validation thresholds, or layout. The update runs in a controlled background process because the full report can exceed a Shell wait window. Report only STATUS=started and RUN_LOG. The result must be checked later with Get-ProfessionalScreenUpdateStatus.ps1; do not claim the report is published before that status says published.
'@

Push-Location $RepoRoot
try {
    & $OpenCode.Source run --title 'pro_ranking daily refresh' $prompt
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
