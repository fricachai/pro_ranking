#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORT = path.join(ROOT, 'professional-screen-report', 'latest.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'professional-screen-report', 'backtest-snapshots');
const MODEL_VERSION = 'HORIZON_SCORE_V2';
const SNAPSHOT_SCHEMA_VERSION = 'HORIZON_BACKTEST_SNAPSHOT_V1';

function parseArgs(argv) {
  const options = { report: DEFAULT_REPORT, outputDir: DEFAULT_OUTPUT_DIR, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--report' || arg === '--output-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      options[arg === '--report' ? 'report' : 'outputDir'] = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function number(value) {
  if (value === null || value === undefined || value === '' || value === '-' || value === 'N/A') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function pick(object, keys) {
  const result = {};
  for (const key of keys) result[key] = object?.[key] ?? null;
  return result;
}

function compactRow(row) {
  return {
    code: row.code,
    name: row.name,
    sector: row.sector,
    bucket: row.bucket,
    score: number(row.score),
    rawScore: number(row.rawScore),
    confidence: number(row.confidence),
    horizonScores: row.horizonScores,
    dataHealth: row.dataHealth,
    close: number(row.close),
    fundamentals: pick(row.fundamentals, [
      'revenueYoy', 'revenueYtdYoy', 'operatingMargin', 'grossMargin', 'netMargin',
      'nonOperatingContributionPct', 'financialPeriod', 'financialCurrentPeriod',
      'financialSourceMode', 'eps', 'debtRatio', 'currentRatio'
    ]),
    valuation: pick(row.valuation, ['pe', 'pb']),
    technical: pick(row.technical, ['return20', 'return60', 'dailyVolatility20']),
    riskInputs: pick(row.riskInputs, ['dailyValue']),
    officialMaterialRisk: row.officialMaterialRisk === true,
    events: { disposal: row.events?.disposal || null }
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/Capture-HorizonBacktestSnapshot.js [--report path] [--output-dir path] [--json]');
    return 0;
  }
  if (!fs.existsSync(options.report)) throw new Error(`Report not found: ${options.report}`);
  const report = JSON.parse(fs.readFileSync(options.report, 'utf8'));
  const meta = report.meta || {};
  const priceDate = isoDate(meta.priceDate || meta.etfDate);
  const liveDate = isoDate(meta.liveDate);
  const status = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    modelVersion: meta.scoringModelVersion || null,
    asOf: priceDate,
    quotePhase: meta.quotePhase || null,
    liveDate,
    output: null
  };

  if (meta.scoringModelVersion !== MODEL_VERSION || report.methodology?.primaryRankingHorizon !== 'medium') {
    throw new Error(`Report is not ${MODEL_VERSION} with medium primary ranking.`);
  }
  if (!priceDate) throw new Error('Report has no valid priceDate or etfDate.');

  // Intraday reports can contain a next-day live quote. They must never become
  // an as-of snapshot for historical strategy validation.
  if (meta.quotePhase !== 'close' || liveDate !== priceDate) {
    status.status = 'skipped';
    status.reason = 'not_close_as_of_snapshot';
    if (options.json) console.log(JSON.stringify(status, null, 2));
    else console.log(`CAPTURE_STATUS=skipped AS_OF=${priceDate} QUOTE_PHASE=${meta.quotePhase || 'missing'} LIVE_DATE=${liveDate || 'missing'}`);
    return 0;
  }

  if (!Array.isArray(report.ranking) || report.ranking.length === 0) throw new Error('Report ranking is empty.');
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    asOf: priceDate,
    meta: {
      priceDate,
      etfDate: isoDate(meta.etfDate),
      marketDate: isoDate(meta.marketDate),
      liveDate,
      quotePhase: meta.quotePhase,
      scoringModelVersion: meta.scoringModelVersion,
      foreignHoldingHistoryDays: number(meta.foreignHoldingHistoryDays),
      activeEtfDataComplete: meta.activeEtfDataComplete === true,
      stockCount: number(meta.stockCount)
    },
    ranking: report.ranking.map(compactRow).filter(row => row.code && Number.isFinite(row.close) && row.close > 0)
  };
  if (!snapshot.ranking.length) throw new Error('No valid close prices were available for the snapshot.');

  fs.mkdirSync(options.outputDir, { recursive: true });
  const dateSlug = priceDate.replace(/-/g, '');
  const output = path.join(options.outputDir, `full-professional-screen-${dateSlug}.json`);
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2), 'utf8');
  status.status = 'captured';
  status.output = output;
  status.stockCount = snapshot.ranking.length;
  if (options.json) console.log(JSON.stringify(status, null, 2));
  else console.log(`CAPTURE_STATUS=captured AS_OF=${priceDate} STOCK_COUNT=${snapshot.ranking.length} OUTPUT=${output}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`Snapshot capture failed: ${error.message}`);
  process.exitCode = 1;
}
