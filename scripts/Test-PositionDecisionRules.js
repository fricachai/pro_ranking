const assert = require('node:assert/strict');
const { positionDecision } = require('../full-professional-stock-screen');

function fixture(overrides = {}) {
  const base = {
    metrics: {
      trust5: -5000,
      trust10: -7000,
      trustNegativeDays5: 5,
      trustValue5: -50_000_000,
      foreignNet5: 1000,
      ...overrides.metrics
    },
    technical: {
      close: 100,
      ema20: 95,
      ema60: 90,
      ma20Slope5: 1,
      return5: 2,
      ...overrides.technical
    },
    foreignHolding: {
      trendReliable: true,
      d5Lots: 100,
      d10Lots: 200,
      ...overrides.foreignHolding
    },
    etf: {
      flowPct: { 5: -1, 10: -1 },
      ...overrides.etf
    },
    events: { disposal: false },
    officialMaterialRisk: false,
    bucket: 'C',
    live: {
      analysisPrice: 110,
      price: 110,
      time: '10:30:00',
      changePct: 1,
      isLimitUp: false,
      ...overrides.live
    }
  };
  return {
    ...base,
    ...overrides,
    metrics: { ...base.metrics, ...overrides.metrics },
    technical: { ...base.technical, ...overrides.technical },
    foreignHolding: { ...base.foreignHolding, ...overrides.foreignHolding },
    etf: { ...base.etf, ...overrides.etf },
    live: { ...base.live, ...overrides.live }
  };
}

const strong = positionDecision(fixture({
  technical: { ema20: 95, ema60: 90, ma20Slope5: 1, return5: 15 },
  live: { analysisPrice: 110, price: 110, changePct: 9.92, isLimitUp: true }
}));
assert.equal(strong.decisionMode, 'strong');
assert.equal(strong.holdingState, 'hold');
assert.equal(strong.holdingAction, '正常持有');
assert.equal(strong.todayAction, '漲停先續抱；不追價');
assert.equal(strong.positionReasons[0], '今日漲停／趨勢站穩');

const technicalBreak = positionDecision(fixture({
  technical: { close: 100, ema20: 110, ema60: 105, ma20Slope5: -1, return5: -5 },
  live: { analysisPrice: 100, price: 100, changePct: -2, isLimitUp: false }
}));
assert.equal(technicalBreak.decisionMode, 'trim');
assert.equal(technicalBreak.holdingState, 'trim');
assert.equal(technicalBreak.holdingAction, '降低部位');

const ownershipOnly = positionDecision(fixture({
  technical: { ema20: 95, ema60: 90, ma20Slope5: 1, return5: 2 },
  live: { analysisPrice: 101, price: 101, changePct: 1, isLimitUp: false }
}));
assert.equal(ownershipOnly.decisionMode, 'protect');
assert.equal(ownershipOnly.holdingState, 'protect');
assert.notEqual(ownershipOnly.holdingAction, '降低部位');

console.log('POSITION_DECISION_RULES_PASS');
