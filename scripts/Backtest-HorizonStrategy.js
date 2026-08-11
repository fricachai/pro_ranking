#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORT_DIR = path.join(ROOT, 'professional-screen-report', 'backtest-snapshots');
const MODEL_VERSION = 'HORIZON_SCORE_V2';
const SCHEMA_VERSION = 'HORIZON_BACKTEST_V1';
const DEFAULT_STRATEGIES = ['v2-a', 'v2-medium', 'shadow-qvm'];
const DEFAULT_MODE = 'portfolio';
const DEFAULT_TOP_N = 10;
const DEFAULT_FORWARD_DAYS = 20;
const DEFAULT_COST_BPS = 58.5;
const DEFAULT_MIN_SNAPSHOTS = 30;
const DEFAULT_MIN_PERIODS = 20;
const DEFAULT_MAX_GAP_DAYS = 10;

function usage() {
  return [
    'Usage: node scripts/Backtest-HorizonStrategy.js [options]',
    '',
    'Options:',
    '  --strategy <name[,name]>  v2-a, v2-medium, shadow-qvm, or all',
    '  --mode <mode>             portfolio, event-study, or both',
    '  --top-n <number>          maximum equally weighted holdings (default 10)',
    '  --forward-days <number>   event-study calendar-day horizon (default 20)',
    '  --cost-bps <number>       estimated round-trip cost in basis points (default 58.5)',
    '  --min-snapshots <number>  minimum event-study observations (default 30)',
    '  --min-periods <number>    minimum portfolio periods (default 20)',
    '  --max-gap-days <number>   maximum gap between portfolio snapshots (default 10)',
    '  --report-dir <path>       report directory override',
    '  --benchmark <csv>         optional CSV with date,close columns',
    '  --out <json>              write the result JSON to a file',
    '  --json                    print only JSON',
    '  --require-sufficient      exit 2 when the sample is too short',
    '  --help                    show this help'
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    strategies: DEFAULT_STRATEGIES,
    mode: DEFAULT_MODE,
    topN: DEFAULT_TOP_N,
    forwardDays: DEFAULT_FORWARD_DAYS,
    costBps: DEFAULT_COST_BPS,
    minSnapshots: DEFAULT_MIN_SNAPSHOTS,
    minPeriods: DEFAULT_MIN_PERIODS,
    maxGapDays: DEFAULT_MAX_GAP_DAYS,
    reportDir: DEFAULT_REPORT_DIR,
    benchmark: null,
    out: null,
    json: false,
    requireSufficient: false
  };

  const valueFor = (index, name) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--require-sufficient') {
      options.requireSufficient = true;
      continue;
    }
    if (arg === '--strategy') {
      const value = valueFor(index, arg);
      index += 1;
      options.strategies = value === 'all' ? DEFAULT_STRATEGIES : value.split(',').map(item => item.trim()).filter(Boolean);
      continue;
    }
    if (arg === '--mode') {
      options.mode = valueFor(index, arg);
      index += 1;
      continue;
    }
    if (arg === '--report-dir') {
      options.reportDir = path.resolve(valueFor(index, arg));
      index += 1;
      continue;
    }
    if (arg === '--benchmark') {
      options.benchmark = path.resolve(valueFor(index, arg));
      index += 1;
      continue;
    }
    if (arg === '--out') {
      options.out = path.resolve(valueFor(index, arg));
      index += 1;
      continue;
    }
    const numericOptions = new Map([
      ['--top-n', 'topN'],
      ['--forward-days', 'forwardDays'],
      ['--cost-bps', 'costBps'],
      ['--min-snapshots', 'minSnapshots'],
      ['--min-periods', 'minPeriods'],
      ['--max-gap-days', 'maxGapDays']
    ]);
    if (numericOptions.has(arg)) {
      const value = Number(valueFor(index, arg));
      index += 1;
      if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be a non-negative number`);
      options[numericOptions.get(arg)] = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!['portfolio', 'event-study', 'both'].includes(options.mode)) {
    throw new Error('--mode must be portfolio, event-study, or both');
  }
  if (!options.strategies.length) throw new Error('At least one strategy is required');
  for (const strategy of options.strategies) {
    if (!DEFAULT_STRATEGIES.includes(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
  }
  if (options.topN < 1 || options.forwardDays < 1 || options.maxGapDays < 1) {
    throw new Error('--top-n, --forward-days, and --max-gap-days must be at least 1');
  }
  return options;
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value));
}

function number(value) {
  if (value === null || value === undefined || value === '' || value === '-' || value === 'N/A') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const valid = values.filter(isFiniteNumber).map(Number);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

function median(values) {
  const valid = values.filter(isFiniteNumber).map(Number).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function percentile(values, target, higherIsBetter = true) {
  const valid = values.filter(isFiniteNumber).map(Number).sort((a, b) => a - b);
  if (!isFiniteNumber(target) || !valid.length) return null;
  let below = 0;
  let equal = 0;
  for (const value of valid) {
    if (value < target) below += 1;
    else if (value === target) equal += 1;
  }
  const rank = (below + equal * 0.5) / valid.length;
  return higherIsBetter ? rank : 1 - rank;
}

function weightedMean(items) {
  const available = items.filter(item => isFiniteNumber(item.value) && item.weight > 0);
  const weight = available.reduce((total, item) => total + item.weight, 0);
  if (!weight) return { value: null, coverage: 0 };
  return {
    value: available.reduce((total, item) => total + Number(item.value) * item.weight, 0) / weight,
    coverage: weight
  };
}

function isoDate(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}

function utcDay(value) {
  return Date.parse(`${value}T00:00:00Z`);
}

function calendarDaysBetween(start, end) {
  return Math.round((utcDay(end) - utcDay(start)) / 86400000);
}

function addCalendarDays(date, days) {
  return new Date(utcDay(date) + days * 86400000).toISOString().slice(0, 10);
}

function valueAt(object, keys) {
  let current = object;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return null;
    current = current[key];
  }
  return number(current);
}

function rowClose(row) {
  return valueAt(row, ['close']);
}

function normalizeRow(row) {
  return {
    ...row,
    code: String(row.code || '').trim(),
    close: rowClose(row),
    score: number(row.score),
    confidence: number(row.confidence),
    dataHealthy: row.dataHealth?.eligible === true,
    sector: String(row.sector || '其他')
  };
}

function loadSnapshots(reportDir) {
  if (!fs.existsSync(reportDir)) {
    return { files: [], snapshots: [], duplicateDates: [], versions: [], incompatibleFiles: [], archiveMissing: true };
  }
  const files = fs.readdirSync(reportDir)
    .filter(name => /^full-professional-screen-\d{8}\.json$/.test(name))
    .sort();
  const byDate = new Map();
  const duplicateDates = [];
  const versions = new Set();
  const incompatibleFiles = [];

  for (const file of files) {
    const filePath = path.join(reportDir, file);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON: ${file}: ${error.message}`);
    }
    const version = payload?.meta?.scoringModelVersion || payload?.methodology?.modelVersion;
    versions.add(version || 'missing');
    if (version !== MODEL_VERSION || payload?.schemaVersion !== 'HORIZON_BACKTEST_SNAPSHOT_V1' ||
        payload?.meta?.quotePhase !== 'close' || payload?.meta?.liveDate !== payload?.meta?.priceDate) {
      incompatibleFiles.push({
        file,
        version: version || null,
        schemaVersion: payload?.schemaVersion || null,
        quotePhase: payload?.meta?.quotePhase || null,
        liveDate: payload?.meta?.liveDate || null,
        priceDate: payload?.meta?.priceDate || null
      });
      continue;
    }
    const rows = Array.isArray(payload.ranking) ? payload.ranking.map(normalizeRow).filter(row => row.code) : [];
    const date = isoDate(payload?.meta?.priceDate) || isoDate(rows.find(row => row.closeDate)?.closeDate);
    if (!date) throw new Error(`${file} has no valid price date`);
    if (!rows.length) throw new Error(`${file} has no ranking rows`);
    if (byDate.has(date)) duplicateDates.push(date);
    byDate.set(date, {
      date,
      file,
      filePath,
      meta: payload.meta || {},
      rows
    });
  }

  const snapshots = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    files,
    snapshots,
    duplicateDates: [...new Set(duplicateDates)],
    versions: [...versions],
    incompatibleFiles
  };
}

