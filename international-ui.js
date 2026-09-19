'use strict';

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—';
const s = (v, d = 1, unit = '%') => Number.isFinite(v) ? (v > 0 ? '+' : '') + n(v, d) + unit : '資料不足';
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
  const judgment = (id, text) => sources.get(id)?.status === 'current' ? text : '資料未更新：先不要依這張圖做買賣判斷';
  const trendJudgment = (id, value, positive, negative, neutral, threshold = 0) => {
    if (!Number.isFinite(value)) return judgment(id, '資料不足：先不要依這張圖做買賣判斷');
    return judgment(id, value > threshold ? positive : value < -threshold ? negative : neutral);
  };
  const card = (id, title, value, detail, metric, note = '', use = '', simple = '') => {
    const src = sources.get(id);
    return `<article class="context-card context-${src.status}" data-source-id="${e(id)}" data-source-date="${e(src.observedAt || '')}" data-source-max-age="${e(src.maxAgeDays ?? '')}"><div class="context-card-head"><b>${e(title)}</b><span>${e(src.evidence)}級</span></div><strong>${e(value)}</strong><p>${e(detail)}</p>${sparkline(metric)}${simple ? `<div class="context-card-judgment"><b>簡單判讀</b><span>${e(simple)}</span></div>` : ''}${use ? `<div class="context-card-use"><b>為什麼</b><span>${e(use)}</span></div>` : ''}<small>${e(src.observedAt || '日期未知')} · ${e(src.cadence)} · <span class="context-freshness">${e(statusLabel[src.status])}</span></small>${note ? `<small>${e(note)}</small>` : ''}</article>`;
  };
  const soxRelative = Number.isFinite(d.sox?.change5) && Number.isFinite(d.sp500?.change5) && d.sox.date === d.sp500.date ? d.sox.change5 - d.sp500.change5 : null;
  const cards = [
     card('sp500', '美股 S&P 500', n(d.sp500?.value, 0), `20筆 ${s(d.sp500?.change20)}｜5筆 ${s(d.sp500?.change5)}`, d.sp500, '', '它代表全球市場氣氛，不是臺股個股答案。', trendJudgment('sp500', d.sp500?.change20, '偏向：可找符合條件個股，但不要追價', '偏向：先觀望，不新增部位', '中性：不據此買賣，回看個股條件', 0.5)),
     card('fx', '美元／臺幣', n(d.fx?.usdTwd?.value, 3), `5筆 ${s(d.fx?.usdTwd?.change5)}｜上升＝臺幣貶值`, d.fx?.usdTwd, '期交所參考值，非銀行成交報價', '臺幣貶值常代表資金壓力增加，但不能單獨判定賣出。', trendJudgment('fx', d.fx?.usdTwd?.change5, '偏向：可回看個股條件，仍不追價', '偏向：先觀望，不新增部位；持股不因這一項單獨賣出', '中性：不據此買賣，回看外資與個股價格', 0.5)),
     card('treasury', '美國10年債殖利率', `${n(d.treasury?.value, 2)}%`, `5筆 ${s(Number.isFinite(d.treasury?.difference5) ? d.treasury.difference5 * 100 : null, 0, '基點')}｜2年 ${n(d.treasury?.y2, 2)}%`, d.treasury, '', '殖利率上升會增加部分股票的估值壓力，不等於所有股票都要賣。', trendJudgment('treasury', d.treasury?.difference5, '偏向：可找符合條件個股，檢查估值後再承接', '偏向：成長股先觀望，等待價格結構確認', '中性：不據此買賣，回看個股估值與趨勢', 0.2)),
     card('vix', 'VIX 波動指數', n(d.vix?.value, 2), '低於20／高於25為觀察門檻，非買賣訊號', d.vix, '', '它代表市場緊張程度；高檔先保守，不代表持股必須賣出。', judgment('vix', Number.isFinite(d.vix?.value) && d.vix.value >= 25 ? '偏向：先觀望，不新增部位；持股先看個股破壞條件' : Number.isFinite(d.vix?.value) && d.vix.value < 20 ? '偏向：環境較穩，可找符合條件個股，但仍不追價' : '中性：不據此買賣，等待其他條件確認')),
     card('tx', '外資臺指期淨部位', `${n(d.tx?.net, 0)}口`, d.tx?.comparisonDate ? `較 ${d.tx.comparisonDate} ${s(d.tx.changeFromPrevious, 0, '口')}` : '首筆快照：尚無前期比較', null, '負值＝淨空；可能包含避險，不能單獨判空', '先看它是否與個股價格同向；淨空單不等於外資正在賣股票。', judgment('tx', '偏向：不可單獨買賣；只作確認，回看個股價格與法人條件')),
     card('dollar', 'Fed 廣義美元', n(d.dollar?.value, 2), `公布期間 ${s(d.dollar?.periodChange)}｜${d.dollar?.periodStart || '—'} 起`, d.dollar, '非 ICE DXY；週資料有發布落差', '它是全球資金背景，不是臺股的直接買賣訊號。', trendJudgment('dollar', d.dollar?.periodChange, '偏向：資金環境較緊，先觀望新部位', '偏向：可回看符合條件個股，仍不追價', '中性：不據此買賣，回看個股條件', 0.5))
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
     <div class="context-purpose"><strong>這裡不是買賣訊號，而是進場的環境濾網</strong><span>先回答「現在適合積極、等待，還是降低曝險？」再回到個股確認價格、法人與資料條件。它不會單獨叫你買進或賣出。</span></div>
     <div class="context-map" aria-label="國際資料與股票決策的關聯"><div><b>1｜進場節奏</b><span>美股、VIX、利率、匯率</span><small>決定要積極、等待，或避免追價</small></div><div><b>2｜產業與資金確認</b><span>半導體、能源、期貨部位</span><small>確認個股是否有產業順風與法人配合</small></div><div><b>3｜事件風險檢查</b><span>Fed、能源、制裁公告</span><small>決定是否延後決策並重新檢查曝險</small></div></div>
     <div class="context-verdict"><strong>${e(c.summary.regime)}</strong><span>${e(c.summary.action)}</span><small>觀察規則｜不改個股評分與買賣動作</small></div>
    <div class="context-grid">${cards}</div>
    <div class="context-refresh"><span>國際資料查詢：${e(localTime(c.checkedAt))}（臺北）${weak ? ` · ${weak}項落後／缺漏` : ''}</span><button id="checkPublishedUpdate" type="button">查看最新發布</button><span id="publishedUpdateStatus" role="status" aria-live="polite"></span></div>
     <details class="context-details"><summary>半導體、能源與國際法人部位</summary><div class="context-section-guide"><b>這一組回答：哪些產業或資金方向值得進一步核對？</b><span>它用來確認臺股個股的產業順風、成本壓力與法人情緒，不取代個股基本面，也不直接產生買賣訊號。</span></div><div class="context-grid context-grid-extra">
        ${card('sox', '費城半導體', n(d.sox?.value, 0), `5筆 ${s(d.sox?.change5)}｜相對S&P ${s(soxRelative, 1, '百分點')}`, d.sox, '', '確認電子／半導體個股是否有產業面配合；只作順風或逆風檢查', trendJudgment('sox', soxRelative, '偏向：電子股可列入觀察，等個股承接再買', '偏向：電子股新部位先觀望', '中性：不據此買賣，回看個股趨勢', 0.5))}
        ${card('oil', 'WTI近月期貨', `${n(d.oil?.value, 2)}美元／桶`, `5筆 ${s(d.oil?.change5)}｜注意合約轉倉`, d.oil, '', '檢查能源、運輸與製造成本壓力；先回看個股受益或受害方向', trendJudgment('oil', d.oil?.change5, '偏向：成本受影響產業先觀望；能源股仍須看個股', '偏向：成本壓力減輕，可回看受益個股', '中性：不據此買賣，回看個股產業位置', 2))}
        ${card('fx', '亞洲匯率參考', `USD/JPY ${n(d.fx?.usdJpy?.value, 2)}`, `USD/CNY ${n(d.fx?.usdCny?.value, 4)}｜均為一美元兌本幣`, null, '', '補充出口、進口與區域資金背景；不能單獨判定臺股漲跌', judgment('fx', '偏向：只作背景參考，不要依這張圖單獨買或賣'))}
     </div><p class="context-cot-note"><b>CFTC 部位的使用方式：</b>只把它當作市場擁擠度與情緒背景。週變化不等同新開倉，不能因為淨多或淨空就直接買進或放空。</p><div class="table-wrap"><table><thead><tr><th>契約</th><th>部位日期</th><th>淨多空（口）</th><th>較前週</th><th>淨部位／未平倉</th></tr></thead><tbody>${cot || '<tr><td colspan="5">本次無可用資料</td></tr>'}</tbody></table></div>
      <p>${e(d.tx?.limitation || '臺指期資料待取得。')}</p></details>
     <details class="context-details"><summary>利率、能源與國際制裁公告</summary><div class="context-section-guide"><b>這一組回答：今天是否有事件風險，需要延後決策或重新檢查？</b><span>公告是風險檢查清單。先閱讀原文與個股曝險，再決定是否等待，不把標題直接翻譯成利多或利空。</span></div><div class="context-events">${events}</div></details>
    <details class="context-details" id="internationalEvidence"><summary>資料來源、時效與判讀限制</summary><p>${e(c.summary.method)}</p><p>日資料超過4個日曆日、週資料超過11日標示落後；遇長假會採保守標示。落後值可查閱，不進環境標籤。公告日期與最近查詢時間分開。</p><div class="table-wrap"><table><thead><tr><th>來源</th><th>證據</th><th>資料日期</th><th>發布頻率</th><th>狀態</th><th>查證</th></tr></thead><tbody>${statusRows}</tbody></table></div><ul>${c.limitations.map(x => `<li>${e(x)}</li>`).join('')}</ul></details>
  </section>`;
}
const quickGuideHtml = `<section class="section" id="quickGuide"><div class="context-heading"><div><h2>個股快速操作</h2><p>先選「未持有／已持有」，再看動作、價位與改變條件。</p></div><a href="#positionSection">我的追蹤 ↓</a></div><div class="quick-controls"><input id="quickSearch" type="search" placeholder="輸入股票代號或名稱" aria-label="快速搜尋股票"><select id="quickMode" aria-label="目前持有狀態"><option value="entry">尚未持有</option><option value="holding">已經持有</option></select><select id="quickAction" aria-label="快速操作篩選"><option value="">全部動作</option></select><span id="quickCount" role="status" aria-live="polite"></span></div><p class="quick-data-note" id="quickDataNote"></p><div class="quick-grid" id="quickRows"></div><button type="button" id="quickMore">再顯示12檔</button><p class="quick-footnote">觀察區不等於自動委託價；缺少有效價格時不提供價位指引。國際訊號僅作環境參考。</p></section>`;
function installQuickGuide(rows, reportMeta, positionDecisionMeta, e, n, showScoreDetail) {
  const search = document.getElementById('quickSearch'), mode = document.getElementById('quickMode'), filter = document.getElementById('quickAction');
  const host = document.getElementById('quickRows'), more = document.getElementById('quickMore');
  let limit = 12;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const validPrice = r => Number.isFinite(r.analysisPrice ?? r.livePrice ?? r.close) && (r.analysisPrice ?? r.livePrice ?? r.close) > 0;
  const stale = r => { const d = r.liveDate || r.closeDate; return !d || !Number.isFinite(Date.parse(d)) || (Date.parse(today()) - Date.parse(d)) / 86400000 > 4; };
  const zone = z => z && Number.isFinite(z.low) && Number.isFinite(z.high) && z.low > 0 && z.high >= z.low ? n(z.low, 2) + '–' + n(z.high, 2) : '資料不足';
  const view = r => positionDecisionMeta({ entryPrice: null }, r);
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
      const action = unavailable ? '先更新資料，再判斷' : holding ? v.todayAction : canEnter ? '只在承接區分批，不追價' : r.entryAction === '等待確認' ? '等條件確認，先不買' : r.entryAction === '不建立部位' ? '排除新部位' : '暫不進場';
      const reason = holding ? (r.positionReasons?.[0] || r.holdingSignals?.[0] || '依價格與法人共同確認') : (r.rejectionReasons?.[0] || '通過現有門檻；仍須等承接條件');
      const priceLabel = holding ? v.triggerLabel : canEnter ? '承接觀察區' : '20EMA觀察區';
      const priceText = unavailable ? '暫不提供' : holding ? Number.isFinite(v.trigger) && v.trigger > 0 ? v.zoneText : '資料不足' : zone(r.addZone);
      const change = holding ? v.change : canEnter ? '跌破趨勢或法人轉弱 → 取消承接' : '趨勢、法人與資料門檻全數通過 → 重評';
      return '<article class="quick-card" data-quick-code="' + e(r.code) + '"><div class="quick-card-head"><b>' + e(r.code + ' ' + r.name) + '</b><span>' + e(label) + '</span></div><strong class="quick-action">' + e(action) + '</strong><div class="quick-prices"><div><small>參考價</small><b>' + (validPrice(r) ? n(r.analysisPrice ?? r.livePrice ?? r.close, 2) : '—') + '</b></div><div><small>' + e(priceLabel) + '</small><b>' + e(priceText) + '</b></div></div><p class="quick-reason">' + e(reason) + '</p><details><summary>改變條件與完整依據</summary><p>' + e(change) + '</p><p>下次確認：' + e(holding ? v.nextCheck : r.nextCheck || '下一交易日收盤') + '</p><p>' + e(holding ? r.holdingPlan : r.entryPlan) + '</p><button type="button" data-quick-detail="' + e(r.code) + '">查看評分與來源</button></details></article>';
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
 .context-map{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}
 .international-context{scroll-margin-top:16px}.context-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.context-heading h2{margin:0}.context-heading p{margin:5px 0 15px}.context-heading a{white-space:nowrap;font-size:14px}.context-purpose{display:flex;gap:8px 18px;align-items:baseline;flex-wrap:wrap;border:1px solid #c6d8cf;border-radius:9px;background:#f2f8f4;padding:12px 15px;margin:12px 0}.context-purpose strong{color:#174f3a}.context-purpose span{font-size:13px;line-height:1.6}.context-map{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 14px}.context-map>div{display:flex;flex-direction:column;gap:4px;border-left:3px solid #397866;background:#f8faf8;padding:10px 12px}.context-map b{font-size:14px}.context-map span{font-size:13px;color:#244b3c}.context-map small{font-size:12px;line-height:1.5;color:#59665f}.context-verdict{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;border-left:4px solid #aa7625;background:#faf3df;padding:13px 16px;margin:12px 0 18px}.context-verdict strong{font-size:23px}.context-verdict small{margin-left:auto;font-size:12px}
.context-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.context-card{min-width:0;border:1px solid #d7dfda;border-radius:10px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:6px}.context-card-head{display:flex;justify-content:space-between;gap:8px;font-size:14px}.context-card-head span{font-size:12px;color:#556b61}.context-card>strong{font-size:27px;font-variant-numeric:tabular-nums;line-height:1.2}.context-card p{font-size:13px;margin:0;min-height:20px}.context-card small{font-size:11px;color:#59665f;line-height:1.6}.context-stale{border-color:#bb8432;background:#fffaf0}.context-unavailable{border-style:dashed;background:#f4f5f4}.context-spark{width:100%;height:34px;color:#397866;margin:4px 0}.context-refresh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:14px 0;font-size:12px}.context-refresh button,.quick-controls select,.quick-controls input,#quickMore,.quick-card button{border:1px solid #bacac1;background:white;padding:9px 12px;border-radius:7px;color:#153e2e;min-height:40px}.context-details{border-top:1px solid var(--line);padding:12px 0}.context-details summary{font-weight:650}.context-details p,.context-details li{font-size:13px;line-height:1.7}.context-details table{min-width:660px;width:100%}.context-details td,.context-details th{padding:10px;text-align:left;white-space:normal}.context-events{display:grid;gap:14px}.context-event{display:flex;flex-direction:column;gap:5px;line-height:1.6}.context-event a{overflow-wrap:anywhere;font-size:14px}.context-event small{color:#59665f}.quick-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0 8px}.quick-controls input{flex:1;min-width:170px}.quick-controls span{font-size:13px}.quick-data-note,.quick-footnote{color:#5d6c64;font-size:12px}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:14px 0}.quick-card{min-width:0;border:1px solid #cad7cf;border-radius:10px;padding:16px;background:white}.quick-card-head{display:flex;gap:6px;flex-wrap:wrap;justify-content:space-between;font-size:15px}.quick-card-head span{font-size:12px;background:#eef3ef;border-radius:4px;padding:3px 5px}.quick-action{display:block;font-size:20px;line-height:1.5;margin:12px 0;color:#153e2e}.quick-prices{display:grid;grid-template-columns:.7fr 1.3fr;gap:8px;border-top:1px solid #e4eae6;border-bottom:1px solid #e4eae6;padding:10px 0}.quick-prices small{display:block;font-size:11px;color:#59665f}.quick-prices b{font-size:16px;font-variant-numeric:tabular-nums}.quick-reason{font-size:13px;line-height:1.6}.quick-card details{font-size:12px}.quick-card details p{line-height:1.7}#quickGuide{scroll-margin-top:14px}.freeze-details{margin-top:10px}.freeze-details summary{font-size:12px}.header-status{font-size:13px;margin-top:12px}.quick-gate{padding:10px 14px;background:#eff5f1;border:1px solid #c4d6ca;font-size:13px;margin:14px 0}.quick-gate.is-warning{background:#fff4dc;border-color:#d5b372}
@media(max-width:900px){.context-grid,.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.context-heading{align-items:flex-start}.context-verdict small{margin-left:0;width:100%}}@media(max-width:540px){.context-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.context-card{padding:11px}.context-card>strong{font-size:22px}.context-card-head{font-size:12px}.context-card p{font-size:12px}.context-card small{font-size:10px}.context-grid-extra,.quick-grid{grid-template-columns:1fr}.quick-controls input{width:100%;flex-basis:100%}.quick-controls select{min-width:0;flex:1}.context-heading a{font-size:12px}.context-heading p{font-size:13px}.quick-card{padding:15px}.context-verdict strong{font-size:20px}.context-verdict span{font-size:14px}}
`;
module.exports = { renderInternationalContext, quickGuideHtml, installQuickGuide, styles };
