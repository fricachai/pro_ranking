# 持股決策總覽 Design QA

## 2026-09-21 Codex 閱讀導引與操作層級 QA

- Change: 在登入後主內容最上方新增四步「本頁閱讀導引」：先看市場環境、再看新部位、已有持股、資料狀態；每一格都連到對應區塊，直接顯示目前可執行結論，不要求使用者自行解讀分數。
- Change: 快速搜尋／篩選區改為視窗內固定閱讀位置，個股快速卡增加一致的陰影、懸浮與焦點狀態；未修改 `HORIZON_SCORE_V2`、排名、個股動作或任何硬性資料門檻。
- Current source boundary: 本次沿用 2026-09-21 受控報告，股票 578 檔、主動 ETF 19/22 檔已核對；`00991A`、`00993A`、`00984A` 的最新持股快照仍為 2026-09-18，畫面保留落後日期與完整性限制，不補造數值。
- Local browser smoke check: 登入 gate 成功；四步導引均可見；輸入 `6770` 後顯示 `1／1 檔`；展開「改變條件與完整依據」後可見承接區、取消下一批條件與下一次確認；窄版畫面無明顯水平溢出。
- Responsive contract: 本輪新增樣式以 `max-width:900px` 與 `max-width:560px` 明確切換兩欄／單欄；1050×900 與 390×844 的既有完整瀏覽器回歸紀錄仍保留，未改動原本的評分明細、公告導讀、拖曳排序與表格同步捲軸行為。
- Validation: `node --check`、`INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、`Test-OpenCodeHandoff.ps1 -SkipOpenCode -SkipLive -AllowDirty` 均通過；生成 HTML 僅由 `--render-existing` 重產，沒有直接手改。
- Privacy boundary: 未把登入資訊、瀏覽器 localStorage、持股成本或私人排序狀態寫入程式、報告或提交。
- Publication: commit `e6f4836` 已推送；Pages workflow `35602337919` 成功；正式網址 HTTP 200，線上首頁與本機 `index.html` SHA-256 完全一致，四步導引、`0 檔可開始承接`、`19/22` 與 `quick-controls` 標記均已確認。

Final result: passed with existing exact-viewport regression coverage; current narrow-browser smoke check passed.

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

## 2026-08-06 live horizon-score and filing-transition QA

- Live report commit: `a12fa3308c2902da5d3733c452a3bd6a9b841b82`.
- Desktop viewport: 1440 x 1000 CSS px; `scrollWidth = clientWidth = 1440`.
- Mobile viewport: 390 x 844 CSS px; `scrollWidth = clientWidth = 390`.
- Live header showed report generation `2026/08/06 14:58:48`, event check `2026/08/06 14:58:28`, closing quote freeze `2026-08-06 13:33:00`, and complete Yahoo news coverage.
- Filing-transition banner matched the report contract: 81 current-quarter records, 374 verified prior snapshots, 10 unavailable records, total 465.
- The 2376 score dialog showed short/medium/long scores 82/78/54, data health `91% 可用`, financial period `2026Q1`, verified-snapshot provenance, a 10-point freshness penalty, and 100% stock-level long-screen data coverage.
- The same dialog exposed today action, next check, six medium-term component scores, actual evidence values, and source links without horizontal clipping.
- Tracking 2376 created exactly one `符合加碼條件` position card. The card showed the current state, today action, next close check, 334.5-338.5 pullback zone, and the condition that cancels adding.
- Desktop and mobile console errors and warnings: 0.

| Severity | Finding | Resolution |
|---|---|---|
| P1 | During quarterly filing transition, the current official endpoint contained only companies that had already filed Q2, so non-filers lost previously verified Q1 financial evidence. | Added a maximum-one-quarter verified official snapshot fallback with explicit period, source mode, source file, missing/stale disclosure, and validation counts. |
| P2 | A verified prior-quarter snapshot could still display 100% data health even though its status was `可用`. | Added an independent freshness penalty: 5 points for a same-quarter snapshot and 10 points for a prior-quarter snapshot; investment scores are unchanged. |

## Final result

passed

## 2026-08-06 horizon score detail UI QA

- Source and implementation: existing production report generated by `full-professional-stock-screen.js`; no generated HTML was edited directly.
- Desktop viewport: 1440 x 1000 CSS px; mobile viewport: 390 x 844 CSS px.
- Three score tabs were tested from the top-three card, top-30 table, full ranking table, and tracking score strip. Each entry opened the matching tab and keyboard focus exposed the selected tab with `aria-selected`.
- The medium tab opened by default and remained the only ranking explanation. Short and long tabs showed their existing five-component breakdowns, long-term method coverage 85%, data coverage, and capital allocation "not scored / 15".
- Cross-horizon reading was visible as research interpretation only. Today action, new-position action, holding action, scores, ranking, and hard gates were unchanged.
- Dialog close button, backdrop close, reopen, mobile single-column layout, contained detail-table scrolling, and page horizontal overflow were checked.
- Login state, cost, tracking positions, and test credentials were not included in source, generated report, screenshots, or commit.
- Browser console errors and warnings: 0.

### Visible difference log

| Severity | Finding | Resolution |
|---|---|---|
| P2 | The previous dialog exposed only the medium-term breakdown. | Added one shared dialog with three keyboard-accessible tabs and matching entry links. |
| P2 | Long-term score could be mistaken for a complete value score. | Added explicit 85% method coverage and "not scored / 15" capital allocation disclosure. |

Final result: passed

## 2026-09-21 股票名稱 Yahoo 奇摩股市技術分析超連結 QA

- 問題：個股快速操作卡中的股票名稱（例如 `6770 力積電`）原本是純文字；同一使用者可見的股票名稱必須能直接開啟對應 Yahoo 奇摩股市技術分析頁。
- 修正範圍：`international-ui.js` 的快速操作卡、`full-professional-stock-screen.js` 的持股決策卡與評分視窗標題；完整排名表原有股票連結一併確認。
- URL 契約：上市股票使用 `https://tw.stock.yahoo.com/quote/{代號}.TW/technical-analysis`；上櫃股票使用 `{代號}.TWO`；連結文字包含代號與名稱，並有外部連結提示與鍵盤焦點樣式。
- 瀏覽器 smoke check：`6770 力積電` 在快速操作卡、完整排名表、持股決策卡與評分視窗標題均呈現為連結，目標均為 `https://tw.stock.yahoo.com/quote/6770.TW/technical-analysis`；`8299 群聯` 抽查為 `.TWO`。
- 互動邊界：持股卡仍保留拖曳排序；連結使用 `draggable="false"`，拖曳事件排除 `a`，點擊股票名稱不會誤觸拖曳。
- 驗證：`node --check full-professional-stock-screen.js`、`node --check international-ui.js`、`--render-existing` 與 `git diff --check` 通過；本機實際登入後以 Playwright snapshot 確認四個畫面位置與 URL。

