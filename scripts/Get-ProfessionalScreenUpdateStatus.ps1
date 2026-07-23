[CmdletBinding()]
param(
    [ValidateRange(0, 60)][int]$WaitSeconds = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$StatePath = Join-Path $RepoRoot '.git\professional-screen-update-state.json'

if (-not (Test-Path -LiteralPath $StatePath)) {
    Write-Output 'STATUS=no_recorded_run'
    exit 0
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
    $running = $state.status -eq 'running' -and $state.pid -and (Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue)
    if (-not $running -or (Get-Date) -ge $deadline) { break }
    Start-Sleep -Seconds 5
} while ($true)

if ($running) {
    Write-Output 'STATUS=running'
    Write-Output "PID=$($state.pid)"
    Write-Output "RUN_LOG=$($state.runLog)"
    exit 0
}

Write-Output "STATUS=$($state.status)"
Write-Output "EXIT_CODE=$($state.exitCode)"
Write-Output "RUN_LOG=$($state.runLog)"
Write-Output "COMPLETED_AT=$($state.completedAt)"
if (Test-Path -LiteralPath $state.runLog) {
    $tail = Get-Content -LiteralPath $state.runLog -Tail 25 -Encoding utf8
    if ($tail.Count -gt 0) {
        Write-Output 'LOG_TAIL_BEGIN'
        $tail
        Write-Output 'LOG_TAIL_END'
    }
}
