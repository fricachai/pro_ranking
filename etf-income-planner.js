'use strict';

/*
 * ETF 月月配退休規劃模組（ETF_INCOME_PLANNER_V1）
 *
 * 資料來源（均為 B 級，前台必須揭露）：
 *  1. Yahoo 奇摩股市 dividend 頁（tw.stock.yahoo.com/quote/{code}.TW/dividend）
 *     - SSR 內嵌 "dividends" JSON 陣列：每筆除息紀錄含 exDate（除息日）、
 *       period（M1-12=月配／Q1-4=季配／H=半年配／FY=年配）、
 *       exDividend.cash（每單位現金股利）、cashPayDate（發放日）、
 *       ytmCashByExDate（當次現金殖利率）、ytmCashAccByPayDateY（年度累計殖利率）
 *     - recordType=YEAR 紀錄：年度累計現金股利與年度現金殖利率
 *  2. Yahoo Finance chart API（query1.finance.yahoo.com/v8/finance/chart/...）
 *     - 5 年月收盤價序列，用於 1／3／5 年報酬計算
 *
 * 配息頻率判定（逐檔確定，不靠預設）：
 *  - period 前綴：M→月配、Q→季配、H→半年配、FY→年配
 *  - 交叉驗證：近 12 個月除息次數（月配≈12、季配≈4、半年配≈2、年配≈1）
 *  - 兩者不一致或證據不足 → frequencyStatus=unverified，不進入月月配建議
 *
 * 年化報酬（誠實揭露）：
 *  - 含息現金流：總報酬 = (期末收盤 + 期間現金股利總額 − 期初收盤) / 期初收盤
 *  - 年化 = (1 + 總報酬) ^ (365.25 / 實際天數) − 1；配息假設不再投入
 *  - 歷史不足期間輸出 null 並標示實際可計算區間，不冒充完整 1／3／5 年
 *
 * 任何來源失敗只讓本模組標示 unavailable／partial，不得阻斷主報告發布。
 * 不得補造配息、頻率或報酬數值。
 */

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9'
};

const DAY = 86400e3;
const MONTH_WINDOW_MS = 366 * DAY;

/* 補充候選清單：不在籌碼小宇 ETF 快照（持有臺股）內、但屬臺灣上市配息型
 * 常見標的（債券型、海外型）。清單本身只是「候選」，每檔的配息頻率、
 * 金額與績效一律以抓取到的 Yahoo 頁面事實為準；抓不到或頁面無配息紀錄
 * 者會被標示為無資料／不配息，不會被硬塞數值。 */
const SUPPLEMENTAL_ETFS = [
  { code: '00948B', name: '中信優息投資級債', category: '債券型' },
  { code: '00937B', name: '群益ESG投資級債20+', category: '債券型' },
  { code: '00959B', name: '復華能源債', category: '債券型' },
  { code: '00966B', name: '統一美債10年Aa-A', category: '債券型' },
  { code: '00967B', name: '統一美債20年', category: '債券型' },
  { code: '00968B', name: '統一美債10年', category: '債券型' },
  { code: '00969B', name: '統一美債20年', category: '債券型' },
  { code: '00679B', name: '元大美債20年', category: '債券型' },
  { code: '00687B', name: '國泰20年美債', category: '債券型' },
  { code: '00795B', name: '中信美國公債20年', category: '債券型' },
  { code: '00720B', name: '元大投資級公司債', category: '債券型' },
  { code: '00751B', name: '元大AAA至A公司債', category: '債券型' },
  { code: '00846B', name: '富邦美債20年', category: '債券型' },
  { code: '00931B', name: '統一美債20年', category: '債券型' },
  { code: '00696B', name: '富邦美債20年', category: '債券型' },
  { code: '00646', name: '元大S&P500', category: '海外股票型' },
  { code: '00662', name: '富邦NASDAQ', category: '海外股票型' },
  { code: '00963', name: '中信全球高股息', category: '海外股票型' }
];

const FREQ_LABEL = {
  monthly: '月配',
  quarterly: '季配',
  semiAnnual: '半年配',
  annual: '年配',
  none: '無配息紀錄',
  unverified: '頻率待確認'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchText(url, timeoutMs = 20000, retries = 2) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { headers: UA, signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status === 429 || r.status === 403) { lastErr = new Error(`HTTP ${r.status}`); await sleep(800 * (i + 1)); continue; }
      if (r.status !== 200) { lastErr = new Error(`HTTP ${r.status}`); await sleep(400 * (i + 1)); continue; }
      return await r.text();
    } catch (e) { lastErr = e; await sleep(400 * (i + 1)); }
  }
  throw lastErr || new Error('fetch failed');
}

/* 從 HTML 中抓取以 marker 開頭的 JSON 陣列（簡易括號配對） */
function extractJsonArray(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf('[', idx);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return null;
}

function parseTitle(html, fallback) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m && m[1].trim()) {
    const cleaned = m[1].replace(/\s+/g, ' ').trim();
    const paren = cleaned.indexOf('(');
    if (paren > 0) return cleaned.slice(0, paren).trim();
    if (cleaned.includes('Yahoo')) {
      const part = cleaned.split('|')[0].trim();
      if (part) return part;
    }
  }
  return fallback;
}

/* 從 dividend 頁面 title 判斷市場別（.TW 上市／.TWO 上櫃），失敗時回傳 null */
function detectMarket(html) {
  const m = html.match(/\(([0-9A-Za-z]{4,8})\.(TW|TWO)\)/);
  return m ? m[2] : null;
}

/* 抓取單檔 ETF 的配息歷史 */
async function fetchDividendHistory(code) {
  const url = `https://tw.stock.yahoo.com/quote/${code}.TW/dividend`;
  const html = await fetchText(url);
  const blob = extractJsonArray(html, '"dividends"');
  if (!blob) return { records: [], yearly: [], name: parseTitle(html, null), market: detectMarket(html), error: 'dividends 陣列不存在（頁面結構異常）' };
  let arr;
  try { arr = JSON.parse(blob); } catch (e) { return { records: [], yearly: [], name: parseTitle(html, null), market: detectMarket(html), error: `dividends 解析失敗：${e.message}` }; }
  const records = (Array.isArray(arr) ? arr : []).filter(r => r && r.exDate && r.exDividend && Number.isFinite(parseFloat(r.exDividend.cash)));
  const yearly = (Array.isArray(arr) ? arr : []).filter(r => r && r.recordType === 'YEAR');
  return {
    records,
    yearly,
    name: parseTitle(html, null),
    market: detectMarket(html),
    error: null
  };
}