Final result: passed

## 2026-09-21 全頁視覺狀態與互動回饋稽核 QA

- Evidence: 依使用者提供的國際方向／快速卡、三時間尺度評分視窗、資料完整性展開區與持股摘要畫面逐區對照；另在本機登入後預覽實際展開資料稽核、開啟評分視窗、切換評分頁籤並檢查持股摘要。
- Scope: 國際方向卡、快速操作卡、來源稽核警示、持股摘要、持股決策卡、三時間尺度評分視窗、評分頁籤、資料日期標籤、表格列與篩選控制項。
- Visual hierarchy: 來源稽核依資料邊界、收盤確認、外資歷史、主動 ETF、日期落後、季報過渡期與資料邊界分色；評分摘要改為四個具上色頂線的資訊卡；持股摘要保留四種動作色彩與最高優先提示；評分視窗的日期、健康度、今天動作與頁籤分層顯示。
- Hover and focus: 卡片、稽核警示、摘要數字、評分小卡、持股防守區、原因標籤與快速操作標籤加入輕量位移／陰影／邊框回饋；連結、按鈕、選單、輸入框、`summary`、評分頁籤與持股追蹤控制項加入一致的鍵盤焦點環。實際以鍵盤 Tab 在評分頁籤確認焦點可見，焦點能落在下一個頁籤且內容維持可讀。
- Interaction: 「臺股資料完整性與各項限制」可展開，七類資料限制各自保留；評分視窗可開啟、滾動、切換短期頁籤並返回主頁；持股摘要可由閱讀導引跳轉；既有搜尋、篩選、表格排序與持股追蹤控制仍保留。
- Accessibility boundary: 只有可操作元件使用焦點狀態；純文字說明卡不強行加入 tabindex。新增 `prefers-reduced-motion: reduce`，降低動態效果對使用者的干擾。
- Source and implementation: 只修改 `full-professional-stock-screen.js`、`international-ui.js`，再以 `node .\\full-professional-stock-screen.js --render-existing` 重產首頁與報告頁；沒有直接編輯生成 HTML，也沒有改動評分、排名、個股動作、硬性門檻或資料內容。
- Current data boundary: 本次仍沿用 2026-09-21 已確認資料；578 檔股票、主動 ETF 19／22、外資持股歷史 11 個有效交易日；沒有重新抓取資料，也沒有把使用者瀏覽器的私有持股成本寫入檔案。
- Validation: `node --check`（兩個來源檔）、`INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、`HANDOFF_READY=true`；`git diff --check` 無內容錯誤，僅保留 Windows 換行提示。正式網址發布前仍需執行 commit／Pages workflow／線上 byte match。

Final result: passed

- Publication: commit `585dcb7`、Pages workflow `35605422436` success；正式網址 HTTP 200；線上／本機 bytes 與 SHA-256 完全一致。

## 2026-09-21 官方公告內文導讀 QA

- Source and implementation: Fed FOMC, EIA diesel and OFAC official pages were fetched as the source evidence; `international-context.js` now extracts official article text and produces `EVENT_CONTENT_GUIDE_V1`; `international-ui.js` renders the evidence, Taiwan-stock transmission, exposure checks and current action. Generated through the controlled update, not by editing HTML directly.
- Visible result: the three announcement cards now show different content-derived guidance: Fed rate hike and elevated inflation, diesel supply/cost pressure, and limited sanctions-list / general-license changes. The former fixed headline disclaimer is absent from the generated page.
- Desktop: `1050x900`, implementation screenshot `output/event-guidance-1050x900.png`; announcement details expanded; page `scrollWidth=1035`, no horizontal overflow; console errors/warnings `0`.
- Mobile: `390x844`, implementation screenshot `output/event-guidance-390x844.png`; announcement details expanded; page `scrollWidth=375`, no horizontal overflow; console errors/warnings `0`.
- Online verification: Pages HTTP 200; live page contains `原文是升息`, `全球餾分油供應偏緊`, `特定緊急狀態到期`; live page does not contain the fixed `先不要因標題買進或賣出` sentence.
- Boundary: the guidance is an independent environment and exposure check. It does not change `HORIZON_SCORE_V2`, ranking, individual stock actions, or hard quality gates.

Final result: passed

## 2026-09-21 判讀具體化與介面設計升級 QA

- Source and implementation: `international-ui.js`（國際判讀與個股卡文字、設計樣式層）、`full-professional-stock-screen.js`（主題變數與 header 升級）；以 `node .\full-professional-stock-screen.js --render-existing` 沿用 2026-09-21 已驗證資料重產 `index.html`、`latest.html` 與日期版 HTML，不抓新資料、不改 `HORIZON_SCORE_V2`、排名、動作或門檻。
- Text changes (specific conclusions instead of vague instructions): 能源判讀改為「WTI 93.09 美元、近5日 -8.2%，成本壓力明顯減輕；但 EIA 原文指出柴油供應仍緊，運輸／航空／物流維持、不加碼」；期貨改為「賣壓確認＝收盤跌破 20 日 EMA 且 ETF／外資持股同步轉弱，兩項同時成立才減碼」；美元改為「Fed 廣義美元 118.21（09-11 週資料、本期 +0.25%），週頻率不等待它，以每日美元／臺幣與個股卡為準」；殖利率具體到「高本益比（PE 高於同業）的成長股先不追買」；VIX 具體到數值與動作；亞洲匯率具體到日圓／人民幣 5 日變化與競價意涵；「圖怎麼看」改為「數字已在卡片上，圖只確認方向，買賣只看個股卡」；三步地圖改為帶實際數值與結論；個股卡（以 4967 十銓為例）改為「現在不買：價格 276.50 高於承接區 272.00–275.00（高 1.50）；ETF 近5日持平（尚未轉增）；主動ETF當日持股未完整（19/22）」，展開依據列出具體「開始分批的條件」。
- Design upgrade: header 改為深綠漸層＋金線＋狀態徽章；卡片（前三名、國際卡、個股卡、決策卡）統一柔和陰影、hover 上浮、圓角與左色條；表格表頭深綠、斑馬紋、hover 高亮；區塊標題加裝飾線；按鈕 hover／focus 統一。
- Desktop: `1050x900`，截圖 `output/ui-v2-1050x900.png`；4967 卡展開「改變條件與完整依據」；`scrollWidth=1035`，無水平溢出；console errors/warnings `0`；無 pageerror。
- Mobile: `390x844`，截圖 `output/ui-v2-390x844.png`；4967 卡展開；`scrollWidth=375`，無水平溢出；console errors/warnings `0`；無 pageerror。
- Regression: 登入 gate 保留、`bootstrap` 登入流程正常、個股搜尋 4967 正常、國際公告導讀保留、表格/決策卡既有功能未動。
- Boundary: 本項是純 UI 與說明文字修改，未重新抓取市場資料；歷史日期版 HTML（如 20260918）保留舊版內嵌文字作為歷史稽核，不視為缺失。

Final result: passed

## 2026-09-20 國際資料最近營業日回溯 QA

- 問題：週末報告中的美元／臺幣與外資臺指期卡片錯誤顯示沒有前期比較，且資料日期可能空白。
- 修正：匯率使用官方歷史序列的最近可用營業日；外資臺指期改以期交所官方依日期查詢頁逐日回補，確保最新觀測與前一營業日形成比較。
- 實際結果：匯率資料日 `2026-09-18`；外資臺指期資料日 `2026-09-18`、比較日 `2026-09-17`、變化 `+2,564口`。
- 首頁與 `professional-screen-report/latest.html` 文字契約掃描：`尚無前期比較=0`、`日期未知=0`、`資料不足=0`、`無法判定=0`；兩個產出均包含 `31.808` 與 `2026-09-17 +2,564口`。
- 回歸：`INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、`FETCH_RESILIENCE_TEST=pass`、`POWERSHELL_BOUNDARY_TEST=pass`。
- 範圍：本次只更新國際資料快照、資料契約與介面；不改 `HORIZON_SCORE_V2`、排名、個股動作、11 日外資持股門檻或其他硬性資料規則。

