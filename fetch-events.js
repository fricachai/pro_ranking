#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const EVENTS_DIR = path.join(ROOT, 'professional-screen-report', 'events');
const DEDUP_PATH = path.join(EVENTS_DIR, 'dedup-hashes.json');
const LATEST_EVENTS_PATH = path.join(EVENTS_DIR, 'latest-events.json');
const AI_CACHE_DIR = path.join(EVENTS_DIR, 'ai-cache');
const LOG_DIR = path.join(ROOT, 'professional-screen-report', 'logs');

const XIAOYU_EVENTS_URL = 'https://xiaoyu-etf.pages.dev/data/events.json';
const YAHOO_RSS_TPL = 'https://finance.yahoo.com/rss/headline?s=';
const TWSE_MATERIAL_INFO_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L';

const CONFIG = {
  aiProvider: process.env.AI_PROVIDER || '',
  aiKey: process.env.AI_API_KEY || '',
  get aiEnabled() { return Boolean(this.aiProvider && this.aiKey); },
  newsEnabled: process.env.EVENTS_NEWS !== '0',
  maxNewsPerStock: 5,
  maxStocksForNews: 500,
  minStockCodes: 300,
  minNewsFeedCoverage: 0.8,
  requestTimeoutMs: Number(process.env.EVENTS_REQUEST_TIMEOUT_MS || 30000)
};

function log(...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[events ${ts}]`, ...args);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; CodexResearch)' },
        signal: AbortSignal.timeout(CONFIG.requestTimeoutMs)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      log(`request failed (${i + 1}/${attempts}) for ${url}: ${error?.name || 'Error'} ${error?.message || error}`);
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`Fetch failed: ${url}: ${lastError?.message || lastError}`);
}

async function fetchJson(url, attempts = 3) {
  return JSON.parse(await fetchText(url, attempts));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function formatDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function rocDateToIso(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 7) return null;
  const year = Number(digits.slice(0, 3)) + 1911;
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  return `${year}-${month}-${day}`;
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) return row[key];
  }
  return null;
}

const EVENT_TYPES = {
  BUYBACK: 'buyback',
  DISPOSAL: 'disposal',
  EX_DIVIDEND: 'ex_dividend',
  INSIDER_TRANSFER: 'insider_transfer',
  MATERIAL_INFO: 'material_info',
  INVESTOR_CONF: 'investor_conf',
  NEWS_PENDING: 'news_pending',
  INDUSTRY_PRICE: 'industry_price'
};

class DedupDB {
  constructor() {
    this.data = { version: 1, dedup: {} };
  }

  load() {
    try {
      if (fs.existsSync(DEDUP_PATH)) {
        this.data = JSON.parse(fs.readFileSync(DEDUP_PATH, 'utf8'));
      }
    } catch (err) {
      log('WARN: corrupted dedup DB, starting fresh:', err.message);
      this.data = { version: 1, dedup: {} };
    }
  }

  save() {
    ensureDir(EVENTS_DIR);
    fs.writeFileSync(DEDUP_PATH, JSON.stringify(this.data, null, 2), 'utf8');
  }

  isNewOrChanged(url, contentHash) {
    const entry = this.data.dedup[url];
    if (!entry) return true;
    return entry.hash !== contentHash;
  }

  markProcessed(url, contentHash, eventType) {
    this.data.dedup[url] = {
      hash: contentHash,
      firstSeen: this.data.dedup[url]?.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      eventType
    };
  }

  stats() {
    const entries = Object.values(this.data.dedup);
    const byType = {};
    for (const e of entries) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    }
    return { total: entries.length, byType };
  }
}

function classifyBySourceType(raw) {
  if (raw.eventType === EVENT_TYPES.INVESTOR_CONF) return EVENT_TYPES.INVESTOR_CONF;
  if (raw.eventType === EVENT_TYPES.MATERIAL_INFO) return EVENT_TYPES.MATERIAL_INFO;
  if (raw.source === 'xiaoyu') {
    if (raw.eventType === 'buyback') return EVENT_TYPES.BUYBACK;
    if (raw.eventType === 'dispose') return EVENT_TYPES.DISPOSAL;
    if (raw.eventType === 'xd') return EVENT_TYPES.EX_DIVIDEND;
    if (raw.eventType === 'transfer') return EVENT_TYPES.INSIDER_TRANSFER;
    if (raw.eventType === 'disp') return EVENT_TYPES.DISPOSAL;
    if (raw.eventType === 'acquire') return EVENT_TYPES.MATERIAL_INFO;
  }
  if (raw.source === 'yahoo_news') return EVENT_TYPES.NEWS_PENDING;
  if (raw.source === 'twse_material') return EVENT_TYPES.MATERIAL_INFO;
  if (raw.source === 'investor_conf') return EVENT_TYPES.INVESTOR_CONF;
  return EVENT_TYPES.NEWS_PENDING;
}

async function fetchOfficialMaterialInfo() {
  const results = [];
  try {
    const data = await fetchJson(TWSE_MATERIAL_INFO_URL);
    for (const item of (Array.isArray(data) ? data : [])) {
      const code = String(pick(item, '公司代號') || '').trim();
      const title = String(pick(item, '主旨 ', '主旨') || '').trim();
      const date = rocDateToIso(pick(item, '發言日期', '事實發生日', '出表日期'));
      if (!/^\d{4}$/.test(code) || !title || !date) continue;
      const time = String(pick(item, '發言時間') || '').replace(/\D/g, '').padStart(6, '0');
      const isInvestorConference = /法人說明會|法說會/.test(title);
      const query = new URLSearchParams({ co_id: code, year: String(Number(date.slice(0, 4)) - 1911), month: date.slice(5, 7) });
      results.push({
        code,
        title: `重大訊息｜${title}`,
        link: `https://mops.twse.com.tw/mops/web/t05sr01_1?${query.toString()}#${date.replace(/-/g, '')}${time}`,
        pubDate: `${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+08:00`,
        description: String(pick(item, '說明') || '').trim(),
        source: 'twse_material',
        eventType: isInvestorConference ? EVENT_TYPES.INVESTOR_CONF : EVENT_TYPES.MATERIAL_INFO,
        confirmed: true,
        dateKind: 'published'
      });
    }
    log(`official material information loaded: ${results.length}`);
  } catch (err) {
    throw new Error(`Official material information fetch failed: ${err.message}`);
  }
  if (results.length === 0) throw new Error('Official material information returned no valid records.');
  return results;
}