function factorValue(row, name) {
  const raw = {
    operatingMargin: valueAt(row, ['fundamentals', 'operatingMargin']),
    grossMargin: valueAt(row, ['fundamentals', 'grossMargin']),
    netMargin: valueAt(row, ['fundamentals', 'netMargin']),
    revenueYtdYoy: valueAt(row, ['fundamentals', 'revenueYtdYoy']),
    eps: valueAt(row, ['fundamentals', 'eps']),
    debtRatio: valueAt(row, ['fundamentals', 'debtRatio']),
    currentRatio: valueAt(row, ['fundamentals', 'currentRatio']),
    pe: valueAt(row, ['valuation', 'pe']),
    pb: valueAt(row, ['valuation', 'pb']),
    return20: valueAt(row, ['technical', 'return20']),
    return60: valueAt(row, ['technical', 'return60']),
    dailyVolatility20: valueAt(row, ['technical', 'dailyVolatility20'])
  };
  const value = raw[name];
  if (!isFiniteNumber(value)) return null;
  if (['pe', 'pb'].includes(name) && value <= 0) return null;
  if (name === 'currentRatio' && value < 0) return null;
  return value;
}

const FACTOR_SPECS = [
  { name: 'operatingMargin', family: 'quality', weight: 0.2, higher: true },
  { name: 'grossMargin', family: 'quality', weight: 0.12, higher: true },
  { name: 'netMargin', family: 'quality', weight: 0.2, higher: true },
  { name: 'revenueYtdYoy', family: 'quality', weight: 0.16, higher: true },
  { name: 'eps', family: 'quality', weight: 0.12, higher: true },
  { name: 'debtRatio', family: 'quality', weight: 0.1, higher: false },
  { name: 'currentRatio', family: 'quality', weight: 0.1, higher: true },
  { name: 'pe', family: 'value', weight: 0.55, higher: false },
  { name: 'pb', family: 'value', weight: 0.45, higher: false },
  { name: 'return20', family: 'momentum', weight: 0.35, higher: true },
  { name: 'return60', family: 'momentum', weight: 0.65, higher: true },
  { name: 'dailyVolatility20', family: 'risk', weight: 1, higher: false }
];

