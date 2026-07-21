[CmdletBinding()]
param(
    [switch]$Publish,
    [int]$PagesTimeoutSeconds = 240
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReportDir = Join-Path $RepoRoot 'professional-screen-report'
$Generator = Join-Path $RepoRoot 'full-professional-stock-screen.js'
$EventFetcher = Join-Path $RepoRoot 'fetch-events.js'
$LatestJson = Join-Path $ReportDir 'latest.json'
$LatestHtml = Join-Path $ReportDir 'latest.html'
$IndexHtml = Join-Path $RepoRoot 'index.html'
$LogDir = Join-Path $ReportDir 'logs'
$LiveUrl = 'https://fricachai.github.io/pro_ranking/'

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed:`n$($output -join "`n")"
    }
    return $output
}

function Get-ChangedPaths {
    $lines = @(Invoke-Git -Arguments @('status', '--porcelain=v1'))
    return @($lines | ForEach-Object {
        if ($_.Length -ge 4) { $_.Substring(3).Trim('"').Replace('\', '/') }
    } | Where-Object { $_ })
}

function Test-LiveReport {
    param(
        [Parameter(Mandatory)][string]$ExpectedCommit,
        [Parameter(Mandatory)][string]$ExpectedEtfDate
    )

    $deadline = (Get-Date).AddSeconds($PagesTimeoutSeconds)
    do {
        $raw = & gh api repos/fricachai/pro_ranking/pages/builds/latest 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to query GitHub Pages status:`n$($raw -join "`n")"
        }
        $build = ($raw -join "`n") | ConvertFrom-Json
        if ($build.status -eq 'errored') {
            throw "GitHub Pages build failed. commit=$($build.commit)"
        }
        if ($build.status -eq 'built' -and $build.commit -eq $ExpectedCommit) {
            break
        }
        Start-Sleep -Seconds 8
    } while ((Get-Date) -lt $deadline)

    if ($build.status -ne 'built' -or $build.commit -ne $ExpectedCommit) {
        throw "GitHub Pages did not publish commit $ExpectedCommit within $PagesTimeoutSeconds seconds."
    }

    $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $response = Invoke-WebRequest -Uri "${LiveUrl}?v=$cacheBust" -UseBasicParsing
    $required = @('top30TableWrap', 'fullTableWrap', $ExpectedEtfDate)
    $missing = @($required | Where-Object { -not $response.Content.Contains($_) })
    if ($response.StatusCode -ne 200 -or $missing.Count -gt 0) {
        throw "Live page validation failed. HTTP=$($response.StatusCode); missing=$($missing -join ', ')"
    }
}

Assert-Command -Name 'node'
Assert-Command -Name 'git'
if ($Publish) { Assert-Command -Name 'gh' }

Push-Location $RepoRoot
try {
    if (-not (Test-Path $Generator)) { throw "Generator not found: $Generator" }
    $initialChanges = @(Get-ChangedPaths)
    if ($initialChanges.Count -gt 0) {
        throw 'The working tree is not clean. Update stopped to protect existing changes.'
    }

    if ($Publish) {
        $branch = (Invoke-Git -Arguments @('branch', '--show-current') | Select-Object -First 1).Trim()
        if ($branch -ne 'main') { throw "Publishing is only allowed from main. Current branch: $branch" }
        $remoteUrl = (Invoke-Git -Arguments @('remote', 'get-url', 'origin') | Select-Object -First 1).Trim()
        if ($remoteUrl -notmatch 'github\.com[/:]fricachai/pro_ranking(?:\.git)?$') {
            throw "Unexpected origin remote: $remoteUrl"
        }
        $authOutput = & gh auth status 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "GitHub CLI is not authenticated:`n$($authOutput -join "`n")"
        }
        Invoke-Git -Arguments @('fetch', 'origin', 'main') | Out-Null
        $headBeforeRefresh = (Invoke-Git -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
        $originBeforeRefresh = (Invoke-Git -Arguments @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
        if ($headBeforeRefresh -ne $originBeforeRefresh) {
            throw "Local main is not synchronized with origin/main. HEAD=$headBeforeRefresh origin/main=$originBeforeRefresh"
        }
    }

    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $logPath = Join-Path $LogDir "daily-refresh-$timestamp.log"

    foreach ($scriptPath in @($Generator, $EventFetcher)) {
        & node --check $scriptPath *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            throw "JavaScript syntax check failed: $scriptPath. Log: $logPath"
        }
    }

    # MI_QFIIS has returned transiently incomplete history under parallel
    # date requests. Keep the proven sequential fetch and 11-day quality gate.
    $generatorContent = Get-Content $Generator -Raw -Encoding utf8
    foreach ($requiredForeignHistoryToken in @(
        'mapLimit(calendarDates, 1',
        'await sleep(120)',
        'snapshots.length < 11'
    )) {
        if (-not $generatorContent.Contains($requiredForeignHistoryToken)) {
            throw "Foreign-holding history safeguard is missing: $requiredForeignHistoryToken"
        }
    }

    if (-not (Test-Path $EventFetcher)) { throw "Event fetcher not found: $EventFetcher" }
    $refreshStartedUtc = [DateTime]::UtcNow
    Write-Host 'Fetching and validating events and news data...'
    & node $EventFetcher *>> $logPath
    if ($LASTEXITCODE -ne 0) {
        $tail = Get-Content $logPath -Tail 60 -Encoding utf8
        throw "Event and news refresh failed. Publishing stale events is not allowed. Log: $logPath`n$($tail -join "`n")"
    }

    $LatestEventsJson = Join-Path $ReportDir 'events/latest-events.json'
    if (-not (Test-Path $LatestEventsJson)) { throw "Events output is missing: $LatestEventsJson" }
    $eventData = Get-Content $LatestEventsJson -Raw -Encoding utf8 | ConvertFrom-Json
    if (-not $eventData.fetchedAt -or -not $eventData.sourceScope -or -not $eventData.sourceStatus) {
        throw 'Events output is missing fetchedAt, sourceScope, or sourceStatus.'
    }
    $eventFetchedAt = [DateTimeOffset]::Parse([string]$eventData.fetchedAt)
    if ($eventFetchedAt.UtcDateTime -lt $refreshStartedUtc.AddMinutes(-2)) {
        throw "Events output was not refreshed in this run: $($eventData.fetchedAt)"
    }
    if ($eventData.sourceScope.yahooNews -ne $true -or $eventData.sourceScope.officialMaterialInfo -ne $true) {
        throw 'Yahoo news and official material information must both be enabled.'
    }
    if ([int]$eventData.sourceStatus.etfStockCodes -lt 300) {
        throw "ETF stock-code coverage is too low: $($eventData.sourceStatus.etfStockCodes)"
    }
    if ([int]$eventData.sourceStatus.xiaoyuItems -lt 1 -or [int]$eventData.sourceStatus.officialMaterialItems -lt 1) {
        throw 'Xiaoyu events or official material information returned no valid items.'
    }
    $newsStatus = $eventData.sourceStatus.yahooNews
    if ([int]$newsStatus.requestedStocks -lt 300 -or [double]$newsStatus.coverageRate -lt 80 -or [int]$newsStatus.itemCount -lt 1) {
        throw "Yahoo news coverage is insufficient: requested=$($newsStatus.requestedStocks), coverage=$($newsStatus.coverageRate)%, items=$($newsStatus.itemCount)"
    }
    $eventTypeNames = @($eventData.events | Group-Object eventType | ForEach-Object Name)
    foreach ($requiredEventType in @('material_info', 'news_pending')) {
        if ($eventTypeNames -notcontains $requiredEventType) {
            throw "Required event type is missing: $requiredEventType"
        }
    }

    & node $Generator *>> $logPath
    if ($LASTEXITCODE -ne 0) {
        $tail = Get-Content $logPath -Tail 60 -Encoding utf8
        throw "Report generation failed. Log: $logPath`n$($tail -join "`n")"
    }

    foreach ($path in @($LatestJson, $LatestHtml)) {
        if (-not (Test-Path $path)) { throw "Required output is missing: $path" }
    }
    $latestHtmlContent = Get-Content $LatestHtml -Raw -Encoding utf8
    foreach ($requiredAuthToken in @('id="loginGate"', 'pro-ranking-auth-v1', 'id="logoutButton"', 'const AUTH_ACCOUNTS=', "username:'frica'", "username:'Amanda'", '待查核候選（治理警示）', '防守價提醒', 'actionTransitionHtml')) {
        if (-not $latestHtmlContent.Contains($requiredAuthToken)) {
            throw "Required login gate token is missing: $requiredAuthToken"
        }
    }
    if (-not $latestHtmlContent.Contains('/^[0-9]{4}$/')) {
        throw 'Position import validation is missing the four-digit stock-code check.'
    }
    if ($latestHtmlContent.Contains('/^d{4}$/')) {
        throw 'Position import validation lost its digit character class during HTML generation.'
    }

    $report = Get-Content $LatestJson -Raw -Encoding utf8 | ConvertFrom-Json
    $meta = $report.meta
    if (-not $meta -or -not $meta.etfDate -or -not $meta.generatedAt) {
        throw 'latest.json is missing meta.etfDate or meta.generatedAt.'
    }
    foreach ($requiredMetaField in @('institutionalDate', 'foreignHoldingDate', 'foreignHoldingHistoryDays', 'creditDate', 'tdccDate', 'listedUniverseCount', 'coverageRate')) {
        if (-not $meta.$requiredMetaField) {
            throw "latest.json is missing meta.$requiredMetaField."
        }
    }
    if ([string]$meta.institutionalSource -notlike 'TWSE T86 direct*') {
        throw "Institutional data is not sourced directly from TWSE T86: $($meta.institutionalSource)"
    }
    if ([int]$meta.institutionalOfficialDays -lt 5) {
        throw "TWSE T86 official history is too short: $($meta.institutionalOfficialDays) days"
    }
    if ([int]$meta.foreignHoldingHistoryDays -lt 11) {
        throw "TWSE foreign-holding history is too short: $($meta.foreignHoldingHistoryDays) valid trading days"
    }
    if (-not $report.macroOverlay -or -not $report.sourcePosture -or -not $report.sectorOverlay) {
        throw 'latest.json is missing macro, source-posture, or sector overlay.'
    }
    if (-not $report.eventsMeta -or [string]$report.eventsMeta.fetchedAt -ne [string]$eventData.fetchedAt) {
        throw 'latest.json did not consume the events file refreshed in this run.'
    }
    if (-not $report.eventsMeta.sourceStatus -or [int]$report.eventsMeta.totalCount -lt 1) {
        throw 'latest.json is missing validated event-source status or event records.'
    }
    if ([int]$meta.stockCount -lt 350) {
        throw "Listed stock count is unexpectedly low: $($meta.stockCount)"
    }
    $minimumKdCoverage = [math]::Floor([int]$meta.stockCount * 0.90)
    if ([int]$meta.kdCovered -lt $minimumKdCoverage) {
        throw "KD OHLC coverage is unexpectedly low: $($meta.kdCovered)/$($meta.stockCount)"
    }
    $rankingRows = @($report.ranking)
    # Keep validation tokens ASCII-only so Windows PowerShell 5 can parse this
    # UTF-8 script reliably on systems that do not default to UTF-8.
    $validBuckets = @('A', 'B', 'C', 'D', 'G')
    $validHoldingStates = @('add', 'hold', 'protect', 'trim', 'exit')
    $missingDecisionRows = @($rankingRows | Where-Object {
        -not $_.entryAction -or -not $_.holdingAction -or
        $validBuckets -notcontains [string]$_.bucket -or
        $validHoldingStates -notcontains [string]$_.holdingState
    })
    if ($missingDecisionRows.Count -gt 0) {
        throw "Position decision fields are missing or invalid for $($missingDecisionRows.Count) stocks."
    }
    $governanceRows = @($rankingRows | Where-Object { $_.governance -and $_.governance.hasWarning })
    $misclassifiedGovernanceRows = @($governanceRows | Where-Object { [string]$_.bucket -ne 'G' -or [string]$_.entryAction -ne '待查核候選' })
    if ($misclassifiedGovernanceRows.Count -gt 0) {
        throw "Governance warnings are not forced into the review bucket for $($misclassifiedGovernanceRows.Count) stocks."
    }
    $topThreeGovernanceRows = @($report.topThree | Where-Object { $_.governance -and $_.governance.hasWarning })
    if ($topThreeGovernanceRows.Count -gt 0) {
        throw "Governance-warning stocks must not appear in topThree."
    }

    $etfDate = [datetime]::ParseExact([string]$meta.etfDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $dateSlug = $etfDate.ToString('yyyyMMdd')
    $datedFiles = @(
        "professional-screen-report/full-professional-ranking-$dateSlug.csv",
        "professional-screen-report/full-professional-screen-$dateSlug.html",
        "professional-screen-report/full-professional-screen-$dateSlug.json"
    )
    foreach ($relativePath in $datedFiles) {
        if (-not (Test-Path (Join-Path $RepoRoot $relativePath))) {
            throw "Dated output is missing: $relativePath"
        }
    }

    Copy-Item $LatestHtml $IndexHtml -Force
    $latestHash = (Get-FileHash $LatestHtml -Algorithm SHA256).Hash
    $indexHash = (Get-FileHash $IndexHtml -Algorithm SHA256).Hash
    if ($latestHash -ne $indexHash) { throw 'index.html does not match latest.html.' }

    $indexContent = Get-Content $IndexHtml -Raw -Encoding utf8
    foreach ($marker in @('top30TableWrap', 'fullTableWrap', [string]$meta.etfDate)) {
        if (-not $indexContent.Contains($marker)) { throw "index.html is missing validation marker: $marker" }
    }

    $allowedPaths = @('index.html', 'professional-screen-report/latest.json') + $datedFiles
    $allowedPrefixes = @('professional-screen-report/events/')
    $changedPaths = @(Get-ChangedPaths)
    $unexpected = @($changedPaths | Where-Object {
        $path = $_
        if ($path -in $allowedPaths) { return $false }
        foreach ($prefix in $allowedPrefixes) {
            if ($path -like "$prefix*" -or $path -eq $prefix.TrimEnd('/')) { return $false }
        }
        return $true
    })
    if ($unexpected.Count -gt 0) {
        throw "Generator changed unexpected files: $($unexpected -join ', ')"
    }

    $gitAddPaths = @('index.html', 'professional-screen-report/latest.json', 'professional-screen-report/events/latest-events.json') + $datedFiles
    $commit = $null
    $publishStatus = if ($changedPaths.Count -eq 0) { 'no_changes' } else { 'validated' }
    if ($Publish -and $changedPaths.Count -gt 0) {
        Invoke-Git -Arguments (@('add', '--') + $gitAddPaths) | Out-Null
        $stagedCheck = & git diff --cached --check 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Pre-commit validation failed:`n$($stagedCheck -join "`n")"
        }
        Invoke-Git -Arguments @('commit', '-m', "Refresh professional stock screen for $($meta.etfDate)") | Out-Null
        $commit = (Invoke-Git -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
        $branch = (Invoke-Git -Arguments @('branch', '--show-current') | Select-Object -First 1).Trim()
        Invoke-Git -Arguments @('push', 'origin', $branch) | Out-Null
        Test-LiveReport -ExpectedCommit $commit -ExpectedEtfDate ([string]$meta.etfDate)
        $publishStatus = 'published'
    }
    elseif ($Publish) {
        $commit = (Invoke-Git -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
        Test-LiveReport -ExpectedCommit $commit -ExpectedEtfDate ([string]$meta.etfDate)
        $publishStatus = 'published_no_changes'
    }

    if ($Publish) {
        $headAfterPublish = (Invoke-Git -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
        $originAfterPublish = (Invoke-Git -Arguments @('rev-parse', 'origin/main') | Select-Object -First 1).Trim()
        $remainingChanges = @(Get-ChangedPaths)
        if ($headAfterPublish -ne $originAfterPublish -or $remainingChanges.Count -gt 0) {
            throw "Publish verification failed. HEAD=$headAfterPublish origin/main=$originAfterPublish remaining=$($remainingChanges -join ', ')"
        }
    }

    $topThree = @($report.topThree | Select-Object -First 3 | ForEach-Object {
        "$($_.code) $($_.name) [$($_.action)] $($_.score)"
    })
    Write-Output "STATUS=$publishStatus"
    Write-Output "ETF_DATE=$($meta.etfDate)"
    Write-Output "INSTITUTIONAL_DATE=$($meta.institutionalDate)"
    Write-Output "FOREIGN_HOLDING_DATE=$($meta.foreignHoldingDate)"
    Write-Output "FOREIGN_HOLDING_HISTORY_DAYS=$($meta.foreignHoldingHistoryDays)"
    Write-Output "CREDIT_DATE=$($meta.creditDate)"
    Write-Output "TDCC_DATE=$($meta.tdccDate)"
    Write-Output "MARKET_DATE=$($meta.marketDate)"
    Write-Output "STOCK_COUNT=$($meta.stockCount)"
    Write-Output "TOP3=$($topThree -join ' | ')"
    if ($commit) { Write-Output "COMMIT=$commit" }
    if ($Publish) { Write-Output "LIVE_URL=$LiveUrl" }
    Write-Output "LOG=$logPath"
}
finally {
    Pop-Location
}
