'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const m = require('../international-context');
const { renderInternationalContext } = require('../international-ui');

async function main() {
  for (const x of [null, undefined, '', ' ', 'ND', '-', '.', 'N/A']) assert.equal(m.num(x), null);
  assert.equal(m.num('0'), 0); assert.equal(m.num('1,234'), 1234);
  assert.equal(m.date('20260230'), null); assert.equal(m.date('20260918'), '2026-09-18');
  assert.equal(m.freshness('2026-09-18', '2026-09-19', 4), 'current');
  assert.equal(m.freshness('2026-08-31', '2026-09-19', 4), 'stale');
  assert.equal(m.freshness('2026-09-20', '2026-09-19', 4), 'unavailable');
  assert.equal(m.freshness('2026-09-08', '2026-09-19', 11), 'current');
  const series = Array.from({ length: 6 }, (_, i) => ({ date: `2026-09-${String(i + 10).padStart(2, '0')}`, value: 100 + i * 2 }));
  const r = m.seriesMetric([...series].reverse(), '2026-09-19');
  assert.ok(Math.abs(r.change5 - 10) < 1e-9); assert.equal(r.change20, null);
  assert.equal(r.comparisonDate, '2026-09-14'); assert.equal(r.comparisonValue, 108); assert.equal(r.changeFromPrevious, 2);
  assert.throws(() => m.seriesMetric([...series, { date: series[0].date, value: 0 }], '2026-09-19'), /Conflicting/);
  assert.throws(() => m.seriesMetric([{ date: '2026-09-18', value: null }], '2026-09-19'), /No valid/);
  const tx = [{ Date: '20260918', ContractCode: '臺股期貨', Item: '外資及陸資', 'OpenInterest(Long)': '100', 'OpenInterest(Short)': '180', 'OpenInterest(Net)': '-80' }];
  const x = m.parseTx(tx, '2026-09-19', [{ date: '2026-09-17', long: 90, short: 190, net: -100 }, { date: '2026-09-18', long: 5, short: 10, net: -5 }]);
  assert.equal(x.net, -80); assert.equal(x.changeFromPrevious, 20); assert.equal(x.comparisonDate, '2026-09-17'); assert.equal(x.history.length, 2);
  const txHistory = m.parseTx([
    { ...tx[0], Date: '20260917', 'OpenInterest(Long)': '90', 'OpenInterest(Short)': '190', 'OpenInterest(Net)': '-100' },
    tx[0]
  ], '2026-09-19');
  assert.equal(txHistory.comparisonDate, '2026-09-17'); assert.equal(txHistory.changeFromPrevious, 20); assert.equal(txHistory.history.length, 2);
  const txHtml = '<form id="uForm"></form><span>日期2026/09/18</span><table><tr><td>外資</td>'
    + ['100', '1', '180', '2', '-80', '-3', '100', '4', '180', '5', '-80', '-6'].map(v => `<td>${v}</td>`).join('')
    + '</tr></table>';
  const txFromHtml = m.parseTxHtml(txHtml, '2026-09-19', [{ date: '2026-09-17', long: 90, short: 190, net: -100 }]);
  assert.equal(txFromHtml.date, '2026-09-18'); assert.equal(txFromHtml.comparisonDate, '2026-09-17'); assert.equal(txFromHtml.netValueThousands, -6);
  assert.throws(() => m.parseTx([{ ...tx[0], 'OpenInterest(Net)': '-79' }], '2026-09-19'), /reconciliation/);
  const c = m.summarize({ sp500: { change20: 1 }, fx: { usdTwd: { change5: null } }, treasury: { difference5: 0 }, vix: { value: 15 } }, ['sp500', 'fx', 'treasury', 'vix'].map(id => ({ id, status: 'current' })));
  assert.equal(c.regime, '中性偏保守'); assert.equal(c.signals[1].state, 'unknown'); assert.equal(c.affectsStockActions, false);
  const stale = m.summarize({ sp500: { change20: 30 } }, [{ id: 'sp500', status: 'stale' }]);
  assert.equal(stale.signals[0].state, 'support');
  const fed = '<div>Release Date: January 5, 2026</div>' + [3, 4, 5, 6, 7].map((i, j) => `<th id="a${i}">${['Dec. 29', 'Dec. 30', 'Dec. 31', 'Jan. 1', 'Jan. 2'][j]}</th>`).join('') + '<tr><th>1) BROAD</th>' + [100, 101, 102, 'ND', 103].map((v, j) => `<td headers="a${j + 3} a1 r1">${v}</td>`).join('') + '</tr>';
  const dollar = m.parseDollar(fed, '2026-01-06');
  assert.equal(dollar.publishedAt, '2026-01-05'); assert.equal(dollar.periodStart, '2025-12-29'); assert.equal(dollar.date, '2026-01-02');
  const xml = '<m:properties><d:NEW_DATE>2026-09-18T00:00:00</d:NEW_DATE><d:BC_2YEAR>4.1</d:BC_2YEAR><d:BC_10YEAR>4.5</d:BC_10YEAR></m:properties>';
  assert.ok(Math.abs(m.parseTreasury(xml, '2026-09-19').spread10y2y - 0.4) < 1e-9);
  const vix = m.parseVix('DATE,OPEN,HIGH,LOW,CLOSE\n09/18/2026,14,16,13,15\n09/19/2026,15,16,14,ND', '2026-09-19');
  assert.equal(vix.date, '2026-09-18'); assert.equal(vix.value, 15);
  assert.throws(() => m.parseVix('<html>outage</html>', '2026-09-19'), /header/);
  const fedBody = '<nav>Federal Reserve navigation</nav><main><p>The Committee decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent.</p><p>Inflation remains elevated. Uncertainty remains elevated owing to geopolitical developments.</p></main>';
  const fedEvent = { title: 'Federal Reserve issues FOMC statement', url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm', publishedAt: '2026-09-16T18:00:00.000Z' };
  const fedGuide = m.interpretOfficialEvent('fed', fedEvent, fedBody);
  assert.equal(fedGuide.status, 'fetched'); assert.match(fedGuide.simpleJudgment, /升息/); assert.match(fedGuide.direction, /高估值/); assert.match(fedGuide.evidence, /raise the target range/i);
  const energyEvent = { title: 'What goes into diesel prices?', url: 'https://www.eia.gov/todayinenergy/detail.php?id=68164', publishedAt: '2026-09-18T14:00:00.000Z' };
  const energyBody = '<main><p>Tight global supplies of distillate fuel and elevated crude oil prices have driven prices higher.</p><p>Inventories were 13% below the five-year seasonal average.</p></main>';
  const enrichedEnergy = await m.enrichOfficialEvents('energy', [energyEvent], async () => ({ ok: true, text: async () => energyBody }), '2026-09-21T00:00:00.000Z');
  assert.equal(enrichedEnergy[0].contentStatus, 'fetched'); assert.match(enrichedEnergy[0].contentAnalysis.simpleJudgment, /供應偏緊/); assert.match(enrichedEnergy[0].contentAnalysis.exposure, /運輸/);
  const unavailableEvent = await m.enrichOfficialEvents('sanctions', [energyEvent], async () => ({ ok: false, status: 503 }), '2026-09-21T00:00:00.000Z');
  assert.equal(unavailableEvent[0].contentStatus, 'unavailable'); assert.match(unavailableEvent[0].contentAnalysis.action, /直接曝險/);
  let attempts = 0;
  await assert.rejects(m.request('https://example.test', async () => { attempts++; return { ok: false, status: 404 }; }), /404/);
  assert.equal(attempts, 1);
  attempts = 0;
  const recovered = await m.request('https://example.test', async () => (++attempts === 1 ? { ok: false, status: 503 } : { ok: true, text: async () => 'ok' }));
  assert.equal(recovered, 'ok'); assert.equal(attempts, 2);
  const failed = await m.fetchInternationalContext({ asOf: '2026-09-19', now: new Date('2026-09-19T01:00:00Z'), fetchImpl: async () => ({ ok: true, text: async () => '<html>not data</html>' }) });
  assert.equal(failed.sources.length, 12); assert.ok(failed.sources.every(s => s.status === 'unavailable')); assert.equal(failed.summary.regime, '中性偏保守');
  const bad = structuredClone(failed); bad.summary.affectsStockActions = true; assert.throws(() => m.validateContext(bad));
  const attack = structuredClone(failed); attack.sources[0].error = '<script>alert(1)</script>';
  assert.ok(!renderInternationalContext(attack).includes('<script>alert(1)</script>'));
  const eventContext = structuredClone(failed);
  eventContext.sources.find(source => source.id === 'fed').status = 'current';
  eventContext.data.fed = [{ ...fedEvent, contentStatus: 'fetched', contentAnalysis: fedGuide }];
  const eventHtml = renderInternationalContext(eventContext);
  assert.match(eventHtml, /升息/); assert.match(eventHtml, /高估值/); assert.ok(!eventHtml.includes('先不要因標題買進或賣出'));
  const index = process.argv.indexOf('--report');
  if (index >= 0) {
    const report = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
    const context = report.internationalContext || report;
    m.validateContext(context);
    for (const [key, value] of Object.entries(context.data)) {
      const metrics = key === 'fx' ? Object.values(value) : value?.series ? [value] : [];
      for (const metric of metrics) {
        const last = metric.series.at(-1); assert.equal(last.value, metric.value); assert.equal(last.date, metric.date);
        if (metric.series.length >= 6) assert.ok(Math.abs(metric.change5 - (last.value / metric.series.at(-6).value - 1) * 100) < 1e-8);
      }
    }
    if (context.data.tx) assert.equal(context.data.tx.long - context.data.tx.short, context.data.tx.net);
    for (const row of context.data.cot || []) assert.equal(row.long - row.short, row.net);
    console.log('INTERNATIONAL_LIVE_RECONCILIATION=PASS');
  }
  console.log('INTERNATIONAL_CONTEXT_TESTS=PASS');
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