function buildShadowScores(rows) {
  const globalValues = new Map();
  const sectorValues = new Map();
  for (const spec of FACTOR_SPECS) {
    globalValues.set(spec.name, rows.map(row => factorValue(row, spec.name)).filter(isFiniteNumber));
  }
  for (const row of rows) {
    if (!sectorValues.has(row.sector)) sectorValues.set(row.sector, new Map());
    const values = sectorValues.get(row.sector);
    for (const spec of FACTOR_SPECS) {
      if (!values.has(spec.name)) values.set(spec.name, []);
      const value = factorValue(row, spec.name);
      if (isFiniteNumber(value)) values.get(spec.name).push(value);
    }
  }

  const scores = new Map();
  for (const row of rows) {
    const ranked = new Map();
    const sector = sectorValues.get(row.sector);
    for (const spec of FACTOR_SPECS) {
      const value = factorValue(row, spec.name);
      const sectorSample = sector?.get(spec.name) || [];
      const distribution = sectorSample.length >= 10 ? sectorSample : globalValues.get(spec.name);
      ranked.set(spec.name, percentile(distribution, value, spec.higher));
    }
    const familyScores = {};
    for (const family of ['quality', 'value', 'momentum', 'risk']) {
      const familyItems = FACTOR_SPECS
        .filter(spec => spec.family === family)
        .map(spec => ({ value: ranked.get(spec.name), weight: spec.weight }));
      familyScores[family] = weightedMean(familyItems);
    }
    const total = weightedMean([
      { value: familyScores.quality.value, weight: 0.4 },
      { value: familyScores.value.value, weight: 0.25 },
      { value: familyScores.momentum.value, weight: 0.25 },
      { value: familyScores.risk.value, weight: 0.1 }
    ]);
    scores.set(row.code, {
      score: total.coverage >= 0.85 ? total.value * 100 : null,
      coverage: total.coverage,
      quality: familyScores.quality.value === null ? null : familyScores.quality.value * 100,
      value: familyScores.value.value === null ? null : familyScores.value.value * 100,
      momentum: familyScores.momentum.value === null ? null : familyScores.momentum.value * 100,
      risk: familyScores.risk.value === null ? null : familyScores.risk.value * 100
    });
  }
  return scores;
}

