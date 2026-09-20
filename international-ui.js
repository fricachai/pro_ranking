'use strict';

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
const s = (v, d = 1, unit = '%') => Number.isFinite(v) ? (v > 0 ? '+' : '') + n(v, d) + unit : '—';
const statusLabel = { current: '依發布頻率可用', stale: '資料落後', unavailable: '暫無資料' };
function localTime(value) { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚未查詢'; }
function sparkline(metric) {
  const values = (metric?.series || []).slice(-21).map(r => r.value).filter(Number.isFinite);
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1) * 160).toFixed(1)},${(30 - (v - min) / spread * 26).toFixed(1)}`).join(' ');
  return `<svg class="context-spark" viewBox="0 0 160 34" role="img" aria-label="最近${values.length}筆觀察值走勢，各圖獨立尺度"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}
function renderInternationalContext(c) {
  if (!c) return '<section class="section international-context" id="internationalContext"><h2>國際市場脈動</h2><p>等待完整更新取得國際資料；現有個股規則維持不變。</p></section>';
  const d = c.data, sources = new Map(c.sources.map(x => [x.id, x]));
  const sourceUsable = id => ['current', 'stale'].includes(sources.get(id)?.status);
  const judgment = (id, text) => sourceUsable(id) ? text : '目前採最近可用資料：採保守判讀，不單獨買賣';
  const trendJudgment = (id, value, positive, negative, neutral, threshold = 0) => {
    if (!Number.isFinite(value)) return '目前採最近可用資料：先不追價，回看個股卡的價格與防守條件';
    return judgment(id, value > threshold ? positive : value < -threshold ? negative : neutral);
  };
  const card = (id, title, value, detail, metric, note = '', use = '', simple = '') => {
    const src = sources.get(id);
    return `<article class="context-card context-${src.status}" data-source-id="${e(id)}" data-source-date="${e(src.observedAt || '')}" data-source-max-age="${e(src.maxAgeDays ?? '')}"><div class="context-card-head"><b>${e(title)}</b><span>${e(src.evidence)}級</span></div><strong>${e(value)}</strong><p>${e(detail)}</p>${sparkline(metric)}${simple ? `<div class="context-card-judgment"><b>簡單判讀</b><span>${e(simple)}</span></div>` : ''}${use ? `<div class="context-card-use"><b>為什麼</b><span>${e(use)}</span></div>` : ''}<small>${e(src.observedAt || '日期未知')} · ${e(src.cadence)} · <span class="context-freshness">${e(statusLabel[src.status])}</span></small>${note ? `<small>${e(note)}</small>` : ''}</article>`;
  };
  const sourceReady = ids => ids.every(id => sourceUsable(id));
  const sourceDate = ids => ids.map(id => sources.get(id)?.observedAt).filter(Boolean).sort().at(-1) || '日期未知';
  const sourceState = ids => sourceReady(ids) ? '資料目前可用' : '採最近可用資料，採保守判讀';
  const quickPanel = (tone, title, value, detail, judgment, limitation, ids) => `<article class="context-quick-panel context-quick-${e(tone)}"><div class="context-quick-head"><b>${e(title)}</b><span>${e(sourceState(ids))}</span></div><strong>${e(value)}</strong><p>${e(detail)}</p><div class="context-quick-judgment"><b>現在怎麼做</b><span>${e(judgment)}</span></div><small>資料日期 ${e(sourceDate(ids))} · ${e(limitation)}</small></article>`;
  const sox5 = d.sox?.change5, oil5 = d.oil?.change5, txNet = d.tx?.net;
  const fx5 = d.fx?.usdTwd?.change5;
  const treasuryBp = Number.isFinite(d.treasury?.difference5) ? Math.round(d.treasury.difference5 * 100 * 10) / 10 : null;
  const vixValue = d.vix?.value;
  const signalParts = [];
  const addSignal = (condition, score, label) => { if (condition) { signalParts.push({ score, label }); } };
  addSignal(Number.isFinite(d.sp500?.change5) && d.sp500.change5 > 0.5, 1, '美股上升');
  addSignal(Number.isFinite(d.sp500?.change5) && d.sp500.change5 < -0.5, -1, '美股下跌');
  addSignal(Number.isFinite(vixValue) && vixValue < 20, 1, '市場不緊張');
  addSignal(Number.isFinite(vixValue) && vixValue >= 25, -1, '市場明顯緊張');
  addSignal(Number.isFinite(sox5) && sox5 > 0.5, 1, '半導體上升');
  addSignal(Number.isFinite(sox5) && sox5 < -0.5, -1, '半導體下跌');
  addSignal(Number.isFinite(fx5) && fx5 < -0.5, 1, '臺幣轉強');
  addSignal(Number.isFinite(fx5) && fx5 > 0.5, -1, '臺幣轉弱');
  addSignal(Number.isFinite(treasuryBp) && treasuryBp <= -5, 1, '殖利率下降');
  addSignal(Number.isFinite(treasuryBp) && treasuryBp >= 5, -1, '殖利率上升');
  addSignal(Number.isFinite(txNet) && txNet >= 50000, 1, '外資期貨偏多');
  addSignal(Number.isFinite(txNet) && txNet <= -50000, -1, '外資期貨偏空');
  const signalScore = signalParts.reduce((sum, x) => sum + x.score, 0);
  const supports = signalParts.filter(x => x.score > 0).map(x => x.label);
  const pressures = signalParts.filter(x => x.score < 0).map(x => x.label);
  const marketReady = sourceReady(['sp500', 'vix', 'sox', 'fx', 'treasury', 'tx']);
  const severeRiskCount = [
    Number.isFinite(vixValue) && vixValue >= 25,
    Number.isFinite(d.sp500?.change5) && d.sp500.change5 <= -1.5,
    Number.isFinite(fx5) && fx5 >= 1,
    Number.isFinite(treasuryBp) && treasuryBp >= 10,
    Number.isFinite(txNet) && txNet <= -100000
  ].filter(Boolean).length;
  const marketAssessment = !marketReady
    ? { tone: 'mixed', label: '中性偏保守', headline: '目前先不追買，已持有部位照個股防守條件處理。', entry: '先不新增大部位；只看個股卡的承接區與價格結構。', holding: '先維持，不因這一區單獨賣出；個股卡轉弱才減碼。', why: '部分環境資料採最近可用值，故採保守節奏，不把單一缺口當成買賣訊號。', support: supports.join('、') || '市場氣氛與波動', pressure: pressures.join('、') || '利率、匯率或資金方向待確認' }
    : signalScore >= 3 && severeRiskCount === 0
      ? { tone: 'support', label: '偏多', headline: '台股環境偏多，可以分批買符合條件的個股。', entry: '只買個股卡顯示「可開始承接」且價格在承接區的股票；分批買，不追高。', holding: '維持持股；個股價格與法人都沒有轉弱，才考慮小量加碼。', why: '支持台股的訊號多於壓力訊號，且沒有明顯風險警報。', support: supports.join('、') || '沒有', pressure: pressures.join('、') || '沒有' }
      : signalScore <= -3 || severeRiskCount >= 2
        ? { tone: 'caution', label: '偏空', headline: '台股環境偏空，現在先停止新增買進。', entry: '現在不要買，等環境回到中性以上，再找個股。', holding: '個股卡出現「降低部位／優先降低風險」就減碼；尚未跌破防守條件，不要恐慌賣。', why: '壓力訊號明顯多於支持訊號，或已出現兩項以上高風險警報。', support: supports.join('、') || '沒有', pressure: pressures.join('、') || '沒有' }
        : { tone: 'mixed', label: '中性偏保守', headline: '台股現在不適合追買，也沒有足夠證據全面賣出。', entry: '先不新增大部位；只挑個股卡顯示「可開始承接」且價格在承接區的股票。', holding: '先維持；只有個股卡出現「降低部位／優先降低風險」才賣或減碼。', why: '支持與壓力訊號互相抵銷，現在用個股條件決定，不猜大盤。', support: supports.join('、') || '沒有', pressure: pressures.join('、') || '沒有' };
  const easyDirection = marketAssessment;
  const marketDetail = `S&P 500 5筆 ${s(d.sp500?.change5)}｜VIX ${n(d.vix?.value, 2)}（低於20通常較不緊張）`;
  const industryDetail = `費城半導體 5筆 ${s(sox5)}｜WTI油價 5筆 ${s(oil5)}；一個看電子氣氛，一個看成本壓力`;
  const flowDetail = `外資臺指期 ${n(txNet, 0)}口｜美國10年債 ${n(d.treasury?.value, 2)}%；期貨空單可能是避險`;
  const marketJudgment = marketAssessment.headline;
  const industryJudgment = Number.isFinite(sox5) && sox5 > 0.5 ? '電子方向偏多，可找符合條件的電子股；能源方向中性，先看油價是否讓成本變高。' : Number.isFinite(sox5) && sox5 < -0.5 ? '電子方向偏空，先不要買電子股；能源股仍要看個股成本與價格。' : '電子與能源沒有清楚方向，兩邊都先不追買。';
  const flowJudgment = Number.isFinite(txNet) && txNet <= -50000 ? '資金方向偏保守：先不追買；只有臺股也下跌、且個股卡同時轉弱，才減碼。' : '資金沒有明確壓力：持股先維持，新買仍要等個股卡通過。';
  const direct = {
    sp500: trendJudgment('sp500', d.sp500?.change5, '對台股：外部氣氛偏多，可找符合條件個股。', '對台股：外部氣氛偏空，新買先停。', '對台股：外部氣氛中性，維持、不追買。', 0.5),
    fx: Number.isFinite(fx5) && fx5 > 0.5 ? '對台股：臺幣轉弱，資金偏保守，先不追買。' : Number.isFinite(fx5) && fx5 < -0.5 ? '對台股：臺幣轉強，壓力減輕，可維持原策略。' : '對台股：匯率沒有明確壓力，維持原策略。',
    treasury: Number.isFinite(treasuryBp) && treasuryBp >= 5 ? '對台股：殖利率上升，成長股先不追買。' : Number.isFinite(treasuryBp) && treasuryBp <= -5 ? '對台股：殖利率下降，估值壓力減輕，可維持原策略。' : '對台股：殖利率變化不大，維持原策略。',
    vix: Number.isFinite(vixValue) && vixValue >= 25 ? '對台股：市場明顯緊張，停止新買。' : Number.isFinite(vixValue) && vixValue < 20 ? '對台股：市場不緊張，支持維持或找符合條件個股。' : '對台股：市場緊張程度普通，維持、不追買。',
    tx: Number.isFinite(txNet) && txNet <= -50000 ? '對台股：期貨偏空，先不追買；現貨也下跌時才算賣壓確認。' : Number.isFinite(txNet) && txNet >= 50000 ? '對台股：期貨偏多，支持維持；仍要個股條件通過。' : '對台股：期貨方向不明，維持原策略。',
    dollar: Number.isFinite(d.dollar?.periodChange) && d.dollar.periodChange > 0.5 ? '對台股：美元上升，資金偏緊，先不新增大部位。' : Number.isFinite(d.dollar?.periodChange) && d.dollar.periodChange < -0.5 ? '對台股：美元下降，資金壓力減輕，可找符合條件個股。' : '對台股：美元方向不明，維持原策略。'
  };
  const soxRelative = Number.isFinite(d.sox?.change5) && Number.isFinite(d.sp500?.change5) && d.sox.date === d.sp500.date ? d.sox.change5 - d.sp500.change5 : null;
  const cards = [
     card('sp500', '美股 S&P 500', n(d.sp500?.value, 0), `20筆 ${s(d.sp500?.change20)}｜5筆 ${s(d.sp500?.change5)}`, d.sp500, '', '它代表全球市場氣氛；這裡直接說明對台股方向。', direct.sp500),
     card('fx', '美元／臺幣', n(d.fx?.usdTwd?.value, 3), `5筆 ${s(d.fx?.usdTwd?.change5)}｜上升＝臺幣貶值`, d.fx?.usdTwd, '期交所參考值，非銀行成交報價', '臺幣貶值會讓資金環境偏緊；這裡直接說明台股要保守或維持。', direct.fx),
     card('treasury', '美國10年債殖利率', `${n(d.treasury?.value, 2)}%`, `5筆 ${s(Number.isFinite(d.treasury?.difference5) ? d.treasury.difference5 * 100 : null, 0, '基點')}｜2年 ${n(d.treasury?.y2, 2)}%`, d.treasury, '', '殖利率上升先壓縮成長股估值；這裡直接說明台股操作。', direct.treasury),
     card('vix', 'VIX 波動指數', n(d.vix?.value, 2), '低於20／高於25為觀察門檻', d.vix, '', 'VIX低表示市場不緊張，VIX高表示先停新買；不是單獨賣出訊號。', direct.vix),
     card('tx', '外資臺指期淨部位', `${n(d.tx?.net, 0)}口`, d.tx?.comparisonDate ? `較 ${d.tx.comparisonDate} ${s(d.tx.changeFromPrevious, 0, '口')}` : '首筆快照：尚無前期比較', null, '負值表示期貨押跌；只有臺股現貨也下跌，才把它當成賣壓確認。', direct.tx),
     card('dollar', 'Fed 廣義美元', n(d.dollar?.value, 2), `公布期間 ${s(d.dollar?.periodChange)}｜${d.dollar?.periodStart || '—'} 起`, d.dollar, '非 ICE DXY；週資料有發布落差', '美元上升表示全球資金偏緊；這裡直接說明台股是否先保守。', direct.dollar)
   ].join('');
  const statusRows = c.sources.map(src => `<tr><td>${e(src.label)}</td><td>${e(src.evidence)}級</td><td>${e(src.observedAt || '—')}</td><td>${e(src.cadence)}</td><td>${e(statusLabel[src.status])}${src.error ? `<br><small>${e(src.error)}</small>` : ''}</td><td><a href="${e(src.url)}" target="_blank" rel="noreferrer">原始來源</a></td></tr>`).join('');
  const cot = (d.cot || []).map(x => `<tr><td>${e({ 'S&P 500 Consolidated': 'S&P 500合併契約', 'UST 10Y NOTE': '美國10年債期貨', 'EURO FX': '歐元期貨' }[x.market])}</td><td>${e(x.date)}</td><td>${n(x.net, 0)}</td><td>${s(x.change, 0, '口')}</td><td>${s(x.netPctOi, 1)}</td></tr>`).join('');
  const events = ['fed', 'energy', 'sanctions'].map(id => {
    const src = sources.get(id), event = d[id]?.[0];
    return `<div class="context-event"><b>${e(src.label)}</b>${event ? `<a href="${e(event.url)}" target="_blank" rel="noreferrer">${e(event.title)}</a><small>簡單判讀：先不要因標題買進或賣出；先看原文與持股曝險。</small><small>公告 ${e(event.publishedAt.slice(0, 10))} · 原文待判讀</small>` : '<span>本次無法取得公告</span>'}</div>`;
  }).join('');
  const weak = c.sources.filter(x => x.status !== 'current').length;
  return `<section class="section international-context" id="internationalContext" data-context-version="${e(c.version)}">
     <div class="context-heading"><div><h2>國際市場脈動</h2><p>先看環境，再看個股觸發條件。</p></div><a href="#quickGuide">直接查個股 ↓</a></div>
      <div class="context-purpose"><strong>先給台股大方向，再查個股</strong><span>下方先回答「偏多、偏空，還是中性偏保守」，再依個股卡的明確動作買進、維持或減碼。</span></div>
      <div class="context-judgment-key"><b>操作對照：</b><span>「偏多」＝可分批買符合條件個股；「中性偏保守」＝持股先維持、不追買；「偏空」＝停止新買，持股照防守條件減碼。</span></div>
      <div class="context-easy-direction context-easy-${e(easyDirection.tone)}"><div class="context-easy-title"><span>台股大方向</span><strong>${e(easyDirection.label)}</strong></div><p class="context-easy-why"><b>${e(easyDirection.headline)}</b><br>${e(easyDirection.why)}</p><div class="context-easy-actions"><div><b>尚未持有：怎麼做</b><span>${e(easyDirection.entry)}</span></div><div><b>已經持有：怎麼做</b><span>${e(easyDirection.holding)}</span></div></div><div class="context-signal-balance"><span><b>支持台股：</b>${e(easyDirection.support)}</span><span><b>壓力台股：</b>${e(easyDirection.pressure)}</span></div><small>這是國際環境的總結方向；個股實際買賣仍照個股卡的「可開始承接／降低部位／優先降低風險」執行。</small></div>
      <div class="context-quick-panels" aria-label="國際市場三個先看方向">
        ${quickPanel(easyDirection.tone, '1｜市場氣氛', `S&P ${s(d.sp500?.change5)}｜VIX ${n(d.vix?.value, 2)}`, marketDetail, marketJudgment, '美股與VIX只看氣氛', ['sp500', 'vix'])}
        ${quickPanel(Number.isFinite(sox5) && sox5 > 0.5 ? 'support' : 'mixed', '2｜半導體與能源', `半導體 ${s(sox5)}｜油價 ${s(oil5)}`, industryDetail, industryJudgment, '沒有同口徑全球能源法人持倉', ['sox', 'oil'])}
        ${quickPanel('mixed', '3｜外資與利率', `期貨 ${n(txNet, 0)}口｜10年債 ${n(d.treasury?.value, 2)}%`, flowDetail, flowJudgment, '淨空單不等於現貨賣股', ['tx', 'treasury'])}
      </div>
      <p class="context-chart-note"><b>圖怎麼看：</b>線往上只是最近資料變強，線往下只是最近資料變弱；它不是預測，也不能單獨決定買或賣。</p>
      <div class="context-map" aria-label="國際資料與股票決策的關聯"><div><b>1｜進場節奏</b><span>美股、VIX、利率、匯率</span><small>決定要積極、等待，或避免追價</small></div><div><b>2｜產業與資金確認</b><span>半導體、能源、期貨部位</span><small>確認個股是否有產業順風與法人配合</small></div><div><b>3｜事件風險檢查</b><span>Fed、能源、制裁公告</span><small>決定是否延後決策並重新檢查曝險</small></div></div>
     <div class="context-verdict"><strong>台股執行結論：${e(marketAssessment.label)}</strong><span>${e(marketAssessment.headline)}</span><small>依美股、VIX、半導體、匯率、殖利率與外資期貨綜合；不改個股評分與個股動作規則</small></div>
    <div class="context-grid">${cards}</div>
    <div class="context-refresh"><span>國際資料查詢：${e(localTime(c.checkedAt))}（臺北）${weak ? ` · ${weak}項落後／缺漏` : ''}</span><button id="checkPublishedUpdate" type="button">查看最新發布</button><span id="publishedUpdateStatus" role="status" aria-live="polite"></span></div>
     <details class="context-details"><summary>半導體、能源與國際法人部位</summary><div class="context-section-guide"><b>這一組回答：電子、能源與資金現在偏強還是偏弱？</b><span>先看這裡的直接結論，再回到個股卡執行買進、維持或減碼；它不會改寫個股評分。</span></div><div class="context-grid context-grid-extra">
        ${card('sox', '費城半導體', n(d.sox?.value, 0), `5筆 ${s(d.sox?.change5)}｜相對S&P ${s(soxRelative, 1, '百分點')}`, d.sox, '', '電子股的產業氣氛；上升才支持找電子股，下跌就先停新買。', trendJudgment('sox', soxRelative, '對台股：電子方向偏多，可找符合條件電子股。', '對台股：電子方向偏空，先不要買電子股。', '對台股：電子方向不明，電子股維持、不追買。', 0.5))}
        ${card('oil', 'WTI近月期貨', `${n(d.oil?.value, 2)}美元／桶`, `5筆 ${s(d.oil?.change5)}｜注意合約轉倉`, d.oil, '', '油價上升會增加運輸與製造成本；能源股仍要看公司是否受益。', trendJudgment('oil', d.oil?.change5, '對台股：成本壓力增加，運輸／製造股先不追買。', '對台股：成本壓力減輕，可找受益個股。', '對台股：油價方向不明，不改變原本買賣。', 2))}
        ${card('fx', '亞洲匯率參考', `USD/JPY ${n(d.fx?.usdJpy?.value, 2)}`, `USD/CNY ${n(d.fx?.usdCny?.value, 4)}｜均為一美元兌本幣`, null, '', '只用來看出口、進口與區域資金背景；不會單獨改變台股買賣。', judgment('fx', '對台股：這是背景資料，維持原本個股卡的買賣動作。'))}
     </div><p class="context-cot-note"><b>CFTC 部位的使用方式：</b>只把它當作市場擁擠度與情緒背景。週變化不等同新開倉，不能因為淨多或淨空就直接買進或放空。</p><div class="table-wrap"><table><thead><tr><th>契約</th><th>部位日期</th><th>淨多空（口）</th><th>較前週</th><th>淨部位／未平倉</th></tr></thead><tbody>${cot || '<tr><td colspan="5">本次無可用資料</td></tr>'}</tbody></table></div>
      <p>${e(d.tx?.limitation || '臺指期資料待取得。')}</p></details>
     <details class="context-details"><summary>利率、能源與國際制裁公告</summary><div class="context-section-guide"><b>這一組回答：今天是否有事件風險，需要延後決策或重新檢查？</b><span>公告是風險檢查清單。先閱讀原文與個股曝險，再決定是否等待，不把標題直接翻譯成利多或利空。</span></div><div class="context-events">${events}</div></details>
    <details class="context-details" id="internationalEvidence"><summary>資料來源、時效與判讀限制</summary><p>${e(c.summary.method)}</p><p>日資料超過4個日曆日、週資料超過11日標示落後；遇長假會採保守標示。落後值可查閱，不進環境標籤。公告日期與最近查詢時間分開。</p><div class="table-wrap"><table><thead><tr><th>來源</th><th>證據</th><th>資料日期</th><th>發布頻率</th><th>狀態</th><th>查證</th></tr></thead><tbody>${statusRows}</tbody></table></div><ul>${c.limitations.map(x => `<li>${e(x)}</li>`).join('')}</ul></details>
  </section>`;
}
const quickGuideHtml = `<section class="section" id="quickGuide"><div class="context-heading"><div><h2>個股快速操作</h2><p>先選「未持有／已持有」，每張卡直接告訴你現在買、維持或減碼。</p></div><a href="#positionSection">我的追蹤 ↓</a></div><p class="quick-action-key"><b>操作讀法：</b>「可開始承接」＝可以分批買；「等待確認／不建立部位」＝現在不買；「正常持有」＝維持；「降低部位／優先降低風險」＝減碼。</p><div class="quick-controls"><input id="quickSearch" type="search" placeholder="輸入股票代號或名稱" aria-label="快速搜尋股票"><select id="quickMode" aria-label="目前持有狀態"><option value="entry">尚未持有</option><option value="holding">已經持有</option></select><select id="quickAction" aria-label="快速操作篩選"><option value="">全部動作</option></select><span id="quickCount" role="status" aria-live="polite"></span></div><p class="quick-data-note" id="quickDataNote"></p><div class="quick-grid" id="quickRows"></div><button type="button" id="quickMore">再顯示12檔</button><p class="quick-footnote">觀察區是限價參考區，不是保證成交或自動委託；缺少有效價格時不提供價位指引。</p></section>`;
function installQuickGuide(rows, reportMeta, positionDecisionMeta, e, n, showScoreDetail) {
  const search = document.getElementById('quickSearch'), mode = document.getElementById('quickMode'), filter = document.getElementById('quickAction');
  const host = document.getElementById('quickRows'), more = document.getElementById('quickMore');
  let limit = 12;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const validPrice = r => Number.isFinite(r.analysisPrice ?? r.livePrice ?? r.close) && (r.analysisPrice ?? r.livePrice ?? r.close) > 0;
  const stale = r => { const d = r.liveDate || r.closeDate; return !d || !Number.isFinite(Date.parse(d)) || (Date.parse(today()) - Date.parse(d)) / 86400000 > 4; };
  const zone = z => z && Number.isFinite(z.low) && Number.isFinite(z.high) && z.low > 0 && z.high >= z.low ? n(z.low, 2) + '–' + n(z.high, 2) : '未提供價位';
  const view = r => positionDecisionMeta({ entryPrice: null }, r);
  const flowDirection = (value, label) => !Number.isFinite(value) ? `${label}目前無有效數值` : value > 0 ? `${label}增加 ${n(value, 0)}張（偏強）` : value < 0 ? `${label}減少 ${n(Math.abs(value), 0)}張（偏弱）` : `${label}沒有變化（中性）`;
  const stockFlowText = r => {
    const etf = r.etf?.d5, foreign = r.foreign?.holdingD5;
    const conclusion = Number.isFinite(etf) && Number.isFinite(foreign) && etf > 0 && foreign > 0 ? '兩項都增加，籌碼偏強。' : Number.isFinite(etf) && Number.isFinite(foreign) && etf < 0 && foreign < 0 ? '兩項都減少，籌碼偏弱，先不要加碼。' : Number.isFinite(etf) && Number.isFinite(foreign) && ((etf > 0 && foreign < 0) || (etf < 0 && foreign > 0)) ? '一強一弱，籌碼分歧，先維持不追價。' : '目前沒有一致方向，先維持。';
    return `ETF：${flowDirection(etf, '')}；外資持股：${flowDirection(foreign, '')}。${conclusion}`;
  };
  function refreshOptions() {
    filter.innerHTML = '<option value="">全部動作</option>' + [...new Set(rows.map(r => mode.value === 'entry' ? r.entryAction : view(r).label))].map(x => '<option>' + e(x) + '</option>').join('');
  }
  function drawQuick() {
      const q = search.value.trim().toLowerCase(), holding = mode.value === 'holding';
    const selected = rows.filter(r => (!q || (r.code + ' ' + r.name).toLowerCase().includes(q)) && (!filter.value || (holding ? view(r).label : r.entryAction) === filter.value));
    document.getElementById('quickCount').textContent = '顯示 ' + Math.min(limit, selected.length) + '／' + selected.length + ' 檔';
    document.getElementById('quickDataNote').textContent = '個股價格 ' + (reportMeta.liveFreeze || reportMeta.marketDate || '日期未知') + '｜' + (reportMeta.quotePhase === 'close' ? '收盤資料' : '盤中快照，待收盤確認');
    host.innerHTML = selected.slice(0, limit).map(r => {
      const v = view(r), unavailable = stale(r) || !validPrice(r), canEnter = r.entryAction === '可開始承接';
      const label = unavailable ? '資料待更新' : holding ? v.label : r.entryAction;
      const current = r.analysisPrice ?? r.livePrice ?? r.close;
      const zoneText = zone(r.addZone);
      const entryActionText = !validPrice(r) || !r.addZone ? '現在不買：目前無有效價格，先不提供價位' : current > r.addZone.high ? `現在不追價：等回到 ${zoneText} 再分批買` : current < r.addZone.low ? `先觀察：等回到 ${zoneText} 再分批買` : `現在可分批買：${zoneText}；不要追高`;
      const action = unavailable ? '先更新資料，再判斷' : holding ? (v.label === '符合加碼條件' ? `可以加碼：回到 ${v.zoneText || zone(r.addZone)} 分2–3批` : v.label === '降低部位' || v.label === '優先降低風險' ? `現在減碼：${v.todayAction}` : v.label === '保護持有' ? `先維持、不加碼：${v.todayAction}` : `維持持有：${v.todayAction}`) : canEnter ? entryActionText : r.entryAction === '等待確認' ? '現在不買：尚未通過可買條件' : r.entryAction === '不建立部位' ? '現在不要買：這檔未通過門檻' : '現在不買：暫不進場';
      const priceReason = !validPrice(r) || !r.addZone ? '目前無有效價格，暫不提供買點。' : current > r.addZone.high ? `目前價格 ${n(current, 2)} 高於承接區 ${zoneText}，先不要追價。` : current < r.addZone.low ? `目前價格 ${n(current, 2)} 低於承接區 ${zoneText}，先觀察是否重新站回。` : `目前價格 ${n(current, 2)} 在承接區 ${zoneText} 內。`;
      const reason = holding ? `${r.positionReasons?.[0] || r.holdingSignals?.[0] || '依價格與法人共同確認'}；${stockFlowText(r)}` : `${r.rejectionReasons?.[0] || (canEnter ? priceReason : '目前未通過完整進場門檻。')} ${stockFlowText(r)}`;
      const priceLabel = holding ? v.triggerLabel : canEnter ? '承接觀察區' : '20EMA觀察區';
      const priceText = unavailable ? '暫不提供' : holding ? Number.isFinite(v.trigger) && v.trigger > 0 ? v.zoneText : '未提供價位' : zone(r.addZone);
      const change = holding ? `${v.change}；${stockFlowText(r)}` : canEnter ? `價格跌破20日EMA（約 ${n(r.technical?.ema20, 2)}）或 ETF／外資持股由增加轉為減少，就取消下一批。` : `等價格、ETF、外資持股與其他門檻同時轉強，再重新判斷。`;
      const plan = holding ? `${r.holdingPlan} ${stockFlowText(r)}` : canEnter ? `操作方式：${entryActionText}；${stockFlowText(r)}` : `目前不買。${stockFlowText(r)}`;
      return '<article class="quick-card" data-quick-code="' + e(r.code) + '"><div class="quick-card-head"><b>' + e(r.code + ' ' + r.name) + '</b><span>' + e(label) + '</span></div><strong class="quick-action">' + e(action) + '</strong><div class="quick-prices"><div><small>參考價</small><b>' + (validPrice(r) ? n(r.analysisPrice ?? r.livePrice ?? r.close, 2) : '—') + '</b></div><div><small>' + e(priceLabel) + '</small><b>' + e(priceText) + '</b></div></div><p class="quick-reason">' + e(reason) + '</p><details><summary>改變條件與完整依據</summary><p>' + e(change) + '</p><p>下次確認：' + e(holding ? v.nextCheck : r.nextCheck || '下一交易日收盤') + '</p><p>' + e(plan) + '</p><button type="button" data-quick-detail="' + e(r.code) + '">查看評分與來源</button></details></article>';
    }).join('') || '<p>查無符合條件的股票。</p>';
    more.hidden = selected.length <= limit;
  }
  search.addEventListener('input', () => { limit = 12; drawQuick(); });
  filter.addEventListener('change', () => { limit = 12; drawQuick(); });
  mode.addEventListener('change', () => { limit = 12; refreshOptions(); drawQuick(); });
  more.addEventListener('click', () => { limit += 12; drawQuick(); });
  host.addEventListener('click', event => { const button = event.target.closest('[data-quick-detail]'); if (button) showScoreDetail(button.dataset.quickDetail); });
  refreshOptions(); drawQuick();
  function checkAge() {
    let expiredCore = false;
    document.querySelectorAll('.context-card[data-source-date]').forEach(card => {
      const age = (Date.parse(today()) - Date.parse(card.dataset.sourceDate)) / 86400000;
      if (card.dataset.sourceMaxAge && Number.isFinite(age) && age > Number(card.dataset.sourceMaxAge)) {
        card.classList.add('context-stale'); card.classList.remove('context-current');
        card.querySelector('.context-freshness').textContent = '資料已過期，請更新';
        if (['sp500', 'fx', 'treasury', 'vix'].includes(card.dataset.sourceId)) expiredCore = true;
      }
    });
    if (expiredCore) {
      const verdict = document.querySelector('.context-verdict');
      verdict.querySelector('strong').textContent = '資料待更新';
      verdict.querySelector('span').textContent = '市場環境資料已過期，暫停沿用原判讀';
    }
  }
  checkAge();
  setInterval(() => { checkAge(); drawQuick(); }, 60000);
  const refresh = document.getElementById('checkPublishedUpdate');
  refresh?.addEventListener('click', async () => {
    const status = document.getElementById('publishedUpdateStatus'); refresh.disabled = true; status.textContent = '檢查發布版本…';
    try {
      const response = await fetch('professional-screen-report/latest.json?check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const latest = await response.json();
      if (!latest.meta?.generatedAt) throw new Error('報告格式不符');
      if (latest.meta.generatedAt !== reportMeta.generatedAt) { status.textContent = '發現新版，正在載入…'; location.reload(); }
      else status.textContent = '目前已是最新發布；完整資料更新由管理者啟動。';
    } catch { status.textContent = '暫時無法查詢，保留目前畫面。'; }
    finally { refresh.disabled = false; }
  });
}
const styles = `
 header h1{font-size:clamp(24px,3vw,36px)}header .header-row{gap:12px}header>p{max-width:850px}details>summary{cursor:pointer}details.source-audit{margin:18px 0;padding:14px;background:#fff;border:1px solid var(--line)}
 .context-card-use{display:flex;flex-direction:column;gap:3px;border-left:3px solid #397866;background:#f4f8f5;padding:7px 9px;margin:2px 0 3px}.context-card-use b{font-size:11px;color:#174f3a}.context-card-use span{font-size:12px;line-height:1.55;color:#244b3c}.context-section-guide{display:flex;flex-direction:column;gap:4px;background:#f8faf8;border-left:3px solid #aa7625;padding:10px 12px;margin:10px 0 14px}.context-section-guide b{font-size:14px}.context-section-guide span,.context-cot-note{font-size:13px;line-height:1.65}
 .context-card-judgment{display:flex;flex-direction:column;gap:3px;border-left:3px solid #aa7625;background:#fff8e8;padding:8px 9px;margin:2px 0 0}.context-card-judgment b{font-size:12px;color:#704d12}.context-card-judgment span{font-size:13px;line-height:1.55;color:#3f321c;font-weight:600}
 .context-judgment-key{display:flex;gap:6px;flex-wrap:wrap;background:#eef4f0;border:1px solid #cbd9d0;border-radius:7px;padding:9px 12px;margin:10px 0;font-size:12px;line-height:1.6}.context-judgment-key b{color:#174f3a}
 .context-easy-direction{border:2px solid #397866;border-radius:12px;background:#f3f8f4;padding:14px 16px;margin:12px 0 14px}.context-easy-caution{border-color:#b77927;background:#fff8e8}.context-easy-blocked{border-color:#8b5b5b;background:#fff4f2}.context-easy-mixed{border-color:#b77927;background:#fffaf0}.context-easy-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.context-easy-title span{font-size:13px;color:#315b49}.context-easy-title strong{font-size:24px;color:#174f3a}.context-easy-caution .context-easy-title strong,.context-easy-mixed .context-easy-title strong{color:#7b531b}.context-easy-blocked .context-easy-title strong{color:#744545}.context-easy-why{margin:6px 0 10px;font-size:14px;line-height:1.65}.context-easy-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.context-easy-actions>div{display:flex;flex-direction:column;gap:3px;background:#fff;border:1px solid #d7e1da;border-radius:8px;padding:9px 11px}.context-easy-actions b{font-size:12px;color:#174f3a}.context-easy-actions span,.context-easy-direction>small{font-size:13px;line-height:1.55}.context-easy-direction>small{display:block;margin-top:9px;color:#59665f}.context-signal-balance{display:flex;gap:8px 18px;flex-wrap:wrap;margin-top:10px;font-size:12px;line-height:1.5;color:#304c40}.context-signal-balance span{background:#fff;border:1px solid #d7e1da;border-radius:6px;padding:6px 8px}.context-signal-balance b{color:#174f3a}
 .context-quick-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 10px}.context-quick-panel{border:1px solid #cbd9d0;border-radius:10px;background:#fff;padding:12px 13px;display:flex;flex-direction:column;gap:5px}.context-quick-support{border-top:4px solid #397866}.context-quick-mixed{border-top:4px solid #b77927}.context-quick-caution{border-top:4px solid #b77927;background:#fffaf0}.context-quick-blocked{border-top:4px solid #8b5b5b;background:#fff4f2}.context-quick-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.context-quick-head b{font-size:14px}.context-quick-head span{font-size:10px;color:#59665f}.context-quick-panel>strong{font-size:19px;color:#173d2e;line-height:1.3}.context-quick-panel p{margin:0;font-size:12px;line-height:1.5;color:#304c40}.context-quick-judgment{border-left:3px solid #aa7625;background:#fff8e8;padding:7px 8px;display:flex;flex-direction:column;gap:2px}.context-quick-judgment b{font-size:11px;color:#704d12}.context-quick-judgment span{font-size:12px;line-height:1.5;font-weight:600;color:#3f321c}.context-quick-panel>small{font-size:10px;line-height:1.45;color:#59665f}.context-chart-note{font-size:12px;color:#59665f;background:#f7faf8;border-left:3px solid #9cafa5;padding:8px 10px;margin:8px 0 12px}.context-chart-note b{color:#315b49}
 .context-map{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}
 .international-context{scroll-margin-top:16px}.context-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.context-heading h2{margin:0}.context-heading p{margin:5px 0 15px}.context-heading a{white-space:nowrap;font-size:14px}.context-purpose{display:flex;gap:8px 18px;align-items:baseline;flex-wrap:wrap;border:1px solid #c6d8cf;border-radius:9px;background:#f2f8f4;padding:12px 15px;margin:12px 0}.context-purpose strong{color:#174f3a}.context-purpose span{font-size:13px;line-height:1.6}.context-map{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 14px}.context-map>div{display:flex;flex-direction:column;gap:4px;border-left:3px solid #397866;background:#f8faf8;padding:10px 12px}.context-map b{font-size:14px}.context-map span{font-size:13px;color:#244b3c}.context-map small{font-size:12px;line-height:1.5;color:#59665f}.context-verdict{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;border-left:4px solid #aa7625;background:#faf3df;padding:13px 16px;margin:12px 0 18px}.context-verdict strong{font-size:23px}.context-verdict small{margin-left:auto;font-size:12px}
.context-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.context-card{min-width:0;border:1px solid #d7dfda;border-radius:10px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:6px}.context-card-head{display:flex;justify-content:space-between;gap:8px;font-size:14px}.context-card-head span{font-size:12px;color:#556b61}.context-card>strong{font-size:27px;font-variant-numeric:tabular-nums;line-height:1.2}.context-card p{font-size:13px;margin:0;min-height:20px}.context-card small{font-size:11px;color:#59665f;line-height:1.6}.context-stale{border-color:#bb8432;background:#fffaf0}.context-unavailable{border-style:dashed;background:#f4f5f4}.context-spark{width:100%;height:34px;color:#397866;margin:4px 0}.context-refresh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:14px 0;font-size:12px}.context-refresh button,.quick-controls select,.quick-controls input,#quickMore,.quick-card button{border:1px solid #bacac1;background:white;padding:9px 12px;border-radius:7px;color:#153e2e;min-height:40px}.context-details{border-top:1px solid var(--line);padding:12px 0}.context-details summary{font-weight:650}.context-details p,.context-details li{font-size:13px;line-height:1.7}.context-details table{min-width:660px;width:100%}.context-details td,.context-details th{padding:10px;text-align:left;white-space:normal}.context-events{display:grid;gap:14px}.context-event{display:flex;flex-direction:column;gap:5px;line-height:1.6}.context-event a{overflow-wrap:anywhere;font-size:14px}.context-event small{color:#59665f}.quick-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0 8px}.quick-controls input{flex:1;min-width:170px}.quick-controls span{font-size:13px}.quick-data-note,.quick-footnote{color:#5d6c64;font-size:12px}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:14px 0}.quick-card{min-width:0;border:1px solid #cad7cf;border-radius:10px;padding:16px;background:white}.quick-card-head{display:flex;gap:6px;flex-wrap:wrap;justify-content:space-between;font-size:15px}.quick-card-head span{font-size:12px;background:#eef3ef;border-radius:4px;padding:3px 5px}.quick-action{display:block;font-size:20px;line-height:1.5;margin:12px 0;color:#153e2e}.quick-prices{display:grid;grid-template-columns:.7fr 1.3fr;gap:8px;border-top:1px solid #e4eae6;border-bottom:1px solid #e4eae6;padding:10px 0}.quick-prices small{display:block;font-size:11px;color:#59665f}.quick-prices b{font-size:16px;font-variant-numeric:tabular-nums}.quick-reason{font-size:13px;line-height:1.6}.quick-card details{font-size:12px}.quick-card details p{line-height:1.7}#quickGuide{scroll-margin-top:14px}.freeze-details{margin-top:10px}.freeze-details summary{font-size:12px}.header-status{font-size:13px;margin-top:12px}.quick-gate{padding:10px 14px;background:#eff5f1;border:1px solid #c4d6ca;font-size:13px;margin:14px 0}.quick-gate.is-warning{background:#fff4dc;border-color:#d5b372}
 .context-signal-balance{display:flex;gap:8px 18px;flex-wrap:wrap;margin-top:10px;font-size:12px;line-height:1.5;color:#304c40}.context-signal-balance span{background:#fff;border:1px solid #d7e1da;border-radius:6px;padding:6px 8px}.context-signal-balance b{color:#174f3a}.quick-action-key{font-size:13px;line-height:1.6;background:#f8faf8;border-left:3px solid #397866;padding:8px 10px;margin:8px 0}.quick-action-key b{color:#174f3a}.quick-action{line-height:1.45}
@media(max-width:900px){.context-grid,.quick-grid,.context-quick-panels{grid-template-columns:repeat(2,minmax(0,1fr))}.context-heading{align-items:flex-start}.context-verdict small{margin-left:0;width:100%}}@media(max-width:540px){.context-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.context-card{padding:11px}.context-card>strong{font-size:22px}.context-card-head{font-size:12px}.context-card p{font-size:12px}.context-card small{font-size:10px}.context-grid-extra,.quick-grid,.context-quick-panels{grid-template-columns:1fr}.context-easy-actions{grid-template-columns:1fr}.quick-controls input{width:100%;flex-basis:100%}.quick-controls select{min-width:0;flex:1}.context-heading a{font-size:12px}.context-heading p{font-size:13px}.quick-card{padding:15px}.context-verdict strong{font-size:20px}.context-verdict span{font-size:14px}.context-easy-title strong{font-size:21px}}
`;
module.exports = { renderInternationalContext, quickGuideHtml, installQuickGuide, styles };
