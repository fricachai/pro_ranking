[CmdletBinding()]
param(
    [switch]$Publish,
    [int]$PagesTimeoutSeconds = 900
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
$LatestEventsJson = Join-Path $ReportDir 'events/latest-events.json'
$latestEventsExistedBeforeRun = $false
$latestEventsBytesBeforeRun = $null
$reportGenerationCompleted = $false
$previousReportFingerprint = $null
$currentReportFingerprint = $null
$dataChanged = $true
$checkedAt = (Get-Date).ToString('o')
$publishedTag = $null

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

function Get-FinancialPeriodOrdinal {
    param([AllowNull()][string]$Period)
    if ([string]::IsNullOrWhiteSpace($Period) -or $Period -notmatch '^(\d{4})Q([1-4])$') { return $null }
    return ([int]$Matches[1] * 4) + [int]$Matches[2]
}

function Get-ReportFingerprint {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $value = Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
    if ($value.meta) {
        $value.meta.PSObject.Properties.Remove('generatedAt')
        $value.meta.PSObject.Properties.Remove('eventCheckedAt')
    }
    if ($value.eventsMeta) {
        $value.eventsMeta.PSObject.Properties.Remove('fetchedAt')
    }
    $normalized = $value | ConvertTo-Json -Depth 100 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '')
    }
    finally {
        $sha256.Dispose()
    }
}

