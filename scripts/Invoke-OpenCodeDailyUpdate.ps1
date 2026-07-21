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
Read AGENTS.md and OPENCODE_HANDOFF.md. Perform the controlled daily data refresh. Run exactly:
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish

Do not edit any file directly. Do not change scoring logic, data sources, validation thresholds, or layout. The script must refetch events and news, rebuild the report, publish it, and verify GitHub Pages. On success, report only the compact script summary. On failure, stop and report the failed gate and log path.
'@

Push-Location $RepoRoot
try {
    & $OpenCode.Source run --title 'pro_ranking daily refresh' $prompt
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