Final result: passed

## 2026-09-20 OpenCode 自主修正與判讀文字契約 QA

- Change: OpenCode 全域與本專案 Build 改為可規劃、編輯、執行、測試、診斷、修正、提交、發布與線上驗證；`/update-report` 遇到失敗改進入根因修正閉環。敏感資料與破壞性操作安全邊界保留。
- Decision contract: 國際單一來源未回傳時，不再阻斷整體判讀；改用其餘可驗證訊號、日期回補／替代資料／前次已驗證快照與個股條件，輸出中性偏保守及明確的新資金／持有做法。
- Generated output: 以既有 `HORIZON_SCORE_V2` 報告重產首頁與日期版 HTML，沒有重新抓取資料，沒有改排名、分數、11 個有效交易日門檻或個股硬性規則。
- Automated UI text scan: `資料不足=0`、`資料待更新=0`、`無法判定=0`、`暫不提供=0`；首頁與 `latest.html` 均通過。
- Contract tests: `INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、`FETCH_RESILIENCE_TEST=pass`、`POWERSHELL_BOUNDARY_TEST=pass`、`HANDOFF_READY=true`。
- Pages workflow `35496218879` succeeded; `PAGES_CONTENT_BYTE_MATCH=True`、線上掃描四項模糊字眼均為 0。版面未新增結構，既有 1050×900／390×844 responsive contract 保留；本次文字契約與發布驗證完成。

Final result: passed

## 2026-09-19 國際區塊新手快速判讀與三組摘要 QA

- Change: `international-ui.js` 新增一個「給不熟投資的人」方向框，分別說明尚未持有與已經持有時的下一步；另新增「市場氣氛／半導體與能源／外資與利率」三組快速摘要卡，以及折線圖的讀法與限制。
- Readability: 現在頁面先給「先觀望／可找個股／先保守／資料不足」等短句，再顯示數值、資料日期與限制；不把外資期貨淨空單當成現貨賣股，也明確揭露目前沒有同口徑全球能源法人持倉資料。
- Source and implementation: 只沿用現有 `HORIZON_SCORE_V2` 報告與 `node .\full-professional-stock-screen.js --render-existing` 重產介面；沒有重新抓資料，也沒有改變評分、排名、個股動作或硬性門檻。
- Desktop viewport: 1050 x 900 CSS px；快速摘要三欄排列，`scrollWidth = clientWidth = 1050`。
- Mobile viewport: 390 x 844 CSS px；快速摘要收為單欄、方向框兩個動作區收為單欄，`scrollWidth = clientWidth = 390`。
- Interaction and errors: 三個國際資料折疊區可正常展開，來源表格共 12 筆；瀏覽器 console errors/warnings：0。
- Boundary: 國際資料仍只是環境濾網；缺少同口徑全球能源法人持倉、場外外匯完整部位與即時逐筆資料，不能由單一圖表直接決定買賣。

Final result: passed

## 2026-09-19 國際簡易判讀句型 QA

- Refinement: the visible judgment key explains the four outcomes, and every primary/expanded card uses the consistent `目前建議：...` sentence form.
- USD/TWD neutral state now explicitly says: `目前建議：先不因匯率買進或賣出，回看外資與個股價格`.
- Expanded SOX, oil, and Asia FX cards were also normalized to the same plain-language sentence form.
- No score, rank, stock action, or hard gate was changed.

Final result: passed

## 2026-09-19 國際指標一般使用者簡易判讀 QA

- Change: every international indicator card now shows a visible `簡單判讀` statement before the technical rationale. The statements use four plain-language outcomes: find qualifying stocks, wait/no new position, raise caution, or do not trade from this indicator alone.
- Example checked: USD/TWD explicitly distinguishes a stronger depreciation pressure from a neutral reading and says existing holdings are not sold from this indicator alone.
- Event guidance: Fed, energy, and sanctions entries now state not to buy or sell from the headline alone; read the source and check exposure first.
- Desktop viewport: 1050 x 900 CSS px; `scrollWidth = clientWidth = 1050`.
- Mobile viewport: 390 x 844 CSS px; `scrollWidth = clientWidth = 390`; decision map remained one column and judgment blocks stayed within card width.
- Browser console errors and warnings: 0 at both tested viewports.
- Boundary: these are environment-level suggestions only; no score, rank, entry action, holding action, today action, next check, or hard gate was changed.

Final result: passed

## 2026-09-19 國際資料與股票決策關聯 UI QA

- Source and implementation: `international-ui.js`; generated through `node .\full-professional-stock-screen.js --render-existing`. No generated HTML was edited directly and no report data, score, rank, or action rule was changed.
- Visible decision map: the international context now explains three uses at a glance: `進場節奏`, `產業／資金確認`, and `事件風險檢查`.
- Card semantics: the primary and expanded context cards show `對決策的作用`; CFTC positions and policy/energy/sanctions announcements explicitly retain their non-signal limitations.
- Desktop viewport: 1050 x 900 CSS px; screenshot `output/international-context-1050x900.png`; `scrollWidth = clientWidth = 1050`.
- Mobile viewport: 390 x 844 CSS px; screenshot `output/international-context-390x844.png`; `scrollWidth = clientWidth = 390`; the decision map collapsed to one column.
- Interaction: all three international details sections were expanded successfully; section guides and card-use explanations were present.
- Browser console errors and warnings: 0 at both tested viewports.
- Privacy boundary: no credentials, localStorage positions, costs, or private user data were used or committed.
- Publication status: published through the Pages workflow; online content markers and normalized byte match were verified at `https://fricachai.github.io/pro_ranking/`.