function Test-LiveReport {
    param(
        [Parameter(Mandatory)][string]$ExpectedCommit,
        [Parameter(Mandatory)][string]$ExpectedEtfDate
    )

    # Pages deployment rule: DO NOT cancel or retrigger Pages builds automatically.
    # If there is an active run for the expected commit, wait until it finishes.
    # Only if no active run exists and the latest build failed for the expected commit,
    # request a single controlled rebuild. Never retry more than once.
    $deadline = (Get-Date).AddSeconds($PagesTimeoutSeconds)
    $rebuildOnce = $false
    $build = $null
    while ((Get-Date) -lt $deadline) {
        $activeRuns = @()
        $runListRaw = & gh run list --commit $ExpectedCommit --workflow "pages build and deployment" --json databaseId,status,conclusion,createdAt,name 2>&1
        if ($LASTEXITCODE -eq 0) {
            $runList = ($runListRaw -join "`n") | ConvertFrom-Json
            $activeRuns = @($runList | Where-Object { $_.status -in @('queued', 'in_progress', 'waiting', 'requested') })
        }
        else {
            Write-Warning "Unable to query active Pages runs for commit $ExpectedCommit; relying on Pages build status only."
        }

        $raw = & gh api repos/fricachai/pro_ranking/pages/builds/latest 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to query GitHub Pages status:`n$($raw -join "`n")"
        }
        $build = ($raw -join "`n") | ConvertFrom-Json

        if ($activeRuns.Count -gt 0) {
            Write-Host "Waiting for $($activeRuns.Count) active Pages run(s) for commit $ExpectedCommit..."
            Start-Sleep -Seconds 10
            continue
        }

        if ($build.status -eq 'built' -and $build.commit -eq $ExpectedCommit) {
            break
        }

        if ($build.commit -eq $ExpectedCommit -and $build.status -in @('errored', 'failed') -and -not $rebuildOnce) {
            Write-Host "GitHub Pages build failed for commit $ExpectedCommit. Requesting one single controlled rebuild..."
            $trigger = & gh api --method POST repos/fricachai/pro_ranking/pages/builds 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to request GitHub Pages rebuild:`n$($trigger -join "`n")"
            }
            $rebuildOnce = $true
            Start-Sleep -Seconds 10
            continue
        }

        if ($build.commit -eq $ExpectedCommit -and $build.status -in @('errored', 'failed') -and $rebuildOnce) {
            throw "GitHub Pages build failed again after one single controlled rebuild. commit=$($build.commit) status=$($build.status)"
        }

        Write-Host "Latest Pages build status=$($build.status) commit=$($build.commit); waiting for commit $ExpectedCommit..."
        Start-Sleep -Seconds 8
    }

    if ($build.status -ne 'built' -or $build.commit -ne $ExpectedCommit) {
        throw "GitHub Pages did not publish commit $ExpectedCommit within $PagesTimeoutSeconds seconds. status=$($build.status) commit=$($build.commit)"
    }

    $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $response = Invoke-WebRequest -Uri "${LiveUrl}?v=$cacheBust" -UseBasicParsing
    $required = @('top30TableWrap', 'fullTableWrap', 'positionDecisionSummary', 'quotePhaseBanner', 'horizon-score-strip', 'score-tabs', 'scoreTabPanel', 'cross-horizon-reading', 'long-coverage-note', 'table-sort-button', 'data-table-sort', 'todayAction', 'nextCheck', $ExpectedEtfDate)
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
    $latestEventsExistedBeforeRun = Test-Path -LiteralPath $LatestEventsJson
    if ($latestEventsExistedBeforeRun) {
        $latestEventsBytesBeforeRun = [IO.File]::ReadAllBytes($LatestEventsJson)
    }
    $previousReportFingerprint = Get-ReportFingerprint -Path $LatestJson

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

    # MI_QFIIS must be fetched sequentially. Weekend/holiday dates are skipped,
    # and temporarily failed dates are retried without relaxing the 11-day gate.
    $generatorContent = Get-Content $Generator -Raw -Encoding utf8
    foreach ($requiredForeignHistoryToken in @(
        'mapLimit(retryDates, 1',
        'calendarDatesEnding(asOfIso, FOREIGN_HOLDING_LOOKBACK_CALENDAR_DAYS)',
        'FOREIGN_HOLDING_MAX_PASSES = 3',
        'FOREIGN_HOLDING_REQUIRED_DAYS = 11',
        'latestUsableSourceDate('
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
    if ([int]$newsStatus.requestedStocks -lt 300) {
        throw "Yahoo news request scope is insufficient: requested=$($newsStatus.requestedStocks)"
    }
    if ([string]$newsStatus.status -notin @('complete', 'partial', 'unavailable')) {
        throw "Yahoo news source status is invalid: $($newsStatus.status)"
    }
    $eventTypeNames = @($eventData.events | Group-Object eventType | ForEach-Object Name)
    foreach ($requiredEventType in @('material_info')) {
        if ($eventTypeNames -notcontains $requiredEventType) {
            throw "Required event type is missing: $requiredEventType"
        }
    }
    if ([int]$newsStatus.itemCount -gt 0 -and $eventTypeNames -notcontains 'news_pending') {
        throw 'Yahoo news items were fetched but news_pending events are missing.'
    }

    Write-Host "Event refresh complete. Yahoo status=$($newsStatus.status). Generating professional screen..."
    & node $Generator *>> $logPath
    if ($LASTEXITCODE -ne 0) {
        $tail = Get-Content $logPath -Tail 60 -Encoding utf8
        throw "Report generation failed. Log: $logPath`n$($tail -join "`n")"
    }
    $reportGenerationCompleted = $true
    Write-Host 'Report generation complete. Validating publishable output...'

    foreach ($path in @($LatestJson, $LatestHtml)) {
        if (-not (Test-Path $path)) { throw "Required output is missing: $path" }
    }
    $latestHtmlContent = Get-Content $LatestHtml -Raw -Encoding utf8
    foreach ($requiredAuthToken in @('id="loginGate"', 'pro-ranking-auth-v1', 'id="logoutButton"', 'const AUTH_ACCOUNTS=', "username:'frica'", "username:'Amanda'", 'triggerLabel=', 'operationPriceHtml', 'positionDecisionSummary', 'positionDecisionMeta', 'tracking-toggle', 'id="quotePhaseBanner"', 'horizon-score-strip', 'score-tabs', 'scoreTabPanel', 'cross-horizon-reading', 'long-coverage-note', 'table-sort-button', 'data-table-sort', 'horizonScores', 'dataHealth', 'todayAction', 'nextCheck', 'zoneText')) {
        if (-not $latestHtmlContent.Contains($requiredAuthToken)) {
            throw "Required login gate token is missing: $requiredAuthToken"
        }
    }
    $defenseReminderToken = -join @([char]0x9632, [char]0x5B88, [char]0x50F9, [char]0x63D0, [char]0x9192)
    $actionTransitionToken = -join @([char]0x5DF2, [char]0x6301, [char]0x6709, [char]0x52D5, [char]0x4F5C, [char]0xFF0F, [char]0x8F49, [char]0x63DB)
    foreach ($removedPositionToken in @('actionTransitionHtml', $defenseReminderToken, $actionTransitionToken)) {
        if ($latestHtmlContent.Contains($removedPositionToken)) {
            throw "Removed position token is still present: $removedPositionToken"
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
    foreach ($requiredMetaField in @('eventCheckedAt', 'yahooNewsStatus', 'yahooNewsCoverageRate', 'institutionalDate', 'foreignHoldingDate', 'foreignHoldingHistoryDays', 'creditDate', 'tdccDate', 'listedUniverseCount', 'coverageRate', 'activeUpdated', 'activeCoverageRate', 'activeEtfDataComplete', 'activeStaleEtfs', 'liveDate', 'quotePhase', 'priceLabel', 'scoringModelVersion', 'financialCurrentPeriod', 'financialCurrentCount', 'financialFallbackCount', 'financialUnavailableCount')) {
        if ($requiredMetaField -notin $meta.PSObject.Properties.Name -or $null -eq $meta.$requiredMetaField) {
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
    $todayTaipei = (Get-Date).ToString('yyyy-MM-dd')
    if ([string]$meta.liveDate -eq $todayTaipei -and (Get-Date).TimeOfDay -ge [TimeSpan]::FromHours(13.5833) -and [string]$meta.quotePhase -ne 'close') {
        throw "Current-day quotes were refreshed after 13:35 but were not identified as closing quotes: $($meta.liveFreeze)"
    }
    if (-not [bool]$meta.activeEtfDataComplete -and [int]$meta.bucketA -gt 0) {
        throw "Active ETF same-day coverage is incomplete ($($meta.activeUpdated)/$($meta.activeEtfs)), but report still contains $($meta.bucketA) buy-oriented A-bucket records."
    }
    if (-not $report.macroOverlay -or -not $report.sourcePosture -or -not $report.sectorOverlay) {
        throw 'latest.json is missing macro, source-posture, or sector overlay.'
    }
    if ([string]$meta.scoringModelVersion -ne 'HORIZON_SCORE_V2' -or [string]$report.methodology.primaryRankingHorizon -ne 'medium') {
        throw "Unexpected scoring model: meta=$($meta.scoringModelVersion) primary=$($report.methodology.primaryRankingHorizon)"
    }
    if ([bool]$report.methodology.dataHealthPolicy.affectsScore -or [int]$report.methodology.dataHealthPolicy.hardGate -ne 65) {
        throw 'Data-health policy must remain score-independent with a hard gate of 65.'
    }
    $currentFinancialOrdinal = Get-FinancialPeriodOrdinal -Period ([string]$meta.financialCurrentPeriod)
    if ($null -eq $currentFinancialOrdinal) {
        throw "Invalid current financial period: $($meta.financialCurrentPeriod)"
    }
    $financialCoverageTotal = [int]$meta.financialCurrentCount + [int]$meta.financialFallbackCount + [int]$meta.financialUnavailableCount
    if ($financialCoverageTotal -ne [int]$meta.stockCount) {
        throw "Financial coverage counts do not match stock count: $financialCoverageTotal/$($meta.stockCount)"
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
    $validBuckets = @('A', 'B', 'C', 'D')
    $validHoldingStates = @('add', 'hold', 'protect', 'trim', 'exit')
    $missingDecisionRows = @($rankingRows | Where-Object {
        -not $_.entryAction -or -not $_.holdingAction -or -not $_.todayAction -or -not $_.nextCheck -or
        $validBuckets -notcontains [string]$_.bucket -or
        $validHoldingStates -notcontains [string]$_.holdingState
    })
    if ($missingDecisionRows.Count -gt 0) {
        throw "Position decision fields are missing or invalid for $($missingDecisionRows.Count) stocks."
    }
    $invalidHorizonRows = @($rankingRows | Where-Object {
        $h = $_.horizonScores
        $health = $_.dataHealth
        if (-not $h -or -not $h.short -or -not $h.medium -or -not $h.long -or -not $health) { return $true }
        $shortScore = $h.short.score
        $mediumScore = $h.medium.score
        $longScore = $h.long.score
        $longDataCoverage = $h.long.dataCoverage
        if ($null -eq $shortScore -or $null -eq $mediumScore -or $null -eq $longScore -or $null -eq $longDataCoverage -or $null -eq $health.score) { return $true }
        if ([double]$shortScore -lt 0 -or [double]$shortScore -gt 100 -or [double]$mediumScore -lt 0 -or [double]$mediumScore -gt 100 -or [double]$longScore -lt 0 -or [double]$longScore -gt 100 -or [double]$longDataCoverage -lt 0 -or [double]$longDataCoverage -gt 100 -or [double]$health.score -lt 0 -or [double]$health.score -gt 100) { return $true }
        if ([math]::Abs([double]$_.score - [double]$mediumScore) -gt 0.05 -or [math]::Abs([double]$_.rawScore - [double]$mediumScore) -gt 0.05) { return $true }
        if ([int]$h.long.methodCoverage -ne 85 -or [int]$h.long.missingWeight -ne 15) { return $true }
        if ([bool]$health.affectsScore -or [int]$health.hardGate -ne 65) { return $true }
        $healthProperties = @($health.PSObject.Properties.Name)
        $fundamentals = $_.fundamentals
        if (-not $fundamentals) { return $true }
        $fundamentalProperties = @($fundamentals.PSObject.Properties.Name)
        if ('financialSourceMode' -notin $healthProperties -or 'financialPeriod' -notin $healthProperties -or 'freshnessPenalty' -notin $healthProperties -or 'missingCore' -notin $healthProperties -or 'staleCore' -notin $healthProperties) { return $true }
        if ('financialSourceMode' -notin $fundamentalProperties -or 'financialPeriod' -notin $fundamentalProperties -or 'financialSnapshotSourceFile' -notin $fundamentalProperties) { return $true }
        $sourceMode = [string]$health.financialSourceMode
        if ($sourceMode -notin @('current_official', 'prior_verified_official_snapshot', 'unavailable') -or $sourceMode -ne [string]$fundamentals.financialSourceMode) { return $true }
        if ([string]$health.financialPeriod -ne [string]$fundamentals.financialPeriod) { return $true }
        if ($sourceMode -eq 'current_official' -and [string]$fundamentals.financialPeriod -ne [string]$meta.financialCurrentPeriod) { return $true }
        if ($sourceMode -eq 'prior_verified_official_snapshot') {
            $rowFinancialOrdinal = Get-FinancialPeriodOrdinal -Period ([string]$fundamentals.financialPeriod)
            if ($null -eq $rowFinancialOrdinal -or $currentFinancialOrdinal - $rowFinancialOrdinal -lt 0 -or $currentFinancialOrdinal - $rowFinancialOrdinal -gt 1) { return $true }
            if (-not $fundamentals.financialSnapshotSourceFile -or @($health.staleCore).Count -lt 1 -or [double]$health.freshnessPenalty -le 0) { return $true }
        }
        if ($sourceMode -eq 'current_official' -and [double]$health.freshnessPenalty -ne 0) { return $true }
        if ($sourceMode -eq 'unavailable' -and $fundamentals.financialPeriod) { return $true }
        return $false
    })
    if ($invalidHorizonRows.Count -gt 0) {
        throw "Horizon-score or data-health contract is invalid for $($invalidHorizonRows.Count) stocks."
    }
    $pendingReviewToken = -join @([char]0x5F85, [char]0x67E5, [char]0x6838)
    $governanceToken = -join @([char]0x6CBB, [char]0x7406)
    $governanceDecisionPattern = [regex]::Escape($pendingReviewToken) + '|' + [regex]::Escape($governanceToken)
    $governanceOverrideRows = @($rankingRows | Where-Object {
        $_.PSObject.Properties.Name -contains 'governance' -or
        [string]$_.entryAction -match $governanceDecisionPattern -or
        [string]$_.holdingAction -match $governanceDecisionPattern
    })
    if ($governanceOverrideRows.Count -gt 0) {
        throw "Governance data must not appear in ranking decisions or position actions."
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
    foreach ($marker in @('top30TableWrap', 'fullTableWrap', 'positionDecisionSummary', 'quotePhaseBanner', 'financialCoverageBanner', 'horizon-score-strip', 'score-tabs', 'scoreTabPanel', 'cross-horizon-reading', 'long-coverage-note', 'table-sort-button', 'data-table-sort', 'dataCoverage', 'financialSourceMode', 'freshnessPenalty', 'todayAction', 'nextCheck', [string]$meta.etfDate)) {
        if (-not $indexContent.Contains($marker)) { throw "index.html is missing validation marker: $marker" }
    }

    $currentReportFingerprint = Get-ReportFingerprint -Path $LatestJson
    if (-not $currentReportFingerprint) {
        throw 'Unable to calculate the current report fingerprint.'
    }
    $dataChanged = -not $previousReportFingerprint -or $previousReportFingerprint -ne $currentReportFingerprint

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
    $publishStatus = 'validated'
    if ($Publish -and $changedPaths.Count -gt 0) {
        Write-Host 'Publishing refreshed report to GitHub Pages...'
        Invoke-Git -Arguments (@('add', '--') + $gitAddPaths) | Out-Null
        $stagedCheck = & git diff --cached --check 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Pre-commit validation failed:`n$($stagedCheck -join "`n")"
        }
        $commitTime = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        Invoke-Git -Arguments @('commit', '-m', "Refresh professional stock screen at $commitTime") | Out-Null
        $commit = (Invoke-Git -Arguments @('rev-parse', 'HEAD') | Select-Object -First 1).Trim()
        $branch = (Invoke-Git -Arguments @('branch', '--show-current') | Select-Object -First 1).Trim()
        Invoke-Git -Arguments @('push', 'origin', $branch) | Out-Null
        Test-LiveReport -ExpectedCommit $commit -ExpectedEtfDate ([string]$meta.etfDate)
        Write-Host "GitHub Pages published commit $commit."
        $publishStatus = 'published'
        # Keep an immutable run tag for audit without blocking later same-day refreshes.
        $publicationStamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
        $publishedTag = "published/$publicationStamp"
        Invoke-Git @('tag', $publishedTag, $commit) | Out-Null
        try {
            Invoke-Git @('push', 'origin', $publishedTag) | Out-Null
        }
        catch {
            Write-Warning "Failed to push publication audit tag '$publishedTag': $_"
        }

    }
    elseif ($Publish) {
        throw 'Refresh completed but did not produce a publishable checked-at timestamp change.'
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
    Write-Output "CHECKED_AT=$checkedAt"
    Write-Output "DATA_CHANGED=$($dataChanged.ToString().ToLowerInvariant())"
    Write-Output "REPORT_FINGERPRINT=$currentReportFingerprint"
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
    if ($publishedTag) { Write-Output "PUBLISHED_TAG=$publishedTag" }
    if ($Publish) { Write-Output "LIVE_URL=$LiveUrl" }
    Write-Output "LOG=$logPath"
}
catch {
    if (-not $reportGenerationCompleted) {
        if ($latestEventsExistedBeforeRun -and $null -ne $latestEventsBytesBeforeRun) {
            [IO.File]::WriteAllBytes($LatestEventsJson, $latestEventsBytesBeforeRun)
        }
        elseif (Test-Path -LiteralPath $LatestEventsJson) {
            Remove-Item -LiteralPath $LatestEventsJson -Force
        }
    }
    throw
}
finally {
    Pop-Location
}
