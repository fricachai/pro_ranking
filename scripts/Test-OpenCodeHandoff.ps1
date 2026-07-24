[CmdletBinding()]
param(
    [switch]$SkipOpenCode,
    [switch]$RequireCli,
    [switch]$SkipLive,
    [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LiveUrl = 'https://fricachai.github.io/pro_ranking/'

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { throw "Required command not found: $Name" }
    return $command
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Name @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "$Name $($Arguments -join ' ') failed:`n$($output -join "`n")"
    }
    return @($output)
}

$requiredFiles = @(
    'AGENTS.md',
    'OPENCODE_HANDOFF.md',
    'README.md',
    'opencode.json',
    '.opencode/commands/update-report.md',
    '.opencode/commands/update-report-status.md',
    'fetch-events.js',
    'full-professional-stock-screen.js',
    'scripts/Invoke-OpenCodeDailyUpdate.ps1',
    'scripts/Test-OpenCodeHandoff.ps1',
    'scripts/Invoke-ProfessionalScreenUpdateCommand.ps1',
    'scripts/Start-ProfessionalScreenUpdate.ps1',
    'scripts/Run-ProfessionalScreenUpdate.ps1',
    'scripts/Get-ProfessionalScreenUpdateStatus.ps1',
    'scripts/Update-ProfessionalScreen.ps1',
    'professional-screen-report/latest.json',
    'professional-screen-report/events/latest-events.json',
    'index.html'
)

foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path (Join-Path $RepoRoot $relativePath))) {
        throw "Required handoff file is missing: $relativePath"
    }
}

foreach ($relativePath in @(
    'scripts/Invoke-OpenCodeDailyUpdate.ps1',
    'scripts/Test-OpenCodeHandoff.ps1',
    'scripts/Invoke-ProfessionalScreenUpdateCommand.ps1',
    'scripts/Start-ProfessionalScreenUpdate.ps1',
    'scripts/Run-ProfessionalScreenUpdate.ps1',
    'scripts/Get-ProfessionalScreenUpdateStatus.ps1',
    'scripts/Update-ProfessionalScreen.ps1'
)) {
    $scriptPath = Join-Path $RepoRoot $relativePath
    $nonAsciiByte = [IO.File]::ReadAllBytes($scriptPath) | Where-Object { $_ -gt 127 } | Select-Object -First 1
    if ($null -ne $nonAsciiByte) {
        throw "Windows PowerShell 5.1 compatibility requires an ASCII-only script: $relativePath"
    }
    $parseTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw "PowerShell syntax validation failed for ${relativePath}: $($parseErrors[0])"
    }
}

$governanceRuleMarker = 'GOVERNANCE_EXCLUSION_RULE_V1'
foreach ($relativePath in @('AGENTS.md', 'README.md', 'OPENCODE_HANDOFF.md', '.opencode/commands/update-report.md', '.opencode/commands/update-report-status.md')) {
    $ruleContent = Get-Content -LiteralPath (Join-Path $RepoRoot $relativePath) -Raw -Encoding utf8
    if (-not $ruleContent.Contains($governanceRuleMarker)) {
        throw "Governance exclusion rule is missing from the OpenCode handoff surface: $relativePath"
    }
}

foreach ($relativePath in @('.opencode/commands/update-report.md', '.opencode/commands/update-report-status.md')) {
    $commandContent = Get-Content -LiteralPath (Join-Path $RepoRoot $relativePath) -Raw -Encoding utf8
    if ($commandContent -notmatch '(?mi)^agent\s*:\s*build\s*$' -or $commandContent -notmatch 'BUILD_BASH_DAILY_UPDATE_V1') {
        throw "OpenCode update commands must explicitly select the Build primary agent: $relativePath"
    }
}

$updateCommand = Get-Content -LiteralPath (Join-Path $RepoRoot '.opencode/commands/update-report.md') -Raw -Encoding utf8
if ($updateCommand -notmatch 'Start-ProfessionalScreenUpdate\.ps1' -or $updateCommand -notmatch 'Get-ProfessionalScreenUpdateStatus\.ps1 -WaitSeconds 60') {
    throw 'The update command must start and poll the controlled background workflow.'
}

$node = Assert-Command -Name 'node'
$git = Assert-Command -Name 'git'
$gh = Assert-Command -Name 'gh'
$openCodeCli = Get-Command opencode -ErrorAction SilentlyContinue
$desktopCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\@opencode-aidesktop\OpenCode.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\OpenCode\OpenCode.exe')
)
$openCodeDesktop = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($RequireCli -and -not $openCodeCli) {
    throw 'OpenCode Desktop is not the same as the opencode CLI. The CLI is required for non-interactive PowerShell automation.'
}
if (-not $SkipOpenCode -and -not $openCodeCli -and -not $openCodeDesktop) {
    throw 'OpenCode was not found as either a CLI command or a Desktop installation.'
}

$nodeVersion = (& $node.Source --version).Trim()
$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 18) { throw "Node.js 18 or newer is required. Found: $nodeVersion" }

foreach ($relativePath in @('fetch-events.js', 'full-professional-stock-screen.js')) {
    Invoke-Checked -Name $node.Source -Arguments @('--check', (Join-Path $RepoRoot $relativePath)) | Out-Null
}

$generatorContent = Get-Content -LiteralPath (Join-Path $RepoRoot 'full-professional-stock-screen.js') -Raw -Encoding utf8
foreach ($requiredForeignHistoryToken in @(
    'mapLimit(calendarDates, 1',
    'await sleep(700)',
    'snapshots.length < 11'
)) {
    if (-not $generatorContent.Contains($requiredForeignHistoryToken)) {
        throw "Foreign-holding history safeguard is missing: $requiredForeignHistoryToken"
    }
}

$eventFetcherContent = Get-Content -LiteralPath (Join-Path $RepoRoot 'fetch-events.js') -Raw -Encoding utf8
foreach ($requiredEventFetcherToken in @('async function mapLimit(', 'mapLimit(codes, 6')) {
    if (-not $eventFetcherContent.Contains($requiredEventFetcherToken)) {
        throw "Event refresh safeguard is missing: $requiredEventFetcherToken"
    }
}

Push-Location $RepoRoot
try {
    $branch = (Invoke-Checked -Name $git.Source -Arguments @('branch', '--show-current') | Select-Object -First 1).Trim()
    if ($branch -ne 'main') { throw "Expected branch main. Found: $branch" }

    $remoteUrl = (Invoke-Checked -Name $git.Source -Arguments @('remote', 'get-url', 'origin') | Select-Object -First 1).Trim()
    if ($remoteUrl -notmatch 'github\.com[/:]fricachai/pro_ranking(?:\.git)?$') {
        throw "Unexpected origin remote: $remoteUrl"
    }

    $changes = @(Invoke-Checked -Name $git.Source -Arguments @('status', '--porcelain=v1'))
    if (-not $AllowDirty -and $changes.Count -gt 0) {
        throw 'Working tree is not clean. Handoff automation intentionally refuses to overwrite existing work.'
    }

    Invoke-Checked -Name $gh.Source -Arguments @('auth', 'status') | Out-Null

    $openCodeMode = 'skipped'
    $openCodeVersion = $null
    if (-not $SkipOpenCode -and $openCodeCli) {
        $openCodeMode = if ($openCodeDesktop) { 'cli+desktop' } else { 'cli' }
        $openCodeVersion = (Invoke-Checked -Name $openCodeCli.Source -Arguments @('--version') | Select-Object -First 1).Trim()
        Invoke-Checked -Name $openCodeCli.Source -Arguments @('auth', 'list') | Out-Null
    }
    elseif (-not $SkipOpenCode -and $openCodeDesktop) {
        $openCodeMode = 'desktop'
        $openCodeVersion = (Get-Item -LiteralPath $openCodeDesktop).VersionInfo.ProductVersion
    }

    $config = Get-Content -LiteralPath (Join-Path $RepoRoot 'opencode.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if (-not $config.permission -or [string]$config.permission.edit -ne 'deny') {
        throw 'opencode.json must keep direct file editing disabled for the daily updater.'
    }
    $bashRules = $config.permission.bash
    $allowedUpdatePatterns = @($bashRules.PSObject.Properties | Where-Object {
        [string]$_.Value -eq 'allow' -and $_.Name -like '*Update-ProfessionalScreen.ps1*'
    })
    $allowedPreflightPatterns = @($bashRules.PSObject.Properties | Where-Object {
        [string]$_.Value -eq 'allow' -and $_.Name -like '*Test-OpenCodeHandoff.ps1*'
    })
    $allowedStartPatterns = @($bashRules.PSObject.Properties | Where-Object {
        [string]$_.Value -eq 'allow' -and $_.Name -like '*Start-ProfessionalScreenUpdate.ps1*'
    })
    $allowedStatusPatterns = @($bashRules.PSObject.Properties | Where-Object {
        [string]$_.Value -eq 'allow' -and $_.Name -like '*Get-ProfessionalScreenUpdateStatus.ps1*'
    })
    $ruleNames = @($bashRules.PSObject.Properties.Name)
    $denyIndex = [array]::IndexOf([string[]]$ruleNames, '*')
    $lastAllowIndex = -1
    for ($index = 0; $index -lt $ruleNames.Count; $index += 1) {
        if ([string]$bashRules.($ruleNames[$index]) -eq 'allow') { $lastAllowIndex = $index }
    }
    if ([string]$config.shell -ne 'powershell.exe' -or $config.tools.bash -ne $true -or [string]$config.agent.build.mode -ne 'primary' -or $config.agent.build.tools.bash -ne $true -or [string]$config.agent.build.permission.bash -ne 'allow' -or [string]$bashRules.'*' -ne 'deny' -or $allowedUpdatePatterns.Count -lt 1 -or $allowedPreflightPatterns.Count -lt 1 -or $allowedStartPatterns.Count -lt 1 -or $allowedStatusPatterns.Count -lt 1 -or $denyIndex -ne 0 -or $denyIndex -ge $lastAllowIndex) {
        throw 'opencode.json must explicitly allow bash for the Build primary agent, define powershell.exe, and retain the controlled global shell rules.'
    }
    foreach ($expectedCommand in @(
        'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1',
        'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-ProfessionalScreenUpdateCommand.ps1',
        'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1',
        'powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60'
    )) {
        $matched = @($bashRules.PSObject.Properties | Where-Object {
            [string]$_.Value -eq 'allow' -and $expectedCommand -like $_.Name
        })
        if ($matched.Count -lt 1) {
            throw "opencode.json does not allow the required command: $expectedCommand"
        }
    }

    $report = Get-Content -LiteralPath (Join-Path $RepoRoot 'professional-screen-report/latest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $events = Get-Content -LiteralPath (Join-Path $RepoRoot 'professional-screen-report/events/latest-events.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if (-not $report.meta.etfDate -or -not $report.meta.marketDate -or -not $report.eventsMeta) {
        throw 'latest.json is missing report dates or events metadata.'
    }
    if ([int]$report.meta.foreignHoldingHistoryDays -lt 11) {
        throw "Current report has fewer than 11 valid TWSE foreign-holding trading days: $($report.meta.foreignHoldingHistoryDays)"
    }
    if (-not $events.fetchedAt -or -not $events.sourceScope -or -not $events.sourceStatus) {
        throw 'latest-events.json is missing source freshness or source-status metadata.'
    }
    if ($events.sourceScope.yahooNews -ne $true -or $events.sourceScope.officialMaterialInfo -ne $true) {
        throw 'The current event file does not include Yahoo news and official material information.'
    }
    if ([double]$events.sourceStatus.yahooNews.coverageRate -lt 80) {
        throw "Current Yahoo news feed coverage is below 80%: $($events.sourceStatus.yahooNews.coverageRate)%"
    }
    $forbiddenDecisionTerms = @(
        (-join @([char]0x6CBB, [char]0x7406)),
        (-join @([char]0x5F85, [char]0x67E5, [char]0x6838)),
        (-join @([char]0x8A2D, [char]0x8CEA)),
        (-join @([char]0x88C1, [char]0x8655)),
        (-join @([char]0x7533, [char]0x5831, [char]0x9055, [char]0x898F)),
        (-join @([char]0x5167, [char]0x90E8, [char]0x4EBA))
    )
    $forbiddenDecisionPattern = ($forbiddenDecisionTerms | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $governanceDecisionRows = @($report.ranking | Where-Object {
        $_.PSObject.Properties.Name -contains 'governance' -or
        [string]$_.entryAction -match $forbiddenDecisionPattern -or
        [string]$_.holdingAction -match $forbiddenDecisionPattern -or
        ((@($_.rejectionReasons) -join '|') -match $forbiddenDecisionPattern)
    })
    if ($governanceDecisionRows.Count -gt 0) {
        throw "Current report contains governance data in ranking, risk reasons, or position decisions for $($governanceDecisionRows.Count) stocks."
    }

    $head = (Invoke-Checked -Name $git.Source -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    $origin = (Invoke-Checked -Name $git.Source -Arguments @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
    if (-not $AllowDirty -and $head -ne $origin) {
        throw "Local HEAD does not match origin/main. HEAD=$head origin/main=$origin"
    }

    if (-not $SkipLive) {
        $buildRaw = Invoke-Checked -Name $gh.Source -Arguments @('api', 'repos/fricachai/pro_ranking/pages/builds/latest')
        $build = ($buildRaw -join "`n") | ConvertFrom-Json
        if ($build.status -ne 'built') {
            throw "GitHub Pages is not built. status=$($build.status) pages=$($build.commit) HEAD=$head"
        }
        if ($build.commit -ne $head) {
            Write-Output "PAGES_COMMIT=$($build.commit)"
            Write-Output "PAGES_HEAD_LAG=$head"
        }
        $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $response = Invoke-WebRequest -Uri "${LiveUrl}?handoff=$cacheBust" -UseBasicParsing
        foreach ($marker in @('top30TableWrap', 'fullTableWrap', [string]$report.meta.etfDate)) {
            if (-not $response.Content.Contains($marker)) { throw "Live page is missing marker: $marker" }
        }
        $forbiddenLiveTerms = @(
            (-join @([char]0x5F85, [char]0x67E5, [char]0x6838, [char]0x5019, [char]0x9078)),
            (-join @([char]0x6CBB, [char]0x7406, [char]0x67E5, [char]0x6838)),
            (-join @([char]0x6CBB, [char]0x7406, [char]0x8B66, [char]0x793A))
        )
        foreach ($forbiddenLiveTerm in $forbiddenLiveTerms) {
            if ($response.Content.Contains($forbiddenLiveTerm)) {
                throw 'Live page still contains a forbidden governance decision marker.'
            }
        }
    }

    Write-Output 'HANDOFF_READY=true'
    Write-Output "NODE_VERSION=$nodeVersion"
    if (-not $SkipOpenCode) {
        Write-Output "OPENCODE_MODE=$openCodeMode"
        Write-Output "OPENCODE_VERSION=$openCodeVersion"
        if ($openCodeDesktop) { Write-Output "OPENCODE_DESKTOP=$openCodeDesktop" }
    }
    Write-Output "BRANCH=$branch"
    Write-Output "COMMIT=$head"
    if (-not $SkipLive) { Write-Output "PAGES_BUILD_COMMIT=$($build.commit)" }
    Write-Output "ETF_DATE=$($report.meta.etfDate)"
    Write-Output "MARKET_DATE=$($report.meta.marketDate)"
    Write-Output "FOREIGN_HOLDING_HISTORY_DAYS=$($report.meta.foreignHoldingHistoryDays)"
    Write-Output "EVENTS_FETCHED_AT=$($events.fetchedAt)"
    Write-Output "NEWS_FEED_COVERAGE=$($events.sourceStatus.yahooNews.coverageRate)%"
    if (-not $SkipLive) { Write-Output "LIVE_URL=$LiveUrl" }
}
finally {
    Pop-Location
}
