'use strict';

// NEWS_PRICING_RADAR_V1 / NEWS_BREAKOUT_RADAR_V1
// 消息起漲觀察雷達（觀察層）：用新聞找機會、用數據驗證。
// 以「消息強度 / 基本面驗證 / 股價反應 / 資金確認 / 技術突破 / 相對強弱」六構面
// 與量比、前高突破、起漲階段、過度乖離，產生觀察排序與追蹤清單。
// 不得寫入 HORIZON_SCORE_V2、不得改變排名、entryAction／holdingAction／todayAction／
// nextCheck、A/B/C/D 分類或任何硬性門檻；缺資料一律標示「資料不足」，不補造數值。

const NEWS_PRICING_RADAR_VERSION = 'NEWS_PRICING_RADAR_V1';
const NEWS_BREAKOUT_RADAR_VERSION = 'NEWS_BREAKOUT_RADAR_V1';

const SIGNIFICANT_EVENT_TYPES = new Set(['material_info', 'investor_conf', 'buyback', 'disposal', 'ex_dividend']);
const EVENT_CATEGORY_LABELS = {
  material_info: '公司重大訊息',
  investor_conf: '法人說明會',
  buyback: '庫藏股',
  disposal: '處置',
  ex_dividend: '除權息',
  news_pending: '新聞（待確認）'
};

const BREAKOUT_STAGES = [
  '① 消息剛出現',
  '② 市場開始注意',
  '③ 量能增加',
  '④ 股價突破',
  '⑤ 籌碼進場',
  '⑥ 回測不破',
  '⑦ 再次上攻'
];

const FLOW_STEPS = [
  { key: 'news', label: '消息', desc: '官方重大訊息／法說會／庫藏股／處置' },
  { key: 'fundamental', label: '基本面', desc: '營收趨勢、獲利品質與估值' },
  { key: 'price', label: '股價', desc: '量比、前高突破與消息後報酬' },
  { key: 'capital', label: '籌碼', desc: '外資、投信、自營與ETF流向' },
  { key: 'breakout', label: '突破', desc: '均線／MACD／RSI／KD與前高' }
];