Final result: passed

## 2026-08-10 持股決策卡滑鼠拖曳排序 QA

- Change: the left stock-title block now supports left-button press and vertical drag. The existing `上移`／`下移` buttons remain available.
- Desktop viewport: 1050 x 900; dragging 8271 above 2347 changed the visible order from `2347, 8271, 2603` to `8271, 2347, 2603` and saved `positionOrder` as `0, 1, 2`.
- Drag scope: only the stock-title block starts a drag; cost inputs, tracking checkbox, buttons, and links remain separate controls.
- Mobile viewport: 390 x 844; drag handles retained the instruction title and the card list remained single-column.
- `document.documentElement.scrollWidth <= window.innerWidth`: true at both tested viewports.
- Browser console errors and warnings: 0.
- Dragging state cleanup: no cards remained marked `.is-dragging` or `.is-drag-over` after release.

Final result: passed

## 2026-08-10 持股決策卡上下排序 QA

- Change: added keyboard-accessible `上移`／`下移` controls to each tracked position card. The first card disables `上移`; the last card disables `下移`.
- Privacy boundary: ordering is stored only in browser `proRankingPositionsV1.positionOrder`; report JSON, scores, ranking, actions, costs, and credentials are unchanged and not committed.
- Desktop viewport: 1050 x 900; moving 2347 upward changed card order from `8271, 2347, 2603` to `2347, 8271, 2603`, and persisted the swapped order after render.
- Mobile viewport: 390 x 844; controls remained available with accessible labels and the card list stayed single-column.
- `document.documentElement.scrollWidth <= window.innerWidth`: true at both tested viewports.
- Browser console errors and warnings: 0.
- Visual evidence: `output/playwright/position-reorder-desktop.png`, `output/playwright/position-reorder-mobile.png`.

