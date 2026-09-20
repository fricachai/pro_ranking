'use strict';

// Independent research context. Never changes HORIZON_SCORE_V2 or stock actions.
const VERSION = 'INTERNATIONAL_CONTEXT_V1';
const DEFINITIONS = {
  fx: ['期交所外幣參考匯率', 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates', 'A', '每日參考值', 4],
  tx: ['期交所三大法人期貨', 'https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate', 'A', '每日盤後', 4],
  treasury: ['美國財政部殖利率', '', 'A', '美國營業日', 4],
  vix: ['Cboe VIX', 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', 'A', '美國收盤', 4],
  dollar: ['Fed 廣義美元指數', 'https://www.federalreserve.gov/releases/h10/current/', 'A', '每週公布前週日資料', 11],
  cot: ['CFTC 金融期貨部位', '', 'A', '通常週五公布週二部位', 11],
  sp500: ['Yahoo S&P 500 日行情', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=3mo&interval=1d', 'B', '日行情／可能含盤中值', 4],
  sox: ['Yahoo 費城半導體日行情', 'https://query1.finance.yahoo.com/v8/finance/chart/%5ESOX?range=3mo&interval=1d', 'B', '日行情／可能含盤中值', 4],
  oil: ['Yahoo WTI 近月期貨', 'https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?range=3mo&interval=1d', 'B', '近月合約／有轉倉影響', 4],
  fed: ['Fed 貨幣政策公告', 'https://www.federalreserve.gov/feeds/press_monetary.xml', 'A', '事件發布', null],
  energy: ['EIA 能源動態', 'https://www.eia.gov/rss/todayinenergy.xml', 'A', '事件發布', null],
  sanctions: ['美國財政部 OFAC 公告', 'https://ofac.treasury.gov/recent-actions', 'A', '事件發布', null]
};
const finite = x => typeof x === 'number' && Number.isFinite(x);
function num(x) {
  if (x == null || String(x).trim() === '' || /^(?:ND|N\/A|NA|\.|-|null)$/i.test(String(x).trim())) return null;
  const n = Number(String(x).replaceAll(',', '')); return Number.isFinite(n) ? n : null;
}
function date(x) {
  const s = String(x || '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(s);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : null;
}
function text(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function xml(s, tag) { return text(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(s)?.[1]); }
function pct(a, b) { return finite(a) && finite(b) && b !== 0 ? (a / b - 1) * 100 : null; }
function normalizeSeries(rows, asOf) {
  const unique = new Map();
  for (const r of rows) if (date(r.date) && r.date <= asOf && finite(r.value)) {
    if (unique.has(r.date) && unique.get(r.date).value !== r.value) throw new Error('Conflicting duplicate observation date');
    unique.set(r.date, r);
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function seriesMetric(rows, asOf, extra = {}) {
  const s = normalizeSeries(rows, asOf), last = s.at(-1);
  if (!last) throw new Error('No valid dated observations');
  return { ...extra, date: last.date, value: last.value, change5: pct(last.value, s.at(-6)?.value),
    change20: pct(last.value, s.at(-21)?.value), difference5: finite(s.at(-6)?.value) ? last.value - s.at(-6).value : null,
    sampleCount: s.length, series: s.slice(-65) };
}
function parseFx(rows, asOf) {
  if (!Array.isArray(rows)) throw new Error('FX schema changed');
  return Object.fromEntries([['usdTwd', 'USD/NTD'], ['usdJpy', 'USD/JPY'], ['usdCny', 'USD/RMB']]
    .map(([key, field]) => [key, seriesMetric(rows.map(r => ({ date: date(r.Date), value: num(r[field]) })), asOf, { unit: field, quoteKind: '期交所參考匯率' })]));
}
function parseTx(rows, asOf, previous = []) {
  if (!Array.isArray(rows)) throw new Error('TAIFEX schema changed');
  const selected = rows.filter(r => r.ContractCode === '臺股期貨' && r.Item === '外資及陸資' && date(r.Date) <= asOf && date(r.Date))
    .sort((a, b) => b.Date.localeCompare(a.Date))[0];
  if (!selected) throw new Error('Missing TX foreign/institutional observation');
  const long = num(selected['OpenInterest(Long)']), short = num(selected['OpenInterest(Short)']), net = num(selected['OpenInterest(Net)']);
  if (![long, short, net].every(finite) || long < 0 || short < 0 || long - short !== net) throw new Error('TAIFEX net position reconciliation failed');
  const observation = { date: date(selected.Date), long, short, net, netValueThousands: num(selected['ContractValueofOpenInterest(Net)(Thousands)']) };
  const validPrevious = previous.filter(r => date(r.date) && r.date < observation.date && [r.long, r.short, r.net].every(finite) && r.long - r.short === r.net);
  const history = [...new Map([...validPrevious, observation].map(r => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-65);
  const prior = history.at(-2);
  return { ...observation, changeFromPrevious: prior ? net - prior.net : null, comparisonDate: prior?.date || null, history,
    unit: '口', contract: '臺股期貨 TX；全到期月份合計', limitation: '僅 TX，未合併小台／微台；換月與避險均可能影響，淨空單不等於撤出台股。' };
}
function parseTreasury(body, asOf) {
  const rows = [...body.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)].map(m => ({ date: date(xml(m[1], 'd:NEW_DATE')),
    y2: num(xml(m[1], 'd:BC_2YEAR')), y10: num(xml(m[1], 'd:BC_10YEAR')) }));
  const ten = seriesMetric(rows.map(r => ({ date: r.date, value: r.y10 })), asOf, { unit: '%' });
  const matched = rows.find(r => r.date === ten.date);
  return { ...ten, y2: matched?.y2 ?? null, spread10y2y: finite(matched?.y2) ? ten.value - matched.y2 : null };
}
function parseVix(body, asOf) {
  if (!/^DATE,OPEN,HIGH,LOW,CLOSE/i.test(body.trim())) throw new Error('VIX CSV header changed');
  const rows = body.trim().split(/\r?\n/).slice(1).map(line => {
    const v = line.split(','), d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v[0]);
    return { date: d ? date(`${d[3]}-${d[1]}-${d[2]}`) : null, value: num(v[4]) };
  });
  return seriesMetric(rows, asOf, { unit: '點' });
}
function parseDollar(body, asOf) {
  const releaseString = /Release Date:\s*([^<]+)/i.exec(body)?.[1];
  const release = new Date(`${String(releaseString || '').trim()} UTC`);
  if (!Number.isFinite(release.getTime())) throw new Error('Fed release date missing');
  const releaseDate = release.toISOString().slice(0, 10);
  if (releaseDate > asOf) throw new Error('Future Fed release');
  const headers = [...body.matchAll(/<th id="a([3-7])">([^<]+)<\/th>/g)];
  const row = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].find(m => /1\) BROAD/.test(m[1]));
  if (headers.length !== 5 || !row) throw new Error('Fed broad dollar table schema changed');
  const series = headers.map(m => {
    let d = new Date(`${text(m[2]).replace('.', '')} ${release.getUTCFullYear()} UTC`);
    if (d > release) d.setUTCFullYear(d.getUTCFullYear() - 1);
    const cell = new RegExp(`<td headers="a${m[1]} a1 r1">([^<]+)<\\/td>`).exec(row[1]);
    return { date: Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null, value: num(text(cell?.[1])) };
  });
  const metric = seriesMetric(series, asOf, { unit: '2006年1月＝100', publishedAt: releaseDate });
  return { ...metric, periodChange: pct(metric.value, metric.series[0]?.value), periodStart: metric.series[0]?.date,
    limitation: 'Fed 廣義美元指數，並非 ICE DXY；本期變動僅比較本次公布期間。' };
}
function parseYahoo(payload, asOf) {
  const r = payload?.chart?.result?.[0], q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q?.close) throw new Error('Market chart schema changed');
  const zone = r.meta.exchangeTimezoneName;
  if (!zone) throw new Error('Market timezone missing');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return seriesMetric(r.timestamp.map((t, i) => ({ date: formatter.format(new Date(t * 1000)), value: num(q.close[i]) })), asOf,
    { unit: r.meta.instrumentType === 'FUTURE' ? '美元／桶' : '點', quoteKind: '日行情，最近一筆可能尚未收盤', exchangeTimezone: zone });
}
async function fetchYahooFx(asOf, fetchImpl) {
  const symbols = { usdTwd: 'TWD%3DX', usdJpy: 'JPY%3DX', usdCny: 'CNY%3DX' };
  const entries = await Promise.all(Object.entries(symbols).map(async ([key, symbol]) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const body = await request(url, fetchImpl);
    return [key, parseYahoo(JSON.parse(body), asOf)];
  }));
  return Object.fromEntries(entries);
}
function parseCot(rows, asOf) {
  if (!Array.isArray(rows)) throw new Error('CFTC schema changed');
  return ['S&P 500 Consolidated', 'UST 10Y NOTE', 'EURO FX'].map(market => {
    const s = rows.filter(r => r.contract_market_name === market && date(r.report_date_as_yyyy_mm_dd) && date(r.report_date_as_yyyy_mm_dd) <= asOf)
      .sort((a, b) => b.report_date_as_yyyy_mm_dd.localeCompare(a.report_date_as_yyyy_mm_dd));
    const r = s[0], p = s.find(x => x.report_date_as_yyyy_mm_dd !== r?.report_date_as_yyyy_mm_dd);
    if (!r) throw new Error(`CFTC missing requested contract: ${market}`);
    const long = num(r.lev_money_positions_long), short = num(r.lev_money_positions_short), oi = num(r.open_interest_all);
    if (![long, short, oi].every(finite) || Math.min(long, short, oi) < 0 || oi === 0 || long > oi || short > oi) throw new Error('CFTC position contract failed');
    const priorLong = num(p?.lev_money_positions_long), priorShort = num(p?.lev_money_positions_short);
    return { market, date: date(r.report_date_as_yyyy_mm_dd), long, short, net: long - short, netPctOi: (long - short) / oi * 100,
      change: finite(priorLong) && finite(priorShort) ? (long - short) - (priorLong - priorShort) : null,
      comparisonDate: date(p?.report_date_as_yyyy_mm_dd), unit: '口', group: '槓桿基金', format: 'TFF futures only' };
  });
}
function parseRss(body, asOf) {
  if (!/<rss\b/i.test(body)) throw new Error('RSS schema changed');
  return [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => {
    const d = new Date(xml(m[1], 'pubDate'));
    return { title: xml(m[1], 'title'), url: xml(m[1], 'link'), publishedAt: Number.isFinite(d.getTime()) ? d.toISOString() : null };
  }).filter(x => x.title && /^https?:\/\//.test(x.url) && x.publishedAt && x.publishedAt.slice(0, 10) <= asOf)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
}
function parseSanctions(body, asOf) {
  const rows = [...body.matchAll(/<a[^>]+href="([^"]*\/recent-actions\/(\d{8})[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => ({ title: text(m[3]), url: new URL(m[1], 'https://ofac.treasury.gov').href, publishedAt: date(m[2]) }))
    .filter(x => x.title && x.publishedAt && x.publishedAt <= asOf);
  return [...new Map(rows.map(x => [x.url, x])).values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
}
function freshness(observed, asOf, maxDays) {
  if (!date(observed) || !date(asOf)) return 'unavailable';
  const age = (Date.parse(asOf) - Date.parse(observed)) / 86400000;
  return age < 0 ? 'unavailable' : maxDays != null && age > maxDays ? 'stale' : 'current';
}
async function request(url, fetchImpl = fetch) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pro-ranking-research/1.0)', Accept: 'application/json,text/plain,*/*' } });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.retryable = r.status === 403 || r.status === 429 || r.status >= 500; throw e; }
      return await r.text();
    } catch (e) { last = e; if (e.retryable === false || attempt === 1) break; await new Promise(resolve => setTimeout(resolve, 350)); }
  }
  throw last;
}
function summarize(data, sources) {
  const current = id => ['current', 'stale'].includes(sources.find(x => x.id === id)?.status);
  const freshnessLimited = sources.some(x => x.id === 'fx' && x.status === 'stale');
  const signals = [
    { id: 'equity', label: '美股', value: current('sp500') ? data.sp500?.change20 : null, high: 0, low: 0, inverse: false },
    { id: 'fx', label: '臺幣壓力', value: current('fx') ? data.fx?.usdTwd?.change5 : null, high: 0.5, low: -0.5, inverse: true },
    { id: 'rates', label: '利率壓力', value: current('treasury') ? data.treasury?.difference5 : null, high: 0.2, low: -0.2, inverse: true },
    { id: 'volatility', label: '波動', value: current('vix') ? data.vix?.value : null, high: 25, low: 20, inverse: true }
  ].map(s => ({ id: s.id, label: s.label, state: !finite(s.value) ? 'unknown' : s.value > s.high ? (s.inverse ? 'pressure' : 'support') : s.value < s.low ? (s.inverse ? 'support' : 'pressure') : 'mixed' }));
  const available = signals.filter(x => x.state !== 'unknown').length;
  const pressure = signals.filter(x => x.state === 'pressure').length;
  const support = signals.filter(x => x.state === 'support').length;
  const regime = available < 4 ? '資料不足' : pressure >= 2 ? '風險升溫' : support >= 3 ? '環境較穩' : '訊號分歧';
  return { regime, available, total: 4, signals, action: available < 4 ? '目前採保守節奏，先看個股價格與防守條件' : freshnessLimited ? '部分資料日期較舊，先不追價，依個股條件確認' : pressure >= 2 ? '檢查曝險，勿因排名追價' : support >= 3 ? '留意達標個股，等待進場條件' : '等待共識，優先看個股價格結構',
    method: '觀察規則，未完成策略回測：S&P 500 20筆變動；美元／臺幣5筆±0.5%；10年殖利率5筆±20基點；VIX低於20／高於25。四項均可用才給環境標籤；匯率、美元與期貨不重複加權。',
    affectsStockActions: false };
}
async function fetchInternationalContext({ asOf, previous, fetchImpl = fetch, now = new Date() } = {}) {
  asOf ||= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
  if (!date(asOf)) throw new Error('Invalid context asOf date');
  const checkedAt = now.toISOString(), year = Number(asOf.slice(0, 4));
  const definitions = structuredClone(DEFINITIONS);
  const txUrl = new URL(definitions.tx[1]);
  txUrl.searchParams.set('date', asOf.replaceAll('-', ''));
  definitions.tx[1] = txUrl.href;
  definitions.treasury[1] = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const cotUrl = new URL('https://publicreporting.cftc.gov/resource/gpe5-46if.json');
  cotUrl.searchParams.set('$where', "contract_market_name in ('S&P 500 Consolidated','UST 10Y NOTE','EURO FX')");
  cotUrl.searchParams.set('$order', 'report_date_as_yyyy_mm_dd DESC'); cotUrl.searchParams.set('$limit', '12');
  definitions.cot[1] = cotUrl.href;
  const parsers = { fx: s => parseFx(JSON.parse(s), asOf), tx: s => parseTx(JSON.parse(s), asOf, previous?.data?.tx?.history || []),
    treasury: s => parseTreasury(s, asOf), vix: s => parseVix(s, asOf), dollar: s => parseDollar(s, asOf),
    cot: s => parseCot(JSON.parse(s), asOf), sp500: s => parseYahoo(JSON.parse(s), asOf), sox: s => parseYahoo(JSON.parse(s), asOf),
    oil: s => parseYahoo(JSON.parse(s), asOf), fed: s => parseRss(s, asOf), energy: s => parseRss(s, asOf), sanctions: s => parseSanctions(s, asOf) };
  const sources = [], data = {}, queue = Object.entries(definitions);
  // Bounded workers; failure in one optional international feed never erases valid Taiwan data.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [id, [label, url, evidence, cadence, maxAgeDays]] = queue.shift();
      const source = { id, label, url, evidence, cadence, maxAgeDays, checkedAt, status: 'unavailable', observedAt: null };
      try {
        let body = await request(url, fetchImpl);
        data[id] = parsers[id](body);
        // At the beginning of a year, Treasury's current-year observations alone cannot support 5-day changes.
        if (id === 'treasury' && data[id].sampleCount < 6) {
          const priorUrl = url.replace(`=${year}`, `=${year - 1}`);
          const priorBody = await request(priorUrl, fetchImpl);
          data[id] = parseTreasury(priorBody + body, asOf); source.additionalUrls = [priorUrl];
        }
        const item = data[id];
        source.observedAt = id === 'fx' ? item.usdTwd.date : Array.isArray(item) ? (id === 'cot' ? item.map(x => x.date).sort()[0] : item[0]?.publishedAt?.slice(0, 10)) : item.date;
        source.status = freshness(source.observedAt, asOf, maxAgeDays);
        if (source.status === 'unavailable') throw new Error('No valid observation date');
      } catch (e) {
        if (id === 'fx') {
          try {
            data[id] = await fetchYahooFx(asOf, fetchImpl);
            source.observedAt = data[id].usdTwd.date;
            source.status = freshness(source.observedAt, asOf, source.maxAgeDays);
            source.evidence = 'B';
            source.label = 'Yahoo匯率替代參考（期交所端點未回傳）';
            source.url = 'https://query1.finance.yahoo.com/v8/finance/chart/TWD%3DX?range=3mo&interval=1d';
            source.fallbackUsed = true;
            source.error = '期交所匯率端點未回傳，已改用 Yahoo 日行情替代參考。';
          } catch (fallbackError) {
            delete data[id]; source.status = 'unavailable'; source.error = String(fallbackError.message).slice(0, 180);
          }
        } else {
          delete data[id]; source.status = 'unavailable'; source.error = String(e.message).slice(0, 180);
        }
      }
      sources.push(source);
    }
  }));
  sources.sort((a, b) => Object.keys(definitions).indexOf(a.id) - Object.keys(definitions).indexOf(b.id));
  const result = { version: VERSION, checkedAt, asOf, sources, data, summary: summarize(data, sources),
    limitations: ['公開彙總部位無法辨識單一外資真正策略；空單可能為避險或套利。', '場外外匯部位、完整跨境資金流與信用利差尚未接入；不可宣稱已完整掌握全球資金。', '政策與制裁公告為原文證據，不自動推定個股利多或利空。', '國際市場與臺股交易時區不同；日資料／週資料不可當成逐筆即時行情。'],
    validation: { strategy: '未完成樣本外驗證', stockModelChanged: false } };
  validateContext(result);
  return result;
}
function validateContext(c) {
  if (c?.version !== VERSION || !date(c.asOf) || !c.checkedAt || !Array.isArray(c.sources) || c.sources.length !== Object.keys(DEFINITIONS).length) throw new Error('International context contract missing');
  for (const s of c.sources) {
    if (!['current', 'stale', 'unavailable'].includes(s.status) || !['A', 'B'].includes(s.evidence) || !s.checkedAt || !s.url.startsWith('https://')) throw new Error('Invalid source status');
    if (s.status === 'current' && freshness(s.observedAt, c.asOf, s.maxAgeDays) !== 'current') throw new Error('Stale source marked current');
  }
  if (c.summary.affectsStockActions !== false || c.validation.stockModelChanged !== false) throw new Error('Unvalidated context cannot change stock actions');
  if (JSON.stringify(summarize(c.data, c.sources)) !== JSON.stringify(c.summary)) throw new Error('Context summary reconciliation failed');
  return true;
}
module.exports = { VERSION, DEFINITIONS, num, date, pct, freshness, seriesMetric, parseFx, parseTx, parseTreasury, parseVix, parseDollar, parseYahoo, parseCot, parseRss, parseSanctions, summarize, request, fetchInternationalContext, validateContext };
