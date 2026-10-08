'use strict';

// NEWS_PRICING_RADAR_V1
// 消息定價雷達（觀察層）：用量價行為判斷「利多是否已被市場定價」，
// 並輸出量比與前高突破。此模組不寫入 HORIZON_SCORE_V2，不改變排名、
// 個股動作或任何硬性門檻；缺資料一律標示「資料不足」，不補造數值。

const NEWS_PRICING_RADAR_VERSION = 'NEWS_PRICING_RADAR_V1';

const SIGNIFICANT_EVENT_TYPES = new Set(['material_info', 'investor_conf', 'buyback', 'disposal', 'ex_dividend']);
const EVENT_CATEGORY_LABELS = {
  material_info: '公司重大訊息',
  investor_conf: '法人說明會',
  buyback: '庫藏股',
  disposal: '處置',
  ex_dividend: '除權息',
  news_pending: '新聞（待確認）'
};

function pct(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return (a - b) / b * 100;
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
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
    returnSinceEvent: round(returnSinceEvent, 1),
    barsSince,
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
  const news = rows.length >= 21 ? analyzeNewsPricing(rows, events, price, distanceEma20) : { available: false, hasRecentEvent: false, status: '日K不足，無法判定消息定價', gaps: [] };
  for (const bucket of [volume, breakout, candle, news]) {
    if (bucket && Array.isArray(bucket.gaps)) gaps.push(...bucket.gaps);
  }
  const observation = scoreObservation(volume, breakout, news);
  const significant = news.hasRecentEvent ? true : (breakout.break20 || breakout.break60 || (volume.available && volume.ratio5 >= 1.5));
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
    news: {
      available: news.available,
      hasRecentEvent: news.hasRecentEvent,
      eventDate: news.eventDate || null,
      eventType: news.event ? news.event.eventType : null,
      eventTitle: news.event ? news.event.title : null,
      returnSinceEvent: news.returnSinceEvent ?? null,
      volumeConfirmRatio: news.volumeConfirmRatio ?? null,
      status: news.status,
      evidence: news.evidence || []
    },
    eventsCatalog: catalogEvents(events),
    observationScore: observation.score,
    observationComponents: observation.components,
    significant,
    gaps: [...new Set(gaps)]
  };
}

function summarizePricingRadar({ records, ohlcByCode, priceDate, marketDate }) {
  const items = [];
  for (const record of records) {
    const ohlc = ohlcByCode.get(record.code) || [];
    const computed = computeStockPricing({
      code: record.code,
      name: record.name,
      market: record.market,
      ohlc,
      events: record.eventsLayer || [],
      analysisPrice: record.live?.analysisPrice ?? record.technical?.close ?? record.metrics?.price,
      close: record.technical?.close ?? record.metrics?.price,
      distanceEma20: record.technical?.distanceEma20
    });
    computed.bucket = record.bucket;
    computed.rank = record.rank ?? null;
    items.push(computed);
  }
  const significant = items.filter(item => item.significant && item.observationScore >= 45);
  significant.sort((a, b) => b.observationScore - a.observationScore || (b.news.returnSinceEvent || 0) - (a.news.returnSinceEvent || 0));
  const list = significant.slice(0, 20);
  const insufficient = items.filter(item => item.gaps.length > 0 && !item.breakout.available).length;
  return {
    version: NEWS_PRICING_RADAR_VERSION,
    priceDate: priceDate || null,
    marketDate: marketDate || null,
    universeCount: items.length,
    itemCount: list.length,
    withNewsCount: items.filter(item => item.news.hasRecentEvent).length,
    significantCount: significant.length,
    insufficientCount: insufficient,
    note: '觀察層：只用量價與已確認消息判斷「利多是否已被市場定價」，不寫入 HORIZON_SCORE_V2、不改變排名、個股動作或硬性門檻；缺資料不補造。',
    items: list
  };
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
  if (score >= 70) return { label: '起漲訊號明確', cls: 'is-strong' };
  if (score >= 55) return { label: '起漲觀察', cls: 'is-mid' };
  if (score >= 45) return { label: '初步訊號', cls: 'is-weak' };
  return { label: '訊號不足', cls: 'is-low' };
}

function stockLink(code, name, market) {
  const suffix = market === 'TPEX' ? '.TWO' : '.TW';
  const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}${suffix}/technical-analysis`;
  return `<a class="stock-link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(code)} ${esc(name)}</a>`;
}

