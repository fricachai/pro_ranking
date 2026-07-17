#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'professional-screen-report');
const XIAOYU = 'https://xiaoyu-etf.pages.dev';
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

  const EVENTS_DIR = path.join(OUT_DIR, 'events');
  const LATEST_EVENTS_PATH = path.join(EVENTS_DIR, 'latest-events.json');

  const SOURCES = {
    etf: `${XIAOYU}/data.js`,
    institution: `${XIAOYU}/data/inst_byday.json`,
    events: `${XIAOYU}/data/events.json`,
    twseValuation: 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
    twseRevenue: 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
    twseEps: 'https://openapi.twse.com.tw/v1/opendata/t187ap14_L',
    twseMargin: 'https://openapi.twse.com.tw/v1/opendata/t187ap17_L',
    twseDaily: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    twseForeignHolding: 'https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS',
    twseInstitutional: 'https://www.twse.com.tw/rwd/zh/fund/T86?response=html',
    twse: 'https://www.twse.com.tw/',
    mops: 'https://mops.twse.com.tw/',
    yahooChart: 'https://query1.finance.yahoo.com/v8/finance/chart/',
    yahooFinanceRss: 'https://finance.yahoo.com/rss/headline'
  };

const WEIGHTS = {
  fundamentals: 30,
  valuation: 15,
  ownership: 20,
  technical: 15,
  catalyst: 10,
  risk: 10
};

const BALANCE_ENDPOINTS = {
  TWSE: ['ci', 'fh', 'basi', 'ins', 'mim', 'bd'].map(type => `https://openapi.twse.com.tw/v1/opendata/t187ap07_L_${type}`)
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 Codex Taiwan equity research screen',
          accept: 'application/json,text/plain,*/*'
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await sleep(350 * (i + 1));
    }
  }
  throw new Error(`Fetch failed: ${url}: ${lastError?.message || lastError}`);
}

async function fetchJson(url, attempts = 3) {
  return JSON.parse(await fetchText(url, attempts));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { __error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function number(value) {
  if (value === null || value === undefined || value === '' || value === '-' || value === 'N/A') return null;
  const parsed = Number(String(value).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? sum(valid) / valid.length : null;
}

function stddev(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return null;
  const avg = mean(valid);
  return Math.sqrt(mean(valid.map(value => (value - avg) ** 2)));
}

function pctChange(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return (current / base - 1) * 100;
}

function smaSeries(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return mean(values.slice(index + 1 - period, index + 1));
  });
}

function emaSeries(values, period) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const output = [];
  let ema = values[0];
  for (const value of values) {
    ema = alpha * value + (1 - alpha) * ema;
    output.push(ema);
  }
  return output;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = mean(changes.slice(0, period).map(value => Math.max(value, 0)));
  let loss = mean(changes.slice(0, period).map(value => Math.max(-value, 0)));
  for (const change of changes.slice(period)) {
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function stochasticKd(rows, period = 9) {
  const valid = rows.filter(row => Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close));
  if (valid.length < period + 2) return null;
  let k = 50;
  let d = 50;
  const points = [];
  for (let index = period - 1; index < valid.length; index += 1) {
    const window = valid.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map(row => row.high));
    const lowest = Math.min(...window.map(row => row.low));
    const rsv = highest === lowest ? 50 : (valid[index].close - lowest) / (highest - lowest) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
    points.push({ k, d, j: 3 * k - 2 * d, rsv });
  }
  const last = points.length - 1;
  let goldenIndex = -1;
  let deathIndex = -1;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].k <= points[index - 1].d && points[index].k > points[index].d) goldenIndex = index;
    if (points[index - 1].k >= points[index - 1].d && points[index].k < points[index].d) deathIndex = index;
  }
  return {
    kdK: points[last].k,
    kdD: points[last].d,
    kdJ: points[last].j,
    kdRsv: points[last].rsv,
    kdKDelta: points[last].k - points[last - 1].k,
    kdDDelta: points[last].d - points[last - 1].d,
    kdGoldenCrossRecent: goldenIndex >= last - 2,
    kdDeathCrossRecent: deathIndex >= last - 2
  };
}

function technicalFromCloses(rawCloses, rawOhlc = []) {
  const ohlc = rawOhlc.filter(row => Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close));
  const closes = (ohlc.length >= 21 ? ohlc.map(row => row.close) : rawCloses).filter(Number.isFinite);
  if (closes.length < 21) return null;
  const ema5s = emaSeries(closes, 5);
  const ema20s = emaSeries(closes, 20);
  const ema60s = emaSeries(closes, 60);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = closes.map((_, index) => ema12[index] - ema26[index]);
  const signal = emaSeries(macd, 9);
  const histogram = macd.map((value, index) => value - signal[index]);
  const ma20s = smaSeries(closes, 20);
  const dailyReturns = closes.slice(1).map((value, index) => pctChange(value, closes[index]));
  const last = closes.length - 1;
  const vol20 = stddev(dailyReturns.slice(-20));
  return {
    close: closes[last],
    ema5: ema5s[last],
    ema20: ema20s[last],
    ema60: ema60s[last],
    ma20Slope5: pctChange(ma20s[last], ma20s[Math.max(0, last - 5)]),
    ema60Slope: pctChange(ema60s[last], ema60s[Math.max(0, last - 1)]),
    rsi14: rsi(closes, 14),
    macdHistogram: histogram[last],
    macdHistogramDelta: last > 0 ? histogram[last] - histogram[last - 1] : null,
    distanceEma20: pctChange(closes[last], ema20s[last]),
    return5: last >= 5 ? pctChange(closes[last], closes[last - 5]) : null,
    return10: last >= 10 ? pctChange(closes[last], closes[last - 10]) : null,
    return20: last >= 20 ? pctChange(closes[last], closes[last - 20]) : null,
    return60: last >= 60 ? pctChange(closes[last], closes[last - 60]) : null,
    dailyVolatility20: vol20,
    ...stochasticKd(ohlc)
  };
}

async function fetchYahooOhlc(code) {
  const url = `${SOURCES.yahooChart}${encodeURIComponent(code)}.TW?range=6mo&interval=1d&events=div%2Csplits`;
  const payload = await fetchJson(url, 2);
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp?.length || !quote) throw new Error(`Yahoo daily OHLC missing for ${code}`);
  return result.timestamp.map((timestamp, index) => ({
    timestamp,
    high: number(quote.high?.[index]),
    low: number(quote.low?.[index]),
    close: number(quote.close?.[index])
  })).filter(row => Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close));
}

function percentile(values, target, higherIsBetter = true) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!Number.isFinite(target) || !valid.length) return 0.35;
  let below = 0;
  let equal = 0;
  for (const value of valid) {
    if (value < target) below += 1;
    else if (value === target) equal += 1;
  }
  const rank = (below + equal * 0.5) / valid.length;
  return higherIsBetter ? rank : 1 - rank;
}

function formatDateTimeTaipei(date = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
}

function rocDateToIso(value) {
  const text = String(value || '');
  if (!/^\d{7}$/.test(text)) return null;
  return `${Number(text.slice(0, 3)) + 1911}-${text.slice(3, 5)}-${text.slice(5, 7)}`;
}