function researchEligible(row) {
  const dailyValue = valueAt(row, ['riskInputs', 'dailyValue']);
  return row.dataHealthy && isFiniteNumber(dailyValue) && dailyValue >= 50_000_000 &&
    row.officialMaterialRisk !== true && !row.events?.disposal && row.close > 0;
}

function selectRows(snapshot, strategy, topN) {
  const rows = snapshot.rows;
  if (strategy === 'v2-a') {
    return rows.filter(row => row.dataHealthy && row.bucket === 'A' && row.close > 0)
      .sort((a, b) => (b.score || -Infinity) - (a.score || -Infinity) || (b.confidence || 0) - (a.confidence || 0))
      .slice(0, topN);
  }
  if (strategy === 'v2-medium') {
    return rows.filter(row => row.dataHealthy && row.bucket !== 'D' && row.close > 0)
      .sort((a, b) => (b.score || -Infinity) - (a.score || -Infinity) || (b.confidence || 0) - (a.confidence || 0))
      .slice(0, topN);
  }
  const shadowScores = buildShadowScores(rows);
  return rows.filter(researchEligible)
    .map(row => ({ row, shadow: shadowScores.get(row.code) }))
    .filter(item => isFiniteNumber(item.shadow?.score))
    .sort((a, b) => b.shadow.score - a.shadow.score || (b.row.confidence || 0) - (a.row.confidence || 0))
    .slice(0, topN)
    .map(item => item.row);
}

function indexRows(snapshot) {
  return new Map(snapshot.rows.map(row => [row.code, row]));
}

function findForwardSnapshot(snapshots, index, forwardDays) {
  const target = addCalendarDays(snapshots[index].date, forwardDays);
  for (let next = index + 1; next < snapshots.length; next += 1) {
    if (snapshots[next].date >= target) return next;
  }
  return null;
}

function eventStudy(snapshots, strategy, options) {
  const observations = [];
  for (let index = 0; index < snapshots.length; index += 1) {
    const forwardIndex = findForwardSnapshot(snapshots, index, options.forwardDays);
    if (forwardIndex === null) continue;
    const selected = selectRows(snapshots[index], strategy, options.topN);
    const futureRows = indexRows(snapshots[forwardIndex]);
    const returns = selected.map(row => {
      const future = futureRows.get(row.code);
      if (!future || !isFiniteNumber(row.close) || !isFiniteNumber(future.close) || row.close <= 0) return null;
      return future.close / row.close - 1;
    }).filter(isFiniteNumber);
    const grossReturn = mean(returns);
    if (!isFiniteNumber(grossReturn)) continue;
    const netReturn = (1 + grossReturn) * (1 - options.costRate) - 1;
    observations.push({
      asOf: snapshots[index].date,
      exitDate: snapshots[forwardIndex].date,
      selectedCount: selected.length,
      pricedCount: returns.length,
      grossReturn,
      netReturn,
      codes: selected.map(row => row.code)
    });
  }
  const values = observations.map(item => item.netReturn);
  return {
    status: observations.length >= options.minSnapshots ? 'sufficient' : 'insufficient_data',
    observationCount: observations.length,
    requiredObservations: options.minSnapshots,
    forwardDays: options.forwardDays,
    meanNetReturn: mean(values),
    medianNetReturn: median(values),
    hitRate: values.length ? values.filter(value => value > 0).length / values.length : null,
    bestNetReturn: values.length ? Math.max(...values) : null,
    worstNetReturn: values.length ? Math.min(...values) : null,
    observations
  };
}

function turnoverFraction(previousCodes, currentCodes) {
  const previous = new Set(previousCodes);
  const current = new Set(currentCodes);
  if (!previous.size && !current.size) return 0;
  if (!previous.size || !current.size) return 1;
  const overlap = [...current].filter(code => previous.has(code)).length;
  return 1 - overlap / Math.max(previous.size, current.size);
}

function annualizedVolatility(returns, totalDays) {
  if (returns.length < 2 || totalDays <= 0) return null;
  const average = mean(returns);
  const variance = mean(returns.map(value => (value - average) ** 2));
  return Math.sqrt(variance) * Math.sqrt(365 / (totalDays / returns.length));
}