function renderPricingRadar(data) {
  const radar = data && typeof data === 'object' ? data : { items: [], universeCount: 0, itemCount: 0, note: '' };
  const meta = [radar.priceDate ? `價量資料日 ${esc(radar.priceDate)}` : null, radar.marketDate ? `市場資料日 ${esc(radar.marketDate)}` : null]
    .filter(Boolean).join('｜');
  const header = `<div class="npr-head"><h2>📡 消息定價雷達（觀察層）</h2><p>用消息找線索，用價格與量能確認「利多是否已被市場定價」。此區不改變中期排名、個股動作或任何硬性門檻。</p></div>`;
  const stats = `<div class="npr-stats"><span>研究母體 <b>${fmtNum(radar.universeCount, 0)}</b> 檔</span><span>近20日有可驗證消息 <b>${fmtNum(radar.withNewsCount, 0)}</b> 檔</span><span>符合量價/消息條件 <b>${fmtNum(radar.significantCount, 0)}</b> 檔</span><span>資料不足 <b>${fmtNum(radar.insufficientCount, 0)}</b> 檔</span>${meta ? `<span class="npr-meta">${meta}</span>` : ''}</div>`;
  if (!radar.items || radar.items.length === 0) {
    return `<section class="section npr-section" id="newsPricingRadar" data-news-pricing-radar="${NEWS_PRICING_RADAR_VERSION}"><!-- NEWS_PRICING_RADAR_V1 -->
${header}${stats}
<div class="npr-empty">本次沒有同時符合「可驗證消息 × 量能 × 前高突破」的標的；這代表目前沒有明確的利多定價跡象，不是資料失敗。</div>
<div class="npr-note">${esc(radar.note || '')}</div></section>`;
  }
  const rows = radar.items.map(item => {
    const band = scoreBand(item.observationScore);
    const newsText = item.news.hasRecentEvent
      ? `${esc(item.news.eventDate)}｜${esc(item.news.status)}`
      : esc(item.news.status);
    const volumeText = item.volume.available ? `${item.volume.ratio5 != null ? item.volume.ratio5.toFixed(2) + '倍' : '—'}｜${esc(item.volume.status)}` : '資料不足';
    const breakoutText = item.breakout.available ? `${esc(item.breakout.status)}${Number.isFinite(item.breakout.distanceHigh20Pct) ? `（距20日前高 ${signedPct(item.breakout.distanceHigh20Pct)}）` : ''}` : '資料不足';
    const gapText = item.gaps.length ? `<div class="npr-gap">⚠️ ${esc(item.gaps.join('；'))}</div>` : '';
    return `<tr>
<td><span class="npr-score ${band.cls}">${item.observationScore}<small>${esc(band.label)}</small></span></td>
<td>${stockLink(item.code, item.name, item.market)}<div class="npr-rank">${item.bucket ? esc(item.bucket) + ' 級' : ''}</div></td>
<td>${newsText}</td>
<td>${item.news.returnSinceEvent != null ? signedPct(item.news.returnSinceEvent) : '—'}</td>
<td>${volumeText}</td>
<td>${breakoutText}</td>
<td>${gapText || esc(item.news.status)}</td>
</tr>`;
  }).join('');
  const details = radar.items.slice(0, 5).map(item => {
    const evidence = (item.news.evidence || []).map(line => `<li>${esc(line)}</li>`).join('');
    const catalog = (item.eventsCatalog || []).slice(0, 4).map(ev => {
      const conf = ev.confirmed ? '' : '<span class="npr-pending">待確認</span>';
      const link = ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noreferrer">${esc(ev.category)}｜${esc(ev.published_at || '日期未提供')}</a>` : esc(ev.category);
      return `<li>${link} ${conf}<div class="npr-cat-title">${esc(ev.title.slice(0, 80))}</div></li>`;
    }).join('');
    return `<details class="npr-detail"><summary>${stockLink(item.code, item.name, item.market)}｜觀察分數 ${item.observationScore}｜${esc(item.news.hasRecentEvent ? item.news.status : '量價觀察')}</summary>
<div class="npr-detail-body">
<div><b>量比（5日）</b>${item.volume.available ? `${item.volume.ratio5 != null ? item.volume.ratio5.toFixed(2) + '倍' : '—'}（5日均量 ${fmtNum(item.volume.avg5, 0)} 張、20日均量 ${fmtNum(item.volume.avg20, 0)} 張）｜${esc(item.volume.status)}` : '⚠️ 資料不足'}</div>
<div><b>前高突破</b>${item.breakout.available ? `${esc(item.breakout.status)}｜20日前高 ${fmtNum(item.breakout.priorHigh20, 2)}${Number.isFinite(item.breakout.priorHigh60) ? `、60日前高 ${fmtNum(item.breakout.priorHigh60, 2)}` : ''}` : '⚠️ 資料不足'}</div>
<div><b>最新K線</b>${item.candle.available ? `上影線占全幅 ${fmtNum(item.candle.upperShadowPct, 0)}%${item.candle.isLongUpperShadow ? '（長上影，留意賣壓）' : ''}` : '⚠️ 資料不足'}</div>
${evidence ? `<div><b>消息定價證據</b><ul>${evidence}</ul></div>` : ''}
${catalog ? `<div><b>相關消息與公告</b><ul>${catalog}</ul></div>` : ''}
</div></details>`;
  }).join('');
  return `<section class="section npr-section" id="newsPricingRadar" data-news-pricing-radar="${NEWS_PRICING_RADAR_VERSION}"><!-- NEWS_PRICING_RADAR_V1 -->
${header}${stats}
<div class="npr-table-wrap"><table class="npr-table"><thead><tr><th>觀察分數</th><th>股票</th><th>最近可驗證消息</th><th>消息後報酬</th><th>量比（5日）</th><th>前高突破</th><th>狀態／限制</th></tr></thead><tbody>${rows}</tbody></table></div>
${details}
<div class="npr-note">${esc(radar.note || '')}｜觀察分數只依「量比＋前高突破＋消息定價」計算，未計入基本面與正式排名；不是買進建議。</div>
</section>`;
}

