[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StatePath,
    [Parameter(Mandatory)][string]$RunLogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Updater = Join-Path $PSScriptRoot 'Update-ProfessionalScreen.ps1'

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
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Updater -Publish 2>&1)
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { [string]$_ } | Add-Content -LiteralPath $RunLogPath -Encoding utf8
    if ($exitCode -eq 0) {
        $statusLine = @($output | ForEach-Object { [string]$_ } | Where-Object { $_ -like 'STATUS=*' } | Select-Object -Last 1)
        if ($statusLine.Count -ne 1) {
            'Updater completed without a valid STATUS line.' | Add-Content -LiteralPath $RunLogPath -Encoding utf8
            $exitCode = 1
        }
        else {
            $updaterStatus = $statusLine[0].Substring(7)
            if ($updaterStatus -notin @('published', 'no_new_data')) {
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
