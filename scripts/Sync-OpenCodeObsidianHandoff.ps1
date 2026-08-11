[CmdletBinding()]
param(
    [switch]$CheckOpenCodeConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $RepoRoot 'opencode.json'
$ObsidianMarker = 'OPENCODE_IMMEDIATE_CONTINUATION_V1'
$RequiredMarkers = @(
    'OPENCODE_IMMEDIATE_CONTINUATION_V1',
    'ETF_FRESHNESS_EXPOSURE_V1'
)

function Require-File {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required handoff file not found: $Path"
    }
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory)][object]$Object,
        [Parameter(Mandatory)][string]$Name
    )
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

Require-File -Path $ConfigPath
Require-File -Path (Join-Path $RepoRoot 'AGENTS.md')
Require-File -Path (Join-Path $RepoRoot 'OPENCODE_HANDOFF.md')

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$instructions = @($config.instructions)
$handoffInstruction = @($instructions | Where-Object { [string]$_ -eq 'OPENCODE_HANDOFF.md' })
$obsidianInstruction = @($instructions | Where-Object { [string]$_ -match 'pro_ranking.*SOP\.md$' })
if ($handoffInstruction.Count -ne 1 -or $obsidianInstruction.Count -ne 1) {
    throw 'opencode.json must auto-load OPENCODE_HANDOFF.md and the pro_ranking Obsidian SOP.'
}

$obsidianPath = [string]$obsidianInstruction[0]
Require-File -Path $obsidianPath

$ruleFiles = @(
    (Join-Path $RepoRoot 'AGENTS.md'),
    (Join-Path $RepoRoot 'OPENCODE_HANDOFF.md'),
    $obsidianPath
)
foreach ($ruleFile in $ruleFiles) {
    $content = Get-Content -LiteralPath $ruleFile -Raw -Encoding UTF8
    foreach ($marker in $RequiredMarkers) {
        if (-not $content.Contains($marker)) {
            throw "Handoff marker missing from $ruleFile : $marker"
        }
    }
}

$build = $config.agent.build
$buildPermission = $build.permission
$buildBash = $buildPermission.bash
$buildBashDefault = Get-PropertyValue -Object $buildBash -Name '*'
$buildPublishDeny = @($buildBash.PSObject.Properties | Where-Object {
    $_.Name -like '*Update-ProfessionalScreen.ps1*Publish*' -and [string]$_.Value -eq 'deny'
})
$buildPermissionReady = (
    [string]$build.mode -eq 'primary' -and
    [string]$buildPermission.edit -eq 'allow' -and
    [string]$buildPermission.webfetch -eq 'allow' -and
    [string]$buildPermission.plan_enter -eq 'allow' -and
    [string]$buildPermission.plan_exit -eq 'allow' -and
    [string]$buildPermission.external_directory -eq 'ask' -and
    [string]$buildBashDefault -eq 'allow' -and
    $buildPublishDeny.Count -gt 0
)
if (-not $buildPermissionReady) {
    throw 'OpenCode Build permissions are not the expected full-project profile with controlled publication.'
}

$contractLine = Select-String -LiteralPath $obsidianPath -Pattern '^current_operational_contract:\s*(.+)$' | Select-Object -First 1
$contract = if ($contractLine) { $contractLine.Matches[0].Groups[1].Value.Trim() } else { 'not-found' }
if ($contract -eq 'not-found') { throw 'Obsidian SOP is missing current_operational_contract.' }
if (-not $contract.Contains('ETF_UNIVERSE_TWSE_TPEX_V1')) {
    throw 'Obsidian current_operational_contract does not include the current ETF universe contract.'
}

if ($CheckOpenCodeConfig) {
    $opencodeCommand = Get-Command opencode -ErrorAction SilentlyContinue
    if ($null -eq $opencodeCommand) { throw 'OpenCode CLI not found while -CheckOpenCodeConfig was requested.' }
    $debugOutput = @(& $opencodeCommand.Source debug config 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "opencode debug config failed: $($debugOutput -join "`n")" }
    $debugText = $debugOutput -join "`n"
    $debugConfig = $debugText | ConvertFrom-Json
    $debugInstructions = @($debugConfig.instructions)
    if ($debugInstructions -notcontains 'OPENCODE_HANDOFF.md' -or -not ($debugInstructions | Where-Object { [string]$_ -eq $obsidianPath })) {
        throw 'opencode debug config did not show both required instruction paths.'
    }
}

Write-Output 'HANDOFF_READY=true'
Write-Output 'OPENCODE_CONTINUATION=ready'
Write-Output 'BUILD_PERMISSION=full-project-with-guardrails'
Write-Output 'INSTRUCTIONS_LOADED=OPENCODE_HANDOFF.md,AGENTS.md,Obsidian_SOP'
Write-Output "OBSIDIAN_SOP=$obsidianPath"
Write-Output "CURRENT_OPERATIONAL_CONTRACT=$contract"
Write-Output 'RELOAD_REQUIRED=true'
Write-Output 'NEXT_ACTION=Open a new main session, select Build, and run /continue-codex-handoff'