/* 抓取 5 年月收盤價序列（上市 .TW／上櫃 .TWO） */
async function fetchMonthlyPrices(code, market = 'TW') {
  const suffix = market === 'TWO' ? 'TWO' : 'TW';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.${suffix}?range=5y&interval=1mo`;
  const text = await fetchText(url);
  const j = JSON.parse(text);
  const res = j?.chart?.result && j.chart.result[0];
  if (!res || !res.timestamp || !res.indicators?.quote?.[0]) throw new Error('chart 回應結構異常');
  const q = res.indicators.quote[0];
  const points = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const close = q.close[i];
    if (Number.isFinite(close) && Number.isFinite(res.timestamp[i])) {
      points.push({ t: new Date(res.timestamp[i] * 1000), c: close });
    }
  }
  if (!points.length) throw new Error('chart 沒有有效月收盤價');
  return { points, meta: res.meta || {} };
}

/* 頻率判定：period 前綴 + 近 12 個月除息次數交叉驗證 */
function classifyFrequency(records, now = Date.now()) {
  if (!records.length) return { frequency: 'none', evidence: '無任何除息紀錄', verified: false };
  const prefixCount = {};
  const recent = [];
  for (const r of records) {
    const p = String(r.period || '').replace(/\d+$/, '');
    if (p) prefixCount[p] = (prefixCount[p] || 0) + 1;
    const ex = new Date(r.exDate);
    if (Number.isFinite(ex.getTime()) && now - ex.getTime() <= MONTH_WINDOW_MS && ex.getTime() <= now) recent.push(r);
  }
  const periods = Object.entries(prefixCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);
  const prefix = Object.entries(prefixCount).sort((a, b) => b[1] - a[1])[0][0];
  const count12 = recent.length;
  let frequency;
  if (prefix === 'M') frequency = 'monthly';
  else if (prefix === 'Q') frequency = 'quarterly';
  else if (prefix === 'H') frequency = 'semiAnnual';
  else if (prefix === 'FY' || prefix === 'Y') frequency = 'annual';
  else frequency = 'unverified';
  const expect = { monthly: [10, 13], quarterly: [3, 5], semiAnnual: [1, 3], annual: [1, 2] };
  let verified = true;
  if (frequency !== 'unverified' && frequency !== 'none') {
    const [lo, hi] = expect[frequency];
    if (count12 < lo || count12 > hi) verified = false;
  }
  if (frequency === 'none') verified = false;
  return {
    frequency,
    verified,
    evidence: `period=${periods.join('、')}；近12個月除息 ${count12} 次`
  };
}

/* 年化報酬：含息現金流（配息不再投入） */
function computeReturn(points, dividends, daysAgo, now) {
  const end = points[points.length - 1];
  const target = end.t.getTime() - daysAgo * DAY;
  let start = null;
  for (const p of points) {
    if (p.t.getTime() <= target) start = p;
    else break;
  }
  if (!start || start === end) return null;
  let sumCash = 0;
  for (const r of dividends) {
    const ex = new Date(r.exDate).getTime();
    if (ex > start.t.getTime() && ex <= end.t.getTime()) sumCash += parseFloat(r.exDividend.cash) || 0;
  }
  const years = (end.t.getTime() - start.t.getTime()) / (365.25 * DAY);
  if (years <= 0.01) return null;
  const total = (end.c + sumCash - start.c) / start.c;
  const annualized = Math.pow(1 + total, 1 / years) - 1;
  return {
    totalPct: total * 100,
    annualizedPct: annualized * 100,
    interval: `${start.t.toISOString().slice(0, 10)} ~ ${end.t.toISOString().slice(0, 10)}`,
    years,
    startPrice: start.c,
    endPrice: end.c,
    cashPerUnit: sumCash
  };
}

/* 整批抓取與計算 */
async function computeEtfIncomeData(etfCodes, options = {}) {
  const now = Date.now();
  const delayMs = options.delayMs ?? 280;
  const maxFetch = options.maxFetch ?? 140;
  const codes = [...etfCodes].slice(0, maxFetch);
  const results = [];
  const failures = [];
  for (let i = 0; i < codes.length; i++) {
    const { code, name, category } = codes[i];
    try {
      const div = await fetchDividendHistory(code);
      if (div.error) throw new Error(div.error);
      const { records, yearly } = div;
      const market = div.market || 'TW';
      const freq = classifyFrequency(records, now);
      const recent12 = records.filter(r => {
        const ex = new Date(r.exDate).getTime();
        return Number.isFinite(ex) && now - ex <= MONTH_WINDOW_MS && ex <= now;
      });
      const sumCash12 = recent12.reduce((s, r) => s + (parseFloat(r.exDividend.cash) || 0), 0);
      let price = null, points = null, returns = null, volume = null;
      if (records.length) {
        try {
          const chart = await fetchMonthlyPrices(code, market);
          points = chart.points;
          price = Number.isFinite(chart.meta.regularMarketPrice) ? chart.meta.regularMarketPrice : points[points.length - 1].c;
          volume = Number.isFinite(chart.meta.regularMarketVolume) ? chart.meta.regularMarketVolume : null;
          returns = {
            '1y': computeReturn(points, records, 365, now),
            '3y': computeReturn(points, records, 365 * 3, now),
            '5y': computeReturn(points, records, 365 * 5, now),
            maxHistoryYears: points.length ? (points[points.length - 1].t.getTime() - points[0].t.getTime()) / (365.25 * DAY) : 0,
            method: '含息現金流：期末收盤＋期間現金股利（不再投入），年化=(1+總報酬)^(365.25/天數)−1'
          };
        } catch (e) {
          price = null;
          returns = null;
        }
      }
      const yearRec = yearly.find(y => y.yearBySort === String(new Date(now).getFullYear())) || yearly[0] || null;
      const lastRec = records[0] || null;
      const dividendMonths12 = [...new Set(recent12.map(r => new Date(r.exDate).getMonth() + 1))].sort((a, b) => a - b);
      const upcomingExDate = records.find(r => {
        const ex = new Date(r.exDate).getTime();
        return Number.isFinite(ex) && ex >= now && ex - now <= 60 * DAY;
      });
      let timing = null;
      if (records.length) {
        try {
          const ind = await fetchDailyIndicators(code, market);
          timing = buildTiming({
            price,
            upcomingExDate: upcomingExDate ? upcomingExDate.exDate.slice(0, 10) : null
          }, ind, new Date(now));
        } catch (e) {
          timing = { status: 'no_data', label: '暫無技術資料', reason: `本次未取得可驗證的日K技術指標（${e.message}）`, zoneLow: null, zoneHigh: null };
        }
      }
      results.push({
        code,
        name: div.name || name || code,
        market,
        category: category || '股票型',
        price,
        priceSource: price !== null ? 'yahoo-chart-regularMarketPrice' : null,
        frequency: freq.frequency,
        frequencyVerified: freq.verified,
        frequencyEvidence: freq.evidence,
        frequencyLabel: FREQ_LABEL[freq.frequency],
        cashPerUnit12m: records.length ? sumCash12 : 0,
        monthlyCashPerUnit: records.length ? sumCash12 / 12 : 0,
        trailingYieldPct: (price && sumCash12) ? (sumCash12 / price) * 100 : null,
        sourceYearYieldPct: yearRec && yearRec.ytmCashByExDate ? parseFloat(yearRec.ytmCashByExDate) : null,
        sourceYearCash: yearRec && yearRec.exDividend && Number.isFinite(parseFloat(yearRec.exDividend.cash)) ? parseFloat(yearRec.exDividend.cash) : null,
        dividendCount12m: recent12.length,
        dividendMonths12,
        upcomingExDate: upcomingExDate ? upcomingExDate.exDate.slice(0, 10) : null,
        lastExDate: lastRec ? lastRec.exDate.slice(0, 10) : null,
        lastCashPayDate: lastRec && lastRec.exDividend && lastRec.exDividend.cashPayDate ? String(lastRec.exDividend.cashPayDate).slice(0, 10) : null,
        returns,
        timing,
        volume
      });
    } catch (e) {
      failures.push({ code, error: e.message });
    }
    if (i < codes.length - 1) await sleep(delayMs);
  }
  const withDividend = results.filter(r => r.frequency !== 'none' && r.records !== undefined);
  return {
    status: failures.length === codes.length ? 'unavailable' : failures.length ? 'partial' : 'ok',
    fetchedAt: new Date(now).toISOString(),
    sourceLabel: 'Yahoo 奇摩股市配息頁＋Yahoo Finance 月收盤（B 級）',
    universeCount: codes.length,
    okCount: results.length,
    failureCount: failures.length,
    failures,
    etfs: results
  };
}

/* 建立候選清單：既有 ETF 快照 + 補充清單 */
function buildCandidateUniverse(existingEtfs) {
  const seen = new Set();
  const list = [];
  for (const etf of existingEtfs || []) {
    const code = String(etf.code || '').trim();
    if (!/^\d{4,6}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    list.push({ code, name: etf.name || code, category: '股票型' });
  }
  for (const etf of SUPPLEMENTAL_ETFS) {
    if (seen.has(etf.code)) continue;
    seen.add(etf.code);
    list.push({ ...etf });
  }
  return list;
}

/* 前端配置計算：輸入資金與勾選，輸出每月預估股息 */
function planAllocation(etfs, allocations, totalCapital) {
  const rows = [];
  let monthlyTotal = 0;
  for (const a of allocations) {
    const etf = etfs.find(x => x.code === a.code);
    if (!etf || !Number.isFinite(etf.price) || etf.price <= 0 || !(etf.frequency in FREQ_LABEL)) continue;
    const weight = Number.isFinite(a.weight) ? a.weight : 0;
    const capital = totalCapital * weight;
    const units = capital / etf.price;
    const monthlyCash = units * etf.monthlyCashPerUnit;
    monthlyTotal += monthlyCash;
    rows.push({
      code: etf.code,
      name: etf.name,
      frequencyLabel: etf.frequencyLabel,
      frequencyVerified: etf.frequencyVerified,
      price: etf.price,
      capital,
      weight,
      units,
      monthlyCashPerUnit: etf.monthlyCashPerUnit,
      monthlyCash
    });
  }
  return {
    totalCapital,
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    rows
  };
}

/* 抓取 1 年日K並計算技術指標（EMA20／EMA60／RSI14／標準KD9,3,3／乖離），
   用真實最高、最低、收盤價，與個股報告同規則。 */
async function fetchDailyIndicators(code, market = 'TW') {
  const suffix = market === 'TWO' ? 'TWO' : 'TW';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.${suffix}?range=1y&interval=1d`;
  const text = await fetchText(url);
  const j = JSON.parse(text);
  const res = j?.chart?.result && j.chart.result[0];
  if (!res || !res.timestamp || !res.indicators?.quote?.[0]) throw new Error('日K回應結構異常');
  const q = res.indicators.quote[0];
  const closes = [], highs = [], lows = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (Number.isFinite(q.close[i])) closes.push(q.close[i]);
    if (Number.isFinite(q.high[i])) highs.push(q.high[i]);
    if (Number.isFinite(q.low[i])) lows.push(q.low[i]);
  }
  if (closes.length < 65) throw new Error(`日K資料不足（${closes.length}日）`);
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    let e = arr[0];
    for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  };
  const ema20 = ema(closes, 20);
  const ema60 = ema(closes, 60);
  const lastClose = closes[closes.length - 1];
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(0, d));
    losses.push(Math.max(0, -d));
  }
  const avg = (arr, n) => arr.slice(-n).reduce((s, x) => s + x, 0) / n;
  const ag = avg(gains, 14), al = avg(losses, 14);
  const rsi14 = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  const kdArr = [];
  let kPrev = 50, dPrev = 50;
  for (let i = 8; i < closes.length; i++) {
    const hh = Math.max(...highs.slice(i - 8, i + 1));
    const ll = Math.min(...lows.slice(i - 8, i + 1));
    const rsv = hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100;
    const k = (2 / 3) * kPrev + (1 / 3) * rsv;
    const d = (2 / 3) * dPrev + (1 / 3) * k;
    kPrev = k; dPrev = d;
    kdArr.push({ k, d });
  }
  const kd = kdArr[kdArr.length - 1] || { k: 50, d: 50 };
  const lastDate = new Date(res.timestamp[res.timestamp.length - 1] * 1000).toISOString().slice(0, 10);
  return {
    lastClose,
    lastDate,
    ema20,
    ema60,
    rsi14,
    kdK: kd.k,
    kdD: kd.d,
    bias20Pct: (lastClose / ema20 - 1) * 100,
    rangeLow: Math.min(...lows),
    rangeHigh: Math.max(...highs)
  };
}