function yyyymmddToIso(value) {
  const text = String(value || '');
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function isoToYyyymmdd(value) {
  return String(value || '').replace(/-/g, '');
}

function calendarDatesEnding(asOfIso, count = 45) {
  const end = new Date(`${asOfIso}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end.getTime() - index * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

function cleanForeignChangeReason(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

async function fetchTwseForeignHoldingHistory(asOfIso) {
  const calendarDates = calendarDatesEnding(asOfIso, 45);
  const payloads = await mapLimit(calendarDates, 4, async iso => {
    const url = `${SOURCES.twseForeignHolding}?date=${isoToYyyymmdd(iso)}&selectType=ALLBUT0999&response=json`;
    const payload = await fetchJson(url);
    if (payload.stat !== 'OK' || !payload.data?.length) return null;
    const rows = payload.data.map(row => ({
      code: String(row[0]),
      shares: number(row[5]),
      ratio: number(row[7]),
      changeReason: cleanForeignChangeReason(row[10])
    })).filter(row => /^\d{4}$/.test(row.code) && Number.isFinite(row.shares));
    return { date: yyyymmddToIso(payload.date), rows: new Map(rows.map(row => [row.code, row])) };
  });
  const seen = new Set();
  const snapshots = payloads.filter(payload => {
    if (!payload || seen.has(payload.date)) return false;
    seen.add(payload.date);
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (snapshots.length < 21) throw new Error(`外資持股交易日不足：僅 ${snapshots.length} 日`);
  return { snapshots, dates: snapshots.map(snapshot => snapshot.date) };
}

function foreignHoldingFeatures(history, code) {
  const rows = history.snapshots.map(snapshot => snapshot.rows.get(code) || null);
  const current = rows[0];
  const structuralChanges = rows.slice(0, 21).flatMap((row, index) => row?.changeReason
    ? [{ date: history.dates[index], reason: row.changeReason }] : []);
  const trendReliable = Boolean(current && rows[20] && structuralChanges.length === 0);
  const lotsChange = index => current && rows[index] ? (current.shares - rows[index].shares) / 1000 : null;
  const ratioChange = index => current && rows[index] && Number.isFinite(current.ratio) && Number.isFinite(rows[index].ratio)
    ? current.ratio - rows[index].ratio : null;
  return {
    date: history.dates[0] || null,
    heldShares: current?.shares ?? null,
    heldLots: Number.isFinite(current?.shares) ? current.shares / 1000 : null,
    ratio: current?.ratio ?? null,
    d1Lots: lotsChange(1), d5Lots: lotsChange(5), d10Lots: lotsChange(10), d20Lots: lotsChange(20),
    d1RatioPp: ratioChange(1), d5RatioPp: ratioChange(5), d10RatioPp: ratioChange(10), d20RatioPp: ratioChange(20),
    trendReliable,
    structuralChanges
  };
}

function broadSector(industry = '') {
  if (/金融|銀行|保險|證券/.test(industry)) return '金融';
  if (/半導體/.test(industry)) return '半導體';
  if (/電腦|週邊|電子零組件|通信|光電|資訊服務|電子通路|其他電子/.test(industry)) return '電子科技';
  if (/食品|觀光|百貨|居家|運動|貿易|生技|醫療/.test(industry)) return '民生消費';
  if (/航運|汽車|電機|機械|營建|電器電纜/.test(industry)) return '工業';
  if (/塑膠|化學|鋼鐵|橡膠|水泥|玻璃|造紙|油電燃氣/.test(industry)) return '原物料';
  return industry || '其他';
}

function isFinancial(industry = '') {
  return /金融|銀行|保險|證券/.test(industry);
}

function snapshotMap(rows = []) {
  return new Map(rows.map(row => [String(row[0]), { lots: number(row[1]) || 0, weight: number(row[2]) || 0 }]));
}

function changeFromSeries(series, days) {
  if (!Array.isArray(series) || series.length <= days) return null;
  return (number(series.at(-1)) || 0) - (number(series.at(-1 - days)) || 0);
}

function stockEtfFeatures(stock, detail, activeSet, laggingSet) {
  const dates = detail?.snap_dates || [];
  const latestDate = dates[0];
  const current = snapshotMap(detail?.snaps?.[latestDate] || []);
  const snapshots = {};
  for (const days of [1, 3, 5, 10, 20]) {
    const date = dates[Math.min(days, Math.max(0, dates.length - 1))];
    snapshots[days] = snapshotMap(detail?.snaps?.[date] || []);
  }
  const activeLots = map => sum([...map.entries()].filter(([code]) => activeSet.has(code)).map(([, row]) => row.lots));
  const currentActiveLots = activeLots(current);
  const activeChanges = {};
  const activeBreadth = {};
  for (const days of [1, 3, 5, 10, 20]) {
    const base = snapshots[days];
    activeChanges[days] = currentActiveLots - activeLots(base);
    let buyers = 0;
    let sellers = 0;
    for (const code of new Set([...current.keys(), ...base.keys()])) {
      if (!activeSet.has(code)) continue;
      const delta = (current.get(code)?.lots || 0) - (base.get(code)?.lots || 0);
      if (delta > 0) buyers += 1;
      if (delta < 0) sellers += 1;
    }
    activeBreadth[days] = { buyers, sellers };
  }
  const totalLots = number(stock.tot_lots) || sum([...current.values()].map(row => row.lots));
  const totalChanges = Object.fromEntries([1, 3, 5, 10, 20].map(days => [days, changeFromSeries(stock.series, days)]));
  const holderLots = (stock.holders || []).map(holder => number(holder.lots) || 0).sort((a, b) => b - a);
  const laggingLots = sum((stock.holders || []).filter(holder => laggingSet.has(holder.etf)).map(holder => number(holder.lots) || 0));
  const flowPct = {};
  const activePct = {};
  for (const days of [1, 3, 5, 10, 20]) {
    const baseLots = totalLots - (totalChanges[days] || 0);
    flowPct[days] = baseLots > 0 ? totalChanges[days] / baseLots * 100 : null;
    const baseActive = currentActiveLots - activeChanges[days];
    activePct[days] = baseActive > 0 ? activeChanges[days] / baseActive * 100 : (activeChanges[days] > 0 ? 100 : 0);
  }
  const topHolders = (stock.holders || []).slice(0, 5).map(holder => ({
    code: holder.etf,
    name: holder.etfname,
    lots: number(holder.lots) || 0,
    weight: number(holder.weight),
    d1: number(holder.d1),
    active: activeSet.has(holder.etf),
    lagging: laggingSet.has(holder.etf)
  }));
  return {
    totalLots,
    etfCount: number(stock.etf_count) || current.size,
    totalChanges,
    flowPct,
    activeLots: currentActiveLots,
    activeChanges,
    activePct,
    activeBreadth,
    passiveChanges: Object.fromEntries([1, 3, 5, 10, 20].map(days => [days, (totalChanges[days] || 0) - activeChanges[days]])),
    top1Concentration: totalLots > 0 ? (holderLots[0] || 0) / totalLots * 100 : null,
    top3Concentration: totalLots > 0 ? sum(holderLots.slice(0, 3)) / totalLots * 100 : null,
    laggingExposure: totalLots > 0 ? laggingLots / totalLots * 100 : 0,
    topHolders
  };
}

function createLookup(rows, codeKeys) {
  const lookup = new Map();
  for (const row of rows || []) {
    const code = codeKeys.map(key => row[key]).find(Boolean);
    if (code) lookup.set(String(code).trim(), row);
  }
  return lookup;
}

function flowLabel(record) {
  const f = record.etf;
  if (f.flowPct[5] > 0 && f.flowPct[10] > 0 && f.activeChanges[5] >= 0) return '5/10日延續加碼';
  if (f.flowPct[20] > 0 && f.flowPct[5] < 0) return '20日仍正、5日已轉減';
  if (f.flowPct[5] < 0 && f.flowPct[10] < 0) return '短中期同步減碼';
  return '籌碼分歧';
}

function idealRsiScore(value) {
  if (!Number.isFinite(value)) return 0.35;
  if (value >= 48 && value <= 66) return 1;
  if (value >= 42 && value < 48) return 0.75;
  if (value > 66 && value <= 72) return 0.65;
  if (value >= 35 && value < 42) return 0.45;
  if (value > 72 && value <= 78) return 0.25;
  return 0.1;
}

function inRangeScore(value, idealLow, idealHigh, outerLow, outerHigh) {
  if (!Number.isFinite(value)) return 0.35;
  if (value >= idealLow && value <= idealHigh) return 1;
  if (value < outerLow || value > outerHigh) return 0;
  if (value < idealLow) return (value - outerLow) / (idealLow - outerLow);
  return (outerHigh - value) / (outerHigh - idealHigh);
}

function kdTimingScore(technical) {
  if (!technical || !Number.isFinite(technical.kdK) || !Number.isFinite(technical.kdD)) return 0.35;
  const { kdK: k, kdD: d } = technical;
  const trendConfirmed = technical.close >= technical.ema20 && technical.ma20Slope5 > 0;
  if (technical.kdDeathCrossRecent && Math.max(k, d) >= 80) return 0.05;
  if (technical.kdGoldenCrossRecent && k >= 20 && k <= 70 && trendConfirmed) return 1;
  if (k > d && technical.kdDDelta > 0 && k <= 80 && trendConfirmed) return 0.78;
  if (k > 80 && k > d && trendConfirmed) return 0.5;
  if (k < 20 && !technical.kdGoldenCrossRecent) return 0.2;
  if (technical.kdGoldenCrossRecent && k < 20) return 0.55;
  return 0.45;
}

function scoreRecords(records) {
  const fields = ['revenueYoy', 'revenueYtdYoy', 'operatingMargin', 'debtRatio', 'currentRatio', 'earningsYield', 'pe', 'pb', 'yield',
    'etfFlow5', 'etfFlow10', 'etfFlow20', 'activeFlow5', 'foreignNetValue5',
    'trustValue5', 'trustValue10', 'dealerValue5',
    'foreignHoldingD5Value', 'foreignHoldingD10Value', 'dailyValue'];
  const bySector = new Map();
  for (const record of records) {
    if (!bySector.has(record.sector)) bySector.set(record.sector, []);
    bySector.get(record.sector).push(record);
  }
  const globalValues = Object.fromEntries(fields.map(field => [field, records.map(record => record.metrics[field]).filter(Number.isFinite)]));
  const sectorValues = new Map();
  for (const [sector, rows] of bySector) {
    sectorValues.set(sector, Object.fromEntries(fields.map(field => [field, rows.map(row => row.metrics[field]).filter(Number.isFinite)])));
  }
  const p = (record, field, higher = true, sector = false) => percentile(
    sector ? sectorValues.get(record.sector)[field] : globalValues[field], record.metrics[field], higher
  );

  for (const record of records) {
    const m = record.metrics;
    const t = record.technical;
    const financial = isFinancial(record.industry);
    const growthConsistency = Number.isFinite(m.revenueYoy) && Number.isFinite(m.revenueYtdYoy)
      ? (m.revenueYoy > 0 && m.revenueYtdYoy > 0 ? 1 : (m.revenueYoy > 0 || m.revenueYtdYoy > 0 ? 0.55 : 0.1)) : 0.35;
    const operatingQuality = Number.isFinite(m.operatingMargin)
      ? p(record, 'operatingMargin', true, true)
      : (financial ? (m.eps > 0 ? 0.65 : 0.2) : 0.35);
    const balanceQuality = financial
      ? (m.eps > 0 ? 0.6 : 0.2)
      : 0.62 * p(record, 'debtRatio', false, true) + 0.38 * p(record, 'currentRatio', true, true);
    const fundamental = WEIGHTS.fundamentals * (
      0.24 * p(record, 'revenueYoy', true, true) +
      0.24 * p(record, 'revenueYtdYoy', true, true) +
      0.17 * operatingQuality +
      0.13 * balanceQuality +
      0.10 * p(record, 'earningsYield', true, true) +
      0.12 * growthConsistency
    );
    const valuation = WEIGHTS.valuation * (
      0.47 * p(record, 'pe', false, true) +
      0.27 * p(record, 'pb', false, true) +
      0.26 * p(record, 'yield', true, true)
    );
    const acceleration = Number.isFinite(m.etfFlow5) && Number.isFinite(m.etfFlow10)
      ? clamp(0.5 + (m.etfFlow5 - m.etfFlow10 / 2) / 8, 0, 1) : 0.35;
    const activeBreadth = record.etf.activeBreadth[5];
    const breadthScore = activeBreadth.buyers + activeBreadth.sellers > 0
      ? activeBreadth.buyers / (activeBreadth.buyers + activeBreadth.sellers) : 0.5;
    const trustConsistency = Number.isFinite(m.trustConsistency10) ? m.trustConsistency10 : 0.5;
    const ownership = WEIGHTS.ownership * (
      0.14 * p(record, 'etfFlow5', true) +
      0.10 * p(record, 'etfFlow10', true) +
      0.06 * p(record, 'etfFlow20', true) +
      0.04 * acceleration +
      0.10 * p(record, 'activeFlow5', true) +
      0.06 * breadthScore +
      0.08 * p(record, 'foreignNetValue5', true) +
      0.10 * p(record, 'foreignHoldingD5Value', true) +
      0.08 * p(record, 'foreignHoldingD10Value', true) +
      0.10 * p(record, 'trustValue5', true) +
      0.05 * p(record, 'trustValue10', true) +
      0.04 * trustConsistency +
      0.05 * p(record, 'dealerValue5', true)
    );
    const trendScore = t ? (
      (t.close > t.ema60 ? 0.3 : 0) +
      (t.close > t.ema20 ? 0.2 : 0) +
      (t.ema5 > t.ema20 ? 0.15 : 0) +
      (t.ma20Slope5 > 0 ? 0.2 : 0) +
      (t.ema60Slope > 0 ? 0.15 : 0)
    ) : 0.35;
    const macdScore = t ? clamp(0.5 + (t.macdHistogramDelta || 0) / Math.max(Math.abs(t.close) * 0.002, 0.01), 0, 1) : 0.35;
    const extensionScore = t ? inRangeScore(t.distanceEma20, -2, 5, -10, 13) : 0.35;
    const technical = WEIGHTS.technical * (
      0.40 * trendScore +
      0.20 * idealRsiScore(t?.rsi14) +
      (2 / 15) * macdScore +
      0.10 * kdTimingScore(t) +
      (1 / 6) * extensionScore
    );

    const revenueAcceleration = Number.isFinite(m.revenueYoy) && Number.isFinite(m.revenueYtdYoy)
      ? clamp(0.5 + (m.revenueYoy - m.revenueYtdYoy) / 80, 0, 1) : 0.45;
    const supportiveBuyback = record.events.buyback && /維護公司信用|股東權益/.test(record.events.buyback.why || '');
    const catalystEvent = supportiveBuyback ? 0.9 : (record.events.buyback ? 0.42 : (record.events.disposal ? 0.15 : 0.5));
    const catalyst = WEIGHTS.catalyst * (0.45 * revenueAcceleration + 0.35 * catalystEvent + 0.20 * growthConsistency);

    const volatilityScore = t ? inRangeScore(t.dailyVolatility20, 0, 2.5, 0, 7) : 0.35;
    const concentrationScore = Number.isFinite(record.etf.top1Concentration)
      ? clamp(1 - Math.max(0, record.etf.top1Concentration - 35) / 65, 0, 1) : 0.35;
    const eventRiskScore = record.events.disposal ? 0.1 : (record.events.exDividendSoon ? 0.55 : 0.85);
    const dataQualityScore = record.confidence / 100;
    const risk = WEIGHTS.risk * (
      0.30 * p(record, 'dailyValue', true) +
      0.25 * volatilityScore +
      0.15 * concentrationScore +
      0.15 * eventRiskScore +
      0.15 * dataQualityScore
    );
    record.components = {
      fundamentals: round(fundamental, 1), valuation: round(valuation, 1), ownership: round(ownership, 1),
      technical: round(technical, 1), catalyst: round(catalyst, 1), risk: round(risk, 1)
    };
    record.rawScore = round(sum(Object.values(record.components)), 1);
    record.adjustedScore = round(record.rawScore * (0.88 + 0.12 * record.confidence / 100), 1);
    record.flowState = flowLabel(record);
    classifyRecord(record);
  }
}

function classifyRecord(record) {
  const m = record.metrics;
  const t = record.technical;
  const reasons = [];
  let action = '觀察';
  let bucket = 'C';
  if (record.confidence < 65) reasons.push('資料覆蓋不足');
  if (!Number.isFinite(m.dailyValue) || m.dailyValue < 50_000_000) reasons.push('單日成交金額低於5,000萬元');
  if (record.events.disposal) reasons.push('處置或交易限制風險');
  if (Number.isFinite(m.revenueYoy) && Number.isFinite(m.revenueYtdYoy) && m.revenueYoy < -10 && m.revenueYtdYoy < 0) reasons.push('營收動能同步衰退');
  if (Number.isFinite(m.revenueYoy) && Number.isFinite(m.revenueYtdYoy) && m.revenueYoy < 10 && m.revenueYtdYoy <= 0) reasons.push('累計營收負成長且當月改善不足');
  if (t && t.close < t.ema60 && t.ma20Slope5 <= 0) reasons.push('中期趨勢仍向下');
  if (record.etf.flowPct[5] < 0 && record.etf.flowPct[10] < 0) reasons.push('ETF短中期同步減碼');
  if (record.etf.flowPct[20] > 0 && record.etf.flowPct[5] < 0) reasons.push('20日累積後5日轉為調節');
  if (record.etf.totalChanges[1] < 0 && record.etf.totalChanges[3] < 0) reasons.push('ETF 1/3日已轉為減碼');
  if (record.etf.activeChanges[5] < 0 && record.etf.activeBreadth[5].sellers >= record.etf.activeBreadth[5].buyers) reasons.push('主動ETF 5日轉為減碼');
  const trustSellMaterial = m.trust5 < 0 && m.trust10 < 0 && m.trustNegativeDays5 >= 3 && m.trustValue5 <= -10_000_000;
  const trustRecentReversal = m.trust20 > 0 && m.trust5 < 0 && m.trustNegativeDays5 >= 3 && m.trustValue5 <= -10_000_000;
  if (trustSellMaterial) reasons.push('投信5/10日持續且具金額意義的賣超');
  else if (trustRecentReversal) reasons.push('投信20日買超後近5日轉賣');
  const foreign = record.foreignHolding;
  const foreignHoldingDown = foreign?.trendReliable && foreign.d5Lots < 0 && foreign.d10Lots < 0;
  if (foreignHoldingDown && m.foreignNet5 < 0) reasons.push('外資持股5/10日下降，且外資5日賣超');
  else if (foreignHoldingDown && record.etf.flowPct[5] > 0) reasons.push('ETF加碼，但外資持股5/10日同步下降');
  if (!foreign?.trendReliable) reasons.push('外資持股趨勢資料不足或期間有非市場異動');
  if (t && t.ma20Slope5 <= 0) reasons.push('20日趨勢尚未上彎');
  const analysisPrice = record.live?.analysisPrice ?? t?.close;
  if (t && Number.isFinite(analysisPrice) && analysisPrice < t.ema20) reasons.push('當下除權息調整價未守20日EMA');
  const currentDistance = t && Number.isFinite(analysisPrice) ? pctChange(analysisPrice, t.ema20) : t?.distanceEma20;
  const liveChangeFromClose = t && Number.isFinite(analysisPrice) ? pctChange(analysisPrice, t.close) : null;
  if (t) t.currentDistanceEma20 = currentDistance;
  if (t && (t.rsi14 > 76 || currentDistance > 12 || t.return5 > 20)) reasons.push('短線過熱或乖離過大');
  if (t && !Number.isFinite(t.kdK)) reasons.push('KD高低收資料不足');
  if (t && t.kdDeathCrossRecent && Math.max(t.kdK, t.kdD) >= 80) reasons.push('KD高檔死亡交叉，等待動能確認');
  if (t && t.dailyVolatility20 > 4.5 && t.return5 > 10) reasons.push('高波動且5日漲幅過大');
  if (t && liveChangeFromClose < -5 && t.return5 > 10) reasons.push('強勢上漲後盤中急跌反轉');
  if (record.events.daysToExDividend > 0 && record.events.daysToExDividend <= 2) reasons.push('2日內除權息，等待價格重置');
  const signalRobust = (
    record.etf.activeBreadth[5].buyers >= 2 && m.activeEtfD5Value >= 30_000_000
  ) || (
    record.etf.etfCount >= 10 && m.etfD5Value >= 80_000_000 && record.etf.activeChanges[5] >= 0
  );
  record.signalRobust = signalRobust;
  if (record.adjustedScore >= 67 && record.etf.flowPct[5] > 0 && record.etf.flowPct[10] >= 0 && !signalRobust) reasons.push('ETF加碼金額或跨基金共識不足');
  if (Number.isFinite(m.pe) && m.pe > 80 && Number.isFinite(m.revenueYoy) && m.revenueYoy < 25) reasons.push('估值高且成長不足以支撐');

  const hardReject = reasons.some(reason => /資料覆蓋|成交金額|處置|營收動能/.test(reason));
  const trendReject = reasons.some(reason => /趨勢仍向下|同步減碼/.test(reason));
  const timingReject = reasons.some(reason => /改善不足|調節|1\/3日|主動ETF|投信|外資持股|尚未上彎|未守20日|過熱|KD|高波動|急跌反轉|除權息|共識不足|估值高/.test(reason));
  const foreignAligned = foreign?.trendReliable && foreign.d5Lots >= 0 && foreign.d10Lots >= 0 && m.foreignNet5 >= 0;
  const trustAligned = !trustSellMaterial && !trustRecentReversal;
  if (hardReject) {
    action = '排除';
    bucket = 'D';
  } else if (trendReject) {
    action = '等待轉強';
    bucket = 'C';
  } else if (timingReject) {
    action = '等回測或確認';
    bucket = 'B';
  } else if (record.adjustedScore >= 67 && analysisPrice >= t?.ema20 && t?.ma20Slope5 > 0 && t?.ema60Slope >= 0 && record.etf.flowPct[5] > 0 && record.etf.flowPct[10] >= 0 && record.etf.activeChanges[5] >= 0 && foreignAligned && trustAligned) {
    action = '可分批布局';
    bucket = 'A';
  } else if (record.adjustedScore >= 60) {
    action = '列入觀察';
    bucket = 'B';
  }
  record.action = action;
  record.bucket = bucket;
  record.rejectionReasons = reasons;
  Object.assign(record, positionDecision(record));
}

function positionDecision(record) {
  const m = record.metrics;
  const t = record.technical;
  const price = record.live?.analysisPrice ?? t?.close;
  const foreign = record.foreignHolding;
  const technicalBreak = Boolean(t && Number.isFinite(price) && price < t.ema60 && t.ma20Slope5 <= 0);
  const etfBreak = record.etf.flowPct[5] < 0 && record.etf.flowPct[10] < 0;
  const foreignBreak = Boolean(foreign?.trendReliable && foreign.d5Lots < 0 && foreign.d10Lots < 0 && m.foreignNet5 < 0);
  const trustBreak = m.trust5 < 0 && m.trust10 < 0 && m.trustNegativeDays5 >= 3 && m.trustValue5 <= -10_000_000;
  const kdRisk = Boolean(t?.kdDeathCrossRecent && Math.max(t.kdK, t.kdD) >= 80);
  const fundamentalBreak = Number.isFinite(m.revenueYoy) && Number.isFinite(m.revenueYtdYoy) && m.revenueYoy < -10 && m.revenueYtdYoy < 0;
  const eventBreak = Boolean(record.events.disposal);
  const sellSignals = [];
  if (technicalBreak) sellSignals.push('價格跌破60日EMA且20日趨勢向下');
  if (etfBreak) sellSignals.push('ETF 5/10日同步減碼');
  if (foreignBreak) sellSignals.push('外資持股5/10日下降且外資5日賣超');
  if (trustBreak) sellSignals.push('投信5/10日持續且具金額意義地賣超');
  if (kdRisk) sellSignals.push('KD高檔死亡交叉（僅屬時機警示）');
  if (fundamentalBreak) sellSignals.push('單月與累計營收同步明顯衰退');
  if (eventBreak) sellSignals.push('處置或交易限制事件');

  const entryAction = record.bucket === 'A' ? '可開始承接'
    : record.bucket === 'B' ? '等待確認'
      : record.bucket === 'C' ? '暫不承接' : '不建立部位';
  const recoveryPrice = t ? Math.max(t.ema20, t.ema60) : null;
  const defensePrice = t?.ema60 ?? null;
  const ownershipBreaks = [etfBreak, foreignBreak, trustBreak].filter(Boolean).length;

  let holdingAction = '續抱觀察';
  let holdingState = 'hold';
  let holdingPlan = '已有部位不因排名變動直接賣出；持續檢查基本面、法人籌碼與趨勢。';
  if (eventBreak || fundamentalBreak) {
    holdingAction = '優先出脫';
    holdingState = 'exit';
    holdingPlan = `已有部位應優先降低曝險；目前觸發「${sellSignals[0]}」。待事件解除或基本面重新確認後再評估。`;
  } else if ((technicalBreak && (etfBreak || foreignBreak || trustBreak)) || ownershipBreaks >= 2) {
    holdingAction = '停止加碼／開始減碼';
    holdingState = 'trim';
    holdingPlan = `已有部位先停止加碼並分批降低部位。若兩個交易日內仍未站回 ${fmt(recoveryPrice, 2)}，或新增ETF／外資轉弱訊號，維持減碼；站回後仍須等賣超收斂再重新評估。`;
  } else if (sellSignals.length > 0 || record.bucket === 'C' || record.bucket === 'D') {
    holdingAction = '暫停加碼／守防線';
    holdingState = 'protect';
    holdingPlan = `已有部位暫停加碼，以60日EMA約 ${fmt(defensePrice, 2)} 為趨勢防守參考；若收盤持續跌破且籌碼再惡化，轉為減碼。`;
  } else if (record.bucket === 'A') {
    holdingAction = '續抱／回測可加碼';
    holdingState = 'add';
    holdingPlan = `已有部位可續抱；回測20日EMA約 ${fmt(t?.ema20, 2)} 且ETF、外資與投信未轉弱時，才考慮下一批。`;
  } else {
    holdingPlan = `已有部位可續抱觀察，但暫不追價；若跌破60日EMA約 ${fmt(defensePrice, 2)} 且法人籌碼轉弱，再改為減碼。`;
  }

  return {
    entryAction,
    holdingAction,
    holdingState,
    holdingPlan,
    holdingSignals: sellSignals,
    defensePrice: round(defensePrice, 2),
    recoveryPrice: round(recoveryPrice, 2)
  };
}

function eventFeatures(events, code, asOfIso) {
  const asOf = new Date(`${asOfIso}T00:00:00+08:00`);
  const futureLimit = new Date(asOf.getTime() + 30 * 86400000);
  const xd = (events.xd || []).filter(row => row.c === code).sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const nextXd = xd.find(row => {
    const date = new Date(`${String(row.d).replace(/\//g, '-')}T00:00:00+08:00`);
    return date >= asOf && date <= futureLimit;
  });
  const nextXdDate = nextXd ? new Date(`${String(nextXd.d).replace(/\//g, '-')}T00:00:00+08:00`) : null;
  const disposal = (events.dispose || []).find(row => row.c === code && new Date(`${String(row.t || row.f).replace(/\//g, '-')}T00:00:00+08:00`) >= asOf);
  const buyback = (events.buyback || []).find(row => row.c === code && row.st === '進行中');
  const insiderLots30 = sum((events.transfer || []).filter(row => row.c === code && new Date(`${String(row.d).replace(/\//g, '-')}T00:00:00+08:00`) >= new Date(asOf.getTime() - 30 * 86400000)).map(row => number(row.lots)));
  return {
    exDividendSoon: Boolean(nextXd),
    nextExDividend: nextXd || null,
    daysToExDividend: nextXdDate ? Math.round((nextXdDate - asOf) / 86400000) : null,
    todayCashDividend: String(nextXd?.d || '').replace(/\//g, '-') === TODAY ? number(nextXd.cash) || 0 : 0,
    disposal: disposal || null,
    buyback: buyback || null,
    insiderTransferLots30: insiderLots30
  };
}

function currentQuotePrice(row) {
  const direct = number(row?.z) ?? number(row?.pz);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const asks = String(row?.a || '').split('_').map(number).filter(value => Number.isFinite(value) && value > 0);
  const bids = String(row?.b || '').split('_').map(number).filter(value => Number.isFinite(value) && value > 0);
  if (asks.length && bids.length) return (asks[0] + bids[0]) / 2;
  return asks[0] ?? bids[0] ?? null;
}

async function fetchMisQuotes(records) {
  const requests = [];
  for (let i = 0; i < records.length; i += 70) {
    const chunk = records.slice(i, i + 70);
    const exCh = chunk.map(record => `tse_${record.code}.tw`).join('|');
    requests.push(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now() + i}`);
  }
  const payloads = await mapLimit(requests, 3, url => fetchJson(url));
  const quotes = new Map();
  for (const payload of payloads) {
    for (const row of payload?.msgArray || []) quotes.set(String(row.c), row);
  }
  return quotes;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function yahooTechnicalUrl(code) {
  return `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}.TW/technical-analysis`;
}

function fmt(value, digits = 1, fallback = '—') {
  return Number.isFinite(value) ? value.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : fallback;
}

function signed(value, digits = 1, suffix = '') {
  return Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value, digits)}${suffix}` : '—';
}

function money(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100_000_000) return `${fmt(value / 100_000_000, 1)} 億`;
  if (Math.abs(value) >= 10_000) return `${fmt(value / 10_000, 0)} 萬`;
  return fmt(value, 0);
}

function thesisText(record) {
  const m = record.metrics;
  const t = record.technical;
  const positives = [];
  if (m.revenueYoy > 15 && m.revenueYtdYoy > 10) positives.push(`月營收年增 ${fmt(m.revenueYoy)}%，累計年增 ${fmt(m.revenueYtdYoy)}%`);
  if (record.etf.flowPct[5] > 0 && record.etf.flowPct[10] > 0) positives.push(`ETF 5/10日持股同步增加，5日 ${signed(record.etf.totalChanges[5], 0, ' 張')}`);
  if (record.etf.activeChanges[5] > 0) positives.push(`主動ETF 5日增加 ${signed(record.etf.activeChanges[5], 0, ' 張')}`);
  if (record.foreignHolding?.trendReliable && record.foreignHolding.d5Lots > 0 && record.foreignHolding.d10Lots > 0) {
    positives.push(`外資實際持股5/10日同步增加，5日 ${signed(record.foreignHolding.d5Lots, 0, ' 張')}`);
  }
  if (m.foreignNet5 > 0) positives.push(`外資5日買超 ${signed(m.foreignNet5, 0, ' 張')}`);
  if (m.trust5 > 0 && m.trustPositiveDays5 >= 3 && m.trustValue5 >= 10_000_000) positives.push(`投信5日買超 ${signed(m.trust5, 0, ' 張')}，買超${m.trustPositiveDays5}日`);
  if (t?.close > t?.ema20 && t?.close > t?.ema60) positives.push('價格位於20與60日EMA之上');
  return positives.slice(0, 4).join('；') || '目前沒有形成足夠強的多因子共振。';
}

function pricedInText(record) {
  const pe = record.metrics.pe;
  const growth = record.metrics.revenueYtdYoy;
  if (!Number.isFinite(pe)) return '缺少可比本益比，無法判定市場已反映程度。';
  if (pe >= 35) return `本益比約 ${fmt(pe)} 倍，市場已給予明顯成長溢價，後續若成長失速，估值壓縮風險較高。`;
  if (pe <= 20 && growth > 20) return `本益比約 ${fmt(pe)} 倍，相對目前累計營收成長 ${fmt(growth)}% 並未呈現極端溢價，但可能已折價反映景氣循環或獲利率疑慮。`;
  return `本益比約 ${fmt(pe)} 倍，估值已反映部分成長；是否仍有空間取決於營收能否轉成可持續獲利。`;
}

function possibleUnderestimateText(record) {
  const m = record.metrics;
  const active = record.etf.activeBreadth[5];
  const foreignAligned = record.foreignHolding?.trendReliable && record.foreignHolding.d5Lots > 0 && record.foreignHolding.d10Lots > 0;
  if (m.revenueYtdYoy > 20 && record.etf.activeChanges[5] > 0 && active.buyers >= 2 && foreignAligned) {
    return `營收成長仍在，${active.buyers} 檔主動ETF近5日共同加碼，外資實際持股5/10日也同步增加，但價格尚未明顯過熱；這可能是市場仍未完全反映的部分。`;
  }
  return '目前主要是趨勢或籌碼候選，尚不足以判定市場明顯低估。';
}

function entryPlanText(record) {
  const t = record.technical;
  if (!t) return '缺少足夠價格資料，暫不規劃布局。';
  if (record.bucket === 'A') {
    return `採2至3批而非一次買足；20日EMA約 ${fmt(t.ema20, 2)}，較合理的觀察承接區約 ${fmt(t.ema20 * 0.98, 2)} 至 ${fmt(t.ema20 * 1.02, 2)}。只有ETF與外資持股未轉弱時才考慮下一批。`;
  }
  const firstRisk = record.rejectionReasons[0] || '尚未形成足夠多因子共識';
  let confirmation = `價格守住20日EMA約 ${fmt(t.ema20, 2)}，且ETF與外資持股5/10日維持非負`;
  if (/尚未上彎/.test(firstRisk)) confirmation = `20日均線轉為上彎，且價格連續守住20日EMA約 ${fmt(t.ema20, 2)}`;
  if (/未守20日EMA/.test(firstRisk)) confirmation = `收盤重新站回20日EMA約 ${fmt(t.ema20, 2)}，並至少再維持一個交易日`;
  if (/除權息/.test(firstRisk)) confirmation = `除權息後完成價格重置，再確認調整後價格守住20日EMA約 ${fmt(t.ema20, 2)}`;
  if (/外資持股/.test(firstRisk)) confirmation = '外資持股5日不再下降，且外資5日買賣超轉為非負';
  if (/投信/.test(firstRisk)) confirmation = '投信5日不再持續賣超，且10日累積買賣超回到非負';
  return `目前先不追價。等待「${firstRisk}」解除；具體確認方式是${confirmation}，再評估是否分批。`;
}

function riskActionText(record) {
  const t = record.technical;
  const rules = [];
  if (t) rules.push(`收盤跌破60日EMA約 ${fmt(t.ema60)}，且20日線轉下`);
  rules.push('ETF 5日與10日同步減碼');
  rules.push('外資實際持股5日與10日同步下降，且外資5日賣超');
  rules.push('投信5日與10日持續賣超，且賣超金額具有影響性');
  if (Number.isFinite(record.metrics.revenueYoy)) rules.push('月營收與累計營收同時轉為負成長');
  return rules.join('；');
}

function selectTopThree(records) {
  const eligible = records.filter(record => record.bucket === 'A').sort((a, b) => b.adjustedScore - a.adjustedScore || b.confidence - a.confidence);
  const selected = [];
  const sectorCounts = new Map();
  for (const record of eligible) {
    const count = sectorCounts.get(record.sector) || 0;
    if (count >= 2) continue;
    selected.push(record);
    sectorCounts.set(record.sector, count + 1);
    if (selected.length === 3) break;
  }
  if (selected.length < 3) {
    const watchlist = records.filter(record => record.bucket === 'B' && record.signalRobust && record.adjustedScore >= 65)
      .sort((a, b) => {
        const penalty = record => sum(record.rejectionReasons.map(reason => /2日內除權息/.test(reason) ? 0.5 : (/尚未上彎|投信/.test(reason) ? 2 : 3)));
        return (b.adjustedScore - penalty(b)) - (a.adjustedScore - penalty(a));
      });
    for (const record of watchlist) {
      if (selected.some(row => row.code === record.code)) continue;
      selected.push(record);
      if (selected.length === 3) break;
    }
  }
  return selected;
}

function recordForOutput(record, rank) {
  return {
    rank,
    code: record.code,
    name: record.name,
    market: record.market,
    industry: record.industry,
    sector: record.sector,
    action: record.action,
    bucket: record.bucket,
    entryAction: record.entryAction,
    holdingAction: record.holdingAction,
    holdingState: record.holdingState,
    holdingPlan: record.holdingPlan,
    holdingSignals: record.holdingSignals,
    defensePrice: record.defensePrice,
    recoveryPrice: record.recoveryPrice,
    score: record.adjustedScore,
    rawScore: record.rawScore,
    confidence: record.confidence,
    closeDate: record.closeDate,
    close: round(record.technical?.close ?? record.metrics.price, 2),
    liveDate: record.live?.date || null,
    liveTime: record.live?.time || null,
    livePrice: round(record.live?.price, 2),
    analysisPrice: round(record.live?.analysisPrice, 2),
    components: record.components,
    fundamentals: {
      revenueYoy: round(record.metrics.revenueYoy, 2),
      revenueYtdYoy: round(record.metrics.revenueYtdYoy, 2),
      operatingMargin: round(record.metrics.operatingMargin, 2),
      eps: round(record.metrics.eps, 2),
      debtRatio: round(record.metrics.debtRatio, 2),
      currentRatio: round(record.metrics.currentRatio, 2)
    },
    valuation: { pe: round(record.metrics.pe, 2), pb: round(record.metrics.pb, 2), yield: round(record.metrics.yield, 2) },
    etf: {
      etfCount: record.etf.etfCount,
      totalLots: record.etf.totalLots,
      d1: record.etf.totalChanges[1], d3: record.etf.totalChanges[3], d5: record.etf.totalChanges[5],
      d10: record.etf.totalChanges[10], d20: record.etf.totalChanges[20],
      activeD5: record.etf.activeChanges[5], activeD10: record.etf.activeChanges[10],
      activeBuyers5: record.etf.activeBreadth[5].buyers, activeSellers5: record.etf.activeBreadth[5].sellers,
      d5Value: round(record.metrics.etfD5Value, 0), activeD5Value: round(record.metrics.activeEtfD5Value, 0),
      laggingExposure: round(record.etf.laggingExposure, 2), topHolders: record.etf.topHolders
    },
    institution: {
      d1: record.metrics.institution1, d5: record.metrics.institution5,
      d10: record.metrics.institution10, d20: record.metrics.institution20
    },
    investmentTrust: {
      netBuy1: record.metrics.trust1, netBuy5: record.metrics.trust5,
      netBuy10: record.metrics.trust10, netBuy20: record.metrics.trust20,
      buyDays5: record.metrics.trustPositiveDays5, buyDays10: record.metrics.trustPositiveDays10,
      sellDays5: record.metrics.trustNegativeDays5, sellDays10: record.metrics.trustNegativeDays10,
      estimatedValue5: round(record.metrics.trustValue5, 0),
      estimatedValue10: round(record.metrics.trustValue10, 0)
    },
    dealer: {
      netBuy1: record.metrics.dealer1, netBuy5: record.metrics.dealer5,
      netBuy10: record.metrics.dealer10, netBuy20: record.metrics.dealer20
    },
    foreign: {
      date: record.foreignHolding?.date || null,
      heldLots: round(record.foreignHolding?.heldLots, 0),
      holdingRatio: round(record.foreignHolding?.ratio, 2),
      holdingD1: round(record.foreignHolding?.d1Lots, 0),
      holdingD5: round(record.foreignHolding?.d5Lots, 0),
      holdingD10: round(record.foreignHolding?.d10Lots, 0),
      holdingD20: round(record.foreignHolding?.d20Lots, 0),
      ratioD5Pp: round(record.foreignHolding?.d5RatioPp, 2),
      ratioD10Pp: round(record.foreignHolding?.d10RatioPp, 2),
      netBuy1: record.metrics.foreignNet1,
      netBuy5: record.metrics.foreignNet5,
      netBuy10: record.metrics.foreignNet10,
      netBuy20: record.metrics.foreignNet20,
      trendReliable: Boolean(record.foreignHolding?.trendReliable),
      structuralChanges: record.foreignHolding?.structuralChanges || []
    },
    technical: Object.fromEntries(Object.entries(record.technical || {}).map(([key, value]) => [
      key, typeof value === 'boolean' ? value : round(value, 2)
    ])),
    riskInputs: {
      dailyValue: round(record.metrics.dailyValue, 0),
      dailyVolatility20: round(record.technical?.dailyVolatility20, 2),
      etfTop1Concentration: round(record.etf.top1Concentration, 2),
      etfLaggingExposure: round(record.etf.laggingExposure, 2),
      dataConfidence: record.confidence
    },
    events: record.events,
    eventsLayer: (record.eventsLayer || []).map(ev => ({
      eventType: ev.eventType, title: ev.title, publishTime: ev.publishTime,
      sourceUrl: ev.sourceUrl, source: ev.source, confirmed: ev.confirmed,
      dateKind: ev.dateKind || 'published', sourceStartDate: ev.sourceStartDate || null,
      sourceEndDate: ev.sourceEndDate || null,
      aiSummary: ev.aiSummary || null, importance: ev.importance || null
    })),
    flowState: record.flowState,
    signalRobust: record.signalRobust,
    rejectionReasons: record.rejectionReasons,
    thesis: thesisText(record),
    pricedIn: pricedInText(record),
    possibleUnderestimate: possibleUnderestimateText(record),
    entryPlan: entryPlanText(record),
    riskAction: riskActionText(record)
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows) {
  const columns = [
    ['排名', 'rank'], ['代號', 'code'], ['名稱', 'name'], ['市場', 'market'], ['產業', 'industry'],
    ['新部位建議', 'entryAction'], ['既有部位建議', 'holdingAction'], ['既有部位說明', 'holdingPlan'],
    ['分數', 'score'], ['信心度', 'confidence'], ['收盤價', 'close'], ['即時價', 'livePrice'],
    ['營收YoY%', 'fundamentals.revenueYoy'], ['累計營收YoY%', 'fundamentals.revenueYtdYoy'], ['營益率%', 'fundamentals.operatingMargin'],
    ['負債比%', 'fundamentals.debtRatio'], ['流動比率%', 'fundamentals.currentRatio'],
    ['EPS', 'fundamentals.eps'], ['本益比', 'valuation.pe'], ['股價淨值比', 'valuation.pb'], ['殖利率%', 'valuation.yield'],
    ['ETF家數', 'etf.etfCount'], ['ETF_1日增減張', 'etf.d1'], ['ETF_3日增減張', 'etf.d3'], ['ETF_5日增減張', 'etf.d5'],
    ['ETF_10日增減張', 'etf.d10'], ['ETF_20日增減張', 'etf.d20'], ['主動ETF_5日增減張', 'etf.activeD5'],
    ['法人1日張', 'institution.d1'], ['法人5日張', 'institution.d5'], ['法人10日張', 'institution.d10'], ['法人20日張', 'institution.d20'],
    ['投信買賣超1日張', 'investmentTrust.netBuy1'], ['投信買賣超5日張', 'investmentTrust.netBuy5'],
    ['投信買賣超10日張', 'investmentTrust.netBuy10'], ['投信買賣超20日張', 'investmentTrust.netBuy20'],
    ['投信5日買超天數', 'investmentTrust.buyDays5'], ['投信5日賣超天數', 'investmentTrust.sellDays5'],
    ['投信5日估算金額', 'investmentTrust.estimatedValue5'],
    ['自營商買賣超5日張', 'dealer.netBuy5'], ['自營商買賣超10日張', 'dealer.netBuy10'],
    ['外資持股比率%', 'foreign.holdingRatio'], ['外資持股1日增減張', 'foreign.holdingD1'], ['外資持股5日增減張', 'foreign.holdingD5'],
    ['外資持股10日增減張', 'foreign.holdingD10'], ['外資持股20日增減張', 'foreign.holdingD20'],
    ['外資買賣超1日張', 'foreign.netBuy1'], ['外資買賣超5日張', 'foreign.netBuy5'], ['外資買賣超10日張', 'foreign.netBuy10'], ['外資買賣超20日張', 'foreign.netBuy20'],
    ['RSI14', 'technical.rsi14'], ['KD-K', 'technical.kdK'], ['KD-D', 'technical.kdD'], ['KD-J', 'technical.kdJ'],
    ['KD近3日黃金交叉', 'technical.kdGoldenCrossRecent'], ['KD近3日死亡交叉', 'technical.kdDeathCrossRecent'],
    ['距20EMA%', 'technical.distanceEma20'], ['5日報酬%', 'technical.return5'], ['淘汰原因', 'rejectionReasons']
  ];
  const get = (row, dotted) => dotted.split('.').reduce((value, key) => value?.[key], row);
  const lines = [columns.map(([label]) => csvEscape(label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map(([, key]) => {
      const value = get(row, key);
      return csvEscape(Array.isArray(value) ? value.join('；') : value);
    }).join(','));
  }
  return `\ufeff${lines.join('\n')}`;
}

function buildHtml(report) {
  const scoreLink = row => `<a class="score-link" href="#score-${escapeHtml(row.code)}" data-score-code="${escapeHtml(row.code)}" title="查看 ${escapeHtml(row.name)} 的評分明細、判斷資料與來源">${fmt(row.score)}</a>`;
  const topCards = report.topThree.map((row, index) => `
    <article class="pick">
      <div class="pick-head"><span class="rank">${index + 1}</span><div><h3><a class="stock-link" href="${yahooTechnicalUrl(row.code)}" target="_blank" rel="noreferrer" title="開啟 ${escapeHtml(row.name)} Yahoo技術分析">${escapeHtml(row.code)} ${escapeHtml(row.name)}</a></h3><p>${escapeHtml(row.industry)}</p></div><strong>${scoreLink(row)}</strong></div>
      <div class="decision-strip"><span><small>建立新部位</small><b>${escapeHtml(row.entryAction)}</b></span><span class="state-${escapeHtml(row.holdingState)}"><small>已經持有</small><b>${escapeHtml(row.holdingAction)}</b></span></div>
      <div class="metrics"><span>即時價<b>${fmt(row.livePrice ?? row.close, 2)}</b></span><span>信心度<b>${fmt(row.confidence, 0)}%</b></span><span>本益比<b>${fmt(row.valuation.pe)}</b></span><span>RSI／K／D<b>${fmt(row.technical.rsi14, 0)}／${fmt(row.technical.kdK, 0)}／${fmt(row.technical.kdD, 0)}</b></span></div>
      <label class="position-toggle"><input type="checkbox" data-position-toggle="${escapeHtml(row.code)}"> <span>我已開始布局，持續追蹤</span></label>
      <dl><dt>值得布局的理由</dt><dd>${escapeHtml(row.thesis)}</dd><dt>市場可能已經反映的部分</dt><dd>${escapeHtml(row.pricedIn)}</dd><dt>市場可能低估的地方</dt><dd>${escapeHtml(row.possibleUnderestimate)}</dd><dt>最先要注意的風險</dt><dd>${escapeHtml(row.rejectionReasons[0] || '目前未觸發硬性風險，但仍不適合一次買足。')}</dd><dt>尚未持有怎麼做</dt><dd>${escapeHtml(row.entryPlan)}</dd><dt>已經持有怎麼做</dt><dd>${escapeHtml(row.holdingPlan)}</dd></dl>
      <div class="flow"><span>ETF 5日 ${signed(row.etf.d5, 0, '張')}</span><span>主動ETF 5日 ${signed(row.etf.activeD5, 0, '張')}</span><span>外資持股5日 ${signed(row.foreign.holdingD5, 0, '張')}</span><span>外資買賣超5日 ${signed(row.foreign.netBuy5, 0, '張')}</span><span>投信買賣超5日 ${signed(row.investmentTrust.netBuy5, 0, '張')}</span></div>
    </article>`).join('');

  const topRows = report.ranking.slice(0, 30).map(row => `
    <tr><td>${row.rank}</td><td><a class="stock-link" href="${yahooTechnicalUrl(row.code)}" target="_blank" rel="noreferrer" title="開啟 ${escapeHtml(row.name)} Yahoo技術分析"><b>${escapeHtml(row.code)}</b> ${escapeHtml(row.name)}</a></td><td><input class="table-position-check" type="checkbox" data-position-toggle="${escapeHtml(row.code)}" aria-label="追蹤 ${escapeHtml(row.code)} ${escapeHtml(row.name)}"></td><td>${escapeHtml(row.entryAction)}</td><td class="state-${escapeHtml(row.holdingState)}">${escapeHtml(row.holdingAction)}</td><td>${scoreLink(row)}</td><td>${fmt(row.confidence, 0)}%</td><td>${signed(row.fundamentals.revenueYoy, 1, '%')}</td><td>${fmt(row.valuation.pe)}</td><td>${signed(row.etf.d5, 0)}</td><td>${signed(row.etf.activeD5, 0)}</td><td>${signed(row.foreign.holdingD5, 0)}</td><td>${signed(row.foreign.holdingD10, 0)}</td><td>${signed(row.foreign.netBuy5, 0)}</td><td>${signed(row.investmentTrust.netBuy5, 0)}</td><td>${fmt(row.technical.rsi14)}</td><td>${fmt(row.technical.kdK, 1)}／${fmt(row.technical.kdD, 1)}</td><td>${escapeHtml(row.rejectionReasons[0] || '—')}</td></tr>`).join('');

  const dataJson = JSON.stringify(report.ranking).replace(/</g, '\\u003c');
  const sourceGroupsJson = JSON.stringify(report.sourceGroups).replace(/</g, '\\u003c');
  const metaJson = JSON.stringify(report.meta).replace(/</g, '\\u003c');
  const sourceRows = Object.entries(report.sources).map(([label, url]) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></li>`).join('');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>上市股票ETF、外資與投信專業選股報告</title>
<style>
:root{--ink:#17211d;--muted:#63706a;--line:#d8dfdb;--paper:#f6f8f6;--white:#fff;--green:#176b49;--red:#a13b32;--amber:#9a6814;--blue:#255f85}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;letter-spacing:0}a{color:var(--blue)}.stock-link{color:#174f73;text-decoration:none}.stock-link:hover,.stock-link:focus-visible{text-decoration:underline;text-underline-offset:3px}.pick h3 .stock-link::after{content:' ↗';font-size:.72em;font-weight:600}header{background:#12251d;color:#fff;padding:34px max(24px,calc((100vw - 1240px)/2)) 30px;border-bottom:5px solid #c9a85b}header h1{font-size:clamp(28px,4vw,44px);margin:0 0 10px;letter-spacing:0}header p{margin:5px 0;color:#d5dfda;line-height:1.6}.freeze{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px;font-size:14px}.freeze b{color:#fff}main{max-width:1240px;margin:auto;padding:26px 24px 70px}.warning{border-left:5px solid var(--amber);background:#fff8e6;padding:16px 18px;margin-bottom:24px;line-height:1.7}.section{margin:30px 0}.section h2{font-size:23px;margin:0 0 8px}.section-lead{color:var(--muted);margin:0 0 18px;line-height:1.65}.picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.pick{background:var(--white);border:1px solid var(--line);border-radius:6px;padding:18px;min-width:0}.pick-head{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:13px}.pick-head .rank{width:32px;height:32px;display:grid;place-items:center;background:#c9a85b;color:#12251d;font-weight:800}.pick h3{font-size:20px;margin:0}.pick h3+p{font-size:13px;color:var(--muted);margin:4px 0 0}.pick-head strong{font-size:25px;color:var(--green)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:14px 0}.metrics span{font-size:11px;color:var(--muted);border-right:1px solid var(--line)}.metrics span:last-child{border:0}.metrics b{display:block;color:var(--ink);font-size:15px;margin-top:3px}.pick dl{margin:0}.pick dt{font-size:12px;text-transform:uppercase;color:var(--green);font-weight:800;margin-top:12px}.pick dd{margin:3px 0 0;line-height:1.58;font-size:14px}.flow{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.flow span{font-size:12px;background:#eef3f0;padding:5px 7px;border-radius:3px}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);background:#fff}.summary-grid div{padding:16px;border-right:1px solid var(--line)}.summary-grid div:last-child{border:0}.summary-grid b{display:block;font-size:25px;color:var(--green);margin-bottom:4px}.summary-grid span{font-size:13px;color:var(--muted)}.table-wrap{overflow:auto;border:1px solid var(--line);background:#fff}table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px;white-space:nowrap}th,td{padding:10px 11px;border-bottom:1px solid #e7ebe8;text-align:right}th{position:sticky;top:0;background:#edf2ef;color:#35433d;z-index:1}th:nth-child(2),td:nth-child(2),th:last-child,td:last-child{text-align:left}tr:hover td{background:#f7faf8}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.filters input,.filters select{height:38px;border:1px solid #bfc9c3;background:#fff;padding:0 10px;font:inherit;border-radius:3px}.filters input{min-width:240px}.table-scroll-tools{position:sticky;top:0;z-index:9;display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:8px;padding:7px 0;background:var(--paper)}.scroll-button{width:38px;height:38px;border:1px solid #aebbb4;background:#fff;color:var(--ink);font:700 20px/1 sans-serif;border-radius:4px;cursor:pointer}.scroll-button:hover,.scroll-button:focus-visible{background:#e9f0ec;border-color:var(--green)}.top-scroll{height:18px;overflow-x:auto;overflow-y:hidden;border:1px solid #c9d2cd;background:#fff}.top-scroll-sizer{height:1px}.top-scroll,.full-table-wrap{scrollbar-color:#71857a #edf2ef;scrollbar-width:auto}.top-scroll::-webkit-scrollbar,.full-table-wrap::-webkit-scrollbar{height:14px;width:12px}.top-scroll::-webkit-scrollbar-track,.full-table-wrap::-webkit-scrollbar-track{background:#edf2ef}.top-scroll::-webkit-scrollbar-thumb,.full-table-wrap::-webkit-scrollbar-thumb{background:#71857a;border:3px solid #edf2ef;border-radius:7px}.full-table-wrap{max-height:72vh;overscroll-behavior:contain}.full-table{min-width:1780px}.full-table th:nth-child(1),.full-table td:nth-child(1){position:sticky;left:0;min-width:54px;width:54px;background:#fff;z-index:3}.full-table th:nth-child(2),.full-table td:nth-child(2){position:sticky;left:54px;min-width:178px;background:#fff;z-index:3;box-shadow:5px 0 7px -7px #425048}.full-table thead th:nth-child(1),.full-table thead th:nth-child(2){background:#edf2ef;z-index:6}.full-table tbody tr:hover td:nth-child(1),.full-table tbody tr:hover td:nth-child(2){background:#f7faf8}.method{display:grid;grid-template-columns:1.2fr .8fr;gap:24px}.method article{background:#fff;border-top:3px solid var(--green);padding:18px}.method h3{margin:0 0 10px;font-size:17px}.method p,.method li{line-height:1.7;color:#3f4b46}.weights{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.weights span{background:#eef3f0;padding:10px}.weights b{display:block;font-size:19px}.sources{columns:2;line-height:1.8}.small{font-size:12px;color:var(--muted)}.tag-A{color:var(--green);font-weight:700}.tag-B{color:var(--amber);font-weight:700}.tag-C,.tag-D{color:var(--red);font-weight:700}@media(max-width:950px){.picks{grid-template-columns:1fr}.summary-grid{grid-template-columns:repeat(2,1fr)}.method{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){main{padding:18px 12px 50px}header{padding:26px 16px}.summary-grid{grid-template-columns:1fr}.summary-grid div{border-right:0;border-bottom:1px solid var(--line)}.filters input{min-width:100%}.sources{columns:1}.full-table th:nth-child(2),.full-table td:nth-child(2){min-width:145px}.table-scroll-tools{grid-template-columns:36px minmax(0,1fr) 36px}.scroll-button{width:36px;height:36px}}
</style>
<style>
.system-credit{display:inline-block;margin-left:.6em;font-size:.48em;font-weight:600;color:#c9d4ce;vertical-align:.16em;white-space:nowrap}
@media(max-width:560px){.system-credit{display:block;margin:6px 0 0;font-size:.58em;vertical-align:baseline}}
.framework-wrap{overflow:auto;border:1px solid var(--line);background:#fff}
.framework-table{min-width:980px;white-space:normal}
.framework-table th,.framework-table td{text-align:left;vertical-align:top;line-height:1.55;padding:13px 14px}
.framework-table th{position:static;background:#e7eee9}
.framework-table td:first-child{font-size:20px;font-weight:800;color:var(--green);white-space:nowrap}
.framework-table td:nth-child(2){font-weight:700;min-width:150px}
.framework-table td:nth-child(3){min-width:330px}
.framework-table ul{margin:0;padding-left:18px}
.framework-table li{margin:2px 0}
.framework-note{color:var(--muted);font-size:12px;margin:10px 0 0;line-height:1.6}
.full-table{min-width:2300px}
.top30-table-wrap{max-height:60vh;overscroll-behavior:contain;scrollbar-color:#71857a #edf2ef;scrollbar-width:auto}
.top30-table-wrap::-webkit-scrollbar{height:14px;width:12px}.top30-table-wrap::-webkit-scrollbar-track{background:#edf2ef}.top30-table-wrap::-webkit-scrollbar-thumb{background:#71857a;border:3px solid #edf2ef;border-radius:7px}
.top30-table{min-width:1900px}
.top30-table th:nth-child(1),.top30-table td:nth-child(1){position:sticky;left:0;min-width:54px;width:54px;background:#fff;z-index:3}
.top30-table th:nth-child(2),.top30-table td:nth-child(2){position:sticky;left:54px;min-width:178px;background:#fff;z-index:3;box-shadow:5px 0 7px -7px #425048}
.top30-table thead th:nth-child(1),.top30-table thead th:nth-child(2){background:#edf2ef;z-index:6}
.top30-table tbody tr:hover td:nth-child(1),.top30-table tbody tr:hover td:nth-child(2){background:#f7faf8}
.filters .position-toggle{height:38px;margin:0;padding:0 10px;white-space:nowrap}
.empty-state{text-align:left!important;padding:28px 18px!important;color:var(--muted);font-size:14px;line-height:1.7;white-space:normal}
.score-dialog-head{color:var(--ink)}
.decision-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);margin:14px 0 10px}.decision-strip span{padding:9px 10px;min-width:0}.decision-strip span+span{border-left:1px solid var(--line)}.decision-strip small{display:block;color:var(--muted);font-size:11px}.decision-strip b{display:block;margin-top:3px;font-size:14px;overflow-wrap:anywhere}.position-toggle{display:flex;align-items:center;gap:7px;margin:10px 0 14px;padding:9px 10px;border:1px solid #b9c6bf;background:#f7faf8;font-size:13px;cursor:pointer}.position-toggle input,.table-position-check{width:18px;height:18px;accent-color:var(--green);cursor:pointer}.state-add{color:var(--green);font-weight:800}.state-hold{color:var(--blue);font-weight:800}.state-protect{color:var(--amber);font-weight:800}.state-trim,.state-exit{color:var(--red);font-weight:800}.position-table{min-width:1040px}.position-table th,.position-table td{text-align:left;vertical-align:top}.position-table input[type=number]{width:108px;height:34px;border:1px solid #aebbb4;padding:0 7px;font:inherit}.position-remove{width:34px;height:34px;border:1px solid #b7c2bc;background:#fff;color:var(--red);font:700 18px/1 sans-serif;cursor:pointer}.position-remove:hover,.position-remove:focus-visible{background:#fff0ee;border-color:var(--red)}.position-empty{padding:18px!important;white-space:normal!important;color:var(--muted)}.decision-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);background:#fff;margin:12px 0 0}.decision-legend div{padding:12px 14px}.decision-legend div+div{border-left:1px solid var(--line)}.decision-legend b{display:block;margin-bottom:5px}.decision-legend p{margin:0;color:var(--muted);font-size:13px;line-height:1.6}
.position-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}.position-action-button{height:38px;border:1px solid #9eada5;background:#fff;color:var(--ink);padding:0 12px;font:inherit;font-weight:700;cursor:pointer}.position-action-button:hover,.position-action-button:focus-visible{background:#e9f0ec;border-color:var(--green)}.position-backup-status{font-size:12px;color:var(--muted);line-height:1.5}.position-backup-status.is-error{color:var(--red);font-weight:700}
.score-link{color:var(--blue);font-weight:800;text-decoration:none;border-bottom:1px dotted currentColor;cursor:pointer}.score-link:hover,.score-link:focus-visible{color:var(--green);border-bottom-style:solid}.pick-head strong .score-link{font-size:25px;color:var(--green)}
.score-dialog{width:min(1120px,calc(100vw - 28px));max-width:none;max-height:92vh;padding:0;border:1px solid #94a59c;background:#fff;color:var(--ink);box-shadow:0 20px 70px rgba(18,37,29,.28)}.score-dialog::backdrop{background:rgba(12,25,20,.58)}.score-dialog-shell{display:grid;grid-template-rows:auto minmax(0,1fr);max-height:92vh}.score-dialog-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;padding:18px 20px;border-bottom:1px solid var(--line);background:#edf2ef}.score-dialog-head h2{font-size:22px;margin:0}.score-dialog-head p{margin:5px 0 0;color:var(--muted);font-size:13px;line-height:1.5}.score-close{width:38px;height:38px;border:1px solid #9daaa3;background:#fff;color:var(--ink);font:400 28px/1 sans-serif;cursor:pointer}.score-close:hover,.score-close:focus-visible{background:#dfe9e3;border-color:var(--green)}.score-dialog-body{overflow:auto;padding:18px 20px 24px}.score-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);margin-bottom:16px}.score-summary div{padding:12px 14px;border-right:1px solid var(--line)}.score-summary div:last-child{border-right:0}.score-summary span{display:block;color:var(--muted);font-size:12px}.score-summary b{display:block;margin-top:4px;font-size:19px}.score-detail-wrap{overflow:auto;border:1px solid var(--line)}.score-breakdown{min-width:940px;white-space:normal}.score-breakdown th,.score-breakdown td{text-align:left;vertical-align:top;line-height:1.55;padding:12px 13px}.score-breakdown th{position:static}.score-breakdown td:first-child{font-weight:800;min-width:150px}.score-breakdown td:nth-child(2){white-space:nowrap;font-size:17px;color:var(--green);font-weight:800}.evidence-list{margin:0;padding-left:18px}.evidence-list li{margin:2px 0}.source-links{display:grid;gap:5px;min-width:210px}.source-links a{font-size:12px;line-height:1.35}.score-judgment{margin:16px 0 0;padding:14px 16px;border-left:4px solid var(--amber);background:#fff8e6;line-height:1.65}.score-formula{color:var(--muted);font-size:12px;line-height:1.65;margin:12px 0 0}.score-dates{display:flex;gap:8px 16px;flex-wrap:wrap;margin:0 0 14px;color:var(--muted);font-size:12px}
@media(max-width:700px){.score-dialog-body{padding:14px 12px 20px}.score-dialog-head{padding:15px 12px}.score-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.score-summary div:nth-child(2){border-right:0}.score-summary div:nth-child(-n+2){border-bottom:1px solid var(--line)}.decision-legend{grid-template-columns:1fr}.decision-legend div+div{border-left:0;border-top:1px solid var(--line)}.position-table{display:block;min-width:0;white-space:normal}.position-table thead{display:none}.position-table tbody,.position-table tr,.position-table td{display:block;width:100%}.position-table tr{padding:8px 0;border-bottom:2px solid var(--line)}.position-table td{display:grid;grid-template-columns:105px minmax(0,1fr);gap:10px;padding:7px 10px;border-bottom:0;text-align:left}.position-table td::before{content:attr(data-label);color:var(--muted);font-size:12px;font-weight:700}.position-table td[data-label="目前依據"]{min-width:0!important}.position-table input[type=number]{width:100%;max-width:140px}.position-empty{display:block!important;padding:18px 12px!important}.position-empty::before{content:none}}
</style>
<style>
@media(max-width:700px){.score-detail-wrap{overflow:visible;border:0}.score-breakdown{display:block;min-width:0}.score-breakdown thead{display:none}.score-breakdown tbody,.score-breakdown tr,.score-breakdown td{display:block;width:100%}.score-breakdown tr{padding:12px 0;border-bottom:1px solid var(--line)}.score-breakdown tr:first-child{border-top:1px solid var(--line)}.score-breakdown td{padding:4px 6px;border-bottom:0}.score-breakdown td:first-child{font-size:15px;min-width:0}.score-breakdown td:nth-child(2){font-size:18px;margin-bottom:5px}.source-links{min-width:0;margin-top:6px}.source-links a{overflow-wrap:anywhere}}
</style>
<style>
body.auth-locked{overflow:hidden}.app-shell--hidden{visibility:hidden;height:100vh;overflow:hidden}.login-gate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(7,14,11,.97);color:#f4f7f5}.login-gate--hidden{display:none}.login-frame{position:relative;width:min(100%,400px);padding:2px;border-radius:8px;background:#111c17;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}.login-border-svg{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.login-border-stroke{fill:none;stroke:url(#loginBorderGradient);stroke-width:3;stroke-linecap:round;opacity:.95;filter:drop-shadow(0 0 7px rgba(201,168,91,.28)) drop-shadow(0 0 11px rgba(82,178,136,.22))}.login-panel{position:relative;z-index:1;padding:28px;border-radius:6px;background:#102219;border:1px solid rgba(255,255,255,.06)}.login-panel h2{margin:0;font-size:24px;text-align:center}.login-panel>p:first-of-type{margin:8px 0 0;color:#b9c8c0;text-align:center;font-size:13px}.login-form{display:grid;gap:13px;margin-top:22px}.login-field{display:grid;gap:6px;color:#d8e2dc;font-size:13px;font-weight:700}.login-form input[type=text],.login-form input[type=password]{width:100%;height:42px;border:1px solid rgba(255,255,255,.16);border-radius:4px;padding:0 12px;background:#0b1711;color:#fff;font:inherit}.login-form input:focus{outline:2px solid #6fb591;outline-offset:1px}.login-submit{height:42px;border:1px solid #c9a85b;border-radius:4px;background:#c9a85b;color:#102219;font:inherit;font-weight:800;cursor:pointer}.login-submit:hover,.login-submit:focus-visible{background:#e0c477;border-color:#e0c477}.remember-me{display:flex;align-items:center;gap:7px;color:#b9c8c0;font-size:13px;cursor:pointer}.remember-me input{width:17px;height:17px;accent-color:#c9a85b}.login-status{min-height:20px;margin:14px 0 0;color:#aebcb5;font-size:13px;text-align:center}.login-status.error{color:#ffb9b2}.header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.header-row h1{min-width:0}.logout-button{flex:0 0 auto;height:38px;border:1px solid #83988d;border-radius:4px;padding:0 12px;background:transparent;color:#fff;font:inherit;font-weight:700;cursor:pointer}.logout-button:hover,.logout-button:focus-visible{border-color:#c9a85b;background:rgba(201,168,91,.13)}@media(max-width:560px){.login-panel{padding:24px 18px}.login-panel h2{font-size:21px}.header-row{display:block}.logout-button{margin-top:8px}}
</style>
</head>
<body class="auth-locked">
<div id="loginGate" class="login-gate">
  <div class="login-frame">
    <svg class="login-border-svg" viewBox="0 0 400 430" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="loginBorderGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="0"><stop offset="0%" stop-color="#c9a85b"/><stop offset="33%" stop-color="#52b288"/><stop offset="66%" stop-color="#6aa7cf"/><stop offset="100%" stop-color="#c9a85b"/><animateTransform attributeName="gradientTransform" type="rotate" from="0 200 215" to="360 200 215" dur="7.2s" repeatCount="indefinite"/></linearGradient></defs><rect x="1.5" y="1.5" width="397" height="427" rx="8" ry="8" class="login-border-stroke"/></svg>
    <div class="login-panel">
      <h2>登入專業選股報告</h2><p>請先完成登入</p>
      <form id="loginForm" class="login-form">
        <label class="login-field"><span>帳號</span><input id="loginUsername" type="text" autocomplete="username" required></label>
        <label class="login-field"><span>密碼</span><input id="loginPassword" type="password" autocomplete="current-password" required></label>
        <label class="remember-me"><input id="rememberLogin" type="checkbox"><span>記住登入狀態</span></label>
        <button class="login-submit" type="submit">登入</button>
      </form>
      <p id="loginStatus" class="login-status">請輸入帳號與密碼。</p>
    </div>
  </div>
</div>
<div id="appShell" class="app-shell app-shell--hidden" aria-hidden="true">
<header><div class="header-row"><h1>上市股票ETF、外資與投信專業選股報告 <span class="system-credit">(系統設計：fricachai)</span></h1><button class="logout-button" id="logoutButton" type="button">登出</button></div><p>只篩選上市股票，整合基本面、估值、ETF籌碼、外資實際持股、外資／投信／自營商買賣超、技術面、事件與風險。</p><div class="freeze"><span>報告產生 <b>${escapeHtml(report.meta.generatedAt)}</b></span><span>ETF資料 <b>${escapeHtml(report.meta.etfDate)}</b></span><span>法人買賣超 <b>${escapeHtml(report.meta.institutionalDate)}</b></span><span>外資持股 <b>${escapeHtml(report.meta.foreignHoldingDate)}</b></span><span>價量／估值 <b>${escapeHtml(report.meta.marketDate)}</b></span><span>即時報價凍結 <b>${escapeHtml(report.meta.liveFreeze)}</b></span></div></header>
<main>
<div class="warning"><b>資料邊界：</b>本報告只保留籌碼小宇 ${report.meta.etfCount} 檔 ETF 所持有的 ${report.meta.stockCount} 檔上市股票，已排除上櫃股票。網站本次仍標示 incomplete=true，${report.meta.laggingEtfs} 檔 ETF 資料落後；ETF 20日只作背景，10日看延續，5日看轉折。標準KD完整日K覆蓋 ${report.meta.kdCovered}／${report.meta.stockCount} 檔，只作進出場時機輔助。外資「持股變化」與「買賣超」分開判讀；投信資料是每日買賣超流量，不等同基金完整持股明細。每次執行都會重新排序，掉出前三名不等於賣出；新部位與既有部位必須分開判斷。評分是研究排序，不是保證報酬或個人化投資建議。</div>

<section class="section"><h2>本次執行的前三名研究候選</h2><p class="section-lead">這是本次資料重算後的研究優先順序，不是持倉清單，也不代表掉出名單就該賣出。請分別看「建立新部位」與「已經持有」；已開始布局者請勾選追蹤，之後每次重跑都會保留並更新判斷。</p><div class="picks">${topCards}</div><div class="decision-legend"><div><b>尚未持有</b><p>只有「可開始承接」才進入分批布局；等待確認、暫不承接或不建立部位都不應因排名高而追價。</p></div><div><b>已經持有</b><p>依序採續抱／加碼、續抱觀察、暫停加碼、開始減碼、優先出脫；排名變化本身不是賣出條件。</p></div></div></section>

<section class="section" id="positionSection"><h2>我的布局追蹤</h2><p class="section-lead">勾選任何股票的追蹤方塊後，系統會在這個瀏覽器保存起始時間、起始價格與起始排名。即使之後多次重跑、排名改變或掉出前三名，仍會顯示最新的既有部位動作。重新整理與資料更新不會刪除；更換裝置或清除網站資料前，請先下載備份。</p><div class="position-actions"><button class="position-action-button" id="exportPositions" type="button" title="下載布局追蹤JSON備份">&#8595; 下載追蹤備份</button><button class="position-action-button" id="importPositions" type="button" title="從JSON備份匯入布局追蹤">&#8593; 匯入追蹤備份</button><input id="importPositionsFile" type="file" accept="application/json,.json" hidden><span class="position-backup-status" id="positionBackupStatus" role="status" aria-live="polite"></span></div><div class="table-wrap"><table class="position-table"><thead><tr><th>股票</th><th>起始／目前排名</th><th>成本價</th><th>現價／損益</th><th>新部位</th><th>已持有動作</th><th>目前依據</th><th>移除</th></tr></thead><tbody id="positionRows"></tbody></table></div></section>

<section class="section"><h2>篩選覆蓋</h2><div class="summary-grid"><div><b>${report.meta.stockCount}</b><span>ETF持有的上市股票</span></div><div><b>${report.meta.foreignHoldingCovered}</b><span>具官方外資持股趨勢</span></div><div><b>${report.meta.bucketA}</b><span>A級：可分批布局候選</span></div><div><b>${report.meta.rejected}</b><span>D級：硬性條件排除</span></div></div></section>

<section class="section"><h2>前30名與主要風險</h2><p class="section-lead">點擊「總分」可查看該股六大構面實得分、判斷數據、資料日期與來源。外資持股是存量；外資、投信與自營商買賣超是流量，分開計算以避免重複加分。</p><div class="table-scroll-tools"><button class="scroll-button" id="top30ScrollLeft" type="button" title="向左捲動" aria-label="前30名表格向左捲動">&#8592;</button><div class="top-scroll" id="top30TopScroll" aria-label="前30名表格水平捲軸"><div class="top-scroll-sizer" id="top30TopScrollSizer"></div></div><button class="scroll-button" id="top30ScrollRight" type="button" title="向右捲動" aria-label="前30名表格向右捲動">&#8594;</button></div><div class="table-wrap top30-table-wrap" id="top30TableWrap"><table class="top30-table" id="top30Table"><thead><tr><th>#</th><th>股票</th><th>追蹤</th><th>建立新部位</th><th>已經持有</th><th>總分</th><th>信心</th><th>營收YoY</th><th>PE</th><th>ETF 5日</th><th>主動ETF 5日</th><th>外資持股5日</th><th>外資持股10日</th><th>外資買賣超5日</th><th>投信買賣超5日</th><th>RSI</th><th>K／D</th><th>最先注意風險</th></tr></thead><tbody>${topRows}</tbody></table></div></section>

<section class="section"><h2>完整 ${report.meta.stockCount} 檔上市股票排名</h2><div class="filters"><input id="search" type="search" placeholder="搜尋代號或名稱"><select id="bucket"><option value="">全部新部位動作</option><option value="A">可開始承接</option><option value="B">等待確認</option><option value="C">暫不承接</option><option value="D">不建立部位</option></select><select id="sector"><option value="">全部產業</option>${[...new Set(report.ranking.map(row => row.sector))].sort().map(value => `<option>${escapeHtml(value)}</option>`).join('')}</select><label class="position-toggle"><input id="positionOnly" type="checkbox"> <span>只看我的布局追蹤</span></label></div><div class="table-scroll-tools"><button class="scroll-button" id="scrollLeft" type="button" title="向左捲動" aria-label="向左捲動">&#8592;</button><div class="top-scroll" id="fullTopScroll" aria-label="表格水平捲軸"><div class="top-scroll-sizer" id="fullTopScrollSizer"></div></div><button class="scroll-button" id="scrollRight" type="button" title="向右捲動" aria-label="向右捲動">&#8594;</button></div><div class="table-wrap full-table-wrap" id="fullTableWrap"><table class="full-table" id="fullTable"><thead><tr><th>#</th><th>股票</th><th>追蹤</th><th>產業</th><th>建立新部位</th><th>已經持有</th><th>總分明細</th><th>信心</th><th>即時/收盤</th><th>營收YoY</th><th>累計YoY</th><th>PE</th><th>ETF 5日</th><th>ETF 10日</th><th>主動5日</th><th>外資持股比</th><th>外資持股5日</th><th>外資持股10日</th><th>外資買賣超5日</th><th>投信5日</th><th>投信10日</th><th>RSI</th><th>K／D</th><th>距20EMA</th><th>主要風險</th></tr></thead><tbody id="fullRows"></tbody></table></div><p class="small">點擊總分可查看該股的分項分數與來源；外資持股比率高低本身不是買賣訊號，重點是持股存量、法人買賣流量與ETF方向是否一致。</p></section>

<section class="section"><h2>專業篩選架構與評分內容</h2><p class="section-lead">比例代表該項在100分總分中的最高分，不代表預期報酬率。各項先依同產業或全體樣本標準化，再由硬性風險條件決定是否可進入布局名單。</p><div class="framework-wrap"><table class="framework-table"><thead><tr><th>占總分</th><th>評估項目</th><th>實際計分內容</th><th>判讀重點與限制</th></tr></thead><tbody>
<tr><td>30%</td><td>基本面與成長</td><td><ul><li>單月營收年增：最高7.2分</li><li>累計營收年增：最高7.2分</li><li>營業利益率／金融業獲利品質：最高5.1分</li><li>負債比與流動比率：最高3.9分</li><li>盈餘殖利率：最高3.0分</li><li>營收成長一致性：最高3.6分</li></ul></td><td>確認成長是否有財務品質支持。只看營收會忽略毛利率、現金流與一次性收益，因此仍需後續公司研究。</td></tr>
<tr><td>15%</td><td>估值</td><td><ul><li>本益比：最高7.05分</li><li>股價淨值比：最高4.05分</li><li>現金殖利率：最高3.9分</li></ul></td><td>以同產業相對比較為主；低估值可能反映景氣衰退或獲利下修，不能單獨視為便宜。</td></tr>
<tr><td>20%</td><td>ETF／外資／投信／自營商籌碼</td><td><ul><li>ETF 5／10／20日變化：最高6.0分</li><li>ETF加碼速度：最高0.8分</li><li>主動ETF 5日與加碼家數：最高3.2分</li><li>外資5日買賣超：最高1.6分</li><li>外資實際持股5／10日變化：最高3.6分</li><li>投信5／10日買賣超與10日連續性：最高3.8分</li><li>自營商5日買賣超：最高1.0分</li></ul></td><td>20日只辨識背景，10日確認延續，5日看轉折。外資持股是存量；外資、投信、自營商買賣超是流量。各類法人分開計分，三大法人合計只展示、不重複加分。投信買賣超不等於基金完整持股。</td></tr>
<tr><td>15%</td><td>技術面與進場時機</td><td><ul><li>5／20／60日EMA與趨勢斜率：最高6.0分</li><li>RSI合理區間：最高3.0分</li><li>MACD動能變化：最高2.0分</li><li>標準KD（9,3,3）時機確認：最高1.5分</li><li>距20日EMA乖離：最高2.5分</li></ul></td><td>KD使用每日最高、最低與收盤計算，只作時機輔助。低檔黃金交叉不等於買進；高檔死亡交叉也不單獨構成賣出，仍須搭配均線與籌碼。</td></tr>
<tr><td>10%</td><td>近期股價推動因素</td><td><ul><li>營收成長是否加速：最高4.5分</li><li>庫藏股、處置等公司事件：最高3.5分</li><li>成長是否持續一致：最高2.0分</li></ul></td><td>這是近期可能推動市場重新評價的因素，不代表股價預期上漲10%。主動ETF廣度已在籌碼項計分，此處不再重複；沒有明確事件時維持中性分數。</td></tr>
<tr><td>10%</td><td>風險與流動性</td><td><ul><li>成交金額與流動性：最高3.0分</li><li>20日波動程度：最高2.5分</li><li>ETF持股集中度：最高1.5分</li><li>處置、除息等事件風險：最高1.5分</li><li>資料完整度：最高1.5分</li></ul></td><td>分數越高代表交易條件與資料品質較可控，不代表沒有下跌風險。硬性淘汰條件仍優先於總分。</td></tr>
</tbody></table></div><p class="framework-note">分數是候選研究排序工具；高分若觸發外資轉弱、ETF短中期減碼、趨勢破壞、處置或事件風險，仍會降級或排除。</p></section>

<section class="section method"><article><h3>多時間窗判讀原則</h3><p>ETF採20／10／5／3／1日多時間窗，主動與被動ETF分開。外資檢查官方持股存量與買賣超流量；投信則檢查1／5／10／20日買賣超、連續買賣天數與估算金額。不同法人分開計分，不把單日買超誤認為長期加碼。技術面使用5、20、60日EMA、RSI、MACD、標準KD、乖離與趨勢斜率。</p></article><article><h3>硬性與時機檢查</h3><ul><li>只保留上市股票，排除上櫃。</li><li>資料信心度低於65%或成交金額不足者排除。</li><li>營收同步衰退或中期趨勢向下者排除。</li><li>ETF 5／10日同步減碼者等待轉強。</li><li>外資持股5／10日同步下降且外資賣超者，不列立即布局。</li><li>投信5／10日持續且具金額意義的賣超者，不列立即布局。</li><li>KD高檔死亡交叉只列時機警示，須搭配均線跌破或籌碼轉弱才升級減碼。</li><li>外資持股期間出現非市場異動時，該段趨勢不直接計分。</li><li>處置、過熱、估值與除息事件改列等待。</li></ul></article></section>

<section class="section"><h2>證據與限制</h2><p class="section-lead">證交所說明，外資持股變化除集中市場買賣外，也可能受借券、海外存託憑證、股本異動、ETF申購買回與國籍變更影響。因此本系統把外資持股與買賣超分開。投信與自營商使用每日買賣超，不宣稱為完整持股。本報告仍未取得券商一致預估、目標價、完整自由現金流與個人持倉成本，候選名單不等於無條件買進。事件層目前涵蓋籌碼小宇的庫藏股、處置與內部人異動，以及 Yahoo Finance RSS 新聞；事件僅為輔助資訊、不計入評分，新聞一律列為待確認。官方重大訊息與法說會資料尚未實作，不得把預留的事件類型視為已完成的來源。</p><ul class="sources">${sourceRows}</ul></section>
</main>
<dialog class="score-dialog" id="scoreDialog" aria-labelledby="scoreDialogTitle"><div class="score-dialog-shell"><header class="score-dialog-head"><div><h2 id="scoreDialogTitle">股票評分明細</h2><p id="scoreDialogSub">六大構面實得分、判斷數據與來源</p></div><button class="score-close" id="scoreClose" type="button" title="關閉評分明細" aria-label="關閉評分明細">&times;</button></header><div class="score-dialog-body" id="scoreDialogBody"></div></div></dialog>
</div>
<script>
const rows=${dataJson};const sourceGroups=${sourceGroupsJson};const reportMeta=${metaJson};const body=document.getElementById('fullRows');const search=document.getElementById('search');const bucket=document.getElementById('bucket');const sector=document.getElementById('sector');const positionOnly=document.getElementById('positionOnly');const positionRows=document.getElementById('positionRows');const exportPositionsButton=document.getElementById('exportPositions');const importPositionsButton=document.getElementById('importPositions');const importPositionsFile=document.getElementById('importPositionsFile');const positionBackupStatus=document.getElementById('positionBackupStatus');const tableWrap=document.getElementById('fullTableWrap');const topScroll=document.getElementById('fullTopScroll');const topScrollSizer=document.getElementById('fullTopScrollSizer');const fullTable=document.getElementById('fullTable');const top30TableWrap=document.getElementById('top30TableWrap');const top30TopScroll=document.getElementById('top30TopScroll');const top30TopScrollSizer=document.getElementById('top30TopScrollSizer');const top30Table=document.getElementById('top30Table');const scoreDialog=document.getElementById('scoreDialog');const scoreDialogTitle=document.getElementById('scoreDialogTitle');const scoreDialogSub=document.getElementById('scoreDialogSub');const scoreDialogBody=document.getElementById('scoreDialogBody');
const appShell=document.getElementById('appShell');const loginGate=document.getElementById('loginGate');const loginForm=document.getElementById('loginForm');const loginUsername=document.getElementById('loginUsername');const loginPassword=document.getElementById('loginPassword');const rememberLogin=document.getElementById('rememberLogin');const loginStatus=document.getElementById('loginStatus');const logoutButton=document.getElementById('logoutButton');
const AUTH_CONFIG={username:'frica',password:'stock2026'};const AUTH_STORAGE_KEY='pro-ranking-auth-v1';
function n(v,d=1){return Number.isFinite(v)?v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}function s(v,d=0,x=''){return Number.isFinite(v)?(v>0?'+':'')+n(v,d)+x:'—'}function e(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function stockUrl(code){return 'https://tw.stock.yahoo.com/quote/'+encodeURIComponent(code)+'.TW/technical-analysis'}
function scoreAnchor(r){return '<a class="score-link" href="#score-'+encodeURIComponent(r.code)+'" data-score-code="'+e(r.code)+'" title="查看 '+e(r.name)+' 的評分明細、判斷資料與來源">'+n(r.score)+'</a>'}
function moneyText(v){if(!Number.isFinite(v))return '—';if(Math.abs(v)>=100000000)return s(v/100000000,1,'億元');if(Math.abs(v)>=10000)return s(v/10000,0,'萬元');return s(v,0,'元')}
function evidenceList(items){return '<ul class="evidence-list">'+items.map(item=>'<li>'+e(item)+'</li>').join('')+'</ul>'}
function sourceLinks(key,code){return '<div class="source-links">'+(sourceGroups[key]||[]).map(item=>{let url=item.url;if(key==='technical'&&url.endsWith('/data/stock/'))url+=encodeURIComponent(code)+'.json';url=url.replace('{code}',encodeURIComponent(code));return '<a href="'+e(url)+'" target="_blank" rel="noreferrer">'+e(item.label)+'</a>'}).join('')+'</div>'}
function componentRow(label,score,max,evidence,key,code){return '<tr><td>'+e(label)+'</td><td>'+n(score)+' / '+n(max,0)+'</td><td>'+evidenceList(evidence)+'</td><td>'+sourceLinks(key,code)+'</td></tr>'}
const POSITION_KEY='proRankingPositionsV1';
function loadPositions(){try{const parsed=JSON.parse(localStorage.getItem(POSITION_KEY)||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch(_){return {}}}
let positions=loadPositions();
function savePositions(){try{localStorage.setItem(POSITION_KEY,JSON.stringify(positions))}catch(_){}}
function setBackupStatus(message,isError=false){positionBackupStatus.textContent=message;positionBackupStatus.classList.toggle('is-error',isError)}
function cleanImportedPositions(payload){const source=payload&&payload.positions&&typeof payload.positions==='object'?payload.positions:payload;if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('備份格式不正確');const cleaned={};Object.entries(source).forEach(([key,value])=>{const code=String(value&&value.code||key);const entryPrice=Number(value&&value.entryPrice);const entryRank=Number(value&&value.entryRank);if(!/^[0-9]{4}$/.test(code)||!Number.isFinite(entryPrice)||entryPrice<=0)return;cleaned[code]={code,addedAt:String(value.addedAt||reportMeta.generatedAt),entryPrice,entryRank:Number.isFinite(entryRank)&&entryRank>0?entryRank:null,entryAction:String(value.entryAction||'')}});return cleaned}
function exportPositions(){const count=Object.keys(positions).length;if(!count){setBackupStatus('目前沒有可下載的布局追蹤。',true);return}const payload={schemaVersion:1,exportedAt:new Date().toISOString(),reportGeneratedAt:reportMeta.generatedAt,positions};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');const stamp=new Date().toISOString().replace(/[:.]/g,'-');link.href=url;link.download='pro-ranking-positions-'+stamp+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);setBackupStatus('已下載 '+count+' 筆布局追蹤備份。')}
async function importPositionsBackup(file){try{const parsed=JSON.parse(await file.text());const imported=cleanImportedPositions(parsed);const count=Object.keys(imported).length;if(!count)throw new Error('備份內沒有有效的布局追蹤');positions={...positions,...imported};savePositions();renderPositions();draw();syncPositionChecks();setBackupStatus('已匯入 '+count+' 筆；同代號以備份內容更新，其他原有追蹤保留。')}catch(error){setBackupStatus('匯入失敗：'+error.message,true)}}
function currentPrice(r){return Number.isFinite(r.livePrice)?r.livePrice:r.close}
function setPosition(code,enabled){const r=rows.find(row=>row.code===String(code));if(!r)return;if(enabled&&!positions[r.code])positions[r.code]={code:r.code,addedAt:reportMeta.generatedAt,entryPrice:currentPrice(r),entryRank:r.rank,entryAction:r.entryAction};if(!enabled)delete positions[r.code];savePositions();renderPositions();draw();syncPositionChecks()}
function syncPositionChecks(){document.querySelectorAll('[data-position-toggle]').forEach(input=>{input.checked=Boolean(positions[input.dataset.positionToggle])})}
function renderPositions(){
  const tracked=Object.values(positions).map(p=>({p,r:rows.find(row=>row.code===String(p.code))})).sort((a,b)=>(a.p.addedAt||'').localeCompare(b.p.addedAt||''));
  if(!tracked.length){positionRows.innerHTML='<tr><td class="position-empty" colspan="8"><b>尚未標記任何布局部位。</b><br>請在前三名、前30名或完整排名中勾選「追蹤」；之後不論重跑多少次，該股票都會留在這裡並套用最新判斷。</td></tr>';return}
  positionRows.innerHTML=tracked.map(({p,r})=>{
    if(!r)return '<tr><td data-label="股票"><b>'+e(p.code)+'</b></td><td data-label="狀態" colspan="6">目前不在本次ETF持股上市股票母體，需另行查核。</td><td data-label="移除"><button class="position-remove" type="button" data-position-remove="'+e(p.code)+'" title="移除追蹤" aria-label="移除 '+e(p.code)+'">&times;</button></td></tr>';
    const price=currentPrice(r);const cost=Number(p.entryPrice);const pnl=Number.isFinite(cost)&&cost>0?(price-cost)/cost*100:null;const rankMove=Number.isFinite(Number(p.entryRank))?Number(p.entryRank)-r.rank:null;const rankText=e(p.entryRank)+' → '+e(r.rank)+(rankMove===null?'':rankMove>0?'（上升 '+n(rankMove,0)+'）':rankMove<0?'（下降 '+n(Math.abs(rankMove),0)+'）':'（不變）');const basis=(r.holdingSignals&&r.holdingSignals[0])||(r.rejectionReasons&&r.rejectionReasons[0])||'目前未觸發明確減碼訊號';
    return '<tr><td data-label="股票"><a class="stock-link" href="'+stockUrl(r.code)+'" target="_blank" rel="noreferrer"><b>'+e(r.code)+'</b> '+e(r.name)+'</a><br>'+scoreAnchor(r)+'</td><td data-label="起始／目前排名">'+rankText+'<br><span class="small">'+e(p.addedAt||'—')+'</span></td><td data-label="成本價"><input type="number" min="0" step="0.01" value="'+e(cost)+'" data-position-cost="'+e(r.code)+'" aria-label="'+e(r.name)+' 成本價"></td><td data-label="現價／損益">'+n(price,2)+'<br><b class="'+(pnl>=0?'state-add':'state-trim')+'">'+s(pnl,1,'%')+'</b></td><td data-label="新部位">'+e(r.entryAction)+'</td><td data-label="已持有動作" class="state-'+e(r.holdingState)+'">'+e(r.holdingAction)+'</td><td data-label="目前依據" style="white-space:normal;min-width:260px">'+e(basis)+'<br><span class="small">'+e(r.holdingPlan)+'</span></td><td data-label="移除"><button class="position-remove" type="button" data-position-remove="'+e(r.code)+'" title="移除追蹤" aria-label="移除 '+e(r.code)+' '+e(r.name)+'">&times;</button></td></tr>'
  }).join('')
}
function openScore(code,updateHash=true){
  const r=rows.find(row=>row.code===String(code));if(!r)return;
  const c=r.components||{};const f=r.fundamentals||{};const v=r.valuation||{};const etf=r.etf||{};const foreign=r.foreign||{};const trust=r.investmentTrust||{};const dealer=r.dealer||{};const t=r.technical||{};const risk=r.riskInputs||{};
  const catalystEvents=(r.events&&r.events.buyback?'有進行中庫藏股':'未偵測進行中庫藏股')+'；'+(r.events&&r.events.disposal?'有處置或交易限制事件':'未偵測處置事件');
  const detailRows=[
    componentRow('基本面與成長',c.fundamentals,30,[
      '單月營收年增 '+s(f.revenueYoy,1,'%')+'；累計營收年增 '+s(f.revenueYtdYoy,1,'%'),
      '營業利益率 '+n(f.operatingMargin,1)+'%；EPS '+n(f.eps,2),
      '負債比 '+n(f.debtRatio,1)+'%；流動比率 '+n(f.currentRatio,1)+'%'
    ],'fundamentals',r.code),
    componentRow('估值',c.valuation,15,[
      '本益比 '+n(v.pe,1)+' 倍；股價淨值比 '+n(v.pb,1)+' 倍；殖利率 '+n(v.yield,1)+'%',
      '估值分數以同產業相對位置計算，不把低估值直接視為便宜'
    ],'valuation',r.code),
    componentRow('ETF／外資／投信／自營商籌碼',c.ownership,20,[
      'ETF 5／10／20日 '+s(etf.d5,0,'張')+'／'+s(etf.d10,0,'張')+'／'+s(etf.d20,0,'張')+'；主動ETF 5日 '+s(etf.activeD5,0,'張'),
      '外資實際持股5／10日 '+s(foreign.holdingD5,0,'張')+'／'+s(foreign.holdingD10,0,'張')+'；外資持股比 '+n(foreign.holdingRatio,2)+'%',
      '外資買賣超5日 '+s(foreign.netBuy5,0,'張')+'；投信5／10日 '+s(trust.netBuy5,0,'張')+'／'+s(trust.netBuy10,0,'張'),
      '投信近5日買超 '+n(trust.buyDays5,0)+' 日、賣超 '+n(trust.sellDays5,0)+' 日；投信5日估算金額 '+moneyText(trust.estimatedValue5),
      '自營商5日買賣超 '+s(dealer.netBuy5,0,'張')+'；三大法人合計僅展示、不重複計分'
    ],'ownership',r.code),
    componentRow('技術面與進場時機',c.technical,15,[
      '分析價 '+n(r.analysisPrice??r.livePrice??r.close,2)+'；5／20／60日EMA '+n(t.ema5,2)+'／'+n(t.ema20,2)+'／'+n(t.ema60,2),
      'RSI14 '+n(t.rsi14,1)+'；MACD柱狀值變化 '+s(t.macdHistogramDelta,2),
      '標準KD（9,3,3）K／D／J '+n(t.kdK,1)+'／'+n(t.kdD,1)+'／'+n(t.kdJ,1)+'；近3日黃金交叉 '+(t.kdGoldenCrossRecent?'是':'否')+'、死亡交叉 '+(t.kdDeathCrossRecent?'是':'否'),
      '距20日EMA '+s(t.currentDistanceEma20??t.distanceEma20,1,'%')+'；20日線5日斜率 '+s(t.ma20Slope5,1,'%')
    ],'technical',r.code),
    componentRow('近期股價推動因素',c.catalyst,10,[
      '單月營收年增 '+s(f.revenueYoy,1,'%')+'，相較累計年增 '+s(f.revenueYtdYoy,1,'%')+'，用來檢查成長是否加速',
      catalystEvents,
      '主動ETF廣度已在籌碼構面計分，此處不重複'
    ],'catalyst',r.code),
    componentRow('風險與流動性',c.risk,10,[
      '單日成交金額 '+moneyText(risk.dailyValue)+'；20日每日波動 '+n(risk.dailyVolatility20,2)+'%',
      '最大單一ETF持股占比 '+n(risk.etfTop1Concentration,1)+'%；落後更新ETF曝險 '+n(risk.etfLaggingExposure,1)+'%',
      '資料信心度 '+n(risk.dataConfidence,0)+'%；事件、處置與除權息風險另行檢查'
    ],'risk',r.code)
  ].join('');
  const eventsHtml=r.eventsLayer&&r.eventsLayer.length?'<div style="margin-top:16px;border:1px solid var(--line);overflow:auto"><table class="score-breakdown" style="min-width:680px"><thead><tr><th>事件類型</th><th>標題</th><th>日期性質</th><th>日期</th></tr></thead><tbody>'+r.eventsLayer.slice(0,6).map(ev=>'<tr><td style="white-space:nowrap">'+e(ev.eventType)+(ev.confirmed?'':' <span style="color:var(--amber);font-size:11px">待確認</span>')+'</td><td><a href="'+e(ev.sourceUrl)+'" target="_blank" rel="noreferrer" style="color:var(--blue)">'+e(ev.title).slice(0,80)+'</a>'+(ev.aiSummary?'<br><span style="font-size:12px;color:var(--muted)">AI: '+e(ev.aiSummary)+'</span>':'')+'</td><td style="white-space:nowrap;font-size:12px">'+e(ev.dateKind==='event_start'?'事件起日':ev.dateKind==='event_date'?'事件日期':'發布日')+'</td><td style="white-space:nowrap;font-size:12px">'+e((ev.publishTime||'').slice(0,10))+'</td></tr>').join('')+'</tbody></table></div>':'';
  const factor=.88+.12*(r.confidence/100);const risks=(r.rejectionReasons||[]).length?(r.rejectionReasons||[]).join('；'):'目前未觸發硬性或時機風險，但仍應分批並設定停損條件。';
  scoreDialogTitle.textContent=r.code+' '+r.name+'｜專業評分明細';scoreDialogSub.textContent=r.industry+' · 排名第 '+r.rank;
  scoreDialogBody.innerHTML='<div class="score-dates"><span>ETF '+e(reportMeta.etfDate)+'</span><span>法人買賣超 '+e(reportMeta.institutionalDate)+'</span><span>外資持股 '+e(reportMeta.foreignHoldingDate)+'</span><span>價量／估值 '+e(reportMeta.marketDate)+'</span></div><div class="score-summary"><div><span>排名總分</span><b>'+n(r.score)+'</b></div><div><span>六構面原始總分</span><b>'+n(r.rawScore)+'</b></div><div><span>資料信心度</span><b>'+n(r.confidence,0)+'%</b></div><div><span>目前排名</span><b>'+n(r.rank,0)+'</b></div></div><div class="decision-strip"><span><small>尚未持有</small><b>'+e(r.entryAction)+'</b></span><span class="state-'+e(r.holdingState)+'"><small>已經持有</small><b>'+e(r.holdingAction)+'</b></span></div><label class="position-toggle"><input type="checkbox" data-position-toggle="'+e(r.code)+'"> <span>我已開始布局，持續追蹤</span></label><div class="score-detail-wrap"><table class="score-breakdown"><thead><tr><th>評估項目</th><th>實得／最高</th><th>本股判斷數據</th><th>資料與消息來源</th></tr></thead><tbody>'+detailRows+'</tbody></table></div>'+eventsHtml+'<div class="score-judgment"><b>已持有部位：</b>'+e(r.holdingPlan)+'<br><b>最先注意的風險：</b>'+e(risks)+'</div><p class="score-formula">排名總分＝六構面原始總分 × 資料完整度調整係數。此股係數為 '+n(factor,3)+'（0.88＋0.12×信心度），因此資料不足不會與資料完整的股票以相同可信度排名。來源連結代表本次計算所用資料的出處，仍應再查公司公告與財報原文。</p>';
  syncPositionChecks();if(!scoreDialog.open)scoreDialog.showModal();if(updateHash&&history.replaceState)history.replaceState(null,'','#score-'+encodeURIComponent(r.code));
}
function setupTableScroller(wrap,scroll,sizer,table,leftButton,rightButton){let syncing=false;const syncWidth=()=>{sizer.style.width=table.scrollWidth+'px';scroll.scrollLeft=wrap.scrollLeft};scroll.addEventListener('scroll',()=>{if(syncing)return;syncing=true;wrap.scrollLeft=scroll.scrollLeft;requestAnimationFrame(()=>{syncing=false})});wrap.addEventListener('scroll',()=>{if(syncing)return;syncing=true;scroll.scrollLeft=wrap.scrollLeft;requestAnimationFrame(()=>{syncing=false})});leftButton.addEventListener('click',()=>wrap.scrollBy({left:-Math.max(320,wrap.clientWidth*.75),behavior:'smooth'}));rightButton.addEventListener('click',()=>wrap.scrollBy({left:Math.max(320,wrap.clientWidth*.75),behavior:'smooth'}));window.addEventListener('resize',syncWidth);requestAnimationFrame(syncWidth);return syncWidth}
let syncTop30ScrollWidth=()=>{};let syncFullScrollWidth=()=>{};let scrollersInitialized=false;
function draw(){const q=search.value.trim().toLowerCase();const filtered=rows.filter(r=>(!q||(r.code+' '+r.name).toLowerCase().includes(q))&&(!bucket.value||r.bucket===bucket.value)&&(!sector.value||r.sector===sector.value)&&(!positionOnly.checked||positions[r.code]));const rendered=filtered.map(r=>'<tr><td>'+r.rank+'</td><td><a class="stock-link" href="'+stockUrl(r.code)+'" target="_blank" rel="noreferrer" title="開啟 '+e(r.name)+' Yahoo技術分析"><b>'+e(r.code)+'</b> '+e(r.name)+'</a></td><td><input class="table-position-check" type="checkbox" data-position-toggle="'+e(r.code)+'" aria-label="追蹤 '+e(r.code)+' '+e(r.name)+'"></td><td>'+e(r.industry)+'</td><td class="tag-'+r.bucket+'">'+e(r.entryAction)+'</td><td class="state-'+e(r.holdingState)+'">'+e(r.holdingAction)+'</td><td>'+scoreAnchor(r)+'</td><td>'+n(r.confidence,0)+'%</td><td>'+n(r.livePrice??r.close,2)+'</td><td>'+s(r.fundamentals.revenueYoy,1,'%')+'</td><td>'+s(r.fundamentals.revenueYtdYoy,1,'%')+'</td><td>'+n(r.valuation.pe)+'</td><td>'+s(r.etf.d5)+'</td><td>'+s(r.etf.d10)+'</td><td>'+s(r.etf.activeD5)+'</td><td>'+n(r.foreign.holdingRatio,2)+'%</td><td>'+s(r.foreign.holdingD5)+'</td><td>'+s(r.foreign.holdingD10)+'</td><td>'+s(r.foreign.netBuy5)+'</td><td>'+s(r.investmentTrust.netBuy5)+'</td><td>'+s(r.investmentTrust.netBuy10)+'</td><td>'+n(r.technical.rsi14)+'</td><td>'+n(r.technical.kdK,1)+'／'+n(r.technical.kdD,1)+'</td><td>'+s(r.technical.distanceEma20,1,'%')+'</td><td>'+e((r.rejectionReasons||[]).join('；')||'—')+'</td></tr>').join('');body.innerHTML=rendered||'<tr><td class="empty-state" colspan="25"><b>目前沒有股票符合這組篩選條件。</b><br>只有「可開始承接」代表新部位通過全部門檻；既有部位請查看「我的布局追蹤」，不要因排名變化直接賣出。</td></tr>';syncPositionChecks();requestAnimationFrame(syncFullScrollWidth)}
function getAuthStorage(remember){return remember?window.localStorage:window.sessionStorage}function hasStoredAuth(){return window.localStorage.getItem(AUTH_STORAGE_KEY)==='1'||window.sessionStorage.getItem(AUTH_STORAGE_KEY)==='1'}function persistAuth(remember){window.localStorage.removeItem(AUTH_STORAGE_KEY);window.sessionStorage.removeItem(AUTH_STORAGE_KEY);getAuthStorage(remember).setItem(AUTH_STORAGE_KEY,'1')}function clearAuth(){window.localStorage.removeItem(AUTH_STORAGE_KEY);window.sessionStorage.removeItem(AUTH_STORAGE_KEY)}function setGateLocked(locked){document.body.classList.toggle('auth-locked',locked);appShell.classList.toggle('app-shell--hidden',locked);appShell.setAttribute('aria-hidden',locked?'true':'false');loginGate.classList.toggle('login-gate--hidden',!locked)}function setLoginStatus(message,type=''){loginStatus.textContent=message;loginStatus.className='login-status'+(type?' '+type:'')}
let appStarted=false;function startApp(){if(!scrollersInitialized){syncTop30ScrollWidth=setupTableScroller(top30TableWrap,top30TopScroll,top30TopScrollSizer,top30Table,document.getElementById('top30ScrollLeft'),document.getElementById('top30ScrollRight'));syncFullScrollWidth=setupTableScroller(tableWrap,topScroll,topScrollSizer,fullTable,document.getElementById('scrollLeft'),document.getElementById('scrollRight'));scrollersInitialized=true}renderPositions();draw();syncPositionChecks();const initialScore=location.hash.startsWith('#score-')?decodeURIComponent(location.hash.slice(7)):'';if(initialScore)openScore(initialScore,false)}function bootstrap(){if(appStarted)return;appStarted=true;startApp()}function handleLoginSubmit(event){event.preventDefault();const username=loginUsername.value.trim();const password=loginPassword.value;if(username!==AUTH_CONFIG.username||password!==AUTH_CONFIG.password){setLoginStatus('帳號或密碼錯誤。','error');loginPassword.value='';loginPassword.focus();return}persistAuth(rememberLogin.checked);setLoginStatus('登入成功。');setGateLocked(false);bootstrap()}function handleLogout(){clearAuth();setGateLocked(true);setLoginStatus('請輸入帳號與密碼。');loginPassword.value='';loginUsername.focus()}
[search,bucket,sector,positionOnly].forEach(el=>el.addEventListener('input',draw));exportPositionsButton.addEventListener('click',exportPositions);importPositionsButton.addEventListener('click',()=>{importPositionsFile.value='';importPositionsFile.click()});importPositionsFile.addEventListener('change',()=>{const file=importPositionsFile.files&&importPositionsFile.files[0];if(file)importPositionsBackup(file)});document.addEventListener('change',event=>{const toggle=event.target.closest('[data-position-toggle]');if(toggle){setPosition(toggle.dataset.positionToggle,toggle.checked);return}const cost=event.target.closest('[data-position-cost]');if(cost&&positions[cost.dataset.positionCost]){const value=Number(cost.value);if(Number.isFinite(value)&&value>0){positions[cost.dataset.positionCost].entryPrice=value;savePositions();renderPositions()}}});document.addEventListener('click',event=>{const remove=event.target.closest('[data-position-remove]');if(remove){setPosition(remove.dataset.positionRemove,false);return}const link=event.target.closest('[data-score-code]');if(!link)return;event.preventDefault();openScore(link.dataset.scoreCode)});document.getElementById('scoreClose').addEventListener('click',()=>scoreDialog.close());scoreDialog.addEventListener('click',event=>{if(event.target===scoreDialog)scoreDialog.close()});scoreDialog.addEventListener('close',()=>{if(location.hash.startsWith('#score-'))history.replaceState(null,'',location.pathname+location.search)});loginForm.addEventListener('submit',handleLoginSubmit);logoutButton.addEventListener('click',handleLogout);if(hasStoredAuth()){setGateLocked(false);bootstrap()}else{setGateLocked(true);setLoginStatus('請輸入帳號與密碼。');loginUsername.focus()}
</script></body></html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('1/7 讀取ETF資料與上市股票官方市場資料...');
  const dataTextPromise = fetchText(SOURCES.etf);
  const [institution, events, twseValuationRows, twseRevenueRows, twseEpsRows,
    twseMarginRows, twseDailyRows, balancePayloads] = await Promise.all([
      fetchJson(SOURCES.institution), fetchJson(SOURCES.events), fetchJson(SOURCES.twseValuation),
      fetchJson(SOURCES.twseRevenue), fetchJson(SOURCES.twseEps), fetchJson(SOURCES.twseMargin),
      fetchJson(SOURCES.twseDaily), Promise.all(BALANCE_ENDPOINTS.TWSE.map(url => fetchJson(url)))
    ]);

  let eventsLayerData = { events: [], aiEnabled: false, fetchedAt: null, sourceScope: null };
  try {
    if (fs.existsSync(LATEST_EVENTS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LATEST_EVENTS_PATH, 'utf8'));
      eventsLayerData = { events: parsed.events || [], aiEnabled: parsed.aiEnabled || false, fetchedAt: parsed.fetchedAt || null, sourceScope: parsed.sourceScope || null };
      console.log(`  事件層載入 ${eventsLayerData.events.length} 筆，AI${eventsLayerData.aiEnabled ? '已' : '未'}啟用`);
    }
  } catch (err) {
    console.log('  事件層無資料或載入失敗（不影響主要報告）');
  }
  const eventsByCode = new Map();
  for (const ev of eventsLayerData.events) {
    if (ev.code) {
      if (!eventsByCode.has(ev.code)) eventsByCode.set(ev.code, []);
      eventsByCode.get(ev.code).push(ev);
    }
  }

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(await dataTextPromise, context);
  const data = context.window.DATA;
  if (!data?.meta || !data?.stocks || !data?.etfs) throw new Error('ETF data.js 結構不符預期');
  const allStockEntries = Object.entries(data.stocks);
  const twseListedCodes = new Set([
    ...twseDailyRows.map(row => String(row.Code || '')),
    ...twseRevenueRows.map(row => String(row['公司代號'] || '')),
    ...twseValuationRows.map(row => String(row.Code || ''))
  ]);
  const stockEntries = allStockEntries.filter(([code]) => /^\d{4}$/.test(code) && twseListedCodes.has(code));
  const activeSet = new Set(data.etfs.filter(etf => etf.type === 'active').map(etf => etf.code));
  const laggingSet = new Set(data.etfs.filter(etf => !etf.updated).map(etf => etf.code));
  console.log(`ETF ${data.etfs.length} 檔，ETF持股共 ${allStockEntries.length} 檔，保留上市股票 ${stockEntries.length} 檔，主動ETF ${activeSet.size} 檔。`);

  console.log(`2/7 讀取${stockEntries.length}檔上市股票ETF快照與官方外資持股歷史...`);
  const foreignHoldingPromise = fetchTwseForeignHoldingHistory(yyyymmddToIso(data.meta.latest));
  const details = await mapLimit(stockEntries, 16, async ([code], index) => {
    if ((index + 1) % 75 === 0) console.log(`  已完成 ${index + 1}/${stockEntries.length}`);
    return fetchJson(`${XIAOYU}/data/stock/${code}.json`);
  });
  console.log('  讀取Yahoo Finance完整日K高低收，供標準KD計算...');
  const ohlcSeries = await mapLimit(stockEntries, 12, async ([code], index) => {
    if ((index + 1) % 100 === 0) console.log(`  KD日K已完成 ${index + 1}/${stockEntries.length}`);
    return fetchYahooOhlc(code);
  });
  const foreignHoldingHistory = await foreignHoldingPromise;
  console.log(`  外資持股已取得 ${foreignHoldingHistory.dates.length} 個交易日，最新 ${foreignHoldingHistory.dates[0]}`);

  const twseValuation = createLookup(twseValuationRows, ['Code']);
  const twseRevenue = createLookup(twseRevenueRows, ['公司代號']);
  const twseEps = createLookup(twseEpsRows, ['公司代號']);
  const twseMargin = createLookup(twseMarginRows, ['公司代號']);
  const twseDaily = createLookup(twseDailyRows, ['Code']);
  const twseBalance = createLookup(balancePayloads.flat(), ['公司代號']);

  const instDates = (institution.dates || []).slice(0, 20);
  const instMaps = instDates.map(date => new Map((institution.days?.[date] || []).map(row => [String(row[0]), row])));
  const institutional = code => {
    const daily = instMaps.map(map => map.get(code)?.slice(4, 8).map(number) || [0, 0, 0, 0]);
    const get = (index, count) => sum(daily.slice(0, count).map(row => row[index] || 0));
    const positiveDays = (index, count) => daily.slice(0, count).filter(row => (row[index] || 0) > 0).length;
    const negativeDays = (index, count) => daily.slice(0, count).filter(row => (row[index] || 0) < 0).length;
    return {
      foreign1: get(0, 1), trust1: get(1, 1), dealer1: get(2, 1), total1: get(3, 1),
      foreign5: get(0, 5), foreign10: get(0, 10), foreign20: get(0, 20),
      trust5: get(1, 5), trust10: get(1, 10), trust20: get(1, 20),
      dealer5: get(2, 5), dealer10: get(2, 10), dealer20: get(2, 20),
      total5: get(3, 5), total10: get(3, 10), total20: get(3, 20),
      trustPositiveDays5: positiveDays(1, 5), trustPositiveDays10: positiveDays(1, 10),
      trustNegativeDays5: negativeDays(1, 5), trustNegativeDays10: negativeDays(1, 10)
    };
  };

  console.log('3/7 建立基本面、估值、籌碼、技術與事件特徵...');
  const records = stockEntries.map(([code, stock], index) => {
    const detail = details[index]?.__error ? null : details[index];
    const ohlc = ohlcSeries[index]?.__error ? [] : ohlcSeries[index];
    const market = 'TWSE';
    const valuationRow = twseValuation.get(code);
    const revenueRow = twseRevenue.get(code);
    const epsRow = twseEps.get(code);
    const dailyRow = twseDaily.get(code);
    const balanceRow = twseBalance.get(code);
    const industry = revenueRow?.['產業別'] || epsRow?.['產業別'] || '未分類';
    const eps = number(epsRow?.['基本每股盈餘(元)'] ?? epsRow?.['基本每股盈餘']);
    const opMargin = market === 'TWSE'
      ? number(twseMargin.get(code)?.['營業利益率(%)(營業利益)/(營業收入)'])
      : (() => {
          const operatingIncome = number(epsRow?.['營業利益']);
          const revenue = number(epsRow?.['營業收入']);
          return Number.isFinite(operatingIncome) && revenue ? operatingIncome / revenue * 100 : null;
        })();
    const price = number(stock.price) || number(dailyRow?.ClosingPrice ?? dailyRow?.Close);
    const pe = number(valuationRow?.PEratio ?? valuationRow?.PriceEarningRatio);
    const pb = number(valuationRow?.PBratio ?? valuationRow?.PriceBookRatio);
    const dividendYield = number(valuationRow?.DividendYield ?? valuationRow?.YieldRatio);
    const assets = number(balanceRow?.['資產總額'] ?? balanceRow?.['資產總計']);
    const liabilities = number(balanceRow?.['負債總額'] ?? balanceRow?.['負債總計']);
    const currentAssets = number(balanceRow?.['流動資產']);
    const currentLiabilities = number(balanceRow?.['流動負債']);
    const debtRatio = Number.isFinite(assets) && assets > 0 && Number.isFinite(liabilities) ? liabilities / assets * 100 : null;
    const currentRatio = Number.isFinite(currentAssets) && Number.isFinite(currentLiabilities) && currentLiabilities > 0 ? currentAssets / currentLiabilities * 100 : null;
    const inst = institutional(code);
    const foreignHolding = foreignHoldingFeatures(foreignHoldingHistory, code);
    const etf = stockEtfFeatures(stock, detail, activeSet, laggingSet);
    const closes = (detail?.px || []).map(number).filter(Number.isFinite).reverse();
    const technical = technicalFromCloses(closes, ohlc);
    const event = eventFeatures(events, code, yyyymmddToIso(data.meta.latest));
    let confidence = 20;
    if (detail && detail.snap_dates?.length >= 21) confidence += 20;
    if (revenueRow) confidence += 13;
    if (epsRow) confidence += 8;
    if (Number.isFinite(opMargin) || isFinancial(industry)) confidence += 4;
    if (balanceRow) confidence += 5;
    if (valuationRow) confidence += 12;
    if (technical) confidence += 11;
    if (Number.isFinite(technical?.kdK) && Number.isFinite(technical?.kdD)) confidence += 2;
    if (instMaps.some(map => map.has(code))) confidence += 5;
    if (foreignHolding.trendReliable) confidence += 5;
    else if (Number.isFinite(foreignHolding.heldShares)) confidence += 2;
    confidence -= Math.min(12, etf.laggingExposure * 0.35);
    confidence = clamp(confidence, 0, 100);
    const dailyValue = number(dailyRow?.TradeValue ?? dailyRow?.TransactionAmount);
    const revenueYoy = number(revenueRow?.['營業收入-去年同月增減(%)']);
    const revenueYtdYoy = number(revenueRow?.['累計營業收入-前期比較增減(%)']);
    const stockEvents = (eventsByCode.get(code) || []).slice(0, 8);
    return {
      code, name: stock.name, market, industry, sector: broadSector(industry), etf, foreignHolding, technical, events: event,
      eventsLayer: stockEvents, closeDate: yyyymmddToIso(data.meta.price_date), confidence: round(confidence, 1), live: null,
      metrics: {
        price, revenueYoy, revenueYtdYoy, operatingMargin: opMargin, eps, debtRatio, currentRatio,
        earningsYield: Number.isFinite(pe) && pe > 0 ? 100 / pe : null,
        pe, pb, yield: dividendYield,
        etfFlow5: etf.flowPct[5], etfFlow10: etf.flowPct[10], etfFlow20: etf.flowPct[20],
        etfD5Value: (etf.totalChanges[5] || 0) * (price || 0) * 1000,
        activeEtfD5Value: (etf.activeChanges[5] || 0) * (price || 0) * 1000,
        activeFlow5: etf.activePct[5], institution1: inst.total1, institution5: inst.total5,
        institution10: inst.total10, institution20: inst.total20,
        foreignNet1: inst.foreign1, foreignNet5: inst.foreign5, foreignNet10: inst.foreign10, foreignNet20: inst.foreign20,
        foreignNetValue5: inst.foreign5 * (price || 0) * 1000,
        foreignHoldingD1: foreignHolding.trendReliable ? foreignHolding.d1Lots : null,
        foreignHoldingD5: foreignHolding.trendReliable ? foreignHolding.d5Lots : null,
        foreignHoldingD10: foreignHolding.trendReliable ? foreignHolding.d10Lots : null,
        foreignHoldingD20: foreignHolding.trendReliable ? foreignHolding.d20Lots : null,
        foreignHoldingD5Value: foreignHolding.trendReliable ? foreignHolding.d5Lots * (price || 0) * 1000 : null,
        foreignHoldingD10Value: foreignHolding.trendReliable ? foreignHolding.d10Lots * (price || 0) * 1000 : null,
        trust1: inst.trust1, trust5: inst.trust5, trust10: inst.trust10, trust20: inst.trust20,
        trustValue5: inst.trust5 * (price || 0) * 1000,
        trustValue10: inst.trust10 * (price || 0) * 1000,
        trustPositiveDays5: inst.trustPositiveDays5, trustPositiveDays10: inst.trustPositiveDays10,
        trustNegativeDays5: inst.trustNegativeDays5, trustNegativeDays10: inst.trustNegativeDays10,
        trustConsistency10: clamp(0.5 + (inst.trustPositiveDays10 - inst.trustNegativeDays10) / 20, 0, 1),
        dealer1: inst.dealer1, dealer5: inst.dealer5, dealer10: inst.dealer10, dealer20: inst.dealer20,
        dealerValue5: inst.dealer5 * (price || 0) * 1000,
        dailyValue
      }
    };
  });

  scoreRecords(records);
  console.log('4/7 取得全候選即時報價並處理今日除權息...');
  const quotes = await fetchMisQuotes(records.filter(record => record.market !== 'UNKNOWN'));
  for (const record of records) {
    const quote = quotes.get(record.code);
    const livePrice = currentQuotePrice(quote);
    if (quote && Number.isFinite(livePrice)) {
      const date = yyyymmddToIso(quote.d);
      record.live = {
        date,
        time: quote.t || null,
        price: livePrice,
        reference: number(quote.y),
        analysisPrice: livePrice + (record.events.todayCashDividend || 0),
        exDividendAdjustment: record.events.todayCashDividend || 0
      };
    }
  }
  scoreRecords(records);

  console.log('5/7 執行硬性淘汰與投資組合層級覆核...');
  records.sort((a, b) => {
    const bucketOrder = { A: 0, B: 1, C: 2, D: 3 };
    return bucketOrder[a.bucket] - bucketOrder[b.bucket] || b.adjustedScore - a.adjustedScore || b.confidence - a.confidence;
  });
  const topThreeRecords = selectTopThree(records);
  const ranking = records.map((record, index) => recordForOutput(record, index + 1));
  const topThree = topThreeRecords.map(record => ranking.find(row => row.code === record.code));
  const liveTimes = records.map(record => record.live?.time).filter(Boolean).sort();
  const marketDates = [twseDailyRows[0]?.Date].map(rocDateToIso).filter(Boolean).sort();
  const report = {
    meta: {
      generatedAt: formatDateTimeTaipei(),
      etfDate: yyyymmddToIso(data.meta.latest),
      priceDate: yyyymmddToIso(data.meta.price_date),
      marketDate: marketDates.at(-1) || yyyymmddToIso(data.meta.price_date),
      foreignHoldingDate: foreignHoldingHistory.dates[0],
      institutionalDate: instDates[0] || null,
      liveFreeze: liveTimes.length ? `${TODAY} ${liveTimes.at(-1)}` : '無可驗證即時報價',
      etfCount: data.etfs.length,
      stockCount: stockEntries.length,
      allEtfHeldStocks: allStockEntries.length,
      foreignHoldingCovered: records.filter(record => record.foreignHolding?.trendReliable).length,
      kdCovered: records.filter(record => Number.isFinite(record.technical?.kdK) && Number.isFinite(record.technical?.kdD)).length,
      activeEtfs: activeSet.size,
      activeUpdated: data.meta.active_updated,
      laggingEtfs: data.meta.lagging_etfs,
      incomplete: data.meta.incomplete,
      deepScored: records.filter(record => record.confidence >= 65).length,
      bucketA: records.filter(record => record.bucket === 'A').length,
      rejected: records.filter(record => record.bucket === 'D').length,
      scope: '只篩選籌碼小宇ETF持股資料集中的上市股票；上櫃股票已排除，不等於全部上市股票'
    },
    methodology: {
      weights: WEIGHTS,
      hierarchy: '只看上市股票；ETF以20日看背景、10日看延續、5日看反轉；外資持股存量、外資買賣超、投信與自營商買賣超分開計算；KD只作進出場時機輔助，避免與RSI、MACD重複加權',
      hardFilters: ['信心度>=65%', '單日成交金額>=5,000萬元', '營收未同步明顯衰退', '中期趨勢未明顯向下', 'ETF 5/10日未同步減碼', '外資持股5/10日與外資買賣超未同步轉弱', '投信未持續且具金額意義地賣超', 'KD高低收資料完整且高檔死亡交叉僅作時機警示', '最終布局需具ETF加碼經濟金額或跨基金共識', '未處於處置風險'],
      caveat: '分數用於研究排序；未取得完整一致預估、自由現金流、目標價與個人風險承受度，不是個人化投資建議。'
    },
    eventsMeta: eventsLayerData.events.length > 0 ? {
      fetchedAt: eventsLayerData.fetchedAt,
      totalCount: eventsLayerData.events.length,
      aiEnabled: eventsLayerData.aiEnabled,
      sourceScope: eventsLayerData.sourceScope,
      byType: eventsLayerData.events.reduce((acc, ev) => {
        acc[ev.eventType] = (acc[ev.eventType] || 0) + 1;
        return acc;
      }, {})
    } : null,
    topThree,
    ranking,
    sources: {
      '籌碼小宇 ETF 持股資料': SOURCES.etf,
      '籌碼小宇 法人逐日買賣超整理': SOURCES.institution,
      '籌碼小宇 公司事件資料': SOURCES.events,
      '證交所 三大法人買賣超欄位與日報': SOURCES.twseInstitutional,
      '證交所 外資及陸資投資持股統計': `${SOURCES.twseForeignHolding}?response=html&selectType=01`,
      '證交所 上市估值': SOURCES.twseValuation,
      '公開資訊觀測站 上市月營收': SOURCES.twseRevenue,
      '公開資訊觀測站 上市EPS': SOURCES.twseEps,
      '公開資訊觀測站 上市資產負債表': BALANCE_ENDPOINTS.TWSE[0],
      '證交所 上市日行情': SOURCES.twseDaily,
      '證交所 即時行情': 'https://mis.twse.com.tw/stock/index.jsp',
      'Yahoo Finance 即時新聞 (僅列待確認資訊)': SOURCES.yahooFinanceRss
    },
    sourceGroups: {
      fundamentals: [
        { label: '證交所上市公司月營收', url: SOURCES.twseRevenue },
        { label: '證交所上市公司EPS', url: SOURCES.twseEps },
        { label: '證交所上市公司財務比率與資產負債資料', url: BALANCE_ENDPOINTS.TWSE[0] }
      ],
      valuation: [{ label: '證交所本益比、股價淨值比與殖利率', url: SOURCES.twseValuation }],
      ownership: [
        { label: '籌碼小宇ETF持股資料', url: SOURCES.etf },
        { label: '籌碼小宇法人逐日買賣超整理', url: SOURCES.institution },
        { label: '證交所三大法人買賣超日報', url: SOURCES.twseInstitutional },
        { label: '證交所外資持股資料', url: `${SOURCES.twseForeignHolding}?response=html&selectType=01` }
      ],
      technical: [
        { label: '籌碼小宇個股價格序列', url: `${XIAOYU}/data/stock/` },
        { label: 'Yahoo Finance日K高低收（標準KD）', url: `${SOURCES.yahooChart}{code}.TW?range=6mo&interval=1d` },
        { label: '證交所每日行情', url: SOURCES.twseDaily },
        { label: '證交所即時行情', url: 'https://mis.twse.com.tw/stock/index.jsp' }
      ],
      catalyst: [
        { label: '證交所上市公司月營收', url: SOURCES.twseRevenue },
        { label: '籌碼小宇公司事件資料', url: SOURCES.events }
      ],
      risk: [
        { label: '證交所每日行情與成交金額', url: SOURCES.twseDaily },
        { label: '籌碼小宇ETF持股與資料更新狀態', url: SOURCES.etf },
        { label: '籌碼小宇公司事件資料', url: SOURCES.events }
      ],
      events_layer: [
        { label: 'Yahoo Finance 個股新聞 (待確認資訊)', url: SOURCES.yahooFinanceRss },
        { label: '籌碼小宇公司事件資料 (庫藏股/處置/內部人異動)', url: SOURCES.events }
      ]
    }
  };

  console.log('6/7 寫入JSON、CSV與HTML報告...');
  const dateSlug = yyyymmddToIso(data.meta.latest).replace(/-/g, '');
  const jsonPath = path.join(OUT_DIR, `full-professional-screen-${dateSlug}.json`);
  const csvPath = path.join(OUT_DIR, `full-professional-ranking-${dateSlug}.csv`);
  const htmlPath = path.join(OUT_DIR, `full-professional-screen-${dateSlug}.html`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(csvPath, buildCsv(ranking), 'utf8');
  fs.writeFileSync(htmlPath, buildHtml(report), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'latest.html'), buildHtml(report), 'utf8');
  console.log('7/7 完成');
  console.log(JSON.stringify({
    htmlPath, jsonPath, csvPath,
    topThree: topThree.map(row => ({ code: row.code, name: row.name, action: row.action, score: row.score, rejectionReasons: row.rejectionReasons })),
    meta: report.meta
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
