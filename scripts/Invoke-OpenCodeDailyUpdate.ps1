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
    throw 'OpenCode is not installed. Run: npm install -g opencode-ai; then run: opencode auth login'
}

if (-not $SkipPreflight) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Preflight
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
