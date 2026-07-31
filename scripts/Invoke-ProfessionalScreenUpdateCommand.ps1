[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Preflight = Join-Path $PSScriptRoot 'Test-OpenCodeHandoff.ps1'
$Starter = Join-Path $PSScriptRoot 'Start-ProfessionalScreenUpdate.ps1'
$Status = Join-Path $PSScriptRoot 'Get-ProfessionalScreenUpdateStatus.ps1'

Push-Location $RepoRoot
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Preflight
    if ($LASTEXITCODE -ne 0) { throw 'Handoff preflight failed.' }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Starter
    if ($LASTEXITCODE -ne 0) { throw 'Controlled update could not be started.' }

    do {
        $statusOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Status -WaitSeconds 60)
        $statusOutput | ForEach-Object { Write-Output $_ }
        $statusLine = @($statusOutput | Where-Object { $_ -like 'STATUS=*' } | Select-Object -First 1)
        if ($statusLine.Count -ne 1) { throw 'Update status output is invalid.' }
        $currentStatus = $statusLine[0].Substring(7)
    } while ($currentStatus -eq 'running')

    if ($currentStatus -notin @('published', 'failed')) {
        throw "Unexpected update status: $currentStatus"
    }
}
finally {
    Pop-Location
}
