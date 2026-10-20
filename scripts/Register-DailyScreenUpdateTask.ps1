#Requires -Version 5.1
<#
.SYNOPSIS
    Registers (or refreshes) the daily pro_ranking update scheduled task.

.DESCRIPTION
    Creates a Windows Task Scheduler entry that runs the single controlled CLI
    entry point every day at the requested time through
    Invoke-DailyScreenUpdateScheduled.ps1.

    Design boundaries:
      - Uses the same controlled entry point as manual runs; preflight, data
        quality gates, Git and GitHub Pages verification are unchanged.
      - MultipleInstances = IgnoreNew prevents a second competing update.
      - StartWhenAvailable lets a missed run start after the machine wakes.
      - Runs with the current user's interactive logon token so existing Git
        and GitHub CLI credentials keep working; no password is stored.

    This script contains ASCII-only text so Windows PowerShell 5.1 can parse it
    regardless of the system code page.

.PARAMETER TaskName
    Scheduled task name. Default: pro_ranking daily screen update.

.PARAMETER Time
    Daily start time in 24-hour HH:mm format. Default: 08:30.

.PARAMETER WeekdaysOnly
    Register a Monday-Friday trigger instead of a daily trigger.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Register-DailyScreenUpdateTask.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Register-DailyScreenUpdateTask.ps1 -Time 08:30 -WeekdaysOnly
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'pro_ranking daily screen update',
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
    [string]$Time = '08:30',
    [switch]$WeekdaysOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'Invoke-DailyScreenUpdateScheduled.ps1'
if (-not (Test-Path -LiteralPath $wrapper)) {
    throw "Missing scheduled wrapper: $wrapper"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $wrapper) `
    -WorkingDirectory $repoRoot

if ($WeekdaysOnly) {
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Time
} else {
    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
}

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$userId = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

$description = 'Controlled daily pro_ranking stock screen update. Runs scripts\Invoke-ProfessionalScreenUpdateCommand.ps1 with all data-quality gates.'

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Description $description -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Output 'SCHEDULED_TASK_READY=true'
Write-Output ("SCHEDULED_TASK_NAME={0}" -f $task.TaskName)
Write-Output ("SCHEDULED_TASK_STATE={0}" -f $task.State)
Write-Output ("SCHEDULED_TASK_TIME={0}" -f $Time)
Write-Output ("SCHEDULED_TASK_WEEKDAYS_ONLY={0}" -f ([bool]$WeekdaysOnly))
Write-Output ("SCHEDULED_TASK_NEXT_RUN={0}" -f $info.NextRunTime)
Write-Output ("SCHEDULED_TASK_ACTION={0}" -f $action.Execute)
Write-Output ("SCHEDULED_TASK_WORKDIR={0}" -f $action.WorkingDirectory)
Write-Output 'SCHEDULED_TASK_BOUNDARY=same-controlled-entry-with-all-quality-gates'
