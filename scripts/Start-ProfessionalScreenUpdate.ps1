[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $PSScriptRoot 'Run-ProfessionalScreenUpdate.ps1'
$LogDir = Join-Path $RepoRoot 'professional-screen-report\logs'
$StatePath = Join-Path $RepoRoot '.git\professional-screen-update-state.json'

if (-not (Test-Path -LiteralPath $Runner)) { throw "Runner script not found: $Runner" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required.' }

if (Test-Path -LiteralPath $StatePath) {
    try {
        $previous = Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($previous.status -eq 'running' -and $previous.pid -and (Get-Process -Id ([int]$previous.pid) -ErrorAction SilentlyContinue)) {
            throw "A controlled update is already running. Use /update-report-status. RUN_LOG=$($previous.runLog)"
        }
    }
    catch {
        if ($_.Exception.Message -like 'A controlled update is already running*') { throw }
    }
}

$changes = @(& git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect git working tree.' }
if ($changes.Count -gt 0) {
    throw "Working tree is not clean. Resolve the listed changes before starting an update: $($changes -join '; ')"
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runLog = Join-Path $LogDir "opencode-update-$stamp.log"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -StatePath `"$StatePath`" -RunLogPath `"$runLog`""
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru

$state = [ordered]@{
    status = 'running'
    pid = $process.Id
    startedAt = (Get-Date).ToString('o')
    completedAt = $null
    exitCode = $null
    runLog = $runLog
}
$state | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8

Write-Output 'STATUS=started'
Write-Output "PID=$($process.Id)"
Write-Output "RUN_LOG=$runLog"