function normalizeEvent(raw, dedup) {
  const eventType = classifyBySourceType(raw);
  const contentHash = sha256(`${raw.title || ''}|${raw.description || ''}|${raw.code || ''}`);
  const url = raw.link || raw.sourceUrl || '';
  if (!url || !raw.title) return null;
  const isNew = dedup.isNewOrChanged(url, contentHash);
  return {
    code: String(raw.code || ''),
    title: raw.title.trim().slice(0, 500),
    publishTime: raw.pubDate || raw.publishTime || new Date().toISOString(),
    sourceUrl: url,
    eventType,
    fetchTime: new Date().toISOString(),
    contentHash,
    source: raw.source || 'unknown',
    confirmed: raw.confirmed !== false,
    dateKind: raw.dateKind || 'published',
    sourceStartDate: raw.sourceStartDate || null,
    sourceEndDate: raw.sourceEndDate || null,
    description: (raw.description || '').trim().slice(0, 1000),
    isNew
  };
}

function normalizedDatePart(value) {
  const match = String(value || '').match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function validateEventContracts(events) {
  const errors = [];

  for (const event of events) {
    const prefix = `${event.code || 'unknown'} ${event.eventType || 'unknown'}`;
    const eventDate = normalizedDatePart(event.publishTime);
    if (!event.code || !event.title || !event.sourceUrl || !eventDate) {
      errors.push(`${prefix}: missing required code/title/sourceUrl/date`);
      continue;
    }

    if (event.eventType === EVENT_TYPES.BUYBACK) {
      const startDate = normalizedDatePart(event.sourceStartDate);
      const endDate = normalizedDatePart(event.sourceEndDate);
      if (event.dateKind !== 'event_start' || !startDate) {
        errors.push(`${prefix}: buyback must preserve its source start date`);
      } else if (eventDate !== startDate) {
        errors.push(`${prefix}: event date ${eventDate} does not match source start ${startDate}`);
      }
      if (startDate && endDate && endDate < startDate) {
        errors.push(`${prefix}: source end ${endDate} is earlier than start ${startDate}`);
      }
    }

    if (event.eventType === EVENT_TYPES.NEWS_PENDING && event.confirmed !== false) {
      errors.push(`${prefix}: pending news must remain unconfirmed`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Event contract validation failed (${errors.length}):\n${errors.slice(0, 20).join('\n')}`);
  }
}

async function fetchXiaoyuEvents() {
  const results = [];
  try {
    const data = await fetchJson(XIAOYU_EVENTS_URL);
    log(`xiaoyu events.json loaded: ${JSON.stringify({ buyback: data.buyback?.length, dispose: data.dispose?.length, transfer: data.transfer?.length, xd: data.xd?.length })}`);

    for (const item of (data.buyback || [])) {
      results.push({
        code: item.c, title: `庫藏股：${item.n} ${item.why}`, link: `https://mops.twse.com.tw/mops/web/t05sr01_1?co_id=${item.c}`,
        pubDate: item.f ? `${String(item.f).replace(/\//g, '-')}T00:00:00+08:00` : null,
        description: `價格 ${item.price}，預計買回 ${item.lots} 張，已執行 ${item.done} 張，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'buyback', confirmed: true,
        dateKind: 'event_start', sourceStartDate: item.f || null, sourceEndDate: item.t || null
      });
    }

    for (const item of (data.dispose || [])) {
      results.push({
        code: item.c, title: `處置股票：${item.n} ${item.lvl}${item.cond ? ` (${item.cond})` : ''}`,
        link: `https://www.twse.com.tw/zh/page/trading/exchange/disposal.html`,
        pubDate: item.f ? `${String(item.f).replace(/\//g, '-')}T00:00:00+08:00` : null,
        description: `間隔 ${item.iv}，等級 ${item.lvl}，期間 ${item.f} ~ ${item.t}，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'dispose', confirmed: true,
        dateKind: 'event_start', sourceStartDate: item.f || null, sourceEndDate: item.t || null
      });
    }

    for (const item of (data.transfer || [])) {
      results.push({
        code: item.c, title: `內部人持股異動：${item.n} ${item.role} ${item.way}`,
        link: `https://mops.twse.com.tw/mops/web/t05sr01_1?co_id=${item.c}`,
        pubDate: item.d ? `${String(item.d).replace(/\//g, '-')}T00:00:00+08:00` : null,
        description: `${item.role} ${item.way} ${item.lots} 張，價格 ${item.pb}，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'transfer', confirmed: true,
        dateKind: 'event_date', sourceStartDate: item.d || null, sourceEndDate: null
      });
    }

  } catch (err) {
    throw new Error(`Xiaoyu events fetch failed: ${err.message}`);
  }
  if (results.length === 0) throw new Error('Xiaoyu events returned no valid records.');
  return results;
}

async function fetchYahooNews(stockCodes) {
  if (!CONFIG.newsEnabled) {
    log('news disabled via EVENTS_NEWS=0');
    return { items: [], requestedStocks: 0, fetchedStocks: 0, failedStocks: 0, coverageRate: 0 };
  }
  const codes = stockCodes.slice(0, CONFIG.maxStocksForNews);
  let completed = 0;
  const outcomes = await mapLimit(codes, 6, async code => {
    let outcome;
    try {
      const rss = await fetchText(`${YAHOO_RSS_TPL}${code}.TW`);
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const extr = (s, tag) => {
        const m = s.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
        return m ? m[1].trim() : null;
      };
      let m;
      while ((m = itemRegex.exec(rss)) !== null) {
        const s = m[1];
        const link = extr(s, 'link');
        if (link && !link.includes('.tsrc=rss')) continue;
        items.push({
          code,
          title: (extr(s, 'title') || '').replace(/<!\[CDATA\[|\]\]>/g, ''),
          link: (link || '').replace(/\?\.tsrc=rss$/, ''),
          pubDate: extr(s, 'pubDate'),
          description: ((extr(s, 'description') || '')).replace(/<[^>]*>/g, '').trim().slice(0, 500),
          source: 'yahoo_news',
          confirmed: false,
          dateKind: 'published'
        });
        if (items.length >= CONFIG.maxNewsPerStock) break;
      }
      outcome = { code, items, fetched: true };
    } catch (err) {
      outcome = { code, items: [], fetched: false };
    }
    completed += 1;
    if (completed % 50 === 0 || completed === codes.length) {
      log(`yahoo news progress: ${completed}/${codes.length}`);
    }
    return outcome;
  });
  const results = outcomes.flatMap(outcome => outcome.items);
  const fetched = outcomes.filter(outcome => outcome.fetched).length;
  const failed = outcomes.length - fetched;
  const coverageRate = codes.length > 0 ? fetched / codes.length : 0;
  log(`yahoo news fetched: ${results.length} items; feeds=${fetched}/${codes.length}; failed=${failed}; coverage=${(coverageRate * 100).toFixed(1)}%`);
  return {
    items: results,
    requestedStocks: codes.length,
    fetchedStocks: fetched,
    failedStocks: failed,
    coverageRate
  };
}

async function runAI(events, dedup) {
  if (!CONFIG.aiEnabled) {
    log('AI skipped: no AI_PROVIDER / AI_API_KEY configured');
    return [];
  }
  ensureDir(AI_CACHE_DIR);

  const today = new Date().toISOString().slice(0, 10);
  const cachePath = path.join(AI_CACHE_DIR, `ai-summary-${today}.json`);
  let cache = {};
  try {
    if (fs.existsSync(cachePath)) cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (_) {}

  const newEvents = events.filter(e => e.isNew && !cache[e.contentHash]);
  if (newEvents.length === 0) {
    log('AI: no new events to analyze');
    return [];
  }

  const importanceThreshold = { material_info: 0.7, investor_conf: 0.5, news_pending: 0.4, disposal: 0.8, buyback: 0.6 };
  const highPriority = newEvents.filter(e => (importanceThreshold[e.eventType] || 0.4) >= 0.5);

  if (highPriority.length === 0) {
    log(`AI: ${newEvents.length} new events, all below importance threshold, skipping`);
    return [];
  }

  const batchSize = 5;
  const aiResults = [];
  for (let i = 0; i < highPriority.length; i += batchSize) {
    const batch = highPriority.slice(i, i + batchSize);
    const prompt = `Analyze the following Taiwan stock market events. For each, provide a brief impact assessment (1-2 sentences) and importance score (0-1).\n\n${batch.map((e, idx) => `${idx + 1}. [${e.code}] ${e.title} (${e.eventType})\n   ${e.description}`).join('\n\n')}\n\nRespond in JSON format: [{\"index\":0,\"importance\":0.7,\"summary\":\"...\"}]`;

    try {
      const body = JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, max_tokens: 1000
      });
      const response = await fetch(process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.aiKey}`
        },
        body
      });
      if (!response.ok) throw new Error(`AI API ${response.status}`);
      const data = await response.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '[]');
      for (const item of parsed) {
        const ev = batch[item.index];
        if (ev) {
          cache[ev.contentHash] = { importance: item.importance || 0.5, summary: item.summary || '' };
          aiResults.push({ ...ev, importance: item.importance || 0.5, aiSummary: item.summary || '' });
        }
      }
    } catch (err) {
      log(`WARN: AI batch ${i}-${i + batchSize} failed:`, err.message);
    }
    await sleep(200);
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  log(`AI analyzed ${aiResults.length}/${highPriority.length} events, cache saved`);
  return aiResults;
}

function mergeEvents(xiaoyuItems, officialItems, newsItems, aiResults, dedup) {
  const all = [];
  const aiMap = {};
  for (const r of aiResults) aiMap[r.contentHash] = r;

  const rawItems = [...xiaoyuItems, ...officialItems, ...newsItems];
  const seen = new Set();

  for (const raw of rawItems) {
    const normalized = normalizeEvent(raw, dedup);
    if (!normalized || seen.has(normalized.sourceUrl)) continue;
    seen.add(normalized.sourceUrl);

    if (normalized.isNew) {
      dedup.markProcessed(normalized.sourceUrl, normalized.contentHash, normalized.eventType);
    }

    const ai = aiMap[normalized.contentHash];
    if (ai) {
      normalized.importance = ai.importance;
      normalized.aiSummary = ai.aiSummary;
    }

    all.push(normalized);
  }

  return all;
}

async function main() {
  const startTime = Date.now();
  ensureDir(EVENTS_DIR);
  ensureDir(LOG_DIR);

  log('=== Event Fetcher Start ===');

  const dedup = new DedupDB();
  dedup.load();
  log(`dedup DB loaded: ${dedup.stats().total} entries`);

  const todayStr = new Date().toISOString().slice(0, 10);
  const stockCodeSet = new Set();
  try {
    const etfDataText = await fetchText('https://xiaoyu-etf.pages.dev/data.js');
    const codeRegex = /"(\d{4})":\s*\{/g;
    let m;
    while ((m = codeRegex.exec(etfDataText)) !== null) {
      stockCodeSet.add(m[1]);
    }
  } catch (err) {
    throw new Error(`Could not load stock codes from ETF data: ${err.message}`);
  }
  const stockCodes = [...stockCodeSet];
  log(`stock codes loaded from ETF data: ${stockCodes.length}`);
  if (stockCodes.length < CONFIG.minStockCodes) {
    throw new Error(`ETF stock-code coverage is unexpectedly low: ${stockCodes.length} < ${CONFIG.minStockCodes}`);
  }

  const xiaoyuItems = await fetchXiaoyuEvents();
  const officialItems = await fetchOfficialMaterialInfo();
  const newsResult = await fetchYahooNews(stockCodes);
  const newsItems = newsResult.items;
  if (!CONFIG.newsEnabled) throw new Error('Yahoo news must be enabled for a publishable refresh.');
  if (newsResult.requestedStocks < CONFIG.minStockCodes) {
    throw new Error(`Yahoo news requested-stock coverage is unexpectedly low: ${newsResult.requestedStocks}`);
  }
  if (newsResult.coverageRate < CONFIG.minNewsFeedCoverage) {
    throw new Error(`Yahoo news feed coverage is too low: ${(newsResult.coverageRate * 100).toFixed(1)}%`);
  }
  if (newsItems.length === 0) throw new Error('Yahoo news returned no valid items.');

  const allEvents = [...xiaoyuItems, ...officialItems, ...newsItems];
  log(`raw items: xiaoyu=${xiaoyuItems.length}, official=${officialItems.length}, news=${newsItems.length}, total=${allEvents.length}`);

  const aiCandidates = allEvents.map(item => normalizeEvent(item, dedup)).filter(Boolean);
  const aiResults = await runAI(aiCandidates, dedup);

  const merged = mergeEvents(xiaoyuItems, officialItems, newsItems, aiResults, dedup);
  log(`merged unique events: ${merged.length}`);
  validateEventContracts(merged);
  dedup.save();
  log('event contract validation passed');

  const output = {
    fetchedAt: new Date().toISOString(),
    date: todayStr,
    aiEnabled: CONFIG.aiEnabled,
    sourceScope: {
      xiaoyuEventTypes: ['buyback', 'disposal', 'insider_transfer'],
      yahooNews: CONFIG.newsEnabled,
      yahooNewsStockLimit: CONFIG.maxStocksForNews,
      yahooNewsItemsPerStock: CONFIG.maxNewsPerStock,
      officialMaterialInfo: true,
      officialInvestorConference: 'material_info_keyword_only'
    },
    sourceStatus: {
      etfStockCodes: stockCodes.length,
      xiaoyuItems: xiaoyuItems.length,
      officialMaterialItems: officialItems.length,
      yahooNews: {
        requestedStocks: newsResult.requestedStocks,
        fetchedStocks: newsResult.fetchedStocks,
        failedStocks: newsResult.failedStocks,
        itemCount: newsItems.length,
        coverageRate: Number((newsResult.coverageRate * 100).toFixed(1))
      }
    },
    stats: {
      totalEvents: merged.length,
      byType: {},
      newToday: merged.filter(e => e.isNew).length,
      dedup: dedup.stats()
    },
    events: merged
  };

  for (const e of merged) {
    output.stats.byType[e.eventType] = (output.stats.byType[e.eventType] || 0) + 1;
  }

  fs.writeFileSync(LATEST_EVENTS_PATH, JSON.stringify(output, null, 2), 'utf8');
  log(`written to ${LATEST_EVENTS_PATH}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`=== Event Fetcher Complete (${elapsed}s) ===`);

  console.log(JSON.stringify({
    status: 'ok',
    eventsCount: merged.length,
    newToday: merged.filter(e => e.isNew).length,
    aiEnabled: CONFIG.aiEnabled,
    stats: output.stats,
    sourceStatus: output.sourceStatus
  }));
}

main().catch(err => {
  const detail = err.stack || String(err);
  try {
    ensureDir(LOG_DIR);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(LOG_DIR, `event-fetch-failed-${stamp}.log`), `${detail}\n`, 'utf8');
  } catch (_) {}
  console.error(detail);
  process.exitCode = 1;
});
