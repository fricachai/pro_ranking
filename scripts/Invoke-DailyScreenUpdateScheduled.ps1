#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the controlled daily pro_ranking update from Windows Task Scheduler.

.DESCRIPTION
    Wrapper used by the scheduled task. It always runs from the repository root,
    delegates to the single controlled CLI entry point
    (Invoke-ProfessionalScreenUpdateCommand.ps1), and writes stdout and stderr
    to dedicated scheduled-update logs.

    Success is decided by the controller exit code only. Native stderr output
    (git hints, retry diagnostics, Node console.warn) must never be promoted to
    a terminating PowerShell error, otherwise a harmless warning aborts the run
    exactly like the 2026-10-21 09:15 scheduled failure.

    This script contains ASCII-only text so Windows PowerShell 5.1 can parse it
    regardless of the system code page (the repository path contains non-ASCII
    characters).

.PARAMETER TimeStamp
    Stamp used for the scheduled log file name. Defaults to the current time.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-DailyScreenUpdateScheduled.ps1
#>
[CmdletBinding()]
param(
    [string]$TimeStamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

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

# Create the log immediately so a scheduled run always leaves evidence, even
# when the controller cannot start at all.
New-Item -ItemType File -Path $logPath -Force | Out-Null
Write-RunLog ("SCHEDULED_UPDATE_STARTED_AT={0}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'))
Write-RunLog ("SCHEDULED_UPDATE_REPO={0}" -f $repoRoot)

$controller = Join-Path $PSScriptRoot 'Invoke-ProfessionalScreenUpdateCommand.ps1'
if (-not (Test-Path -LiteralPath $controller)) {
    Write-RunLog 'SCHEDULED_UPDATE_FAILED=missing_controller'
    Write-RunLog ("SCHEDULED_UPDATE_CONTROLLER={0}" -f $controller)
    exit 1
}

$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $shell)) { $shell = 'powershell.exe' }

# Start-Process keeps stdin/stdout/stderr away from PowerShell's error stream, so
# native warnings can never abort the wrapper. The runner stays fail-closed via
# the controller exit code.
$process = Start-Process -FilePath $shell `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $controller) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -PassThru

$process.WaitForExit()
$exitCode = [int]$process.ExitCode

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

Write-RunLog ("SCHEDULED_UPDATE_EXIT_CODE={0}" -f $exitCode)
Write-RunLog ("SCHEDULED_UPDATE_LOG={0}" -f $logPath)
exit $exitCode