function pct(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return (a - b) / b * 100;
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function barDate(timestampSeconds) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function prepareSeries(ohlc) {
  return (Array.isArray(ohlc) ? ohlc : [])
    .filter(row => Number.isFinite(row.timestamp) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function volumeFeatures(rows) {
  const last = rows.length - 1;
  const volumes = rows.map(row => (Number.isFinite(row.volume) && row.volume > 0 ? row.volume : null));
  const newest = volumes[last];
  const finiteCount = volumes.filter(Number.isFinite).length;
  if (!Number.isFinite(newest) || finiteCount < 21) {
    return { available: false, gaps: ['成交量歷史不足，無法計算量比'] };
  }
  const avg5 = mean(volumes.slice(last - 5, last));
  const avg20 = mean(volumes.slice(last - 20, last));
  const ratio5 = Number.isFinite(avg5) && avg5 > 0 ? newest / avg5 : null;
  const ratio20 = Number.isFinite(avg20) && avg20 > 0 ? newest / avg20 : null;
  let status = '量能資料不足';
  if (Number.isFinite(ratio5)) {
    if (ratio5 >= 2) status = '爆量（逾2倍）';
    else if (ratio5 >= 1.5) status = '明顯放量';
    else if (ratio5 >= 1.2) status = '溫和放量';
    else if (ratio5 >= 0.8) status = '量能持平';
    else status = '量能萎縮';
  }
  return { available: true, latestVolume: newest, avg5: round(avg5, 0), avg20: round(avg20, 0), ratio5: round(ratio5, 2), ratio20: round(ratio20, 2), status, gaps: [] };
}

function breakoutFeatures(rows, price) {
  const last = rows.length - 1;
  const gaps = [];
  const priorHigh20 = last >= 20 ? Math.max(...rows.slice(last - 20, last).map(row => row.high)) : null;
  const priorHigh60 = last >= 60 ? Math.max(...rows.slice(last - 60, last).map(row => row.high)) : null;
  if (!Number.isFinite(price)) {
    return { available: false, status: '缺少可比價格', gaps: ['缺少可比價格，無法判定前高突破'] };
  }
  if (!Number.isFinite(priorHigh20)) gaps.push('日K不足20日，無法計算20日前高');
  const distanceHigh20Pct = Number.isFinite(priorHigh20) ? pct(price, priorHigh20) : null;
  const distanceHigh60Pct = Number.isFinite(priorHigh60) ? pct(price, priorHigh60) : null;
  const break20 = Number.isFinite(priorHigh20) && price > priorHigh20;
  const break60 = Number.isFinite(priorHigh60) && price > priorHigh60;
  let status = '前高資料不足';
  if (break60) status = '創60日新高';
  else if (break20) status = '突破20日前高';
  else if (Number.isFinite(distanceHigh20Pct) && distanceHigh20Pct >= -2) status = '逼近20日前高（-2%內）';
  else if (Number.isFinite(distanceHigh20Pct)) status = '仍在20日前高下方';
  return {
    available: Number.isFinite(priorHigh20),
    priorHigh20: round(priorHigh20),
    priorHigh60: round(priorHigh60),
    distanceHigh20Pct: round(distanceHigh20Pct),
    distanceHigh60Pct: round(distanceHigh60Pct),
    break20,
    break60,
    status,
    gaps
  };
}

function candleFeatures(rows) {
  const row = rows[rows.length - 1];
  const range = row.high - row.low;
  if (!(range > 0) || !Number.isFinite(row.close)) return { available: false, gaps: ['最新K線資料不足，無法判定上影線'] };
  const open = Number.isFinite(row.open) ? row.open : row.close;
  const upperShadowPct = (row.high - Math.max(open, row.close)) / range * 100;
  const bodyPct = Math.abs(row.close - open) / range * 100;
  return {
    available: true,
    upperShadowPct: round(upperShadowPct, 0),
    bodyPct: round(bodyPct, 0),
    isLongUpperShadow: upperShadowPct >= 50,
    gaps: []
  };
}

function pullbackFeatures(rows) {
  const last = rows.length - 1;
  if (last < 25) return { available: false, pullbackHeld: false, reAttack: false };
  const window = rows.slice(Math.max(0, last - 20), last);
  let peak = -Infinity;
  let peakIndex = -1;
  for (let i = 0; i < window.length; i += 1) {
    if (window[i].high > peak) { peak = window[i].high; peakIndex = i; }
  }
  const current = rows[last].close;
  const peakIsRecent = peakIndex >= window.length - 2;
  const nearPeak = Number.isFinite(peak) && current >= peak * 0.97;
  const brokeEarlier = peakIndex >= 0 && peakIndex < window.length - 2 && peak > (window[Math.max(0, peakIndex - 1)]?.close ?? peak);
  const pullbackHeld = brokeEarlier && nearPeak;
  const reAttack = pullbackHeld && current > peak;
  return { available: true, peak: round(peak), peakIsRecent, pullbackHeld, reAttack };
}

function catalogEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(ev => ev && ev.title)
    .map(ev => ({
      stock_id: ev.code || '',
      stock_name: ev.name || '',
      title: ev.title,
      source: ev.source || 'unknown',
      published_at: (ev.publishTime || '').slice(0, 10) || null,
      category: EVENT_CATEGORY_LABELS[ev.eventType] || ev.eventType || '其他',
      importance: ev.confirmed === false ? '待確認' : (ev.eventType === 'material_info' || ev.eventType === 'investor_conf' ? '高' : '中'),
      summary: ev.aiSummary || ev.description || '',
      confirmed: ev.confirmed !== false,
      url: ev.sourceUrl || null
    }));
}

function analyzeNewsPricing(rows, events, price, distanceEma20) {
  const last = rows.length - 1;
  const windowStart = Math.max(0, last - 20);
  const confirmed = (Array.isArray(events) ? events : [])
    .filter(ev => ev && ev.confirmed === true && SIGNIFICANT_EVENT_TYPES.has(ev.eventType) && ev.publishTime)
    .map(ev => ({ ...ev, date: String(ev.publishTime).slice(0, 10) }))
    .filter(ev => /^\d{4}-\d{2}-\d{2}$/.test(ev.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!confirmed.length) {
    return { available: false, hasRecentEvent: false, status: '無近期可驗證消息', gaps: [], event: null };
  }
  const windowStartDate = barDate(rows[windowStart].timestamp);
  const recent = confirmed.filter(ev => ev.date >= windowStartDate);
  if (!recent.length) {
    return { available: true, hasRecentEvent: false, status: '近20個交易日無可驗證消息', gaps: [], event: null };
  }
  const event = recent[recent.length - 1];
  let reactionStart = null;
  for (let i = 0; i <= last; i += 1) {
    if (barDate(rows[i].timestamp) >= event.date) { reactionStart = i; break; }
  }
  if (reactionStart === null || reactionStart > last) {
    return { available: false, hasRecentEvent: true, status: '消息日超出可比較日K範圍', gaps: ['消息日期超出Yahoo日K可比範圍'], event };
  }
  const preClose = reactionStart > 0 ? rows[reactionStart - 1].close : rows[reactionStart].close;
  const returnSinceEvent = pct(price, preClose);
  const barsSince = last - reactionStart;
  const afterVol = mean(rows.slice(reactionStart, last + 1).map(row => row.volume));
  const beforeStart = Math.max(0, reactionStart - 10);
  const beforeVol = mean(rows.slice(beforeStart, reactionStart).map(row => row.volume));
  const volumeConfirmRatio = Number.isFinite(afterVol) && Number.isFinite(beforeVol) && beforeVol > 0 ? afterVol / beforeVol : null;
  const volumeConfirmed = Number.isFinite(volumeConfirmRatio) && volumeConfirmRatio >= 1.3;
  let status = '消息出現、市場尚未明確反應';
  if (Number.isFinite(returnSinceEvent)) {
    if (returnSinceEvent >= 8 && volumeConfirmed) status = '已被市場定價（帶量上行）';
    else if (returnSinceEvent >= 8) status = '股價已大幅反應、量能未同步確認';
    else if (returnSinceEvent >= 3) status = '市場已開始反應';
    else if (returnSinceEvent <= -3) status = '利多不漲／消息鈍化';
    else status = '消息出現、市場尚未明確反應';
  }
  const overextended = Number.isFinite(distanceEma20) && distanceEma20 > 15;
  if (overextended && status.startsWith('已被市場定價')) status += '；且已過度乖離';
  const evidence = [];
  evidence.push(`消息日 ${event.date}（${EVENT_CATEGORY_LABELS[event.eventType] || event.eventType}）：${event.title.slice(0, 60)}`);
  evidence.push(Number.isFinite(returnSinceEvent) ? `消息後至今約 ${barsSince} 個交易日，價格變動 ${round(returnSinceEvent, 1)}%` : '消息後價格變動無法計算');
  evidence.push(Number.isFinite(volumeConfirmRatio) ? `消息後平均量為消息前的 ${round(volumeConfirmRatio, 2)} 倍` : '消息前後量能無法比較');
  if (overextended) evidence.push(`目前價格高於20日EMA約 ${round(distanceEma20, 1)}%，已屬高度乖離`);
  return {
    available: true,
    hasRecentEvent: true,
    event,
    eventDate: event.date,
    eventType: event.eventType,
    eventTitle: event.title,
    barsSince,
    returnSinceEvent: round(returnSinceEvent, 1),
    volumeConfirmRatio: round(volumeConfirmRatio, 2),
    volumeConfirmed,
    overextended,
    status,
    evidence,
    gaps: []
  };
}

function scoreObservation(volume, breakout, news) {
  const components = [];
  if (volume.available && Number.isFinite(volume.ratio5)) {
    let earned;
    if (volume.ratio5 >= 2) earned = 30;
    else if (volume.ratio5 >= 1.5) earned = 24;
    else if (volume.ratio5 >= 1.2) earned = 16;
    else if (volume.ratio5 >= 0.8) earned = 8;
    else earned = 3;
    components.push({ key: '量比', earned, max: 30 });
  }
  if (breakout.available) {
    let earned = 4;
    if (breakout.break60) earned = 30;
    else if (breakout.break20) earned = 24;
    else if (Number.isFinite(breakout.distanceHigh20Pct) && breakout.distanceHigh20Pct >= -2) earned = 14;
    components.push({ key: '前高突破', earned, max: 30 });
  }
  if (news.hasRecentEvent && news.available) {
    let earned = 12;
    if (news.status.startsWith('已被市場定價')) earned = 40;
    else if (news.status.startsWith('市場已開始反應')) earned = 30;
    else if (news.status.startsWith('股價已大幅反應')) earned = 22;
    else if (news.status.startsWith('利多不漲')) earned = 0;
    components.push({ key: '消息定價', earned, max: 40 });
  }
  const totalMax = components.reduce((sum, item) => sum + item.max, 0);
  const totalEarned = components.reduce((sum, item) => sum + item.earned, 0);
  const score = totalMax > 0 ? Math.round(totalEarned / totalMax * 100) : 0;
  return { score, totalEarned, totalMax, components };
}

function computeStockPricing(input) {
  const { code, name, market, ohlc, events, analysisPrice, close, distanceEma20 } = input;
  const rows = prepareSeries(ohlc);
  const price = Number.isFinite(analysisPrice) ? analysisPrice : close;
  const gaps = [];
  if (rows.length < 21) gaps.push('日K不足21日，量價特徵不足');
  const volume = rows.length >= 21 ? volumeFeatures(rows) : { available: false, gaps: ['日K不足，無法計算量比'] };
  const breakout = rows.length >= 21 ? breakoutFeatures(rows, price) : { available: false, status: '日K不足', gaps: ['日K不足，無法計算前高突破'] };
  const candle = rows.length ? candleFeatures(rows) : { available: false, gaps: ['無日K，無法判定上影線'] };
  const pullback = rows.length >= 25 ? pullbackFeatures(rows) : { available: false, pullbackHeld: false, reAttack: false };
  const news = rows.length >= 21 ? analyzeNewsPricing(rows, events, price, distanceEma20) : { available: false, hasRecentEvent: false, status: '日K不足，無法判定消息定價', gaps: [] };
  for (const bucket of [volume, breakout, candle, news]) {
    if (bucket && Array.isArray(bucket.gaps)) gaps.push(...bucket.gaps);
  }
  const observation = scoreObservation(volume, breakout, news);
  return {
    code,
    name: name || '',
    market: market || 'TWSE',
    price: round(price, 2),
    bars: rows.length,
    latestBarDate: rows.length ? barDate(rows[rows.length - 1].timestamp) : null,
    volume,
    breakout,
    candle,
    pullback,
    news: {
      available: news.available,
      hasRecentEvent: news.hasRecentEvent,
      eventDate: news.eventDate || null,
      eventType: news.eventType || null,
      eventTitle: news.eventTitle || null,
      barsSince: news.barsSince ?? null,
      returnSinceEvent: news.returnSinceEvent ?? null,
      volumeConfirmRatio: news.volumeConfirmRatio ?? null,
      volumeConfirmed: Boolean(news.volumeConfirmed),
      status: news.status,
      evidence: news.evidence || []
    },
    eventsCatalog: catalogEvents(events),
    observationScore: observation.score,
    observationComponents: observation.components,
    gaps: [...new Set(gaps)]
  };
}

function scoreNewsStrength(news) {
  if (!news.hasRecentEvent || !news.available) return 0;
  const base = { material_info: 17, investor_conf: 15, buyback: 12, ex_dividend: 8, disposal: 0 }[news.eventType] ?? 10;
  const recencyFactor = Number.isFinite(news.barsSince) && news.barsSince > 10 ? 0.7 : 1;
  return round(clamp(base * recencyFactor, 0, 20), 1);
}

function scoreFundamentals(record) {
  const c = record.horizonScores?.medium?.components || record.components || {};
  const earningsTrend = Number.isFinite(c.earningsTrend) ? c.earningsTrend : 0;
  const businessQuality = Number.isFinite(c.businessQuality) ? c.businessQuality : 0;
  return round(clamp((earningsTrend + businessQuality) / 45 * 20, 0, 20), 1);
}

function scorePriceReaction(pricing, market5) {
  const vol = pricing.volume;
  const bo = pricing.breakout;
  const move = pricing.news.hasRecentEvent && Number.isFinite(pricing.news.returnSinceEvent)
    ? pricing.news.returnSinceEvent
    : null;
  let movePts = 0;
  if (Number.isFinite(move)) {
    if (move >= 8) movePts = 8;
    else if (move >= 4) movePts = 6;
    else if (move >= 1) movePts = 4;
    else if (move > 0) movePts = 2;
    else if (move <= -3) movePts = 0;
    else movePts = 1;
  }
  let volumePts = 0;
  if (vol.available && Number.isFinite(vol.ratio5)) {
    if (vol.ratio5 >= 1.5) volumePts = 6;
    else if (vol.ratio5 >= 1.2) volumePts = 4;
    else if (vol.ratio5 >= 0.8) volumePts = 2;
  }
  let breakoutPts = 0;
  if (bo.break60) breakoutPts = 6;
  else if (bo.break20) breakoutPts = 5;
  else if (Number.isFinite(bo.distanceHigh20Pct) && bo.distanceHigh20Pct >= -2) breakoutPts = 2;
  let status = '價格尚未明顯轉強';
  if (bo.break60 && Number.isFinite(vol.ratio5) && vol.ratio5 >= 1.5) status = '帶量創新高';
  else if (bo.break20 && Number.isFinite(vol.ratio5) && vol.ratio5 >= 1.2) status = '帶量突破前高';
  else if (bo.break20 || bo.break60) status = '突破前高但量能待確認';
  else if (Number.isFinite(move) && move <= -3) status = '利多不漲';
  return { score: round(clamp(movePts + volumePts + breakoutPts, 0, 20), 1), status };
}

function scoreCapital(record) {
  const etfFlow5 = record.etf?.flowPct?.[5];
  const activeFlow5 = record.etf?.activePct?.[5];
  const foreignNet5 = record.metrics?.foreignNet5;
  const foreignHoldingD5 = record.foreignHolding?.trendReliable ? record.foreignHolding?.d5Lots : null;
  const trust5 = record.metrics?.trust5;
  const dealer5 = record.metrics?.dealer5;
  const signals = [
    { label: 'ETF 5日', value: etfFlow5 },
    { label: '主動ETF 5日', value: activeFlow5 },
    { label: '外資5日買賣超', value: foreignNet5 },
    { label: '外資持股5日', value: foreignHoldingD5 },
    { label: '投信5日', value: trust5 },
    { label: '自營商5日', value: dealer5 }
  ].filter(item => Number.isFinite(item.value));
  const buys = signals.filter(item => item.value > 0).length;
  const sells = signals.filter(item => item.value < 0).length;
  let status = '法人方向不一致';
  let score = 8;
  if (buys >= 3 && sells <= 1) { status = '法人同步買進'; score = 15; }
  else if (sells >= 3 && buys <= 1) { status = '法人反向賣超'; score = 2; }
  else if (buys > sells) { status = '法人偏多但未同步'; score = 11; }
  else if (sells > buys) { status = '法人偏空'; score = 5; }
  return { score, status, buys, sells, signalCount: signals.length };
}

function scoreTechnical(record) {
  const t = record.technical;
  if (!t) return { score: 0, status: '技術資料不足' };
  const price = record.live?.analysisPrice ?? t.close;
  let pts = 0;
  if (Number.isFinite(price) && price > t.ema20) pts += 2;
  if (Number.isFinite(price) && price > t.ema60) pts += 2;
  if (t.ema5 > t.ema20) pts += 2;
  if (t.ma20Slope5 > 0) pts += 2;
  if (t.ema60Slope > 0) pts += 2;
  if (Number.isFinite(t.macdHistogramDelta) && t.macdHistogramDelta > 0) pts += 2;
  if (Number.isFinite(t.rsi14) && t.rsi14 >= 48 && t.rsi14 <= 70) pts += 1.5;
  const trendConfirmed = Number.isFinite(price) && price >= t.ema20 && t.ma20Slope5 > 0;
  if (trendConfirmed && Number.isFinite(t.kdK) && Number.isFinite(t.kdD) && t.kdK > t.kdD && t.kdK <= 80) pts += 1.5;
  const status = pts >= 11 ? '趨勢明顯轉強' : pts >= 7 ? '趨勢轉強中' : pts >= 4 ? '趨勢剛起步' : '趨勢尚未轉強';
  return { score: round(clamp(pts, 0, 15), 1), status };
}

function scoreRelative(record, market5, market20) {
  const t = record.technical;
  const r5 = t?.return5;
  const r20 = t?.return20;
  const rs5 = Number.isFinite(r5) && Number.isFinite(market5) ? r5 - market5 : null;
  const rs20 = Number.isFinite(r20) && Number.isFinite(market20) ? r20 - market20 : null;
  let pts = 0;
  if (Number.isFinite(rs20)) {
    if (rs20 >= 5) pts += 6;
    else if (rs20 >= 0) pts += 4;
    else if (rs20 >= -5) pts += 2;
  }
  if (Number.isFinite(rs5)) {
    if (rs5 >= 3) pts += 4;
    else if (rs5 >= 0) pts += 2;
  }
  const strongVsWeak = Number.isFinite(rs5) && rs5 > 0 && Number.isFinite(market5) && market5 < 0;
  if (strongVsWeak) pts += 2;
  const status = strongVsWeak ? '大盤弱、個股強' : Number.isFinite(rs20) && rs20 >= 0 ? '相對強於大盤' : Number.isFinite(rs20) ? '相對弱於大盤' : '相對強弱資料不足';
  return { score: round(clamp(pts, 0, 10), 1), status, rs5: round(rs5, 2), rs20: round(rs20, 2), return5: round(r5, 2), return20: round(r20, 2) };
}

function overextension(record) {
  const t = record.technical;
  const price = record.live?.analysisPrice ?? t?.close;
  if (!t || !Number.isFinite(price)) return { status: '乖離資料不足', level: 'unknown', distanceEma20: null, distanceEma60: null };
  const d20 = pct(price, t.ema20);
  const d60 = pct(price, t.ema60);
  const worst = Math.max(Number.isFinite(d20) ? d20 : -Infinity, Number.isFinite(d60) ? d60 : -Infinity);
  let level = 'low';
  if (worst > 15) level = 'high';
  else if (worst > 8) level = 'mid';
  const status = level === 'high' ? '高度乖離（不宜追高）' : level === 'mid' ? '中度乖離' : '尚未過度乖離';
  return { status, level, distanceEma20: round(d20, 1), distanceEma60: round(d60, 1) };
}

function detectStage(pricing, capital, tech, rel) {
  const hasNews = pricing.news.hasRecentEvent;
  const ratio5 = pricing.volume.available ? pricing.volume.ratio5 : null;
  const bo = pricing.breakout;
  const pull = pricing.pullback || {};
  const institutionBuy = capital.score >= 9;
  let index = -1;
  if (pull.reAttack) index = 6;
  else if (pull.pullbackHeld) index = 5;
  else if (bo.break20 && institutionBuy) index = 4;
  else if (bo.break20 || bo.break60) index = 3;
  else if (Number.isFinite(ratio5) && ratio5 >= 1.5) index = 2;
  else if (hasNews && (tech.score >= 4 || (Number.isFinite(ratio5) && ratio5 >= 1.1))) index = 1;
  else if (hasNews) index = 0;
  if (index < 0) return { index: -1, label: '—' };
  return { index, label: BREAKOUT_STAGES[index] };
}

function classifyBreakout(radar) {
  const { news, components, overextension: over } = radar;
  if (news.available && news.status.startsWith('利多不漲')) return { code: 'EXCLUDE', label: '排除｜利多不漲／消息鈍化' };
  if (over.level === 'high') return { code: 'EXCLUDE', label: '排除｜股價過度乖離' };
  if (radar.candle?.isLongUpperShadow && components.capitalFlow <= 8) return { code: 'EXCLUDE', label: '排除｜爆量長上影且籌碼未支持' };
  if (!news.hasRecentEvent) {
    return { code: 'OBSERVE', label: '量價觀察｜無近期可驗證消息' };
  }
  const strong = components.newsStrength >= 12 && components.fundamentals >= 10 && components.priceReaction >= 12
    && components.capitalFlow >= 9 && components.technical >= 9 && over.level !== 'high';
  if (strong) return { code: 'A', label: 'A級｜消息＋股價同步起漲' };
  if (components.newsStrength >= 10 && components.fundamentals >= 8 && components.priceReaction < 12) {
    return { code: 'B', label: 'B級｜利多確認、等待突破' };
  }
  if (components.newsStrength >= 6) return { code: 'C', label: 'C級｜消息有利、股價尚未確認' };
  return { code: 'C', label: 'C級｜消息與基本面證據有限' };
}

function buildAnalysis(radar, record) {
  const m = record.metrics || {};
  const t = record.technical || {};
  const news = radar.news;
  const vol = radar.volume;
  const bo = radar.breakout;
  const cap = radar.capital;
  const fund = radar.fundamentalsText;
  const analysis = [];
  analysis.push({ q: '發生了什麼消息？', a: news.hasRecentEvent ? `${news.eventDate}｜${news.eventTitle}` : '近20個交易日沒有可驗證的官方消息，本檔只作量價觀察。' });
  analysis.push({ q: '消息為什麼重要？', a: news.hasRecentEvent ? `歸類為${EVENT_CATEGORY_LABELS[news.eventType] || '公司事件'}；消息強度 ${radar.components.newsStrength}/20。` : '無官方消息可評估。' });
  analysis.push({ q: '是否可能影響營收或獲利？', a: fund });
  analysis.push({ q: '市場是否已經反映？', a: news.available ? news.status : '消息定價資料不足。' });
  analysis.push({ q: '股價是否同步轉強？', a: `${bo.available ? bo.status : '前高資料不足'}；相對大盤 ${radar.relative.status}（20日 ${radar.relative.rs20 ?? '—'} 個百分點）。` });
  analysis.push({ q: '成交量是否確認？', a: vol.available ? `量比（5日）${vol.ratio5 ?? '—'} 倍，${vol.status}。` : '成交量歷史不足。' });
  analysis.push({ q: '法人是否進場？', a: `${cap.status}（${cap.buys} 項偏多、${cap.sells} 項偏空，共 ${cap.signalCount} 項可比）。` });
  analysis.push({ q: '關鍵支撐在哪裡？', a: t.ema20 ? `20日EMA約 ${round(t.ema20, 2)}；60日EMA約 ${round(t.ema60, 2)}。` : '技術均線資料不足。' });
  analysis.push({ q: '關鍵突破位置在哪裡？', a: bo.available ? `20日前高 ${bo.priorHigh20}${Number.isFinite(bo.priorHigh60) ? `、60日前高 ${bo.priorHigh60}` : ''}。` : '前高資料不足。' });
  analysis.push({ q: '什麼情況代表消息起漲失敗？', a: `收盤跌破20日EMA約 ${round(t.ema20, 2)} 且法人轉弱；或出現利多不漲、爆量長上影、${radar.overextension.status}。` });
  return analysis;
}

function buildFundamentalsText(record) {
  const m = record.metrics || {};
  const parts = [];
  if (Number.isFinite(m.revenueYoy)) parts.push(`月營收YoY ${round(m.revenueYoy, 1)}%`);
  if (Number.isFinite(m.revenueYtdYoy)) parts.push(`累計YoY ${round(m.revenueYtdYoy, 1)}%`);
  if (Number.isFinite(m.operatingMargin)) parts.push(`營業利益率 ${round(m.operatingMargin, 1)}%`);
  if (Number.isFinite(m.eps)) parts.push(`EPS ${round(m.eps, 2)}`);
  const text = parts.length ? `${parts.join('、')}。` : '基本面資料不足。';
  const could = Number.isFinite(m.revenueYoy) && m.revenueYoy > 0 && Number.isFinite(m.operatingMargin) && m.operatingMargin > 0;
  return `${text}${could ? '營收與獲利同時為正，消息有機會轉為實際獲利。' : '目前證據不足以確認消息可轉為持續獲利。'}`;
}

function buildCoreEvidence(radar) {
  const c = radar.components;
  const evidence = [];
  if (c.newsStrength >= 10) evidence.push(`官方消息強度 ${c.newsStrength}/20（${radar.news.eventTitle ? radar.news.eventTitle.slice(0, 30) : '官方事件'}）`);
  if (c.fundamentals >= 10) evidence.push(`基本面支持（${radar.fundamentalsText.replace('。', '')}）`);
  if (c.priceReaction >= 12) evidence.push(`股價反應（${radar.priceReactionText}）`);
  if (c.capitalFlow >= 9) evidence.push(`籌碼：${radar.capital.status}`);
  if (c.technical >= 9) evidence.push(`技術：${radar.technicalText}`);
  if (c.relativeStrength >= 7) evidence.push(`相對強弱：${radar.relative.status}`);
  evidence.push(`乖離：${radar.overextension.status}`);
  return evidence;
}

function computeStockRadar(record, pricing, ctx) {
  const newsStrength = scoreNewsStrength(pricing.news);
  const fundamentals = scoreFundamentals(record);
  const priceReaction = scorePriceReaction(pricing, ctx.marketReturn5);
  const capital = scoreCapital(record);
  const technical = scoreTechnical(record);
  const relative = scoreRelative(record, ctx.marketReturn5, ctx.marketReturn20);
  const over = overextension(record);
  const components = {
    newsStrength,
    fundamentals,
    priceReaction: priceReaction.score,
    capitalFlow: capital.score,
    technical: technical.score,
    relativeStrength: relative.score
  };
  const total = round(clamp(newsStrength + fundamentals + priceReaction.score + capital.score + technical.score + relative.score, 0, 100), 1);
  const radar = {
    code: pricing.code,
    name: pricing.name,
    market: pricing.market,
    price: pricing.price,
    bucket: record.bucket || null,
    latestBarDate: pricing.latestBarDate,
    volume: pricing.volume,
    breakout: pricing.breakout,
    candle: pricing.candle,
    news: pricing.news,
    eventsCatalog: pricing.eventsCatalog,
    components,
    observationScore: total,
    fundamentalsText: buildFundamentalsText(record),
    priceReactionText: `${priceReaction.status}（近5日 ${relative.return5 ?? '—'}%）`,
    technicalText: technical.status,
    capital: { status: capital.status, buys: capital.buys, sells: capital.sells, signalCount: capital.signalCount },
    technical: technical,
    relative,
    overextension: over,
    gaps: pricing.gaps
  };
  radar.stage = detectStage(pricing, capital, technical, relative);
  radar.classification = classifyBreakout(radar);
  radar.coreEvidence = buildCoreEvidence(radar);
  radar.analysis = buildAnalysis(radar, record);
  return radar;
}

function summarizePricingRadar({ records, ohlcByCode, priceDate, marketDate }) {
  const marketReturn5 = median(records.map(record => record.technical?.return5));
  const marketReturn20 = median(records.map(record => record.technical?.return20));
  const ctx = { marketReturn5, marketReturn20 };
  const all = [];
  for (const record of records) {
    const ohlc = ohlcByCode.get(record.code) || [];
    const pricing = computeStockPricing({
      code: record.code,
      name: record.name,
      market: record.market,
      ohlc,
      events: record.eventsLayer || [],
      analysisPrice: record.live?.analysisPrice ?? record.technical?.close ?? record.metrics?.price,
      close: record.technical?.close ?? record.metrics?.price,
      distanceEma20: record.technical?.distanceEma20
    });
    const radar = computeStockRadar(record, pricing, ctx);
    const eligible = radar.news.hasRecentEvent || radar.breakout.break20 || radar.breakout.break60
      || (radar.volume.available && Number.isFinite(radar.volume.ratio5) && radar.volume.ratio5 >= 1.5);
    radar.included = eligible;
    all.push(radar);
  }
  const candidates = all.filter(item => item.included)
    .sort((a, b) => b.observationScore - a.observationScore || (b.news.returnSinceEvent || 0) - (a.news.returnSinceEvent || 0));
  const items = candidates.slice(0, 20);
  const watchlist = selectWatchlist(candidates);
  const insufficient = all.filter(item => item.gaps.length > 0 && !item.breakout.available).length;
  return {
    version: NEWS_BREAKOUT_RADAR_VERSION,
    pricingVersion: NEWS_PRICING_RADAR_VERSION,
    priceDate: priceDate || null,
    marketDate: marketDate || null,
    marketReturn5: round(marketReturn5, 2),
    marketReturn20: round(marketReturn20, 2),
    universeCount: all.length,
    withNewsCount: all.filter(item => item.news.hasRecentEvent).length,
    candidateCount: candidates.length,
    significantCount: candidates.length,
    itemCount: items.length,
    watchlistCount: watchlist.length,
    insufficientCount: insufficient,
    flow: FLOW_STEPS,
    stages: BREAKOUT_STAGES,
    note: '觀察層：以「消息強度／基本面驗證／股價反應／資金確認／技術突破／相對強弱」六構面與量比、前高突破、起漲階段交叉檢核；不寫入 HORIZON_SCORE_V2、不改變排名、個股動作或硬性門檻，缺資料不補造。',
    items,
    watchlist
  };
}

function selectWatchlist(candidates) {
  const primary = candidates.filter(item => item.classification.code === 'A');
  const secondary = candidates.filter(item => item.classification.code === 'B');
  const pool = primary.length >= 3 ? primary : [...primary, ...secondary];
  const ranked = pool.slice().sort((a, b) => {
    const penalty = item => (item.overextension.level === 'high' ? 40 : item.overextension.level === 'mid' ? 12 : 0);
    return (b.observationScore - penalty(b)) - (a.observationScore - penalty(a));
  });
  return ranked.slice(0, 5);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fmtNum(value, digits = 1) {
  return Number.isFinite(value) ? value.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

function signedPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${fmtNum(value, 1)}%`;
}

function scoreBand(score) {
  if (score >= 80) return { label: '起漲訊號強', cls: 'is-strong' };
  if (score >= 70) return { label: '起漲觀察', cls: 'is-good' };
  if (score >= 60) return { label: '初步訊號', cls: 'is-mid' };
  return { label: '訊號不足', cls: 'is-low' };
}

function classChip(cls) {
  return `<span class="nbr-class nbr-class-${esc(cls.code)}">${esc(cls.label)}</span>`;
}

function stockLink(code, name, market) {
  const suffix = market === 'TPEX' ? '.TWO' : '.TW';
  const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}${suffix}/technical-analysis`;
  return `<a class="stock-link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(code)} ${esc(name)}</a>`;
}

function renderFlow(flow) {
  const steps = (flow || FLOW_STEPS).map((step, i) => `<div class="nbr-flow-step"><b>${i + 1}. ${esc(step.label)}</b><span>${esc(step.desc)}</span></div>`);
  return `<div class="nbr-flow">${steps.join('<span class="nbr-flow-arrow">→</span>')}</div>`;
}

function renderWatchlist(watchlist) {
  if (!watchlist || !watchlist.length) {
    return '<div class="nbr-empty">目前沒有同時滿足「消息 ＋ 基本面 ＋ 量價 ＋ 法人 ＋ 突破 ＋ 相對強弱 ＋ 未過度乖離」的追蹤標的。</div>';
  }
  const cards = watchlist.map(item => {
    const band = scoreBand(item.observationScore);
    const evidence = (item.coreEvidence || []).map(line => `<li>${esc(line)}</li>`).join('');
    return `<div class="nbr-watch-card">
<div class="nbr-watch-top"><div>${stockLink(item.code, item.name, item.market)}<div class="nbr-watch-stage">起漲階段：${esc(item.stage.label)}</div></div><span class="nbr-score ${band.cls}">${item.observationScore}<small>${esc(band.label)}</small></span></div>
${classChip(item.classification)}
<div class="nbr-watch-evidence"><b>起漲核心證據</b><ul>${evidence}</ul></div>
</div>`;
  }).join('');
  return `<div class="nbr-watch-grid">${cards}</div>`;
}

function renderPricingRadar(data) {
  const radar = data && typeof data === 'object' ? data : { items: [], universeCount: 0, itemCount: 0, note: '' };
  const meta = [radar.priceDate ? `價量資料日 ${esc(radar.priceDate)}` : null, radar.marketDate ? `市場資料日 ${esc(radar.marketDate)}` : null]
    .filter(Boolean).join('｜');
  const header = `<div class="nbr-head"><h2>📡 消息起漲觀察雷達（觀察層）</h2><p>用新聞找機會，用數據驗證：找出「利多開始被市場定價」的標的。此區不改變中期排名、個股動作或任何硬性門檻。</p></div>`;
  const flow = renderFlow(radar.flow);
  const stats = `<div class="nbr-stats"><span>研究母體 <b>${fmtNum(radar.universeCount, 0)}</b> 檔</span><span>近20日有可驗證消息 <b>${fmtNum(radar.withNewsCount, 0)}</b> 檔</span><span>進入觀察 <b>${fmtNum(radar.candidateCount, 0)}</b> 檔</span><span>資料不足 <b>${fmtNum(radar.insufficientCount, 0)}</b> 檔</span>${meta ? `<span class="nbr-meta">${meta}</span>` : ''}</div>`;
  const watchSection = `<div class="nbr-block"><h3>🔥 最值得追蹤（${radar.watchlistCount || 0} 檔）</h3>${renderWatchlist(radar.watchlist)}</div>`;
  if (!radar.items || radar.items.length === 0) {
    return `<section class="section nbr-section" id="newsPricingRadar" data-news-pricing-radar="${NEWS_PRICING_RADAR_VERSION}" data-news-breakout-radar="${NEWS_BREAKOUT_RADAR_VERSION}"><!-- NEWS_PRICING_RADAR_V1 --><!-- NEWS_BREAKOUT_RADAR_V1 -->
${header}${flow}${stats}
<div class="nbr-empty">本次沒有同時符合「可驗證消息 × 量能 × 前高突破」的標的；這代表目前沒有明確的利多定價跡象，不是資料失敗。</div>
<div class="nbr-note">${esc(radar.note || '')}</div></section>`;
  }
  const rows = radar.items.map(item => {
    const band = scoreBand(item.observationScore);
    const newsText = item.news.hasRecentEvent ? `${esc(item.news.eventDate || '')}｜${esc(item.news.status)}` : esc(item.news.status);
    const volumeText = item.volume.available ? `${item.volume.ratio5 != null ? item.volume.ratio5.toFixed(2) + '倍' : '—'}｜${esc(item.volume.status)}` : '資料不足';
    const breakoutText = item.breakout.available ? esc(item.breakout.status) : '資料不足';
    const capitalText = item.capital.signalCount ? esc(item.capital.status) : '資料不足';
    return `<tr>
<td><span class="nbr-score ${band.cls}">${item.observationScore}<small>${esc(band.label)}</small></span></td>
<td>${stockLink(item.code, item.name, item.market)}<div class="nbr-rank">${item.bucket ? esc(item.bucket) + ' 級' : ''}</div></td>
<td>${classChip(item.classification)}<div class="nbr-stage">${esc(item.stage.label)}</div></td>
<td>${newsText}</td>
<td>${volumeText}</td>
<td>${breakoutText}</td>
<td>${capitalText}</td>
<td><span class="nbr-over nbr-over-${esc(item.overextension.level)}">${esc(item.overextension.status)}</span></td>
</tr>`;
  }).join('');
  const details = radar.items.slice(0, 8).map(item => {
    const comp = item.components;
    const compHtml = `<div class="nbr-comp"><span>消息強度 ${comp.newsStrength}/20</span><span>基本面 ${comp.fundamentals}/20</span><span>股價反應 ${comp.priceReaction}/20</span><span>資金確認 ${comp.capitalFlow}/15</span><span>技術突破 ${comp.technical}/15</span><span>相對強弱 ${comp.relativeStrength}/10</span></div>`;
    const analysis = (item.analysis || []).map((x, i) => `<li><b>${i + 1}. ${esc(x.q)}</b><span>${esc(x.a)}</span></li>`).join('');
    const catalog = (item.eventsCatalog || []).slice(0, 4).map(ev => {
      const conf = ev.confirmed ? '' : '<span class="nbr-pending">待確認</span>';
      const link = ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noreferrer">${esc(ev.category)}｜${esc(ev.published_at || '日期未提供')}</a>` : esc(ev.category);
      return `<li>${link} ${conf}<div class="nbr-cat-title">${esc(ev.title.slice(0, 80))}</div></li>`;
    }).join('');
    return `<details class="nbr-detail"><summary>${stockLink(item.code, item.name, item.market)}｜消息起漲分數 ${item.observationScore}｜${esc(item.classification.label)}｜${esc(item.stage.label)}</summary>
<div class="nbr-detail-body">
${compHtml}
<div class="nbr-analysis"><b>每檔 10 項分析</b><ul>${analysis}</ul></div>
<div><b>量比（5日）</b>${item.volume.available ? `${item.volume.ratio5 != null ? item.volume.ratio5.toFixed(2) + '倍' : '—'}（5日均量 ${fmtNum(item.volume.avg5, 0)}、20日均量 ${fmtNum(item.volume.avg20, 0)}）｜${esc(item.volume.status)}` : '⚠️ 資料不足'}</div>
<div><b>前高突破</b>${item.breakout.available ? `${esc(item.breakout.status)}｜20日前高 ${fmtNum(item.breakout.priorHigh20, 2)}${Number.isFinite(item.breakout.priorHigh60) ? `、60日前高 ${fmtNum(item.breakout.priorHigh60, 2)}` : ''}` : '⚠️ 資料不足'}</div>
<div><b>最新K線</b>${item.candle.available ? `上影線占全幅 ${fmtNum(item.candle.upperShadowPct, 0)}%${item.candle.isLongUpperShadow ? '（長上影，留意賣壓）' : ''}` : '⚠️ 資料不足'}</div>
${catalog ? `<div><b>相關消息與公告</b><ul>${catalog}</ul></div>` : ''}
${item.gaps && item.gaps.length ? `<div class="nbr-gap">⚠️ ${esc(item.gaps.join('；'))}</div>` : ''}
</div></details>`;
  }).join('');
  return `<section class="section nbr-section" id="newsPricingRadar" data-news-pricing-radar="${NEWS_PRICING_RADAR_VERSION}" data-news-breakout-radar="${NEWS_BREAKOUT_RADAR_VERSION}"><!-- NEWS_PRICING_RADAR_V1 --><!-- NEWS_BREAKOUT_RADAR_V1 -->
${header}${flow}${stats}
${watchSection}
<div class="nbr-block"><h3>完整觀察排名（前 ${radar.itemCount} 名）</h3>
<div class="nbr-table-wrap"><table class="nbr-table"><thead><tr><th>消息起漲分數</th><th>股票</th><th>分類／起漲階段</th><th>最近可驗證消息</th><th>量比（5日）</th><th>前高突破</th><th>法人動向</th><th>乖離</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<div class="nbr-block"><h3>明細與每檔 10 項分析</h3>${details}</div>
<div class="nbr-note">${esc(radar.note || '')}｜消息起漲分數只由六構面觀察計算，未寫入正式排名；不是買進建議。</div>
</section>`;
}

const styles = `
.nbr-section{border:1px solid #dfe9e2}
.nbr-head h2{margin:0 0 4px}
.nbr-head p{margin:0;color:#5b6b62;font-size:13px;line-height:1.6}
.nbr-flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:6px;margin:12px 0}
.nbr-flow-step{flex:1 1 150px;min-width:130px;background:#f3f7f4;border:1px solid #dce7df;border-radius:9px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.nbr-flow-step b{font-size:12.5px;color:#0b6b3a}
.nbr-flow-step span{font-size:11.5px;color:#5b6b62;line-height:1.4}
.nbr-flow-arrow{align-self:center;color:#9bb3a6;font-weight:800}
.nbr-stats{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}
.nbr-stats span{background:#f3f7f4;border:1px solid #dce7df;border-radius:8px;padding:6px 12px;font-size:12.5px;color:#3c4a42}
.nbr-stats b{color:#0b6b3a}
.nbr-meta{margin-left:auto;color:#7b8a80}
.nbr-block{margin:14px 0}
.nbr-block h3{font-size:14px;color:#0b3d22;margin:0 0 8px}
.nbr-watch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.nbr-watch-card{background:#fff;border:1px solid #dce7df;border-left:4px solid #0b6b3a;border-radius:11px;padding:12px 14px;box-shadow:0 3px 10px rgba(11,107,58,.08);transition:transform .16s ease,box-shadow .16s ease}
.nbr-watch-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(11,107,58,.16)}
.nbr-watch-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.nbr-watch-stage{font-size:11.5px;color:#5b6b62;margin-top:3px}
.nbr-watch-evidence{margin-top:8px}
.nbr-watch-evidence b{font-size:12.5px;color:#0b6b3a}
.nbr-watch-evidence ul{margin:4px 0 0;padding-left:18px;line-height:1.6;font-size:12.5px;color:#333}
.nbr-score{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:54px;padding:4px 8px;border-radius:9px;font-weight:800;font-size:16px;color:#fff}
.nbr-score small{font-size:10px;font-weight:600;opacity:.92}
.nbr-score.is-strong{background:#0b6b3a}
.nbr-score.is-good{background:#2f8a5b}
.nbr-score.is-mid{background:#c0902a}
.nbr-score.is-low{background:#9aa7a0}
.nbr-class{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:700;border:1px solid transparent}
.nbr-class-A{background:#e3f4ea;color:#0b6b3a;border-color:#b6ddc5}
.nbr-class-B{background:#eef7f1;color:#2f8a5b;border-color:#cfe3d7}
.nbr-class-C{background:#fff7e8;color:#8a5a00;border-color:#f0d48a}
.nbr-class-EXCLUDE{background:#fdecec;color:#b3261e;border-color:#e3b3ae}
.nbr-class-OBSERVE{background:#eef2f7;color:#40566b;border-color:#cfdbe6}
.nbr-stage{font-size:11.5px;color:#5b6b62;margin-top:3px}
.nbr-rank{font-size:11px;color:#7b8a80;margin-top:3px}
.nbr-table-wrap{overflow:auto;border:1px solid #e3eae5;border-radius:10px}
.nbr-table{width:100%;border-collapse:collapse;min-width:940px}
.nbr-table th{background:#0b6b3a;color:#fff;font-size:12.5px;padding:9px 10px;text-align:left;white-space:nowrap}
.nbr-table td{border-top:1px solid #eef3ef;padding:9px 10px;font-size:12.5px;vertical-align:top}
.nbr-table tbody tr:hover td{background:#f6fbf8}
.nbr-over{font-size:11.5px;font-weight:700}
.nbr-over-low{color:#0b6b3a}
.nbr-over-mid{color:#8a5a00}
.nbr-over-high{color:#b3261e}
.nbr-over-unknown{color:#7b8a80}
.nbr-gap{color:#8a5a00;background:#fff7e8;border:1px solid #f0d48a;border-radius:6px;padding:3px 7px;margin-top:4px;font-size:11.5px}
.nbr-detail{border:1px solid #e3eae5;border-radius:10px;margin-top:10px;overflow:hidden}
.nbr-detail>summary{cursor:pointer;padding:10px 12px;font-weight:700;color:#0b3d22;background:#f7faf8;list-style:none}
.nbr-detail>summary::-webkit-details-marker{display:none}
.nbr-detail>summary:hover{background:#eef7f1}
.nbr-detail>summary:focus-visible{outline:3px solid #e9b949;outline-offset:2px}
.nbr-detail-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#333}
.nbr-detail-body b{color:#0b6b3a;font-size:12.5px}
.nbr-comp{display:flex;flex-wrap:wrap;gap:6px}
.nbr-comp span{background:#eef7f1;border:1px solid #dce7df;border-radius:999px;padding:2px 9px;font-size:11.5px;color:#0b3d22}
.nbr-analysis ul{margin:6px 0 0;padding-left:18px;line-height:1.65;display:flex;flex-direction:column;gap:4px}
.nbr-analysis li b{display:block;color:#0b6b3a;font-size:12.5px}
.nbr-analysis li span{font-size:12.5px;color:#444}
.nbr-cat-title{color:#666;font-size:12px}
.nbr-pending{color:#8a5a00;background:#fff7e8;border:1px solid #f0d48a;border-radius:999px;padding:0 6px;font-size:10.5px;margin-left:4px}
.nbr-empty{background:#f6fbf8;border:1px dashed #bcddca;border-radius:10px;padding:14px;color:#3c4a42;font-size:13px}
.nbr-note{margin-top:10px;font-size:12px;color:#7b8a80;line-height:1.6}
@media(max-width:560px){.nbr-table{min-width:820px}.nbr-flow-step{flex:1 1 100%}.nbr-flow-arrow{display:none}}
`;

module.exports = {
  NEWS_PRICING_RADAR_VERSION,
  NEWS_BREAKOUT_RADAR_VERSION,
  computeStockPricing,
  computeStockRadar,
  summarizePricingRadar,
  renderPricingRadar,
  styles
};
