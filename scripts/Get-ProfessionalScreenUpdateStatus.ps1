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

function Write-LogTail {
    param([Parameter(Mandatory)][string]$Path)
    if (Test-Path -LiteralPath $Path) {
        $tail = @(Get-Content -LiteralPath $Path -Tail 25 -Encoding utf8)
        if ($tail.Count -gt 0) {
            Write-Output 'LOG_TAIL_BEGIN'
            $tail
            Write-Output 'LOG_TAIL_END'
        }
    }
}

function Get-LogValue {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Key
    )

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $pattern = '^' + [regex]::Escape($Key) + '=(.*)$'
    $line = Get-Content -LiteralPath $Path -Encoding utf8 | Where-Object { $_ -match $pattern } | Select-Object -Last 1
    if ($line -and $line -match $pattern) { return [string]$matches[1] }
    return $null
}

function Write-TerminalResult {
    param(
        [Parameter(Mandatory)][pscustomobject]$State,
        [Parameter(Mandatory)][string]$TerminalStatus
    )

    $runLog = [string]$State.runLog
    Write-Output 'FINAL_RESULT_READY=true'
    Write-Output "FINAL_STATUS=$TerminalStatus"
    Write-Output 'FINAL_RESULT_SOURCE=RUN_LOG_AND_STATE'
    Write-Output "FINAL_EXIT_CODE=$($State.exitCode)"
    Write-Output "FINAL_COMPLETED_AT=$($State.completedAt)"
    Write-Output "FINAL_RUN_LOG=$runLog"

    foreach ($key in @('CHECKED_AT','DATA_CHANGED','COMMIT','PUBLISHED_TAG','LIVE_URL','PAGES_AUDIT_STATUS','FOREIGN_HOLDING_HISTORY_DAYS','ETF_DATE','INSTITUTIONAL_DATE','FOREIGN_HOLDING_DATE','MARKET_DATE','STOCK_COUNT')) {
        $value = Get-LogValue -Path $runLog -Key $key
        if ($key -eq 'PAGES_AUDIT_STATUS' -and $value -and $value -match '^([^\s]+)') { $value = $matches[1] }
        if ($null -ne $value -and $value -ne '') { Write-Output "FINAL_$key=$value" }
    }
}

if ($running) {
    Write-Output 'STATUS=running'
    Write-Output 'FINAL_RESULT_READY=false'
    Write-Output "PID=$($state.pid)"
    Write-Output "RUN_LOG=$($state.runLog)"
    if ($state.startedAt) {
        $elapsedSeconds = [math]::Max(0, [int]((Get-Date) - [DateTimeOffset]::Parse([string]$state.startedAt).LocalDateTime).TotalSeconds)
        Write-Output "ELAPSED_SECONDS=$elapsedSeconds"
    }
    Write-LogTail -Path ([string]$state.runLog)
    exit 0
}

if ($state.status -eq 'running') {
    Write-Output 'STATUS=failed'
    Write-Output 'FAILURE_STAGE=worker_stopped_before_completion'
    Write-TerminalResult -State $state -TerminalStatus 'failed'
}
else {
    Write-Output "STATUS=$($state.status)"
    Write-TerminalResult -State $state -TerminalStatus ([string]$state.status)
}
Write-Output "EXIT_CODE=$($state.exitCode)"
Write-Output "RUN_LOG=$($state.runLog)"
Write-Output "COMPLETED_AT=$($state.completedAt)"
Write-LogTail -Path ([string]$state.runLog)