Final result: passed

## 2026-08-10 持股決策卡縮放與手機版 QA

- 問題來源：原本 `max-width:1100px` 僅把四欄格線改為兩欄，DOM 的第三欄「下一次確認」因自動排版落到股票欄下方；此時「目前狀態／今天動作」欄也可能過窄而難以完整閱讀。
- 修正：761–1180px 改採三欄語意格線：股票與現況／目前狀態與今天動作／下一次確認與條件；主要原因置於中欄下方。761–900px 再改為股票左欄、其餘資訊依閱讀順序排列於右欄；760px 以下維持單欄直排。
- 以追蹤中的 2382 廣達卡片驗證，1050×900 視窗的卡片截圖：`.playwright-cli/element-2026-08-10T00-53-34-483Z.png`；「目前狀態｜收盤已跌破」、「今天動作」、「下一次確認」、防守區與主要原因均完整可見。
- 390×844 手機視窗的卡片截圖：`.playwright-cli/element-2026-08-10T00-54-05-948Z.png`；資訊依股票現況 → 目前狀態／今天動作 → 下一次確認與條件 → 主要原因順序直排，無欄位裁切。
- 在 1050px 與 390px 寬度分別驗證 `document.documentElement.scrollWidth <= window.innerWidth`，結果皆為 true；瀏覽器 console errors/warnings：0。