/* 投入時點建議：直接回答「現在投入或不投入」，保留技術理由與近一年價格位置 */
function buildTiming(etf, ind, today = new Date()) {
  if (!ind) return { status: 'no_data', decision: 'unknown', label: '無法判斷', reason: '本次未取得可驗證的日K技術指標', zoneLow: null, zoneHigh: null, rangeLow: null, rangeHigh: null, rangePositionPct: null };
  const zoneLow = ind.ema20 * 0.985, zoneHigh = ind.ema20 * 1.015;
  let status, decision, label, reason;
  if (ind.lastClose < ind.ema20) {
    status = 'watch';
    decision = 'wait';
    label = '現在不投入';
    reason = `目前價 ${fmtPrice(ind.lastClose)} 在 20日EMA（${fmtPrice(ind.ema20)}）下方，趨勢尚未站回；等收盤站回 ${fmtPrice(ind.ema20)} 以上再考慮第一批，回測承接區 ${fmtPrice(zoneLow)}–${fmtPrice(zoneHigh)} 附近才分批。`;
  } else if (ind.bias20Pct > 5) {
    status = 'wait';
    decision = 'wait';
    label = '現在不投入';
    reason = `目前價 ${fmtPrice(ind.lastClose)} 高於 20日EMA 約 ${ind.bias20Pct.toFixed(1)}%，短線漲多、追價風險高；等價格回測到 ${fmtPrice(zoneLow)}–${fmtPrice(zoneHigh)} 再分批。`;
  } else if (ind.rsi14 > 75) {
    status = 'hot';
    decision = 'wait';
    label = '現在不投入';
    reason = `RSI14 約 ${ind.rsi14.toFixed(0)} 偏熱，短線過熱、追價風險高；等指標降溫（RSI 回到 70 以下）再考慮分批。`;
  } else if (ind.kdK < 30 && ind.kdK > ind.kdD) {
    status = 'observe';
    decision = 'wait';
    label = '現在不投入（觀察）';
    reason = `KD 低檔（K=${ind.kdK.toFixed(0)}／D=${ind.kdD.toFixed(0)}）剛黃金交叉，屬低檔轉強觀察；確認收盤站回 20日EMA（${fmtPrice(ind.ema20)}）後再投入第一批，跌破 60日EMA（${fmtPrice(ind.ema60)}）則放棄。`;
  } else {
    status = 'ok';
    decision = 'invest';
    label = '現在可投入第一批';
    reason = `目前價 ${fmtPrice(ind.lastClose)} 站穩 20日EMA（${fmtPrice(ind.ema20)}）、RSI ${ind.rsi14.toFixed(0)} 未過熱、KD ${ind.kdK.toFixed(0)}／${ind.kdD.toFixed(0)} 無極端訊號；建議先投入配置金額的 1／3，回測 ${fmtPrice(zoneLow)}–${fmtPrice(zoneHigh)} 再加碼，收盤跌破 60日EMA（${fmtPrice(ind.ema60)}）則暫停後續加碼。`;
  }
  const upcoming = etf.upcomingExDate;
  if (upcoming) {
    reason += ` 最近除息日 ${upcoming} 將至；除息會使淨值同步下降，需以填息判斷實際獲益，不因「領息」單獨追買。`;
  }
  const rangePositionPct = (ind.rangeLow !== null && ind.rangeHigh !== null && ind.rangeHigh > ind.rangeLow)
    ? (ind.lastClose - ind.rangeLow) / (ind.rangeHigh - ind.rangeLow) * 100 : null;
  return { status, decision, label, reason, zoneLow, zoneHigh, ema20: ind.ema20, ema60: ind.ema60, rsi14: ind.rsi14, kdK: ind.kdK, kdD: ind.kdD, bias20Pct: ind.bias20Pct, lastClose: ind.lastClose, lastDate: ind.lastDate, rangeLow: ind.rangeLow, rangeHigh: ind.rangeHigh, rangePositionPct };
}

const TIMING_LABEL = { ok: '現在可投入第一批', watch: '現在不投入', wait: '現在不投入', hot: '現在不投入', observe: '現在不投入（觀察）', no_data: '無法判斷' };
function fmtPrice(v) { return Number.isFinite(v) ? v.toFixed(2) : '—'; }

/* ---------- 前端 UI（與 international-ui.js 相同的產生器注入模式） ---------- */

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
const n0 = v => Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: 0 }) : '—';
const s = (v, d = 1, unit = '%') => Number.isFinite(v) ? (v > 0 ? '+' : '') + n(v, d) + unit : '—';

function compactEtfForUi(etf) {
  return {
    code: etf.code,
    name: etf.name,
    market: etf.market || 'TW',
    category: etf.category || '股票型',
    frequency: etf.frequency,
    frequencyVerified: Boolean(etf.frequencyVerified),
    frequencyLabel: etf.frequencyLabel,
    price: etf.price,
    trailingYieldPct: etf.trailingYieldPct,
    monthlyCashPerUnit: etf.monthlyCashPerUnit,
    cashPerUnit12m: etf.cashPerUnit12m,
    dividendMonths12: etf.dividendMonths12 || [],
    upcomingExDate: etf.upcomingExDate,
    lastExDate: etf.lastExDate,
    lastCashPayDate: etf.lastCashPayDate,
    returns: etf.returns ? {
      '1y': etf.returns['1y'] ? { annualizedPct: etf.returns['1y'].annualizedPct, totalPct: etf.returns['1y'].totalPct, interval: etf.returns['1y'].interval, years: etf.returns['1y'].years } : null,
      '3y': etf.returns['3y'] ? { annualizedPct: etf.returns['3y'].annualizedPct, totalPct: etf.returns['3y'].totalPct, interval: etf.returns['3y'].interval, years: etf.returns['3y'].years } : null,
      '5y': etf.returns['5y'] ? { annualizedPct: etf.returns['5y'].annualizedPct, totalPct: etf.returns['5y'].totalPct, interval: etf.returns['5y'].interval, years: etf.returns['5y'].years } : null,
      maxHistoryYears: etf.returns.maxHistoryYears,
      method: etf.returns.method
    } : null,
    timing: etf.timing ? {
      status: etf.timing.status,
      decision: etf.timing.decision,
      label: etf.timing.label,
      reason: etf.timing.reason,
      zoneLow: etf.timing.zoneLow,
      zoneHigh: etf.timing.zoneHigh,
      ema20: etf.timing.ema20,
      ema60: etf.timing.ema60,
      rsi14: etf.timing.rsi14,
      kdK: etf.timing.kdK,
      kdD: etf.timing.kdD,
      lastClose: etf.timing.lastClose,
      lastDate: etf.timing.lastDate,
      rangeLow: etf.timing.rangeLow,
      rangeHigh: etf.timing.rangeHigh,
      rangePositionPct: etf.timing.rangePositionPct
    } : null,
    volume: etf.volume
  };
}

