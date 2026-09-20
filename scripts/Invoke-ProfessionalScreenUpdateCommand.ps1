[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Preflight = Join-Path $PSScriptRoot 'Test-OpenCodeHandoff.ps1'
$Starter = Join-Path $PSScriptRoot 'Start-ProfessionalScreenUpdate.ps1'
$StatePath = Join-Path $RepoRoot '.git\professional-screen-update-state.json'
$lastLogLineCount = 0
$controllerStartedAt = Get-Date
$nextHeartbeatAt = $controllerStartedAt.AddSeconds(15)
$stateReadFailures = 0

function Read-UpdateState {
    if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
    try {
        return (Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Write-NewProgressLines {
    param([AllowNull()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return }
    $lines = @(Get-Content -LiteralPath $Path -Encoding utf8)
    if ($lines.Count -lt $script:lastLogLineCount) {
        Write-Output 'UPDATE_PROGRESS=run_log_rotated'
        $script:lastLogLineCount = 0
    }
    for ($index = $script:lastLogLineCount; $index -lt $lines.Count; $index++) {
        $line = [string]$lines[$index]
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            Write-Output "UPDATE_PROGRESS=$line"
        }
    }
    $script:lastLogLineCount = $lines.Count
}

Push-Location $RepoRoot
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Preflight
    if ($LASTEXITCODE -ne 0) { throw 'Handoff preflight failed.' }
    Write-Output 'UPDATE_STAGE=preflight_passed'

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Starter
    if ($LASTEXITCODE -ne 0) { throw 'Controlled update could not be started.' }
    Write-Output 'CONTROLLED_UPDATE_WAITING=true'
    $state = Read-UpdateState
    if ($null -eq $state -or [string]::IsNullOrWhiteSpace([string]$state.runLog)) {
        throw 'Controlled update state did not provide a run log.'
    }
    $runLog = [string]$state.runLog
    Write-Output "RUN_LOG=$runLog"
    Write-Output 'UPDATE_STAGE=background_started'

    while ($true) {
        Write-NewProgressLines -Path $runLog
        $state = Read-UpdateState
        if ($null -eq $state) {
            $stateReadFailures++
            if ($stateReadFailures -ge 15) {
                throw 'Controlled update state remained unreadable for 30 seconds.'
            }
            Start-Sleep -Seconds 2
            continue
        }
        $stateReadFailures = 0

        $currentStatus = [string]$state.status
        if ($currentStatus -ne 'running') { break }

        if ((Get-Date) -ge $nextHeartbeatAt) {
            $elapsedSeconds = [int]((Get-Date) - $controllerStartedAt).TotalSeconds
            Write-Output "UPDATE_PROGRESS=still_running elapsed_seconds=$elapsedSeconds run_log=$runLog"
            $nextHeartbeatAt = (Get-Date).AddSeconds(15)
        }

        if ($state.pid) {
            $worker = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
            if ($null -eq $worker) {
                Start-Sleep -Seconds 2
                $lateState = Read-UpdateState
                if ($null -eq $lateState -or [string]$lateState.status -eq 'running') {
                    throw "Controlled update worker stopped before terminal state. RUN_LOG=$runLog"
                }
                $state = $lateState
                $currentStatus = [string]$state.status
                break
            }
        }

        Start-Sleep -Seconds 2
    }

    Write-NewProgressLines -Path $runLog

    if ($currentStatus -notin @('published', 'failed')) {
        throw "Unexpected update status: $currentStatus"
    }
    Write-Output "STATUS=$currentStatus"
    Write-Output "EXIT_CODE=$($state.exitCode)"
    Write-Output "COMPLETED_AT=$($state.completedAt)"
    Write-Output "RUN_LOG=$runLog"
    Write-Output "UPDATE_STAGE=terminal_$currentStatus"
    if ($currentStatus -eq 'failed') {
        exit 1
    }
}
finally {
    Pop-Location
}