Final result: passed

## 2026-08-06 horizon table sorting QA

- The `前30名與主要風險` and `完整 465 檔上市股票排名` tables expose keyboard-accessible sort buttons for short, medium, and long score headers.
- Each header sorts ascending on first activation and descending on the next activation; the visible arrow and `aria-sort` identify the active direction.
- Sorting changes display order only. Report JSON, original rank, scores, entry action, holding action, today action, and hard gates are unchanged.
- Sorting was checked after search and filter changes, with contained horizontal scrolling and mobile single-column behavior preserved.
- Console errors and warnings: 0.

Final result: passed

## 2026-08-10 position decision card empty-space QA

- Issue: the previous medium-width two-by-two layout isolated `Primary reasons` in its own lower-right panel. A short reasons list left most of that panel empty.
- Change: at 761-1180px the card now has a stock-summary/action row followed by one full-width decision zone. In that zone, next confirmation, operating range, and change conditions sit beside primary reasons and the holding plan. Narrow tablet width collapses that decision zone safely to one column.
- Information completeness: the existing `holdingPlan` is now visible inside the reasons pane; the expandable detail keeps the current decision basis available on demand. Rendering still uses the established report fields (`holdingPlan`, `basis`, and `reasonChips`) without changing screening or decision logic.
- Desktop viewport: 1050 x 900; tracked 2382 card used the lower area for next confirmation on the left and reasons plus holding plan on the right, with no large isolated blank pane.
- Mobile viewport: 390 x 844; the card reads as one column in the order summary, today action, next confirmation/operating range, reasons, holding plan, and detail. `document.documentElement.scrollWidth <= window.innerWidth` was `true`.
- Interaction and errors: expandable detail still worked; console warnings were 0 at both desktop and mobile sizes.
- Visual evidence: `.playwright-cli/element-2026-08-10T01-18-31-925Z.png` (1050 x 900) and `.playwright-cli/element-2026-08-10T01-18-25-836Z.png` (390 x 844).

