#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the controlled daily pro_ranking update from Windows Task Scheduler.

.DESCRIPTION
    Wrapper used by the scheduled task. It always runs from the repository root,
    delegates to the single controlled CLI entry point
    (Invoke-ProfessionalScreenUpdateCommand.ps1), and streams every line to a
    dedicated scheduled-update log. It never bypasses preflight, data-quality
    gates, Git checks or GitHub Pages verification.

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

$controller = Join-Path $PSScriptRoot 'Invoke-ProfessionalScreenUpdateCommand.ps1'
if (-not (Test-Path -LiteralPath $controller)) {
    Write-Output "SCHEDULED_UPDATE_FAILED=missing_controller"
    Write-Output ("SCHEDULED_UPDATE_CONTROLLER={0}" -f $controller)
    exit 1
}

Write-Output ("SCHEDULED_UPDATE_STARTED_AT={0}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'))
Write-Output ("SCHEDULED_UPDATE_REPO={0}" -f $repoRoot)

# Stream the controller output line by line so the log is useful while running.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $controller *>&1 | Tee-Object -FilePath $logPath
$exitCode = $LASTEXITCODE
if ($null -eq $exitCode) { $exitCode = 1 }

Write-Output ("SCHEDULED_UPDATE_EXIT_CODE={0}" -f $exitCode)
Write-Output ("SCHEDULED_UPDATE_LOG={0}" -f $logPath)
exit $exitCode
