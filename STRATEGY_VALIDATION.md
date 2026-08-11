# Strategy Validation

## Purpose

`scripts/Backtest-HorizonStrategy.js` is an offline research diagnostic for the stock-screening system. It does not change `HORIZON_SCORE_V2`, generated reports, ranking order, or public-page actions.

The controlled publish flow calls `scripts/Capture-HorizonBacktestSnapshot.js` after the report passes validation. It stores a compact snapshot only when `quotePhase=close` and `liveDate=priceDate`. Intraday reports are skipped so a next-day quote cannot leak into an earlier `asOf` signal.

The tool currently compares:

- `v2-a`: the production A-bucket candidates, sorted by the existing medium score.
- `v2-medium`: the highest eligible medium-score candidates without requiring the A bucket.
- `shadow-qvm`: a non-production quality/value/momentum experiment using only fields already present in historical report JSON.

`shadow-qvm` is intentionally incomplete. It does not claim to implement ROIC, free cash flow, or a 12-month momentum factor.

## Commands

Run the default portfolio diagnostic:

```powershell
node .\scripts\Backtest-HorizonStrategy.js
```

Run an exploratory result with a smaller local sample threshold:

```powershell
node .\scripts\Backtest-HorizonStrategy.js --min-periods 5 --min-snapshots 5
```

Run event-study and portfolio diagnostics together:

```powershell
node .\scripts\Backtest-HorizonStrategy.js --mode both --strategy all
```

Require a sufficiently long sample in automation:

```powershell
node .\scripts\Backtest-HorizonStrategy.js --require-sufficient --json
```

An optional benchmark CSV must contain `date,close` columns. The benchmark is not bundled into the report because a benchmark price series must be collected with its own as-of-date and adjustment contract.

## Guardrails

- Only close-only snapshots under `professional-screen-report/backtest-snapshots/` are loaded by default.
- Each snapshot must declare `HORIZON_BACKTEST_SNAPSHOT_V1`, `HORIZON_SCORE_V2`, `quotePhase=close`, and `liveDate=priceDate`.
- Every input report must declare `HORIZON_SCORE_V2`.
- A signal uses only the report available on its `asOf` date.
- Future prices are read only from later report snapshots.
- Portfolio simulation uses the next available snapshot and skips gaps larger than the configured maximum.
- The default round-trip cost is 58.5 basis points and can be overridden.
- Missing values do not receive a neutral factor score.
- Short samples return `insufficient_data`; they are not promoted to performance evidence.
- The production model is never rewritten by this tool.

## Interpretation

The repository is collecting the safe archive from successful close-phase publishes. Existing intraday or next-day-rendered reports are not retroactively converted into point-in-time evidence. The default history is not yet long enough to establish a reliable out-of-sample result. A result marked `sufficient` only means that the configured minimum number of snapshots or periods exists; it does not prove that a strategy will outperform.

Before introducing `HORIZON_SCORE_V3`, collect a point-in-time archive that includes at least one full market cycle, financial publication dates, a survivorship-aware universe, benchmark prices, transaction costs, and next-period returns. Compare the candidate model with broad-market ETF benchmarks and the existing `HORIZON_SCORE_V2` model after costs.
