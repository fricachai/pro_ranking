[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StatePath,
    [Parameter(Mandatory)][string]$RunLogPath,
    [string]$UpdaterPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Updater = if ([string]::IsNullOrWhiteSpace($UpdaterPath)) {
    Join-Path $PSScriptRoot 'Update-ProfessionalScreen.ps1'
}
else {
    (Resolve-Path -LiteralPath $UpdaterPath).Path
}

function Write-State {
    param([Parameter(Mandatory)]$Value)
    $Value | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
}

$state = [ordered]@{
    status = 'running'
    pid = $PID
    startedAt = (Get-Date).ToString('o')
    completedAt = $null
    exitCode = $null
    runLog = $RunLogPath
}
Write-State -Value $state

$exitCode = 1
$updaterStatus = $null
try {
    Push-Location $RepoRoot
    New-Item -ItemType Directory -Path (Split-Path -Parent $RunLogPath) -Force | Out-Null
    New-Item -ItemType File -Path $RunLogPath -Force | Out-Null
    $previousPreference = $ErrorActionPreference
    try {
        # Native stderr is diagnostic output. The child exit code is the
        # authoritative success/failure signal for this controlled runner.
        $ErrorActionPreference = 'Continue'
        $childArguments = @(
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $Updater,
            '-Publish'
        )
        $output = @(& powershell.exe @childArguments 2>&1 | ForEach-Object {
            $line = [string]$_
            $line | Add-Content -LiteralPath $RunLogPath -Encoding utf8
            $line
        })
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -eq 0) {
        $statusLine = @($output | ForEach-Object { [string]$_ } | Where-Object { $_ -like 'STATUS=*' } | Select-Object -Last 1)
        if ($statusLine.Count -ne 1) {
            'Updater completed without a valid STATUS line.' | Add-Content -LiteralPath $RunLogPath -Encoding utf8
            $exitCode = 1
        }
        else {
            $updaterStatus = $statusLine[0].Substring(7)
            if ($updaterStatus -ne 'published') {
                "Unexpected updater status: $updaterStatus" | Add-Content -LiteralPath $RunLogPath -Encoding utf8
                $exitCode = 1
            }
        }
    }
}
catch {
    $_ | Out-String | Add-Content -LiteralPath $RunLogPath -Encoding utf8
    $exitCode = 1
}
finally {
    Pop-Location
    $state.status = if ($exitCode -eq 0) { $updaterStatus } else { 'failed' }
    $state.completedAt = (Get-Date).ToString('o')
    $state.exitCode = $exitCode
    Write-State -Value $state
}

exit $exitCode
