[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OpenCode = Get-Command opencode -ErrorAction SilentlyContinue
if (-not $OpenCode) {
    throw 'OpenCode is not installed. Run: npm install -g opencode-ai; then run: opencode auth login'
}

$prompt = @'
Follow the project AGENTS.md and perform the daily data refresh. Run only:
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish

Do not read the full index.html or latest.json first. Do not change scoring logic or layout. On success, report only the compact script summary. On failure, stop and report the error and log path.
'@

Push-Location $RepoRoot
try {
    & $OpenCode.Source run $prompt
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
