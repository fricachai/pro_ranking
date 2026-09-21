'use strict';

// Independent research context. Never changes HORIZON_SCORE_V2 or stock actions.
const VERSION = 'INTERNATIONAL_CONTEXT_V1';
const DEFINITIONS = {
  fx: ['期交所外幣參考匯率', 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates', 'A', '每日參考值', 4],
  tx: ['期交所三大法人期貨（依日期查詢）', 'https://www.taifex.com.tw/cht/3/futContractsDate', 'A', '每日盤後', 4],
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
const OFFICIAL_EVENT_IDS = new Set(['fed', 'energy', 'sanctions']);
const EVENT_GUIDANCE_VERSION = 'EVENT_CONTENT_GUIDE_V1';
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
function extractArticleText(body) {
  return text(String(body || '').replace(/<(script|style|noscript|nav|header|footer|aside|form|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
}
function shorten(value, max = 360) {
  const s = String(value || '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
}
function contentSentences(content) {
  return (String(content || '').match(/[^.!?。！？]+[.!?。！？]+/g) || [String(content || '')])
    .map(x => x.trim()).filter(x => x.length >= 24);
}
function focusArticleContent(content) {
  const anchors = [
    /The Federal Open Market Committee/i,
    /The Committee decided/i,
    /The price of distillate fuel oil/i,
    /Crack spreads are/i,
    /The national emergency declared/i,
    /Following the expiration/i,
    /Separately, OFAC/i,
    /Specially Designated Nationals List Updates/i
  ];
  const positions = anchors.map(anchor => anchor.exec(content)?.index).filter(Number.isInteger);
  return positions.length ? content.slice(Math.min(...positions)) : content;
}
function contentEvidence(content, patterns, limit = 2) {
  const focused = focusArticleContent(content);
  const matches = contentSentences(focused).filter(sentence => patterns.some(pattern => pattern.test(sentence)));
  return shorten([...new Set(matches)].slice(0, limit).join(' '), 520) || shorten(focused, 360);
}
function hasContent(content, patterns) {
  return patterns.some(pattern => pattern.test(content));
}
function eventAnalysis(fields) {
  return { version: EVENT_GUIDANCE_VERSION, ...fields };
}
function unavailableEventAnalysis(id, error) {
  const byId = {
    fed: {
      simpleJudgment: '這次未取得 Fed 公告內文，不用標題猜升息或降息；待原文可讀後核對政策利率、通膨與前瞻說法。',
      direction: '目前不把這則公告轉成台股買賣方向。',
      exposure: '先核對高本益比、負債高或對美元／美債殖利率敏感的持股。',
      action: '新資金不因標題追價；既有持股照個股價格結構與基本面條件處理。',
      evidence: '官方公告內文尚未成功擷取。',
      limitation: '未讀到原文前，不推定政策方向。'
    },
    energy: {
      simpleJudgment: '這次未取得 EIA 文章內文，不用標題猜油價利多或利空；待原文可讀後核對供給、庫存與煉油利差。',
      direction: '目前不把這則公告轉成能源股或運輸股買賣方向。',
      exposure: '先核對運輸、物流、航空、化工與製造持股的燃料成本及成本轉嫁能力。',
      action: '新資金不因能源標題追價；既有持股先看毛利與成本是否真的受影響。',
      evidence: '官方文章內文尚未成功擷取。',
      limitation: '未讀到原文前，不推定柴油價格對臺灣公司的影響。'
    },
    sanctions: {
      simpleJudgment: '這次未取得 OFAC 公告內文，不用標題猜制裁解除或加重；待原文可讀後核對名單、許可與適用交易範圍。',
      direction: '目前不把這則公告轉成大盤或一般個股買賣方向。',
      exposure: '先核對持股公司的客戶、供應商、付款、出口地區與制裁名單曝險。',
      action: '有直接曝險才延後決策並查合規；沒有直接曝險則回到個股價格、基本面與法人條件。',
      evidence: '官方公告內文尚未成功擷取。',
      limitation: '未讀到原文前，不推定任何公司可使用特定許可。'
    }
  };
  return eventAnalysis({ status: 'unavailable', ...byId[id], error: String(error || '').slice(0, 180) });
}
function interpretOfficialEvent(id, event, articleBody) {
  const content = extractArticleText(articleBody);
  if (content.length < 120) return unavailableEventAnalysis(id, '官方原文內容過短或未回傳可解析正文');
  if (id === 'fed') {
    const hike = hasContent(content, [/raise the target range for the federal funds rate/i, /raise(?:d)?[^.]{0,100}federal funds rate/i]);
    const cut = hasContent(content, [/lower the target range for the federal funds rate/i, /cut[^.]{0,100}federal funds rate/i]);
    const inflation = hasContent(content, [/inflation remains elevated/i, /inflation[^.]{0,80}(?:elevated|above|price stability)/i]);
    const evidence = contentEvidence(content, [/raise the target range for the federal funds rate/i, /lower the target range for the federal funds rate/i, /inflation remains elevated/i, /uncertainty remains elevated/i]);
    if (hike) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: `原文是升息${inflation ? '，並明示通膨仍高' : ''}；這是金融條件收緊，不是單純的「美股利空」標題。`,
      direction: '對臺股：高估值、對利率敏感與高負債公司先面臨估值／融資壓力；不等於所有股票都要賣。',
      exposure: '核對高本益比成長股、負債高或需要持續融資的持股，並看美元與美債殖利率是否同步走高。',
      action: '新資金先不追高，等個股承接區與價格結構確認；既有持股未同時出現基本面或價格破壞，不因單一 Fed 公告立即砍倉。',
      evidence,
      limitation: 'Fed 政策是全球環境濾網，不直接取代個股財報、估值與防守條件。'
    });
    if (cut) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: `原文是降息${inflation ? '，但仍需留意通膨描述' : ''}；利率壓力可能減輕，仍不是台股全面買進訊號。`,
      direction: '對臺股：估值壓力可能減輕，但要等美元、殖利率與個股價格結構共同確認。',
      exposure: '優先核對成長股估值是否因利率下降獲得支撐，以及企業基本面是否真的改善。',
      action: '新資金只在個股通過門檻且位於承接區時分批；既有持股先維持，不因降息單一事件追買。',
      evidence,
      limitation: '降息的原因與前瞻指引比標題本身更重要。'
    });
    return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文是 Fed 政策聲明；先看政策利率、通膨與經濟展望的具體措辭，再判斷利率敏感持股。',
      direction: '對臺股：目前只作利率與估值風險檢查，不把公告直接翻成全面買進或賣出。',
      exposure: '核對高本益比、高負債與美元／美債殖利率敏感的持股。',
      action: '新資金依個股承接區執行；既有持股依價格結構與基本面條件，不用標題單獨改變動作。',
      evidence,
      limitation: '政策聲明的前瞻指引可能比當次利率動作更影響市場。'
    });
  }
  if (id === 'energy') {
    const tightSupply = hasContent(content, [/tight global supplies of distillate/i, /reduced global refining activity/i, /inventories[^.]{0,100}below the five-year/i, /prices remaining elevated/i, /high crack spread/i]);
    const relief = hasContent(content, [/supplies have increased/i, /inventories[^.]{0,100}(?:rose|increased|above)/i, /prices have declined/i]);
    const evidence = contentEvidence(content, [/tight global supplies/i, /elevated crude oil prices/i, /high crack spread/i, /inventories[^.]{0,100}below the five-year/i, /prices remaining elevated/i]);
    if (tightSupply) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文指出柴油不是單看原油：全球餾分油供應偏緊、原油價格與煉油裂解價差偏高，推升柴油價格。',
      direction: '對臺股：先視為運輸、物流與製造成本壓力，不是所有能源股都自動利多。',
      exposure: '核對運輸、物流、航空、化工與製造持股的燃料成本、庫存與成本轉嫁能力；能源股則查公司是否真的受益。',
      action: '新資金先查毛利與報價轉嫁，不因能源標題追價；既有持股若成本尚未反映在毛利或價格結構，先觀察，不直接賣出。',
      evidence,
      limitation: '文章主要描述美國柴油與全球餾分油供應，不能直接當成臺灣公司獲利預測。'
    });
    if (relief) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文顯示供給或庫存壓力有緩解跡象；成本壓力可能減輕，但仍要看油價與公司實際成本。',
      direction: '對臺股：運輸與製造成本風險可能下降，能源受益方向仍需公司層證據。',
      exposure: '核對燃料成本占比高的持股，以及公司是否能把成本變化反映到報價與毛利。',
      action: '新資金只在個股條件通過且價格位於承接區時分批；既有持股不因單篇能源文章立即改變動作。',
      evidence,
      limitation: '文章的供需範圍與臺灣公司營運地區可能不同。'
    });
    return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文在解釋柴油價格構成，先看供給、庫存、原油與煉油利差，再判斷成本或受益方向。',
      direction: '對臺股：這是產業成本檢查，不是能源股或運輸股的直接買賣訊號。',
      exposure: '核對持股公司的燃料／運費成本與成本轉嫁能力。',
      action: '把原文重點放回個股毛利、營收與價格結構；未有公司層證據，不因標題新增部位。',
      evidence,
      limitation: '能源商品與個股獲利的傳導有時間差。'
    });
  }
  if (id === 'sanctions') {
    const removals = hasContent(content, [/emergency[^.]{0,100}expired/i, /removed from the list of specially designated/i, /designations removals/i, /deletions have been made/i]);
    const license = hasContent(content, [/general license/i, /authorizing certain transactions/i, /contingent contracts/i]);
    const newDesignations = hasContent(content, [/new designations/i, /designated pursuant/i, /blocked persons/i]) && !removals;
    const evidence = contentEvidence(content, [/emergency[^.]{0,100}expired/i, /removed from the list/i, /general license/i, /authorizing certain transactions/i, /SDN list/i]);
    if (removals && license) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文同時包含特定緊急狀態到期／名單移除，以及針對特定俄羅斯交易的許可；是局部規則調整，不是全面解除制裁。',
      direction: '對臺股：只有直接涉及相關國家、交易對手或制裁合規的公司才有直接影響，一般持股不是大盤利多。',
      exposure: '核對客戶、供應商、付款、出口地區與交易對手是否涉及俄羅斯／衣索比亞，以及是否落在許可範圍。',
      action: '有直接曝險先查合規與許可適用範圍；沒有直接曝險不因公告買賣，回到個股價格、基本面與法人條件。',
      evidence,
      limitation: '一般許可只涵蓋公告寫明的交易與條件，不能推廣成所有俄羅斯交易都可做。'
    });
    if (newDesignations) return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文包含新增或延伸制裁名單措施；影響集中在被列名者及其交易往來，不是整體市場訊號。',
      direction: '對臺股：直接曝險公司面臨合規、收款、供應鏈或出口限制檢查；無直接曝險者不先當成利空。',
      exposure: '核對被列名交易對手、地區營收、供應鏈、付款銀行與出口管制。',
      action: '有直接曝險先暫停新增曝險並查公司公告／合規說明；沒有直接曝險則維持個股原判斷。',
      evidence,
      limitation: '制裁適用範圍與法律身分需以 OFAC 原文及公司正式揭露為準。'
    });
    return eventAnalysis({
      status: 'fetched',
      simpleJudgment: '原文是特定制裁名單或交易規則更新；先確認適用對象與交易範圍，不把標題當成全面利多或利空。',
      direction: '對臺股：只有直接曝險公司需要調整風險檢查，一般持股維持原本個股判斷。',
      exposure: '核對公司地區營收、供應商、客戶、付款與制裁名單關係。',
      action: '直接曝險才延後或重新檢查；沒有直接曝險不因公告單獨買賣。',
      evidence,
      limitation: '公告的法律效果只適用於原文列出的對象與交易。'
    });
  }
  return unavailableEventAnalysis(id, '未支援的官方事件來源');
}
async function enrichOfficialEvents(id, events, fetchImpl, checkedAt) {
  if (!OFFICIAL_EVENT_IDS.has(id)) return events;
  return Promise.all(events.map(async event => {
    try {
      const body = await request(event.url, fetchImpl);
      const articleText = extractArticleText(body);
      if (articleText.length < 120) throw new Error('官方原文內容過短或未回傳可解析正文');
      return { ...event, contentStatus: 'fetched', contentFetchedAt: checkedAt, contentLength: articleText.length,
        contentAnalysis: interpretOfficialEvent(id, event, articleText) };
    } catch (error) {
      return { ...event, contentStatus: 'unavailable', contentFetchedAt: checkedAt, contentLength: 0,
        contentError: String(error?.message || error).slice(0, 180), contentAnalysis: unavailableEventAnalysis(id, error?.message || error) };
    }
  }));
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
  const s = normalizeSeries(rows, asOf), last = s.at(-1), prior = s.at(-2);
  if (!last) throw new Error('No valid dated observations');
  return { ...extra, date: last.date, value: last.value, comparisonDate: prior?.date || null,
    comparisonValue: prior?.value ?? null, changeFromPrevious: finite(prior?.value) ? last.value - prior.value : null,
    change5: pct(last.value, s.at(-6)?.value),
    change20: pct(last.value, s.at(-21)?.value), difference5: finite(s.at(-6)?.value) ? last.value - s.at(-6).value : null,
    sampleCount: s.length, series: s.slice(-65) };
}
function parseFx(rows, asOf) {
  if (!Array.isArray(rows)) throw new Error('FX schema changed');
  return Object.fromEntries([['usdTwd', 'USD/NTD'], ['usdJpy', 'USD/JPY'], ['usdCny', 'USD/RMB']]
    .map(([key, field]) => [key, seriesMetric(rows.map(r => ({ date: date(r.Date), value: num(r[field]) })), asOf, { unit: field, quoteKind: '期交所參考匯率' })]));
}
function buildTxMetric(observations, asOf, previous = []) {
  const validObservations = observations.filter(r => date(r.date) && r.date <= asOf && [r.long, r.short, r.net].every(finite)
    && r.long >= 0 && r.short >= 0 && r.long - r.short === r.net);
  if (validObservations.length !== observations.length) throw new Error('TAIFEX net position reconciliation failed');
  const observation = validObservations.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!observation) throw new Error('Missing TX foreign/institutional observation');
  const validPrevious = previous.filter(r => date(r.date) && r.date < observation.date && [r.long, r.short, r.net].every(finite) && r.long - r.short === r.net);
  const history = [...new Map([...validPrevious, ...validObservations].map(r => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-65);
  const prior = history.at(-2);
  return { ...observation, changeFromPrevious: prior ? observation.net - prior.net : null, comparisonDate: prior?.date || null, history,
    unit: '口', contract: '臺股期貨 TX；全到期月份合計', limitation: '僅 TX，未合併小台／微台；換月與避險均可能影響，淨空單不等於撤出台股。' };
}
function parseTx(rows, asOf, previous = []) {
  if (!Array.isArray(rows)) throw new Error('TAIFEX schema changed');
  const observations = rows.filter(r => r.ContractCode === '臺股期貨' && r.Item === '外資及陸資' && date(r.Date) && date(r.Date) <= asOf)
    .sort((a, b) => a.Date.localeCompare(b.Date)).map(row => {
      const long = num(row['OpenInterest(Long)']), short = num(row['OpenInterest(Short)']), net = num(row['OpenInterest(Net)']);
      return { date: date(row.Date), long, short, net, netValueThousands: num(row['ContractValueofOpenInterest(Net)(Thousands)']) };
    });
  return buildTxMetric(observations, asOf, previous);
}
function htmlCellText(s) {
  return text(s).replace(/\u00a0/g, ' ').trim();
}
function parseTxHtml(body, asOf, previous = []) {
  if (!/<form[^>]+id=["']uForm["']/i.test(body)) throw new Error('TAIFEX historical page schema changed');
  const pageDate = date(/(?:日期|queryDate)[^\d]*(\d{4}[\/-]\d{2}[\/-]\d{2})/i.exec(body)?.[1]?.replaceAll('/', '-'));
  if (!pageDate || pageDate > asOf) throw new Error('TAIFEX historical page has no valid observation date');
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1])
    .filter(row => /(?:>\s*外資\s*<|>\s*外資及陸資\s*<)/i.test(row));
  const row = rows[0];
  if (!row) throw new Error('TAIFEX historical page missing foreign row');
  const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => htmlCellText(m[1]));
  if (cells.length < 13) throw new Error('TAIFEX historical foreign row schema changed');
  const parsed = {
    Date: pageDate.replaceAll('-', ''), ContractCode: '臺股期貨', Item: '外資及陸資',
    'OpenInterest(Long)': cells[7], 'OpenInterest(Short)': cells[9], 'OpenInterest(Net)': cells[11],
    'ContractValueofOpenInterest(Net)(Thousands)': cells[12]
  };
  return parseTx([parsed], asOf, previous);
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
function dateBackfillCandidates(asOf, days = 10) {
  const start = new Date(`${asOf}T00:00:00Z`);
  return Array.from({ length: days + 1 }, (_, offset) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  });
}
function sourceObservedAt(id, item) {
  if (id === 'fx') return item?.usdTwd?.date || null;
  if (Array.isArray(item)) return item.map(x => x.date || x.publishedAt?.slice(0, 10)).filter(Boolean).sort().at(-1) || null;
  return item?.date || null;
}
function hasReusablePrevious(id, item) {
  if (!item) return false;
  if (id === 'fx') return date(item.usdTwd?.date) && finite(item.usdTwd?.value);
  if (Array.isArray(item)) return item.some(x => date(x.date || x.publishedAt?.slice(0, 10)));
  return date(item.date) && (finite(item.value) || finite(item.net));
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
    } catch (e) {
      last = e;
      if (e.retryable === false || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
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
  const regime = pressure >= 2 ? '風險升溫' : support >= 3 ? '環境較穩' : available < 4 ? '中性偏保守' : '訊號分歧';
  const action = pressure >= 2 ? '先檢查曝險，不因排名追價；持股依個股防守條件處理'
    : support >= 3 ? '留意已通過門檻且位於承接區的個股，採分批進場'
      : available < 4 ? '目前以可取得的國際指標與個股條件判讀；新部位只在承接區分批，持股依防守條件處理'
        : '環境訊號分歧，持股先維持；新部位只採個股條件與承接區確認';
  return { regime, available, total: 4, signals, action, fallbackUsed: sources.filter(x => x.status !== 'current').map(x => x.id),
    method: '觀察規則：S&P 500 20筆變動；美元／臺幣5筆±0.5%；10年殖利率5筆±20基點；VIX低於20／高於25。可用指標採最佳可得值判讀，匯率、美元與期貨不重複加權。',
    affectsStockActions: false };
}
async function fetchInternationalContext({ asOf, previous, fetchImpl = fetch, now = new Date() } = {}) {
  asOf ||= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
  if (!date(asOf)) throw new Error('Invalid context asOf date');
  const checkedAt = now.toISOString(), year = Number(asOf.slice(0, 4));
  const definitions = structuredClone(DEFINITIONS);
  definitions.treasury[1] = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const cotUrl = new URL('https://publicreporting.cftc.gov/resource/gpe5-46if.json');
  cotUrl.searchParams.set('$where', "contract_market_name in ('S&P 500 Consolidated','UST 10Y NOTE','EURO FX')");
  cotUrl.searchParams.set('$order', 'report_date_as_yyyy_mm_dd DESC'); cotUrl.searchParams.set('$limit', '12');
  definitions.cot[1] = cotUrl.href;
  const parsers = { fx: s => parseFx(JSON.parse(s), asOf), tx: s => parseTxHtml(s, asOf, previous?.data?.tx?.history || []),
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
        const candidates = ['fx', 'tx'].includes(id) ? dateBackfillCandidates(asOf) : [null];
        let lastError, parsedData, lastRequestedDate = null, txRows = [];
        for (const requestedDate of candidates) {
          try {
            const candidateUrl = new URL(url);
            if (requestedDate) {
              if (id === 'tx') {
                candidateUrl.searchParams.set('queryDate', requestedDate.replaceAll('-', '/'));
                candidateUrl.searchParams.set('commodityId', 'TXF');
                candidateUrl.searchParams.set('queryType', '');
                candidateUrl.searchParams.set('goDay', '');
                candidateUrl.searchParams.set('doQuery', '1');
              } else {
                candidateUrl.searchParams.set('date', requestedDate.replaceAll('-', ''));
              }
            }
            const body = await request(candidateUrl.href, fetchImpl);
            if (id === 'tx') {
              const parsed = parsers[id](body);
              txRows.push(parsed.history.at(-1));
              parsedData = buildTxMetric(txRows, asOf, previous?.data?.tx?.history || []);
              // TX returns one observation date per request. Keep walking back
              // until the latest observation has an actual prior business-day
              // comparison, even when the previous published snapshot is empty.
              if (!parsedData.comparisonDate) continue;
            } else {
              parsedData = parsers[id](body);
              if (OFFICIAL_EVENT_IDS.has(id)) {
                parsedData = await enrichOfficialEvents(id, parsedData, fetchImpl, checkedAt);
                source.contentFetchedCount = parsedData.filter(event => event.contentStatus === 'fetched').length;
                source.contentUnavailableCount = parsedData.filter(event => event.contentStatus !== 'fetched').length;
              }
            }
            lastRequestedDate = requestedDate || asOf;
            source.url = candidateUrl.href;
            break;
          } catch (e) {
            lastError = e;
          }
        }
        if (!parsedData) throw lastError || new Error('No valid observation after date backfill');
        data[id] = parsedData;
        // At the beginning of a year, Treasury's current-year observations alone cannot support 5-day changes.
        if (id === 'treasury' && data[id].sampleCount < 6) {
          const priorUrl = url.replace(`=${year}`, `=${year - 1}`);
          const priorBody = await request(priorUrl, fetchImpl);
          data[id] = parseTreasury(priorBody + body, asOf); source.additionalUrls = [priorUrl];
        }
        const item = data[id];
        source.observedAt = sourceObservedAt(id, item);
        source.status = freshness(source.observedAt, asOf, maxAgeDays);
        source.requestedDate = asOf;
        source.historyRequestedThrough = lastRequestedDate || asOf;
        source.dateBackfillDays = source.observedAt ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(source.observedAt)) / 86400000)) : 0;
        if (id === 'tx') source.comparisonDate = item.comparisonDate || null;
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
            const prior = previous?.data?.[id];
            if (hasReusablePrevious(id, prior)) {
              data[id] = structuredClone(prior);
              source.observedAt = sourceObservedAt(id, data[id]);
              source.status = 'stale';
              source.fallbackUsed = true;
              source.fallbackType = 'previous_verified_snapshot';
              source.error = '官方與替代端點暫時未回傳，已沿用前次已驗證快照並標示日期。';
            } else {
              delete data[id]; source.status = 'unavailable'; source.error = String(fallbackError.message).slice(0, 180);
            }
          }
        } else {
          const prior = previous?.data?.[id];
          if (hasReusablePrevious(id, prior)) {
            data[id] = structuredClone(prior);
            source.observedAt = sourceObservedAt(id, data[id]);
            source.status = 'stale';
            source.fallbackUsed = true;
            source.fallbackType = 'previous_verified_snapshot';
            source.error = '本次端點暫時未回傳，已沿用前次已驗證快照並標示日期。';
          } else {
            delete data[id]; source.status = 'unavailable'; source.error = String(e.message).slice(0, 180);
          }
        }
      }
      sources.push(source);
    }
  }));
  sources.sort((a, b) => Object.keys(definitions).indexOf(a.id) - Object.keys(definitions).indexOf(b.id));
  const result = { version: VERSION, checkedAt, asOf, sources, data, summary: summarize(data, sources),
    limitations: ['公開彙總部位無法辨識單一外資真正策略；空單可能為避險或套利。', '場外外匯部位、完整跨境資金流與信用利差尚未接入；不可宣稱已完整掌握全球資金。', '政策與制裁公告為原文證據，不自動推定個股利多或利空。', '國際市場與臺股交易時區不同；日資料／週資料不可當成逐筆即時行情。'],
    validation: { strategy: '未完成樣本外驗證', stockModelChanged: false } };
  validateContext(result, { requireEventGuidance: true });
  return result;
}
function validateEventGuidance(c, required = false) {
  for (const id of OFFICIAL_EVENT_IDS) {
    const events = c?.data?.[id];
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const analysis = event?.contentAnalysis;
      if (!analysis) {
        if (required) throw new Error(`Official event content analysis missing: ${id}`);
        continue;
      }
      if (analysis.version !== EVENT_GUIDANCE_VERSION || !['fetched', 'unavailable'].includes(event.contentStatus)) {
        throw new Error(`Invalid official event content analysis: ${id}`);
      }
      for (const field of ['simpleJudgment', 'direction', 'exposure', 'action', 'evidence', 'limitation']) {
        if (!String(analysis[field] || '').trim()) throw new Error(`Official event guidance missing ${id}.${field}`);
      }
    }
  }
  return true;
}
function validateContext(c, options = {}) {
  if (c?.version !== VERSION || !date(c.asOf) || !c.checkedAt || !Array.isArray(c.sources) || c.sources.length !== Object.keys(DEFINITIONS).length) throw new Error('International context contract missing');
  for (const s of c.sources) {
    if (!['current', 'stale', 'unavailable'].includes(s.status) || !['A', 'B'].includes(s.evidence) || !s.checkedAt || !s.url.startsWith('https://')) throw new Error('Invalid source status');
    if (s.status === 'current' && freshness(s.observedAt, c.asOf, s.maxAgeDays) !== 'current') throw new Error('Stale source marked current');
  }
  if (c.summary.affectsStockActions !== false || c.validation.stockModelChanged !== false) throw new Error('Unvalidated context cannot change stock actions');
  // Summary wording is a display contract and may evolve between published
  // reports. Freshly fetched contexts are reconciled before writing; older
  // reports still need source/schema validation during preflight.
  if (!c.summary || !Array.isArray(c.summary.signals) || c.summary.affectsStockActions !== false) throw new Error('Context summary contract missing');
  if (options.requireEventGuidance) validateEventGuidance(c, true);
  return true;
}
module.exports = { VERSION, DEFINITIONS, EVENT_GUIDANCE_VERSION, num, date, pct, freshness, seriesMetric, parseFx, parseTx, parseTxHtml, parseTreasury, parseVix, parseDollar, parseYahoo, parseCot, parseRss, parseSanctions, extractArticleText, interpretOfficialEvent, enrichOfficialEvents, validateEventGuidance, summarize, request, fetchInternationalContext, validateContext };