function maxDrawdown(equityCurve) {
  let peak = 1;
  let drawdown = 0;
  for (const value of equityCurve) {
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, value / peak - 1);
  }
  return drawdown;
}

function portfolioBacktest(snapshots, strategy, options, benchmark) {
  const periods = [];
  let equity = 1;
  let previousCodes = [];
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const current = snapshots[index];
    const next = snapshots[index + 1];
    const gapDays = calendarDaysBetween(current.date, next.date);
    if (gapDays > options.maxGapDays) continue;
    const selected = selectRows(current, strategy, options.topN);
    const nextRows = indexRows(next);
    const returns = selected.map(row => {
      const future = nextRows.get(row.code);
      if (!future || !isFiniteNumber(row.close) || !isFiniteNumber(future.close) || row.close <= 0) return null;
      return future.close / row.close - 1;
    }).filter(isFiniteNumber);
    const grossReturn = returns.length ? mean(returns) : 0;
    const codes = selected.map(row => row.code);
    const turnover = turnoverFraction(previousCodes, codes);
    const netReturn = (1 + grossReturn) * (1 - turnover * options.costRate) - 1;
    equity *= 1 + netReturn;
    const benchmarkReturn = benchmark ? benchmark.returnBetween(current.date, next.date) : null;
    periods.push({
      asOf: current.date,
      exitDate: next.date,
      gapDays,
      selectedCount: selected.length,
      pricedCount: returns.length,
      grossReturn,
      netReturn,
      turnover,
      equity,
      benchmarkReturn,
      codes
    });
    previousCodes = codes;
  }
  const returns = periods.map(period => period.netReturn);
  const totalDays = periods.length ? calendarDaysBetween(periods[0].asOf, periods.at(-1).exitDate) : 0;
  const totalReturn = equity - 1;
  const annualizedReturn = equity > 0 && totalDays > 0 ? equity ** (365 / totalDays) - 1 : null;
  const benchmarkReturns = periods.map(period => period.benchmarkReturn).filter(isFiniteNumber);
  return {
    status: periods.length >= options.minPeriods ? 'sufficient' : 'insufficient_data',
    periodCount: periods.length,
    requiredPeriods: options.minPeriods,
    totalDays,
    totalReturn,
    annualizedReturn,
    annualizedVolatility: annualizedVolatility(returns, totalDays),
    maxDrawdown: maxDrawdown(periods.map(period => period.equity)),
    hitRate: returns.length ? returns.filter(value => value > 0).length / returns.length : null,
    averageTurnover: mean(periods.map(period => period.turnover)),
    benchmark: benchmarkReturns.length ? {
      periodCount: benchmarkReturns.length,
      totalReturn: benchmarkReturns.reduce((total, value) => total * (1 + value), 1) - 1,
      meanReturn: mean(benchmarkReturns)
    } : { status: benchmark ? 'no_matching_prices' : 'not_provided' },
    periods
  };
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function loadBenchmark(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) throw new Error(`Benchmark file not found: ${filePath}`);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('Benchmark CSV must contain a header and at least one row');
  const headers = parseCsvLine(lines[0]).map(value => value.toLowerCase());
  const dateIndex = headers.findIndex(value => value === 'date' || value === 'pricedate');
  const closeIndex = headers.findIndex(value => value === 'close' || value === 'price');
  if (dateIndex < 0 || closeIndex < 0) throw new Error('Benchmark CSV requires date and close columns');
  const prices = new Map();
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const date = isoDate(cells[dateIndex]);
    const close = number(cells[closeIndex]);
    if (date && isFiniteNumber(close) && close > 0) prices.set(date, close);
  }
  return {
    file: filePath,
    prices,
    returnBetween(start, end) {
      const startPrice = prices.get(start);
      const endPrice = prices.get(end);
      return isFiniteNumber(startPrice) && isFiniteNumber(endPrice) && startPrice > 0 ? endPrice / startPrice - 1 : null;
    }
  };
}

function resultForStrategy(snapshots, strategy, options, benchmark) {
  const result = { strategy };
  if (options.mode === 'portfolio' || options.mode === 'both') {
    result.portfolio = portfolioBacktest(snapshots, strategy, options, benchmark);
  }
  if (options.mode === 'event-study' || options.mode === 'both') {
    result.eventStudy = eventStudy(snapshots, strategy, options);
  }
  return result;
}

