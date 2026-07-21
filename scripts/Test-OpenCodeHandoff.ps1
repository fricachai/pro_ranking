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
    'fetch-events.js',
    'full-professional-stock-screen.js',
    'scripts/Invoke-OpenCodeDailyUpdate.ps1',
    'scripts/Test-OpenCodeHandoff.ps1',
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

    $report = Get-Content -LiteralPath (Join-Path $RepoRoot 'professional-screen-report/latest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $events = Get-Content -LiteralPath (Join-Path $RepoRoot 'professional-screen-report/events/latest-events.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if (-not $report.meta.etfDate -or -not $report.meta.marketDate -or -not $report.eventsMeta) {
        throw 'latest.json is missing report dates or events metadata.'
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

    $head = (Invoke-Checked -Name $git.Source -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
    $origin = (Invoke-Checked -Name $git.Source -Arguments @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
    if (-not $AllowDirty -and $head -ne $origin) {
        throw "Local HEAD does not match origin/main. HEAD=$head origin/main=$origin"
    }

    if (-not $SkipLive) {
        $buildRaw = Invoke-Checked -Name $gh.Source -Arguments @('api', 'repos/fricachai/pro_ranking/pages/builds/latest')
        $build = ($buildRaw -join "`n") | ConvertFrom-Json
        if ($build.status -ne 'built' -or $build.commit -ne $head) {
            throw "GitHub Pages is not built from current HEAD. status=$($build.status) pages=$($build.commit) HEAD=$head"
        }
        $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $response = Invoke-WebRequest -Uri "${LiveUrl}?handoff=$cacheBust" -UseBasicParsing
        foreach ($marker in @('top30TableWrap', 'fullTableWrap', [string]$report.meta.etfDate)) {
            if (-not $response.Content.Contains($marker)) { throw "Live page is missing marker: $marker" }
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
    Write-Output "ETF_DATE=$($report.meta.etfDate)"
    Write-Output "MARKET_DATE=$($report.meta.marketDate)"
    Write-Output "EVENTS_FETCHED_AT=$($events.fetchedAt)"
    Write-Output "NEWS_FEED_COVERAGE=$($events.sourceStatus.yahooNews.coverageRate)%"
    if (-not $SkipLive) { Write-Output "LIVE_URL=$LiveUrl" }
}
finally {
    Pop-Location
}