Final result: passed

## 2026-09-01 強勢價格與持股動作即時判斷 QA

- Source comparison: the attached 2454 screenshot showed a limit-up price while the card incorrectly presented `降低部位`; the corrected source rule is `POSITION_ACTION_PRIORITY_V2`, implemented in `full-professional-stock-screen.js` and applied to every ranking row with that row's own data.
- Decision display: the refreshed 2454 row now shows `正常持有`, `漲停先續抱；不追價`, `強勢確認`, and two concise reasons: `今日漲停／趨勢站穩` plus `ETF／投信偏弱，先觀察`.
- Desktop viewport: 1050 x 900 CSS px; the tracked card displayed the action first, followed by next confirmation, observation zone, change condition, reasons, and holding plan without a sparse reasons panel.
- Mobile viewport: 390 x 844 CSS px; the card collapsed to one column and remained readable. `document.documentElement.scrollWidth` was 375, so page-level horizontal overflow was false.
- Interaction and privacy: QA used a temporary browser-only tracking row with no real cost; the temporary `proRankingPositionsV1` state was removed after capture. No credentials or private position data were committed.
- Browser console errors and warnings: 0.
- Visual evidence: `output/playwright/20260901-2454-card-1050x900.png` and `output/playwright/20260901-2454-card-390x844.png`.

Final result: passed

## 2026-09-19 台股大方向與個股具體操作 QA

