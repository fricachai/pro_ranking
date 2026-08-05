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
Read AGENTS.md and OPENCODE_HANDOFF.md. Run exactly one controlled daily update command:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-ProfessionalScreenUpdateCommand.ps1

Do not edit any file directly. Do not split this into separate start and status Shell calls. Do not change scoring logic, data sources, validation thresholds, or layout. Wait for the command's terminal STATUS=published or STATUS=failed output. DATA_CHANGED=false means current sources were checked and the new checked-at timestamp was published without a material content change.
'@

Push-Location $RepoRoot
try {
    & $OpenCode.Source run --title 'pro_ranking daily refresh' $prompt
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
