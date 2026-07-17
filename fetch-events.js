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

const CONFIG = {
  aiProvider: process.env.AI_PROVIDER || '',
  aiKey: process.env.AI_API_KEY || '',
  get aiEnabled() { return Boolean(this.aiProvider && this.aiKey); },
  newsEnabled: process.env.EVENTS_NEWS !== '0',
  maxNewsPerStock: 5,
  maxStocksForNews: 100
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
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; CodexResearch)' }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
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
    description: (raw.description || '').trim().slice(0, 1000),
    isNew
  };
}

async function fetchXiaoyuEvents() {
  const results = [];
  try {
    const data = await fetchJson(XIAOYU_EVENTS_URL);
    log(`xiaoyu events.json loaded: ${JSON.stringify({ buyback: data.buyback?.length, dispose: data.dispose?.length, transfer: data.transfer?.length, xd: data.xd?.length })}`);

    for (const item of (data.buyback || [])) {
      results.push({
        code: item.c, title: `庫藏股：${item.n} ${item.why}`, link: `https://mops.twse.com.tw/mops/web/t05sr01_1?co_id=${item.c}`,
        pubDate: item.t ? `${item.t}T00:00:00+08:00` : null,
        description: `價格 ${item.price}，預計買回 ${item.lots} 張，已執行 ${item.done} 張，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'buyback', confirmed: true
      });
    }

    for (const item of (data.dispose || [])) {
      results.push({
        code: item.c, title: `處置股票：${item.n} ${item.lvl}${item.cond ? ` (${item.cond})` : ''}`,
        link: `https://www.twse.com.tw/zh/page/trading/exchange/disposal.html`,
        pubDate: item.f ? `${item.f}T00:00:00+08:00` : null,
        description: `間隔 ${item.iv}，等級 ${item.lvl}，期間 ${item.f} ~ ${item.t}，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'dispose', confirmed: true
      });
    }

    for (const item of (data.transfer || [])) {
      results.push({
        code: item.c, title: `內部人持股異動：${item.n} ${item.role} ${item.way}`,
        link: `https://mops.twse.com.tw/mops/web/t05sr01_1?co_id=${item.c}`,
        pubDate: item.d ? `${item.d}T00:00:00+08:00` : null,
        description: `${item.role} ${item.way} ${item.lots} 張，價格 ${item.pb}，狀態：${item.st}`,
        source: 'xiaoyu', eventType: 'transfer', confirmed: true
      });
    }

  } catch (err) {
    log('WARN: xiaoyu events fetch failed:', err.message);
  }
  return results;
}

async function fetchYahooNews(stockCodes) {
  if (!CONFIG.newsEnabled) {
    log('news disabled via EVENTS_NEWS=0');
    return [];
  }
  const results = [];
  const codes = stockCodes.slice(0, CONFIG.maxStocksForNews);
  let fetched = 0;
  for (const code of codes) {
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
          confirmed: false
        });
        if (items.length >= CONFIG.maxNewsPerStock) break;
      }
      results.push(...items);
      fetched += 1;
    } catch (err) {
      // skip individual stock failures silently
    }
  }
  log(`yahoo news fetched: ${results.length} items from ${fetched} stocks`);
  return results;
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

function mergeEvents(xiaoyuItems, newsItems, aiResults, dedup) {
  const all = [];
  const aiMap = {};
  for (const r of aiResults) aiMap[r.contentHash] = r;

  const rawItems = [...xiaoyuItems, ...newsItems];
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

  dedup.save();
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
  const stockCodes = [];
  try {
    const etfDataText = await fetchText('https://xiaoyu-etf.pages.dev/data.js');
    const codeRegex = /"(\d{4})":\s*\{/g;
    let m;
    while ((m = codeRegex.exec(etfDataText)) !== null) {
      stockCodes.push(m[1]);
    }
    log(`stock codes loaded from ETF data: ${stockCodes.length}`);
  } catch (err) {
    log('WARN: could not load stock codes from ETF data:', err.message);
  }

  const xiaoyuItems = await fetchXiaoyuEvents();
  const newsItems = stockCodes.length > 0 ? await fetchYahooNews(stockCodes) : [];

  const allEvents = [...xiaoyuItems, ...newsItems];
  log(`raw items: xiaoyu=${xiaoyuItems.length}, news=${newsItems.length}, total=${allEvents.length}`);

  const aiResults = await runAI(allEvents, dedup);

  const merged = mergeEvents(xiaoyuItems, newsItems, aiResults, dedup);
  log(`merged unique events: ${merged.length}`);

  const output = {
    fetchedAt: new Date().toISOString(),
    date: todayStr,
    aiEnabled: CONFIG.aiEnabled,
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
    stats: output.stats
  }));
}

main().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