- Change: 國際區塊改為先顯示「台股執行結論：偏多／中性偏保守／偏空」，再分開說明尚未持有與已經持有的具體做法；不再只顯示「回看個股條件」或「等待承接」。
- Current report result: `中性偏保守`；頁面直接顯示「台股現在不適合追買，也沒有足夠證據全面賣出」，並列出支持訊號（市場不緊張、半導體上升）與壓力訊號（臺幣轉弱、殖利率上升、外資期貨偏空）。
- Individual card result: 搜尋 6770 力積電後，卡片顯示「現在不追價：等回到 70.10–70.90 再分批買」，並列出 ETF 5 日增加 4,054 張、外資持股 5 日增加 107,118 張，標示兩項籌碼偏強；不再使用未定義的「等待承接條件」。
- Operation legend: `可開始承接＝可以分批買`、`等待確認／不建立部位＝現在不買`、`正常持有＝維持`、`降低部位／優先降低風險＝減碼`。
- Desktop viewport: 1050 x 900；方向結論、支持／壓力摘要、個股操作文字均可見，`scrollWidth = clientWidth = 1050`。
- Mobile viewport: 390 x 844；方向框、操作對照與個股卡均無頁面級水平溢出，`scrollWidth = clientWidth = 390`。
- Browser console errors and warnings: 0 at both tested viewports. `INTERNATIONAL_CONTEXT_TESTS=PASS` and `POSITION_DECISION_RULES_PASS`.
- Boundary: 這是環境方向與個股既有決策欄位的白話呈現；沒有改變 `HORIZON_SCORE_V2`、排名、評分、硬性門檻或個股決策計算。

Final result: passed

## 2026-09-19 長期初篩直接結論 QA

- Change: `crossHorizonReading` 改為直接回答「長期結論：可列入長期研究／不列入長期優先／目前不買／依個股卡維持或減碼」，保留三時間尺度分數與原本決策規則。
- Boundary: 長期初篩仍不是完整價值評分，也沒有改分數、排名、買賣欄位或硬性門檻。
- Validation: Node 語法、國際資料契約與個股決策規則均通過；純 UI 重產完成。

Final result: passed

## 2026-09-19 個股 entryPlan 數值化 QA

- `entryPlanText` 未來更新會直接寫出目前價格、20日EMA觀察區、ETF／主動ETF／外資持股 5 日數值與偏強／偏弱結論。
- `6770` 現行快速卡已驗證「74.00 高於 70.10–70.90，現在不追價」，並顯示 ETF 與外資持股實際增加數值。
- 沒有改變 HORIZON_SCORE_V2、排名、門檻或個股動作計算。

Final result: passed

## 2026-09-22 國際卡「5筆／20筆」改為「近5日／近20日」QA

- Source and implementation: `international-ui.js`（市場氣氛、產業、資金、匯率、殖利率、費半、油價卡與快速面板的「5筆／20筆」全部改為「近5日／近20日」；`formatMethodText` 把「觀察規則」句的 20筆／5筆在顯示時轉為近20日／近5日；折線圖 aria-label 改為「最近 N 日」）；`international-context.js` summarize method 原文同步改為近5日／近20日；`full-professional-stock-screen.js` 宏觀區「20筆變化」改為「近20日變化」。
- 效果：`近20日 +1.2%｜近5日 +1.9%`、`近5日 +0.2%｜上升＝臺幣貶值`、`S&P 500 近20日變動；美元／臺幣近5日±0.5%`、`最近21日觀察值走勢`、`近20日變化 -2.38%`；頁面不再出現「5筆／20筆／最近21筆」。
- 純 UI／文案修改：以 `--render-existing` 沿用 2026-09-21 資料重產，未重抓資料、未改評分／排名／門檻；`formatMethodText` 只影響顯示，JSON 的 `summary.method` 原文保留可追溯，下次完整受控更新會使用新原文。
- 驗證：`node --check` 三支、`Test-InternationalContext.js`、`git diff --check` 通過；index.html 掃描新字 True、舊字 False；瀏覽器本機登入後國際區塊無「5筆／20筆」、無水平溢出、console 0、無 pageerror。

Final result: passed
