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
try {
    Push-Location $RepoRoot
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Updater -Publish *>> $RunLogPath
    $exitCode = $LASTEXITCODE
}
catch {
    $_ | Out-String | Add-Content -LiteralPath $RunLogPath -Encoding utf8
    $exitCode = 1
}
finally {
    Pop-Location
    $state.status = if ($exitCode -eq 0) { 'published' } else { 'failed' }
    $state.completedAt = (Get-Date).ToString('o')
    $state.exitCode = $exitCode
    Write-State -Value $state
}

exit $exitCode