const styles = `
.npr-section{border:1px solid #dfe9e2}
.npr-head h2{margin:0 0 4px}
.npr-head p{margin:0;color:#5b6b62;font-size:13px;line-height:1.6}
.npr-stats{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
.npr-stats span{background:#f3f7f4;border:1px solid #dce7df;border-radius:8px;padding:6px 12px;font-size:12.5px;color:#3c4a42}
.npr-stats b{color:#0b6b3a}
.npr-meta{margin-left:auto;color:#7b8a80}
.npr-table-wrap{overflow:auto;border:1px solid #e3eae5;border-radius:10px}
.npr-table{width:100%;border-collapse:collapse;min-width:760px}
.npr-table th{background:#0b6b3a;color:#fff;font-size:12.5px;padding:9px 10px;text-align:left;white-space:nowrap}
.npr-table td{border-top:1px solid #eef3ef;padding:9px 10px;font-size:13px;vertical-align:top}
.npr-table tbody tr:hover td{background:#f6fbf8}
.npr-score{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;padding:4px 8px;border-radius:9px;font-weight:800;font-size:16px;color:#fff}
.npr-score small{font-size:10px;font-weight:600;opacity:.9}
.npr-score.is-strong{background:#0b6b3a}
.npr-score.is-mid{background:#3f9d6d}
.npr-score.is-weak{background:#c99a2e}
.npr-score.is-low{background:#9aa7a0}
.npr-rank{font-size:11px;color:#7b8a80;margin-top:3px}
.npr-gap{color:#8a5a00;background:#fff7e8;border:1px solid #f0d48a;border-radius:6px;padding:3px 7px;margin-top:4px;font-size:11.5px}
.npr-detail{border:1px solid #e3eae5;border-radius:10px;margin-top:10px;overflow:hidden}
.npr-detail>summary{cursor:pointer;padding:10px 12px;font-weight:700;color:#0b3d22;background:#f7faf8;list-style:none}
.npr-detail>summary::-webkit-details-marker{display:none}
.npr-detail>summary:hover{background:#eef7f1}
.npr-detail>summary:focus-visible{outline:3px solid #e9b949;outline-offset:2px}
.npr-detail-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#333}
.npr-detail-body b{display:block;color:#0b6b3a;font-size:12.5px;margin-bottom:2px}
.npr-detail-body ul{margin:4px 0 0;padding-left:18px;line-height:1.65}
.npr-cat-title{color:#666;font-size:12px}
.npr-pending{color:#8a5a00;background:#fff7e8;border:1px solid #f0d48a;border-radius:999px;padding:0 6px;font-size:10.5px;margin-left:4px}
.npr-empty{background:#f6fbf8;border:1px dashed #bcddca;border-radius:10px;padding:14px;color:#3c4a42;font-size:13px}
.npr-note{margin-top:10px;font-size:12px;color:#7b8a80;line-height:1.6}
@media(max-width:560px){.npr-table{min-width:640px}.npr-stats span{font-size:12px}}
`;

module.exports = {
  NEWS_PRICING_RADAR_VERSION,
  computeStockPricing,
  summarizePricingRadar,
  renderPricingRadar,
  styles
};
