# 持股決策總覽 Design QA

## Visual truth and evidence

- Source visual truth: `professional-screen-report/qa/source-holding-decision-wireframe.png`
- Source size: 1440 x 1600 px
- Normalized source crop: `professional-screen-report/qa/source-holding-decision-wireframe-top.png` (1440 x 877 px)
- Desktop implementation: `professional-screen-report/qa/decision-board-desktop.png` (1425 x 868 px)
- Mobile implementation: `professional-screen-report/qa/decision-board-mobile.png` (375 x 812 px)
- Full comparison: `professional-screen-report/qa/decision-board-comparison.png` (1425 x 868 px)
- Comparison method: source and implementation are top-aligned and fitted to equal-width columns in one browser-rendered comparison surface.

## Tested state

- Local authenticated session
- Five tracked holdings: 2330, 2382, 2395, 2454, and 3702
- Cost fields stored in browser local storage
- Decision details collapsed for the comparison capture
- Desktop browser viewport request: 1440 x 900 CSS px; captured content: 1425 x 868 px
- Mobile browser viewport request: 390 x 844 CSS px; captured content: 375 x 812 px

## Visual findings

| Severity | Finding | Resolution |
|---|---|---|
| P2 | First iteration used `次日確認` as the visible action badge, which mixed action and timing. | Changed the badge to `持有不動`; retained `下個交易日確認` as timing and `今日 0% → 觸發後 -1/3` as the conditional position change. |
| P3 | The production site uses its existing 1240 px content container, so the decision board is slightly denser than the standalone visual target. | Accepted to preserve the existing site layout and responsive behavior; hierarchy, spacing, colors, and card structure remain aligned. |

No remaining P0, P1, or P2 visual differences were found in the final comparison.

## Interaction and responsive verification

- Login gate completed successfully.
- Tracking checkboxes produced five position cards.
- Summary counts matched the card groups: 2 reduce/exit, 2 next-day confirmation, 1 hold, and 0 add.
- Editable cost persisted after reload.
- `查看完整依據` expanded the full rationale.
- `我尚未持有` navigated to `#fullRankingSection`.
- Mobile layout rendered as one column with no horizontal overflow.
- Desktop and mobile console errors: 0.

## Comparison history

1. Iteration 1: identified the P2 badge-copy mismatch.
2. Iteration 2: corrected the action/timing separation, re-rendered, and re-captured the full comparison.

## Final result

passed