function buildReport(options) {
  const loaded = loadSnapshots(options.reportDir);
  const benchmark = loadBenchmark(options.benchmark);
  const costRate = options.costBps / 10000;
  const effectiveOptions = { ...options, costRate };
  const first = loaded.snapshots[0]?.date || null;
  const last = loaded.snapshots.at(-1)?.date || null;
  const results = loaded.snapshots.length
    ? options.strategies.map(strategy => resultForStrategy(loaded.snapshots, strategy, effectiveOptions, benchmark))
    : [];
  const statuses = results.flatMap(result => [result.portfolio?.status, result.eventStudy?.status]).filter(Boolean);
  const status = statuses.length && statuses.every(value => value === 'sufficient') ? 'sufficient' : 'insufficient_data';
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    source: {
      reportDirectory: options.reportDir,
      fileCount: loaded.files.length,
      snapshotCount: loaded.snapshots.length,
      dateFrom: first,
      dateTo: last,
      modelVersions: loaded.versions,
      duplicateDates: loaded.duplicateDates,
      incompatibleFiles: loaded.incompatibleFiles,
      archiveMissing: loaded.archiveMissing || false
    },
    assumptions: {
      modelVersion: MODEL_VERSION,
      mode: options.mode,
      topN: options.topN,
      forwardCalendarDays: options.forwardDays,
      roundTripCostBps: options.costBps,
      maxPortfolioSnapshotGapDays: options.maxGapDays,
      benchmark: benchmark?.file || null,
      note: 'This is an offline research diagnostic. It is not a live trading signal and does not change the production ranking.'
    },
    strategies: results,
    warnings: [
      loaded.archiveMissing ? '尚未建立收盤後 point-in-time 快照封存區' : null,
      loaded.snapshots.length < options.minSnapshots ? `快照數不足：${loaded.snapshots.length}/${options.minSnapshots}` : null,
      loaded.incompatibleFiles.length ? `已排除非${MODEL_VERSION}檔案：${loaded.incompatibleFiles.length} 個` : null,
      !benchmark ? '未提供 benchmark CSV，無法比較大盤 ETF 基準' : null,
      options.strategies.includes('shadow-qvm') ? 'shadow-qvm 只使用現有報告欄位，不代表已完成 ROIC、自由現金流或 12 個月動能模型' : null
    ].filter(Boolean)
  };
}

function formatPercent(value) {
  return isFiniteNumber(value) ? `${(Number(value) * 100).toFixed(2)}%` : '—';
}

function printHuman(report) {
  console.log(`Backtest status: ${report.status}`);
  console.log(`Snapshots: ${report.source.snapshotCount} (${report.source.dateFrom || '—'} to ${report.source.dateTo || '—'})`);
  console.log(`Model: ${report.assumptions.modelVersion}; cost: ${report.assumptions.roundTripCostBps} bps; benchmark: ${report.assumptions.benchmark || 'not provided'}`);
  for (const result of report.strategies) {
    console.log(`\n[${result.strategy}]`);
    if (result.portfolio) {
      const item = result.portfolio;
      console.log(`portfolio: ${item.status}; periods=${item.periodCount}/${item.requiredPeriods}; total=${formatPercent(item.totalReturn)}; CAGR=${formatPercent(item.annualizedReturn)}; maxDD=${formatPercent(item.maxDrawdown)}; turnover=${formatPercent(item.averageTurnover)}`);
    }
    if (result.eventStudy) {
      const item = result.eventStudy;
      console.log(`event-study: ${item.status}; observations=${item.observationCount}/${item.requiredObservations}; mean=${formatPercent(item.meanNetReturn)}; median=${formatPercent(item.medianNetReturn)}; hit=${formatPercent(item.hitRate)}`);
    }
  }
  if (report.warnings.length) {
    console.log('\nWarnings:');
    report.warnings.forEach(warning => console.log(`- ${warning}`));
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const report = buildReport(options);
  if (options.out) {
    const parent = path.dirname(options.out);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2), 'utf8');
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (options.requireSufficient && report.status !== 'sufficient') return 2;
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`Backtest failed: ${error.message}`);
  process.exitCode = 1;
}
