#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the controlled daily pro_ranking update from Windows Task Scheduler.

.DESCRIPTION
    Wrapper used by the scheduled task. It always runs from the repository root,
    delegates to the single controlled CLI entry point
    (Invoke-ProfessionalScreenUpdateCommand.ps1), and writes stdout and stderr
    to dedicated scheduled-update logs.

    Two failure modes are handled explicitly:

    1. Success is decided by exit codes, never by native stderr. Windows
       PowerShell 5.1 promotes native stderr to a terminating error when
       $ErrorActionPreference='Stop' and '*>&1' are combined, which aborted the
       2026-10-21 09:15 scheduled run before any log was written.
    2. The wrapper waits for the terminal state of the run it started. The
       controller can return before the background runner publishes, so the
       scheduled task result must be derived from
       .git/professional-screen-update-state.json (published/failed), not from
       the moment the controller process exits.

    This script contains ASCII-only text so Windows PowerShell 5.1 can parse it
    regardless of the system code page (the repository path contains non-ASCII
    characters).

.PARAMETER TimeStamp
    Stamp used for the scheduled log file name. Defaults to the current time.

.PARAMETER TimeoutMinutes
    Maximum minutes to wait for a terminal state after the controller returns.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-DailyScreenUpdateScheduled.ps1
#>
[CmdletBinding()]
param(
    [string]$TimeStamp = (Get-Date -Format 'yyyyMMdd-HHmmss'),
    [int]$TimeoutMinutes = 45
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$wrapperStart = Get-Date
$statePath = Join-Path $repoRoot '.git\professional-screen-update-state.json'

$logDir = Join-Path $repoRoot 'professional-screen-report\logs'
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logPath = Join-Path $logDir ("scheduled-update-{0}.log" -f $TimeStamp)
$outPath = Join-Path $logDir ("scheduled-update-{0}.out.log" -f $TimeStamp)
$errPath = Join-Path $logDir ("scheduled-update-{0}.err.log" -f $TimeStamp)

function Write-RunLog {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}

function Read-UpdateState {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try {
        return (Get-Content -LiteralPath $statePath -Raw -Encoding utf8 | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Get-StateStartedAt {
    param($State)
    if ($null -eq $State -or [string]::IsNullOrWhiteSpace([string]$State.startedAt)) { return $null }
    try { return [datetime]::Parse([string]$State.startedAt) } catch { return $null }
}

# Create the log immediately so a scheduled run always leaves evidence, even
# when the controller cannot start at all.
New-Item -ItemType File -Path $logPath -Force | Out-Null
Write-RunLog ("SCHEDULED_UPDATE_STARTED_AT={0}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'))
Write-RunLog ("SCHEDULED_UPDATE_REPO={0}" -f $repoRoot)

$controller = Join-Path $PSScriptRoot 'Invoke-ProfessionalScreenUpdateCommand.ps1'
if (-not (Test-Path -LiteralPath $controller)) {
    Write-RunLog 'SCHEDULED_UPDATE_FAILED=missing_controller'
    exit 1
}

$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $shell)) { $shell = 'powershell.exe' }

# Start-Process keeps native stdout/stderr away from PowerShell's error stream,
# so git hints or Node warnings can never abort the wrapper.
$process = Start-Process -FilePath $shell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $controller) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -PassThru

$process.WaitForExit()
$controllerExit = [int]$process.ExitCode

if (Test-Path -LiteralPath $outPath) {
    $stdout = Get-Content -LiteralPath $outPath -Raw -ErrorAction SilentlyContinue
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        Add-Content -LiteralPath $logPath -Value $stdout.TrimEnd() -Encoding UTF8
    }
    Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $errPath) {
    $stderr = Get-Content -LiteralPath $errPath -Raw -ErrorAction SilentlyContinue
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        Add-Content -LiteralPath $logPath -Value '----- CONTROLLER STDERR -----' -Encoding UTF8
        Add-Content -LiteralPath $logPath -Value $stderr.TrimEnd() -Encoding UTF8
    }
    Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
}
Write-RunLog ("SCHEDULED_UPDATE_CONTROLLER_EXIT_CODE={0}" -f $controllerExit)

# The scheduled task result must reflect the publish outcome, not the controller
# exit moment. Wait for a terminal state that belongs to this invocation.
$minimumStartedAt = $wrapperStart.AddMinutes(-2)
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$finalState = $null
$lastReportedStatus = ''

# Fail fast when the controller never started a run (for example a preflight
# failure). Otherwise the scheduled task would wait for the full timeout while
# nothing is actually running.
$runDetectionDeadline = (Get-Date).AddSeconds(90)
$runDetected = $false
while ((Get-Date) -lt $runDetectionDeadline) {
    $state = Read-UpdateState
    if ($null -ne $state) {
        $stateStartedAt = Get-StateStartedAt -State $state
        if (($null -ne $stateStartedAt) -and ($stateStartedAt -ge $minimumStartedAt)) {
            $runDetected = $true
            break
        }
    }
    Start-Sleep -Seconds 5
}
if (-not $runDetected) {
    Write-RunLog 'SCHEDULED_UPDATE_FAILED=no_run_started'
    if ($controllerExit -ne 0) { exit $controllerExit }
    exit 1
}

while ((Get-Date) -lt $deadline) {
    $state = Read-UpdateState
    if ($null -ne $state) {
        $status = [string]$state.status
        $stateStartedAt = Get-StateStartedAt -State $state
        $belongsToThisRun = ($null -eq $stateStartedAt) -or ($stateStartedAt -ge $minimumStartedAt)
        if ($belongsToThisRun -and $status -in @('published', 'failed')) {
            $finalState = $state
            break
        }
        if ($belongsToThisRun -and $status -ne $lastReportedStatus) {
            Write-RunLog ("SCHEDULED_UPDATE_OBSERVED_STATUS={0}" -f $status)
            $lastReportedStatus = $status
        }
    }
    Start-Sleep -Seconds 15
}

if ($null -eq $finalState) {
    if ($controllerExit -ne 0) {
        Write-RunLog ("SCHEDULED_UPDATE_FAILED=controller_exit_{0}" -f $controllerExit)
        exit $controllerExit
    }
    Write-RunLog 'SCHEDULED_UPDATE_FAILED=terminal_state_timeout'
    exit 1
}

Write-RunLog ("SCHEDULED_UPDATE_FINAL_STATUS={0}" -f $finalState.status)
Write-RunLog ("SCHEDULED_UPDATE_FINAL_EXIT_CODE={0}" -f $finalState.exitCode)
Write-RunLog ("SCHEDULED_UPDATE_FINAL_COMPLETED_AT={0}" -f $finalState.completedAt)

if ([string]$finalState.status -eq 'published') {
    Write-RunLog ("SCHEDULED_UPDATE_LOG={0}" -f $logPath)
    exit 0
}

Write-RunLog ("SCHEDULED_UPDATE_LOG={0}" -f $logPath)
exit 1