function envCard(env) {
  if (!env) return '<div class="etfi-env"><b>環境判讀</b><p>本次未取得可驗證的國際環境脈絡；仍以個別 ETF 的配息、績效與技術承接區為主要依據。</p></div>';
  const j = env.judgments || {};
  return `<div class="etfi-env">
    <div class="etfi-env-head"><b>現在大環境（時空背景參考）</b><span>${e(env.regime)}</span></div>
    <p>${e(env.regimeAction || '')}</p>
    <div class="etfi-env-grid">
      <div class="etfi-env-item"><b>股票型高股息 ETF</b><span>${e(j.equity || '—')}</span></div>
      <div class="etfi-env-item"><b>債券型 ETF</b><span>${e(j.bond || '—')}</span></div>
      <div class="etfi-env-item"><b>海外型 ETF</b><span>${e(j.offshore || '—')}</span></div>
    </div>
    <details class="etfi-env-scenarios"><summary>未來大環境的三種可能情境（推演，不是預測）</summary>
      <ul>${(env.scenarios || []).map(x => `<li>${e(x)}</li>`).join('')}</ul>
      <small>${e(env.sourceNote || '')}</small>
    </details>
  </div>`;
}

function renderEtfIncomePlanner(data) {
  if (!data || data.status === 'unavailable') {
    return `<section class="section etfi-section" id="etfIncomePlanner"><h2>ETF 月月配退休規劃</h2>
      <p>本次未能取得可驗證的 ETF 配息與績效資料（${e(data && data.failures && data.failures[0] ? data.failures[0].error : '來源未回傳')}）。此區塊不影響其餘報告；下次更新時會重新嘗試。</p></section>`;
  }
  const etfs = (data.etfs || []).map(compactEtfForUi);
  const env = data.environment;
  const bestMonthly = data.bestMonthly || { picks: [], selected: [] };
  const bestStaggered = data.bestStaggered || { picks: [], selected: [] };
  const statusBadge = data.status === 'ok' ? '完整' : data.status === 'partial' ? '部分（缺 ' + (data.failureCount || 0) + ' 檔）' : '—';
  const countByFreq = {};
  for (const x of etfs) countByFreq[x.frequencyLabel] = (countByFreq[x.frequencyLabel] || 0) + 1;
  const freqSummary = ['月配', '季配', '半年配', '年配'].filter(k => countByFreq[k]).map(k => `${k} ${countByFreq[k]} 檔`).join('、');
  const rowsHtml = etfs.map(x => etfRowHtml(x)).join('');
  const envHtml = envCard(env);
  return `<section class="section etfi-section" id="etfIncomePlanner" data-contract="ETF_INCOME_PLANNER_V1">
    <h2>ETF 月月配退休規劃 <span class="etfi-badge">${e(statusBadge)}</span></h2>
    <p class="section-lead">設定可投入資金，系統依「配息頻率（逐檔以實際除息紀錄確定）、現金殖利率、1／3／5 年含息年化報酬、投入時點與目前大環境」提出研究建議；可採用下方「3 支最佳配置」快速方案，或自行勾選標的與權重。月月領息可用「月配 ETF 直領」或「季配 ETF 錯開月份」兩種方式達成。</p>
    ${envHtml}
    <div class="etfi-layout">
      <div class="etfi-left">
        <div class="etfi-capital">
          <label for="etfiCapital">可投入資金（新臺幣）</label>
          <div class="etfi-capital-row">
            <input id="etfiCapital" type="number" min="10000" step="10000" value="100000" inputmode="numeric">
            <div class="etfi-quick">
              ${[100000, 200000, 300000, 500000, 1000000].map(v => `<button type="button" class="etfi-quick-btn" data-capital="${v}">${v >= 1000000 ? '100萬' : (v / 10000) + '萬'}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="etfi-mode">
          <button type="button" class="etfi-mode-btn is-active" data-mode="monthly">月配直領（每月都有股息）</button>
          <button type="button" class="etfi-mode-btn" data-mode="staggered">季配錯月（三檔輪流配）</button>
        </div>
        <div class="etfi-best" id="etfiBest"></div>
        <div class="etfi-filter">
          <select id="etfiFreqFilter" aria-label="依配息頻率篩選">
            <option value="">全部可配息標的</option>
            <option value="月配">僅月配</option>
            <option value="季配">僅季配</option>
            <option value="其他">半年配／年配／頻率待確認</option>
          </select>
          <span class="etfi-filter-note">${e(freqSummary)}（全部 ${etfs.length} 檔候選中可配息 ${freqSummary.split('、').reduce((s, k) => s + (countByFreq[k.split(' ')[0] === '月配' ? '月配' : k.split(' ')[0]] || 0), 0)} 檔）</span>
        </div>
        <div class="etfi-list" id="etfiList">${rowsHtml}</div>
      </div>
      <div class="etfi-right">
        <div class="etfi-result" id="etfiResult"></div>
        <div class="etfi-notes">
          <details open><summary>怎麼讀這份規劃</summary>
            <ul>
              <li>「月配直領」：全部選月配 ETF，每個月都領息。</li>
              <li>「季配錯月」：挑 3 檔除息月份不同（各差 1 個月）的季配 ETF，每月輪流領息。</li>
              <li>「每月預估股息」＝各檔配置金額 ÷ 現價 × 近 12 個月每單位配息 ÷ 12 加總；配息金額可能逐月變動，這是估算不是保證。</li>
              <li>「含息年化報酬」＝期末收盤＋期間現金股利（不再投入）÷ 期初收盤，再年化；歷史不足的期間會誠實標示。</li>
              <li>「投入時點」以 ETF 本身 20／60 日 EMA、RSI、標準 KD 與除息時點判斷，只作分批節奏參考，不是買賣指令。</li>
            </ul>
          </details>
          <details><summary>風險與限制（必讀）</summary>
            <ul>
              <li>配息不是保證：可能來自股息、利息或基金收益平準金／本金；除息會使淨值同步下降，須以填息判斷實際獲益。</li>
              <li>高殖利率不代表高總報酬：若價格長期下跌，領到的息可能小於本金的損失。</li>
              <li>本區塊資料來自 Yahoo 奇摩股市配息頁與 Yahoo Finance 月收盤（B 級），非投信官方逐筆對帳；頻率以實際除息紀錄判定。</li>
              <li>年化報酬未計入配息再投資，也不代表未來表現；過去績效發生於特定利率、景氣與股市環境，環境會改變。</li>
              <li>環境情境只是可能性推演，不是走勢預測；實際配置請依個人風險承受度與退休需求調整。</li>
              <li>本功能是研究排序與試算工具，不構成投資建議；資金投入請自行決定，必要時尋求專業諮詢。</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
    <script id="etfi-data" type="application/json">${JSON.stringify({ etfs, env, bestMonthly: bestMonthly.selected, bestStaggered: bestStaggered.selected, fetchedAt: data.fetchedAt, sourceLabel: data.sourceLabel }).replace(/<\//g, '<\\/')}</script>
    <script>${etfPlannerClientScript}</script>
  </section>`;
}

/* 近一年價格位置圖：低點→高點色帶＋現價標記＋位置說明 */
function rangeChartHtml(t) {
  if (!t || !Number.isFinite(t.rangeLow) || !Number.isFinite(t.rangeHigh) || t.rangeHigh <= t.rangeLow) {
    return '<div class="etfi-range"><div class="etfi-range-note">近一年高低點：暫無資料</div></div>';
  }
  const pos = Math.max(0, Math.min(100, Number.isFinite(t.rangePositionPct) ? t.rangePositionPct : (t.lastClose - t.rangeLow) / (t.rangeHigh - t.rangeLow) * 100));
  const zoneLabel = pos < 33 ? '位於近一年區間低位' : pos < 67 ? '位於近一年區間中段' : '位於近一年區間高位';
  const mid = (t.rangeLow + t.rangeHigh) / 2;
  return `<div class="etfi-range">
    <div class="etfi-range-bar" aria-hidden="true">
      <span class="etfi-range-dot" style="left:${pos.toFixed(1)}%"></span>
    </div>
    <div class="etfi-range-labels"><span>低 ${n(t.rangeLow, 2)}</span><span>中 ${n(mid, 2)}</span><span>高 ${n(t.rangeHigh, 2)}</span></div>
    <div class="etfi-range-note">目前價 ${n(t.lastClose, 2)}｜近一年區間約 ${pos.toFixed(0)}%｜${zoneLabel}</div>
  </div>`;
}

function etfRowHtml(x) {
  const r = x.returns || {};
  const t = x.timing;
  const freqMark = x.frequencyVerified ? `<span class="etfi-freq is-verified" title="以實際除息紀錄確認">${e(x.frequencyLabel)}✓</span>` : `<span class="etfi-freq" title="頻率證據不足或無配息紀錄">${e(x.frequencyLabel)}</span>`;
  const yieldHtml = Number.isFinite(x.trailingYieldPct) ? `<b>${n(x.trailingYieldPct, 2)}%</b>` : '<b>—</b>';
  const returnCell = (k, label) => {
    const v = r[k];
    if (!v) return `<span class="etfi-ret is-none" title="上市歷史不足或本次無資料">${label} —</span>`;
    return `<span class="etfi-ret ${v.annualizedPct < 0 ? 'is-neg' : ''}">${label} <b>${s(v.annualizedPct, 1)}</b><small>${e(v.interval)}</small></span>`;
  };
  const timingHtml = t ? `<div class="etfi-timing etfi-timing-${e(t.status)} etfi-decision-${e(t.decision || 'unknown')}">
      <b class="etfi-decision-badge">${e(t.label)}</b>
      <span>${e(t.reason)}</span>
      ${rangeChartHtml(t)}
      <small>技術資料日 ${e(t.lastDate || '')}${Number.isFinite(t.zoneLow) ? '｜承接區 ' + n(t.zoneLow, 2) + '–' + n(t.zoneHigh, 2) : ''}</small>
    </div>` : '';
  const months = (x.dividendMonths12 || []).map(m => m + '月').join('、') || '—';
  return `<div class="etfi-row" data-code="${e(x.code)}" data-frequency="${e(x.frequencyLabel)}" data-verified="${x.frequencyVerified}">
    <div class="etfi-row-head">
      <label class="etfi-check"><input type="checkbox" data-etfi-check="${e(x.code)}" aria-label="選擇 ${e(x.code)} ${e(x.name)}"><span></span></label>
      <div class="etfi-title"><b>${e(x.code)} ${e(x.name)}</b>${freqMark}<span class="etfi-cat">${e(x.category)}${x.market === 'TWO' ? '·上櫃' : ''}</span></div>
      <div class="etfi-price">現價 <b>${n(x.price, 2)}</b><small>${e(x.lastExDate ? '最近除息 ' + x.lastExDate : '')}${e(x.upcomingExDate ? '｜即將除息 ' + x.upcomingExDate : '')}</small></div>
    </div>
    <div class="etfi-metrics">
      <span class="etfi-metric"><small>近12個月每單位配息</small><b>${n(x.cashPerUnit12m, 3)} 元</b></span>
      <span class="etfi-metric"><small>現金殖利率（近12月）</small>${yieldHtml}</span>
      <span class="etfi-metric"><small>近12個月除息</small><b>${x.dividendMonths12 ? x.dividendMonths12.length : 0} 次</b><small>月份 ${e(months)}</small></span>
      <span class="etfi-metric"><small>含息年化報酬（配息不再投入）</small><span class="etfi-rets">${returnCell('1y', '1年')}${returnCell('3y', '3年')}${returnCell('5y', '5年')}</span><small>最長可計算 ${n(r.maxHistoryYears, 1)} 年</small></span>
    </div>
    <div class="etfi-row-bottom">
      <label class="etfi-weight">權重 <input type="number" min="0" max="100" step="5" value="0" data-etfi-weight="${e(x.code)}"> %</label>
      <span class="etfi-contrib">每月預估 <b class="etfi-contrib-val" data-etfi-contrib="${e(x.code)}">—</b></span>
    </div>
    ${timingHtml}
  </div>`;
}

/* 前端互動：資金、模式、勾選、權重 → 每月預估股息 */
const etfPlannerClientScript = `(function(){
  var DATA = JSON.parse(document.getElementById('etfi-data').textContent);
  var state = { capital: 100000, mode: 'monthly', selected: {} };
  var ETFI_SELECTED_KEY = 'proRankingEtfiSelectionV1';
  function n(v, d){ return Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'; }
  function init(){
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(ETFI_SELECTED_KEY) || 'null'); } catch(x) {}
    if (saved && saved.mode) state.mode = saved.mode; else state.mode = 'monthly';
    if (saved && saved.selected) state.selected = saved.selected; else state.selected = {};
    var cap = document.getElementById('etfiCapital');
    if (saved && saved.capital) cap.value = saved.capital;
    var best = state.mode === 'staggered' ? DATA.bestStaggered : DATA.bestMonthly;
    var rows = document.querySelectorAll('.etfi-row');
    rows.forEach(function(row){
      var code = row.getAttribute('data-code');
      var w = document.querySelector('[data-etfi-weight="'+code+'"]');
      var c = document.querySelector('[data-etfi-check="'+code+'"]');
      if (state.selected[code] !== undefined) {
        c.checked = true;
        w.value = Math.round(state.selected[code] * 100);
      } else {
        c.checked = false;
        w.value = 0;
      }
    });
    if (!Object.keys(state.selected).length && best && best.length) {
      state.selected = {};
      best.forEach(function(code){ state.selected[code] = 1 / best.length; });
      rows.forEach(function(row){
        var code = row.getAttribute('data-code');
        var c = document.querySelector('[data-etfi-check="'+code+'"]');
        var w = document.querySelector('[data-etfi-weight="'+code+'"]');
        if (state.selected[code] !== undefined) { c.checked = true; w.value = Math.round(state.selected[code] * 100); }
      });
    }
    applyFilters();
    render();
  }
  function applyFilters(){
    var f = document.getElementById('etfiFreqFilter').value;
    document.querySelectorAll('.etfi-row').forEach(function(row){
      var freq = row.getAttribute('data-frequency');
      var verified = row.getAttribute('data-verified') === 'true';
      var show = true;
      if (f === '月配') show = freq === '月配' && verified;
      else if (f === '季配') show = freq === '季配' && verified;
      else if (f === '其他') show = !(freq === '月配' && verified) && !(freq === '季配' && verified);
      else show = (freq === '月配' || freq === '季配') && verified;
      row.style.display = show ? '' : 'none';
    });
  }
  function selectedList(){
    var out = [];
    document.querySelectorAll('.etfi-row').forEach(function(row){
      var code = row.getAttribute('data-code');
      var c = document.querySelector('[data-etfi-check="'+code+'"]');
      var w = document.querySelector('[data-etfi-weight="'+code+'"]');
      if (c && c.checked) {
        var wt = parseFloat(w.value);
        if (!isFinite(wt) || wt < 0) wt = 0;
        out.push({ code: code, weight: wt / 100 });
      }
    });
    var sum = out.reduce(function(s, x){ return s + x.weight; }, 0);
    if (sum > 0) out.forEach(function(x){ x.weight = x.weight / sum; });
    return out;
  }
  function etfOf(code){ return DATA.etfs.find(function(x){ return x.code === code; }); }
  function render(){
    var capital = parseFloat(document.getElementById('etfiCapital').value);
    if (!isFinite(capital) || capital < 0) capital = 0;
    state.capital = capital;
    var list = selectedList();
    state.selected = {};
    list.forEach(function(x){ state.selected[x.code] = x.weight; });
    try { localStorage.setItem(ETFI_SELECTED_KEY, JSON.stringify({ mode: state.mode, capital: capital, selected: state.selected })); } catch(x) {}
    var rows = [];
    var monthlyTotal = 0;
    list.forEach(function(x){
      var etf = etfOf(x.code);
      if (!etf || !isFinite(etf.price) || etf.price <= 0) return;
      var capitalShare = capital * x.weight;
      var units = capitalShare / etf.price;
      var monthlyCash = units * (etf.monthlyCashPerUnit || 0);
      monthlyTotal += monthlyCash;
      rows.push({ etf: etf, weight: x.weight, capitalShare: capitalShare, units: units, monthlyCash: monthlyCash });
    });
    var bestEl = document.getElementById('etfiBest');
    var bestModeLabel = state.mode === 'staggered' ? '季配錯月最佳配置' : '月配直領最佳配置';
    var bestCodes = state.mode === 'staggered' ? DATA.bestStaggered : DATA.bestMonthly;
    bestEl.innerHTML = '<div class="etfi-best-head"><b>' + bestModeLabel + '</b><span>每月都有配息｜可再自行增減標的</span></div><div class="etfi-best-codes">' + (bestCodes || []).map(function(code){
      var etf = etfOf(code);
      if (!etf) return '';
      var isSel = rows.some(function(r){ return r.etf.code === code; });
      return '<span class="etfi-best-chip ' + (isSel ? 'is-sel' : '') + '">' + code + ' ' + etf.name + (isFinite(etf.trailingYieldPct) ? '（殖利率 ' + etf.trailingYieldPct.toFixed(2) + '%）' : '') + '</span>';
    }).join('') + '</div>';
    var resultEl = document.getElementById('etfiResult');
    if (!rows.length) {
      resultEl.innerHTML = '<div class="etfi-result-empty"><b>尚未選擇標的</b><p>使用上方「3 支最佳配置」自動選取，或在左側勾選 ETF 標的。</p></div>';
      return;
    }
    resultEl.innerHTML = '<div class="etfi-result-head"><span>每月預估股息（' + (state.mode === 'staggered' ? '季配錯月，每月輪流領' : '月配直領，每月領') + '）</span><b class="etfi-result-total">約 ' + monthlyTotal.toLocaleString('zh-TW', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' 元／月</b><small>年化估算 ' + (monthlyTotal * 12).toLocaleString('zh-TW', { maximumFractionDigits: 0 }) + ' 元／年（近12個月配息推算，非保證）</small></div>' + rows.map(function(r){
      var etf = r.etf;
      return '<div class="etfi-result-row"><div><b>' + etf.code + ' ' + etf.name + '</b><span>' + etf.frequencyLabel + '｜權重 ' + Math.round(r.weight * 100) + '%｜現價 ' + n(r.etf.price, 2) + '</span></div><div class="etfi-result-num"><span>投入 ' + Math.round(r.capitalShare).toLocaleString('zh-TW') + ' 元</span><b>' + Math.round(r.monthlyCash).toLocaleString('zh-TW') + ' 元／月</b></div></div>';
    }).join('') + '<p class="etfi-result-note">每月股息＝配置金額 ÷ 現價 × 近12個月每單位配息 ÷ 12；配息逐月變動，除息會使淨值下降，須以填息判斷實際獲益。</p>';
    document.querySelectorAll('.etfi-row').forEach(function(row){
      var code = row.getAttribute('data-code');
      var c = document.querySelector('[data-etfi-check="'+code+'"]');
      var w = document.querySelector('[data-etfi-weight="'+code+'"]');
      var el = document.querySelector('[data-etfi-contrib="'+code+'"]');
      if (!el) return;
      var item = rows.find(function(x){ return x.etf.code === code; });
      el.textContent = item ? Math.round(item.monthlyCash).toLocaleString('zh-TW') + ' 元／月' : '—';
    });
  }
  document.addEventListener('change', function(ev){
    var t = ev.target;
    if (t.id === 'etfiCapital') { render(); return; }
    if (t.id === 'etfiFreqFilter') { applyFilters(); render(); return; }
    if (t.hasAttribute('data-etfi-check') || t.hasAttribute('data-etfi-weight')) { render(); return; }
  });
  document.addEventListener('input', function(ev){
    if (ev.target.id === 'etfiCapital' || ev.target.hasAttribute('data-etfi-weight')) render();
  });
  document.addEventListener('click', function(ev){
    if (ev.target.classList && ev.target.classList.contains('etfi-quick-btn')) {
      document.getElementById('etfiCapital').value = ev.target.getAttribute('data-capital');
      render();
      return;
    }
    if (ev.target.classList && ev.target.classList.contains('etfi-mode-btn')) {
      document.querySelectorAll('.etfi-mode-btn').forEach(function(b){ b.classList.remove('is-active'); });
      ev.target.classList.add('is-active');
      state.mode = ev.target.getAttribute('data-mode');
      var best = state.mode === 'staggered' ? DATA.bestStaggered : DATA.bestMonthly;
      state.selected = {};
      (best || []).forEach(function(code){ state.selected[code] = 1 / Math.max(best.length, 1); });
      document.querySelectorAll('.etfi-row').forEach(function(row){
        var code = row.getAttribute('data-code');
        var c = document.querySelector('[data-etfi-check="'+code+'"]');
        var w = document.querySelector('[data-etfi-weight="'+code+'"]');
        if (state.selected[code] !== undefined) { c.checked = true; w.value = Math.round(state.selected[code] * 100); }
        else { c.checked = false; w.value = 0; }
      });
      render();
      return;
    }
  });
  init();
})();`;

const styles = `
.etfi-section{scroll-margin-top:12px}
.etfi-badge{font-size:12px;font-weight:600;color:#0b6b3a;background:#e6f4ec;border:1px solid #bcddca;padding:2px 10px;border-radius:999px;vertical-align:middle}
.etfi-env{background:#f4f8f5;border-left:4px solid #0b6b3a;border-radius:10px;padding:14px 16px;margin:14px 0}
.etfi-env-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px}
.etfi-env-head b{font-size:15px}
.etfi-env-head span{font-size:13px;font-weight:700;color:#0b6b3a;background:#fff;border:1px solid #bcddca;padding:2px 10px;border-radius:999px}
.etfi-env-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.etfi-env-item{background:#fff;border:1px solid #e3eae5;border-radius:8px;padding:10px 12px}
.etfi-env-item b{display:block;font-size:13px;margin-bottom:4px;color:#0b6b3a}
.etfi-env-item span{font-size:13px;line-height:1.6;color:#333}
.etfi-env-scenarios{margin-top:10px;font-size:13px}
.etfi-env-scenarios ul{margin:8px 0;padding-left:20px;line-height:1.7}
.etfi-env-scenarios small{color:#666}
.etfi-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;margin-top:14px}
.etfi-capital{background:#fff;border:1px solid #e3eae5;border-radius:10px;padding:12px 14px;box-shadow:0 1px 4px rgba(11,107,58,.06)}
.etfi-capital label{font-size:13px;font-weight:700;color:#0b6b3a;display:block;margin-bottom:8px}
.etfi-capital-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.etfi-capital input{font-size:18px;font-weight:700;padding:8px 12px;border:2px solid #bcddca;border-radius:8px;width:220px;color:#0b3d22}
.etfi-capital input:focus-visible{outline:3px solid #e9b949;border-color:#0b6b3a}
.etfi-quick{display:flex;gap:8px;flex-wrap:wrap}
.etfi-quick-btn{background:#f2f7f4;border:1px solid #cfe3d7;color:#0b6b3a;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;transition:.15s}
.etfi-quick-btn:hover{background:#0b6b3a;color:#fff}
.etfi-mode{display:flex;gap:10px;margin:12px 0}
.etfi-mode-btn{flex:1;background:#fff;border:2px solid #cfe3d7;color:#0b3d22;font-weight:700;padding:10px 12px;border-radius:10px;cursor:pointer;transition:.15s}
.etfi-mode-btn:hover{border-color:#0b6b3a}
.etfi-mode-btn.is-active{background:#0b6b3a;border-color:#0b6b3a;color:#fff}
.etfi-best{background:linear-gradient(135deg,#0b6b3a,#0d8a4c);border-radius:12px;padding:14px 16px;color:#fff;margin-bottom:14px;box-shadow:0 4px 14px rgba(11,107,58,.25)}
.etfi-best-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.etfi-best-head b{font-size:15px}
.etfi-best-head span{font-size:12px;opacity:.85}
.etfi-best-codes{display:flex;flex-wrap:wrap;gap:8px}
.etfi-best-chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:5px 12px;font-size:13px}
.etfi-best-chip.is-sel{background:#fff;color:#0b6b3a;font-weight:700}
.etfi-filter{display:flex;gap:10px;align-items:center;margin:12px 0}
.etfi-filter select{padding:7px 10px;border:1px solid #cfe3d7;border-radius:8px;background:#fff}
.etfi-filter-note{font-size:12px;color:#666}
.etfi-list{display:flex;flex-direction:column;gap:10px;max-height:640px;overflow:auto;padding-right:4px}
.etfi-row{background:#fff;border:1px solid #e3eae5;border-left:4px solid #0b6b3a;border-radius:10px;padding:12px 14px;box-shadow:0 1px 4px rgba(11,107,58,.05)}
.etfi-row-head{display:flex;align-items:flex-start;gap:10px}
.etfi-check{position:relative;width:20px;height:20px;flex:none;margin-top:2px}
.etfi-check input{position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0}
.etfi-check span{display:block;width:20px;height:20px;border:2px solid #9cbfab;border-radius:5px;background:#fff;transition:.15s}
.etfi-check input:checked + span{background:#0b6b3a;border-color:#0b6b3a}
.etfi-check input:checked + span::after{content:"✓";color:#fff;font-size:13px;display:flex;justify-content:center;align-items:center;height:100%}
.etfi-check input:focus-visible + span{outline:3px solid #e9b949}
.etfi-title{flex:1;min-width:0}
.etfi-title b{font-size:15px}
.etfi-freq{display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:#8a5a00;background:#fff5dc;border:1px solid #f0d48a;padding:1px 8px;border-radius:999px;vertical-align:middle}
.etfi-freq.is-verified{color:#0b6b3a;background:#e6f4ec;border-color:#bcddca}
.etfi-cat{display:block;font-size:12px;color:#777;margin-top:2px}
.etfi-price{text-align:right;flex:none}
.etfi-price b{font-size:16px;color:#0b3d22}
.etfi-price small{display:block;font-size:11px;color:#888}
.etfi-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0;padding:10px 0;border-top:1px dashed #dde8e1;border-bottom:1px dashed #dde8e1}
.etfi-metric{font-size:12px;color:#555}
.etfi-metric b{display:block;font-size:14px;color:#0b3d22;margin-top:2px}
.etfi-metric small{display:block;font-size:11px;color:#888;margin-top:2px}
.etfi-rets{display:flex;flex-direction:column;gap:3px}
.etfi-ret b{display:inline;font-size:13px}
.etfi-ret small{display:inline;font-size:10px;color:#999;margin-left:4px}
.etfi-ret.is-neg b{color:#b3261e}
.etfi-ret.is-none{color:#aaa}
.etfi-row-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px}
.etfi-weight{font-size:12px;color:#555}
.etfi-weight input{width:70px;padding:5px 8px;border:1px solid #cfe3d7;border-radius:6px;font-weight:700}
.etfi-weight input:focus-visible{outline:3px solid #e9b949}
.etfi-contrib{font-size:12px;color:#555}
.etfi-contrib b{font-size:14px;color:#0b6b3a}
.etfi-timing{margin-top:10px;background:#f6f9f7;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6}
.etfi-timing > span{display:block;margin-top:2px;color:#333}
.etfi-timing small{color:#888}
.etfi-decision-badge{display:inline-block;font-size:13px;font-weight:800;padding:3px 10px;border-radius:999px;margin-bottom:4px}
.etfi-decision-invest .etfi-decision-badge{background:#0b6b3a;color:#fff}
.etfi-decision-wait .etfi-decision-badge{background:#fff7e8;color:#8a5a00;border:1px solid #e5c36a}
.etfi-decision-unknown .etfi-decision-badge{background:#eef1ef;color:#555;border:1px solid #ccd6d0}
.etfi-timing-wait,.etfi-timing-hot{background:#fff7e8;border-left:3px solid #d98e04}
.etfi-timing-watch{background:#fdf0ef;border-left:3px solid #b3261e}
.etfi-timing-observe{background:#eef4fd;border-left:3px solid #1d5fa8}
.etfi-range{margin:8px 0 4px}
.etfi-range-bar{position:relative;height:9px;border-radius:999px;background:linear-gradient(90deg,#b9d8e6 0%,#8fc7a8 48%,#e8b76a 80%,#d98e04 100%);box-shadow:inset 0 1px 2px rgba(0,0,0,.12)}
.etfi-range-dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;background:#0b3d22;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)}
.etfi-range-labels{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:3px}
.etfi-range-note{font-size:12px;font-weight:700;color:#0b3d22;margin-top:2px}
.etfi-right{display:flex;flex-direction:column;gap:12px}
.etfi-result{background:#fff;border:2px solid #0b6b3a;border-radius:12px;padding:16px;box-shadow:0 4px 14px rgba(11,107,58,.12)}
.etfi-result-head{font-size:13px;color:#0b3d22}
.etfi-result-total{display:block;font-size:26px;font-weight:800;color:#0b6b3a;margin:6px 0}
.etfi-result-head small{display:block;font-size:12px;color:#666;margin-top:2px}
.etfi-result-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px dashed #dde8e1}
.etfi-result-row b{font-size:13.5px}
.etfi-result-row span{display:block;font-size:11.5px;color:#777}
.etfi-result-num{text-align:right}
.etfi-result-num b{color:#0b6b3a;font-size:14px}
.etfi-result-num span{font-size:11.5px;color:#666}
.etfi-result-note{font-size:11.5px;color:#888;line-height:1.6;margin-top:8px}
.etfi-result-empty{text-align:center;color:#777;padding:14px 0}
.etfi-result-empty b{display:block;font-size:15px;color:#0b3d22;margin-bottom:4px}
.etfi-notes details{background:#fff;border:1px solid #e3eae5;border-radius:10px;padding:12px 14px;margin-bottom:10px}
.etfi-notes summary{font-weight:700;color:#0b3d22;cursor:pointer}
.etfi-notes ul{font-size:12.5px;color:#444;line-height:1.7;padding-left:18px;margin:8px 0 0}
@media (max-width:1180px){
  .etfi-layout{grid-template-columns:minmax(0,1fr) 300px}
  .etfi-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:900px){
  .etfi-layout{grid-template-columns:1fr}
  .etfi-right{order:-1}
  .etfi-env-grid{grid-template-columns:1fr}
  .etfi-metrics{grid-template-columns:1fr 1fr}
}
@media (max-width:560px){
  .etfi-capital input{width:100%}
  .etfi-mode{flex-direction:column}
  .etfi-price{text-align:left}
  .etfi-row-head{flex-wrap:wrap}
  .etfi-metrics{grid-template-columns:1fr}
}
`;

/* 環境判讀：以既有國際資料（B 級官方脈絡）說明目前環境對各類 ETF 的意義，
   並提供「情境式」未來可能性（不預測確定走勢）。 */
function buildEnvironmentContext(ctx) {
  if (!ctx || !ctx.data || !ctx.summary) return null;
  const d = ctx.data;
  const treasury = d.treasury || {};
  const sp500 = d.sp500 || {};
  const vix = d.vix || {};
  const fx = d.fx?.usdTwd || {};
  const tx = d.tx || {};
  const regime = ctx.summary.regime || '訊號分歧';
  const regimeAction = ctx.summary.action || '';
  const treasuryYield = Number.isFinite(treasury.value) ? treasury.value : null;
  const treasuryBp = Number.isFinite(treasury.difference5) ? treasury.difference5 * 100 : null;
  const sp500Chg5 = Number.isFinite(sp500.change5) ? sp500.change5 : null;
  const vixValue = Number.isFinite(vix.value) ? vix.value : null;
  const fxRate = Number.isFinite(fx.value) ? fx.value : null;
  const fxChg5 = Number.isFinite(fx.change5) ? fx.change5 : null;

  const judgments = {};
  if (treasuryYield !== null) {
    const rising = treasuryBp !== null && treasuryBp > 5;
    const falling = treasuryBp !== null && treasuryBp < -5;
    judgments.bond = treasuryYield >= 4.2
      ? `10年期公債殖利率約 ${treasuryYield.toFixed(2)}%（較高），這是債券型 ETF 過去價格承壓的環境；利率若能轉降，價格有回升空間，但若續升仍會侵蝕價格。`
      : rising
        ? `10年期公債殖利率約 ${treasuryYield.toFixed(2)}%（近5日上升約 ${treasuryBp.toFixed(0)}bp），債券型 ETF 價格短期承壓，先不因配息追買。`
        : falling
          ? `10年期公債殖利率約 ${treasuryYield.toFixed(2)}%（近5日下降約 ${(-treasuryBp).toFixed(0)}bp），利率轉降環境對債券型 ETF 價格相對有利，但仍以分批承接為主。`
          : `10年期公債殖利率約 ${treasuryYield.toFixed(2)}%，利率方向未明；債券型 ETF 以配息與到期殖利率為主，價格波動列入持有考量。`;
  } else {
    judgments.bond = '本次未取得可驗證的長天期殖利率；債券型 ETF 以配息與到期殖利率為主，價格波動列入持有考量。';
  }
  if (vixValue !== null && sp500Chg5 !== null) {
    if (vixValue >= 25) judgments.equity = `VIX 約 ${vixValue.toFixed(0)}（偏高）且 S&P500 近5日 ${sp500Chg5 > 0 ? '+' : ''}${sp500Chg5.toFixed(1)}%；股市波動升高，股票型高股息 ETF 的回檔風險增加，新資金分批並保留現金。`;
    else if (vixValue < 20 && sp500Chg5 > 0.5) judgments.equity = `VIX 約 ${vixValue.toFixed(0)}（低）且 S&P500 近5日 ${sp500Chg5.toFixed(1)}% 走強；股市環境相對穩健，股票型高股息 ETF 可分批布局，但不要因漲勢延後而追價。`;
    else judgments.equity = `VIX 約 ${vixValue.toFixed(0)}、S&P500 近5日 ${sp500Chg5 > 0 ? '+' : ''}${sp500Chg5.toFixed(1)}%；股市訊號分歧，股票型高股息 ETF 以回測承接區分批為主，不追高。`;
  } else {
    judgments.equity = '本次未取得可驗證的美股波動訊號；股票型高股息 ETF 依個別技術承接區分批。';
  }
  if (fxRate !== null) {
    judgments.offshore = fxChg5 !== null && Math.abs(fxChg5) >= 0.3
      ? `美元／臺幣約 ${fxRate.toFixed(2)}（近5日${fxChg5 > 0 ? '臺幣貶值' : '臺幣升值'}約 ${Math.abs(fxChg5).toFixed(2)}%）；海外型 ETF 的匯兌損益會放大或抵消配息，配置時須納入考量。`
      : `美元／臺幣約 ${fxRate.toFixed(2)}，匯率方向未明；海外型 ETF 以原幣資產報酬為主，臺幣計價會有匯兌波動。`;
  } else {
    judgments.offshore = '本次未取得可驗證的匯率資料；海外型 ETF 以原幣資產報酬為主，臺幣計價會有匯兌波動。';
  }
  const scenarios = [
    `情境一（利率維持現狀）：債券型 ETF 價格以區間為主，主要收益來自配息；股票型高股息 ETF 以企業盈餘與股息成長支撐。`,
    `情境二（利率轉降）：債券型 ETF 有資本利得空間，高股息股票型因評價壓力減輕而相對有利。`,
    `情境三（利率再升或通膨回升）：債券型 ETF 價格續承壓，股票型高股息 ETF 的股息吸引力相對上升但波動增加。`
  ];
  return {
    regime,
    regimeAction,
    treasuryYield,
    treasuryBp,
    sp500Chg5,
    vixValue,
    fxRate,
    fxChg5,
    txNet: Number.isFinite(tx.net) ? tx.net : null,
    judgments,
    scenarios,
    sourceNote: '環境判讀來自本報告國際市場脈動區的官方脈絡資料；情境為可能性推演，不是走勢預測。'
  };
}

/* ETF 評分（透明權重）：殖利率 45%、1年報酬 20%、3年報酬 15%、流動性 10%、歷史 10% */
function etfScore(etf) {
  if (!etf || !Number.isFinite(etf.price) || etf.price <= 0 || !Number.isFinite(etf.trailingYieldPct)) return null;
  if (etf.frequency !== 'monthly' && etf.frequency !== 'quarterly') return null;
  if (!etf.frequencyVerified) return null;
  const r1 = etf.returns?.['1y']?.annualizedPct;
  const r3 = etf.returns?.['3y']?.annualizedPct;
  const yieldScore = Math.min(etf.trailingYieldPct, 12) / 12 * 100;
  const r1Score = Number.isFinite(r1) ? Math.max(-100, Math.min(r1, 80)) : 0;
  const r3Score = Number.isFinite(r3) ? Math.max(-100, Math.min(r3, 80)) : 0;
  const liqScore = Number.isFinite(etf.volume) && etf.volume > 0 ? Math.min(Math.log10(etf.volume) / 8, 1) * 100 : 30;
  const histScore = Number.isFinite(etf.returns?.maxHistoryYears) ? Math.min(etf.returns.maxHistoryYears / 5, 1) * 100 : 20;
  const score = yieldScore * 0.45 + r1Score * 0.20 + r3Score * 0.15 + liqScore * 0.10 + histScore * 0.10;
  return {
    score,
    parts: { yieldScore, r1Score, r3Score, liqScore, histScore },
    weights: { yieldScore: 45, r1: 20, r3: 15, liquidity: 10, history: 10 }
  };
}

/* 3 檔最佳配置：
   mode=monthly：月配 ETF 中依評分取最佳 3 檔（每月直領）
   mode=staggered：季配 ETF 依除息月份分成 3 組，每組取評分最佳 1 檔（每月輪流領） */
function planBestThree(etfs, mode = 'monthly') {
  if (mode === 'monthly') {
    const scored = etfs
      .map(e => ({ e, s: etfScore(e) }))
      .filter(x => x.s && x.e.frequency === 'monthly')
      .sort((a, b) => b.s.score - a.s.score);
    const picks = scored.slice(0, 3).map(x => ({ code: x.e.code, weight: 1 / 3 }));
    return { mode: 'monthly', picks, score: scored.slice(0, 3).map(x => x.s.score), selected: scored.slice(0, 3).map(x => x.e.code) };
  }
  const groups = [[], [], []];
  for (const e of etfs) {
    if (e.frequency !== 'quarterly' || !etfScore(e)) continue;
    const months = new Set(e.dividendMonths12 || []);
    let gi = 0;
    if (months.has(2) || months.has(5) || months.has(8) || months.has(11)) gi = 1;
    if (months.has(3) || months.has(6) || months.has(9) || months.has(12)) gi = 2;
    groups[gi].push(e);
  }
  const picks = [];
  const selected = [];
  for (const g of groups) {
    if (!g.length) continue;
    g.sort((a, b) => etfScore(b).score - etfScore(a).score);
    picks.push({ code: g[0].code, weight: 1 / Math.max(groups.filter(x => x.length).length, 1) });
    selected.push(g[0].code);
  }
  return { mode: 'staggered', picks, selected };
}

module.exports = {
  SUPPLEMENTAL_ETFS,
  FREQ_LABEL,
  TIMING_LABEL,
  buildCandidateUniverse,
  computeEtfIncomeData,
  classifyFrequency,
  planAllocation,
  planBestThree,
  etfScore,
  buildEnvironmentContext,
  renderEtfIncomePlanner,
  styles,
  fetchDividendHistory,
  fetchMonthlyPrices,
  fetchDailyIndicators,
  buildTiming
};

if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    if (!arg) {
      console.log('用法: node etf-income-planner.js --test <代號> | --universe <代號,代號...>');
      process.exit(0);
    }
    if (arg === '--test') {
      const code = process.argv[3] || '00929.TW';
      const div = await fetchDividendHistory(code.replace('.TW', ''));
      console.log(JSON.stringify(div, null, 2).slice(0, 2500));
      const freq = classifyFrequency(div.records);
      console.log('FREQ', JSON.stringify(freq, null, 2));
    } else if (arg === '--universe') {
      const codes = (process.argv[3] || '').split(',').map(x => x.trim()).filter(Boolean);
      const uni = codes.map(code => ({ code, name: code, category: 'test' }));
      const data = await computeEtfIncomeData(uni, { delayMs: 200 });
      console.log(JSON.stringify(data, null, 2));
    }
  })();
}