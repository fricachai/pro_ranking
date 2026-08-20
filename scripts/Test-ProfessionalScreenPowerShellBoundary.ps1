[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Condition {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )
    if (-not $Condition) { throw $Message }
}

$runner = Join-Path $PSScriptRoot 'Run-ProfessionalScreenUpdate.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('pro-ranking-ps-boundary-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $successUpdater = Join-Path $tempRoot 'success-updater.ps1'
    @'
[CmdletBinding()]
param([switch]$Publish)
[Console]::Error.WriteLine('CHILD_STDERR_SUCCESS')
Write-Output 'STATUS=published'
exit 0
'@ | Set-Content -LiteralPath $successUpdater -Encoding utf8

    $successState = Join-Path $tempRoot 'success-state.json'
    $successLog = Join-Path $tempRoot 'success.log'
    $successOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -StatePath $successState -RunLogPath $successLog -UpdaterPath $successUpdater 2>&1)
    $successExitCode = $LASTEXITCODE
    Assert-Condition ($successExitCode -eq 0) ('Success boundary run failed: ' + ($successOutput -join [Environment]::NewLine))
    $successResult = Get-Content -LiteralPath $successState -Raw -Encoding utf8 | ConvertFrom-Json
    $successLogText = Get-Content -LiteralPath $successLog -Raw -Encoding utf8
    Assert-Condition ([string]$successResult.status -eq 'published') 'Success boundary state is not published.'
    Assert-Condition $successLogText.Contains('CHILD_STDERR_SUCCESS') 'Success stderr was not preserved in the run log.'
    Assert-Condition (-not ($successOutput -join [Environment]::NewLine).Contains('NativeCommandError')) 'Success stderr became NativeCommandError.'

    $failureUpdater = Join-Path $tempRoot 'failure-updater.ps1'
    @'
[CmdletBinding()]
param([switch]$Publish)
[Console]::Error.WriteLine('CHILD_STDERR_FAILURE')
exit 1
'@ | Set-Content -LiteralPath $failureUpdater -Encoding utf8

    $failureState = Join-Path $tempRoot 'failure-state.json'
    $failureLog = Join-Path $tempRoot 'failure.log'
    $failureOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -StatePath $failureState -RunLogPath $failureLog -UpdaterPath $failureUpdater 2>&1)
    $failureExitCode = $LASTEXITCODE
    $failureResult = Get-Content -LiteralPath $failureState -Raw -Encoding utf8 | ConvertFrom-Json
    $failureLogText = Get-Content -LiteralPath $failureLog -Raw -Encoding utf8
    Assert-Condition ($failureExitCode -eq 1) 'Failure boundary run did not preserve the child exit code.'
    Assert-Condition ([string]$failureResult.status -eq 'failed') 'Failure boundary state is not failed.'
    Assert-Condition $failureLogText.Contains('CHILD_STDERR_FAILURE') 'Failure stderr was not preserved in the run log.'

    Write-Output 'POWERSHELL_BOUNDARY_TEST=pass'
    Write-Output 'SUCCESS_EXIT_CODE=0'
    Write-Output 'FAILURE_EXIT_CODE=1'
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
