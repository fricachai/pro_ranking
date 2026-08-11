# 上市股票專業選股報告操作規則

## Obsidian 與 OpenCode 自動交接

1. 專案 `opencode.json` 的 `instructions` 已列入 `OPENCODE_HANDOFF.md` 與 Obsidian 的 `Codex操作累積/pro_ranking上市股票專業選股系統-開發與部署SOP.md`；OpenCode 必須在新工作階段啟動時自動載入兩者。
2. Obsidian MCP 只是讀寫工具；若沒有 `instructions` 或本檔明確要求，OpenCode 不會自行掃描整個 vault。更新必讀規則後要開新工作階段，不要假設舊工作階段會回溯替換已載入的指示。
3. 權威層級依序為：可執行的腳本與驗證器、repo `AGENTS.md` / `OPENCODE_HANDOFF.md`、Obsidian 歷史理由與 SOP。若舊筆記與現行腳本衝突，不得依舊筆記操作；必須同步更新這三層。<!-- OBSIDIAN_AUTOREAD_V1 -->

## 專案用途

本專案每日重新抓取 ETF、證交所、公開資訊觀測站與即時行情資料，產生台灣上市股票研究排序報告並發布到 GitHub Pages。

## Obsidian 與 OpenCode 自動交接

1. 專案 `opencode.json` 的 `instructions` 已列入 `OPENCODE_HANDOFF.md` 與 Obsidian 的 `Codex操作累積/pro_ranking上市股票專業選股系統-開發與部署SOP.md`；OpenCode 必須在新工作階段啟動時自動載入兩者。
2. Obsidian MCP 只是讀寫工具；若沒有 `instructions` 或本檔明確要求，OpenCode 不會自行掃描整個 vault。更新必讀規則後要開新工作階段，不要假設舊工作階段會回溯替換已載入的指示。
3. 權威層級依序為：可執行的腳本與驗證器、repo `AGENTS.md` / `OPENCODE_HANDOFF.md`、Obsidian 歷史理由與 SOP。若舊筆記與現行腳本衝突，不得依舊筆記操作；必須同步更新這三層。<!-- OBSIDIAN_AUTOREAD_V1 -->
4. Pages 唯一權威部署流程是 `.github/workflows/deploy-pages.yml`；`pages/builds/latest` 的 legacy 紀錄只供歷史稽核，不得單獨決定成敗。預檢必須先等待 active Actions run 結束，不得繞過；更新器推送前也必須等待整個 Pages 佇列排空。工作流不取消執行中部署，deploy timeout 為 15 分鐘；明確失敗只可 rerun 失敗 job 一次，不得重跑資料或製造新 commit。線上 byte match 與 Actions 稽核必須分開回報。OpenCode 不得直接呼叫 `Update-ProfessionalScreen.ps1 -Publish`，只能使用 `Invoke-ProfessionalScreenUpdateCommand.ps1`。<!-- PAGES_DEPLOYMENT_LOOP_GUARD_V1 --><!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

## 盤中／每日更新唯一入口

日常資料更新只執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

此腳本會依序完成資料抓取、報告產生、輸出驗證、限定檔案提交、推送，以及 GitHub Pages 線上驗證。不要另外手動修改產出的 HTML、JSON 或 CSV。

## OpenCode 執行規則

1. 先讀 `OPENCODE_HANDOFF.md`。每日更新不得改動 `full-professional-stock-screen.js` 的評分權重、硬性條件、資料來源、驗證門檻或版面。
2. 不要重新閱讀完整 `index.html` 或 `professional-screen-report/latest.json`；它們很大，腳本已負責驗證。
3. 成功時依腳本狀態回報：`published` 顯示本次檢查時間、資料日期、是否有實質資料變化、股票數、前三名、提交版本與公開網址。
4. 失敗時停止，不要猜測、不降低門檻，也不要自行填造資料。只讀取腳本指出的紀錄檔尾端，說明失敗步驟。
5. 若工作區原本有未提交變更，腳本會停止。不得清除或覆蓋這些變更。
6. ETF 20 日資料只作背景，10 日確認延續，5 日看轉折；不得把 20 日累積直接寫成買進訊號。
7. ETF 資料日、法人買賣超日、外資持股日、價量估值日與即時報價時間必須分開呈現。
8. 報告是研究排序，不是保證報酬或個人化投資建議。
9. 每次執行都會重新排序；掉出前三名不是賣出訊號。不得用本次排名取代既有部位的續抱、停加碼、減碼與出脫判斷。
10. 每檔股票必須同時輸出 `entryAction`、`holdingAction`、`todayAction` 與 `nextCheck`。新部位只有「可開始承接」才可進入分批布局；既有部位依基本面破壞、技術趨勢與 ETF／外資／投信轉弱程度判斷。
11. 使用者標記的布局部位保存在瀏覽器 `proRankingPositionsV1`，不因重跑或掉出前三名自動移除；不得把本地持倉追蹤資料上傳或寫入公開報告。
12. 標準KD（9,3,3）固定只占各技術單元的10%（短期最高3分、中期最高2分），必須使用每日最高、最低與收盤價計算。KD不得用收盤價近似；低檔黃金交叉不可單獨列為買進，高檔死亡交叉不可單獨列為減碼或出脫。
13. 布局追蹤匯出／匯入只處理本機JSON。匯入必須驗證四碼代號與正數成本，採同代號更新、其他原有追蹤保留，不得把持倉寫入Git、公開HTML或網路來源。
14. 報告使用Obsidian既有重用規格的純前端登入遮罩，只保留使用者指定的帳密清單。日常更新不得移除 `loginGate`、`pro-ranking-auth-v1`、任何已設定帳號、記住登入或登出控制；登入遮罩不得宣稱為伺服器端安全驗證。
15. 治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使仍存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->

## 三時間尺度評分與資料健康契約

1. 評分模型版本固定輸出 `HORIZON_SCORE_V2`，每檔股票必須有 `horizonScores.short`、`horizonScores.medium`、`horizonScores.long` 與獨立的 `dataHealth`。
2. 只有 `horizonScores.medium.score` 是排名主軸，並向後相容映射到 `score`、`rawScore` 與 `adjustedScore`。短期分數只判斷時機；長期分數只作初篩，不得各自產生另一套排名或直接買賣動作。
3. 短期權重固定為：技術與時機30、ETF／法人短期流向25、事件催化15、風險與流動性15、基本面護欄15。
4. 中期權重固定為：盈餘與營收趨勢25、企業營運品質20、技術趨勢20、估值15、ETF／法人籌碼10、事件／風險／流動性10。
5. 長期初篩目前只覆蓋85%方法權重：企業營運品質25、財務韌性20、成長耐久性15、估值25；資本配置品質15因尚缺完整自由現金流、ROIC與資本配置紀律資料而不計分。輸出須揭露 `methodCoverage=85` 與 `missingWeight=15`，不得冒充完整長期價值評估。
6. `dataHealth` 只判斷資料可用性，不得進入任一時間尺度分數、風險分數或總分乘數；低於65%仍屬硬性品質淘汰，不能進入A級。
7. 反重複計分固定規則：本益比只在估值構面計分，不再以盈餘殖利率重複；營收趨勢不再同時放入事件催化；資料健康度不得同時出現在分數、乘數與硬門檻。
8. 介面顯示分數使用整數，JSON可保留一位小數供稽核；不得用過多小數營造不存在的精準度。<!-- HORIZON_SCORE_V2 -->
9. 季報申報切換期間，本次官方端點有回傳者一律使用本次資料；未回傳者只可沿用既有日期版報告中同季或前一季、已驗證的官方季報快照，且必須輸出實際 `financialPeriod`、`financialSourceMode`、快照檔名與 `freshnessPenalty`。同季快照扣5點資料健康度，前一季快照扣10點；不得跨越一季、不得把歷史快照冒充本次取得資料、不得用中性預設值替缺漏證據加分。
10. 長期初篩除固定的 `methodCoverage=85` 外，每檔股票還必須揭露 `dataCoverage`。當季、歷史快照與無可用季報三類數量之和必須等於股票總數；歷史快照列入 `dataHealth.staleCore`，真正缺漏列入 `missingCore`。

## 離線策略驗證契約

1. 任何新因子、權重或核心／衛星配置想法，先執行 `node .\scripts\Backtest-HorizonStrategy.js`；不得直接修改正式 `HORIZON_SCORE_V2`。
2. 回測工具只讀取 `professional-screen-report/backtest-snapshots/` 的 close-only point-in-time 快照；快照必須是 `HORIZON_SCORE_V2` 且 `quotePhase=close`、`liveDate=priceDate`。其他日期版或舊模型檔案必須排除並列出，不得混合舊模型。
3. 回測訊號只能使用 `asOf` 當日已存在的資料，未來價格只能用後續快照；交易成本、快照間隔、樣本長度與 benchmark 缺漏都必須揭露。
4. 工具回傳 `insufficient_data` 時不得宣稱策略有效、優於大盤或已完成樣本外驗證；`shadow-qvm` 只作非生產實驗，不能取代 ROIC、自由現金流或完整長期動能資料。<!-- STRATEGY_VALIDATION_V1 -->

## 官方外資持股歷史完整性

1. 證交所 `MI_QFIIS` 最近 45 個日曆日必須逐日、循序抓取，日期間保留短暫延遲；不得恢復多日期並行，因來源曾在並行查詢時只回傳 10 個有效交易日。
2. 外資持股 10 日變化需要「當日加前 10 個有效交易日」，所以最低完整度固定為 11 日。不得降低門檻、把週末算成交易日、以舊快照補值，或把較短期間仍標示為 10 日。
3. 只有 `trendReliable=true` 的個股，外資持股 5／10 日趨勢才可進入評分、正面理由、風險判斷與持倉動作；期間若有非市場結構異動，維持不可直接計分。
4. 報告必須輸出 `meta.foreignHoldingHistoryDays` 並在頁面揭露有效交易日數；每日管線與交接預檢都必須確認至少 11 日。
5. 再次不足時，先檢查官方最大可查日期、週末／休市日、回應狀態及暫時性限流，再以循序方式重試。這是資料取得故障，不是修改選股權重或放寬品質標準的理由。

## 持股決策總覽與純 UI 發布規則

1. 「持股決策總覽」必須先回答目前動作，再回答執行時間、部位比例、觸發價、改變條件與原因。排名與新部位分類不得取代既有部位動作。
2. 目前狀態、今天動作與下一次確認必須分開。盤中跌破只顯示「保護持有／盤中待收盤」，不得直接當成已確認減碼；收盤跌破後仍依規則等待下一交易日收盤確認。
3. 摘要固定分為「減碼／出脫、等待確認、正常／保護持有、符合加碼條件」。卡片與摘要必須共同使用 `positionDecisionMeta` 的結果，不得各自建立另一套分類。
4. 每張卡至少顯示：股票與現況、目前狀態、今天動作、下一次確認、執行觀察區、改變條件與主要原因；完整依據必須可展開。手機版改為單欄卡片，不得出現頁面級水平溢出。
4a. 中等寬度（761–1180px）不可讓「主要原因」形成內容稀少的大面積空白欄位：上列應保留標的摘要與今天動作，下列決策區應把下一次確認／執行觀察區／改變條件，與主要原因／持有計畫一起有效使用。持有計畫應直接可見，完整依據仍維持可展開；900px 以下可收為單欄。任何調整必須實測 1050×900 與 390×844，確認無頁面級水平溢出及 console warnings。<!-- POSITION_CARD_RESPONSIVE_DENSITY_V1 -->
5. `proRankingPositionsV1`、成本價、登入狀態與追蹤 JSON 都是瀏覽器私人資料。測試可建立本機狀態，但不得把測試持倉、成本或帳密寫入 Git、公開 HTML、截圖文字或 Obsidian。
6. 純 UI／說明文字修改且使用者明確要求發布時，可用 `node .\full-professional-stock-screen.js --render-existing` 沿用已驗證的 `latest.json`，同步重產日期版 HTML、`latest.html` 與根目錄 `index.html`。既有JSON必須是 `HORIZON_SCORE_V2`；使用前必須確認沒有更動資料、評分、排名、門檻或日期，不得用此模式冒充每日資料更新。
7. 同一日可多次執行受控更新。舊的 `published/YYYYMMDD` 只保留歷史稽核，不得再用來提前停止；每次都必須重新查詢行情、新聞、重大訊息與其他來源。<!-- INTRADAY_REFRESH_V1 -->
8. 更新器以排除 `meta.generatedAt`、`meta.eventCheckedAt` 與 `eventsMeta.fetchedAt` 後的報告資料指紋判斷實質變化，但每次成功檢查都必須提交本次時間戳、發布並建立不可變的 `published/YYYYMMDD-HHmmss` 稽核標籤；`DATA_CHANGED=false` 只表示排除時間戳後沒有實質內容變化。
9. `STATUS=published` 表示本次來源檢查、Git、Pages 與線上驗證都已完成；無論 `DATA_CHANGED` 為何，前台都必須顯示本次「報告產生」與「事件檢查」日期時間。<!-- REFRESH_TIMESTAMP_V1 -->
10. 只要修改資料來源、評分、排名、動作規則、品質門檻或報告日期，就不屬於純 UI 例外；必須走完整受控更新，禁止沿用舊資料冒充新資料。
11. 決策介面發布驗證至少包含 `positionDecisionSummary`、資料日期與既有表格標記。`Update-ProfessionalScreen.ps1` 與 `Test-OpenCodeHandoff.ps1` 必須同步檢查新標記。
12. 視覺修改必須保存 `design-qa.md`：來源與實作並排比較、桌機與手機尺寸、測試狀態、互動清單、console error、差異修正紀錄及 `Final result: passed`。截圖本身不是完成證據，必須實際比較並修正可見差異。

## Codex／OpenCode 統一完成條件

除非使用者明確要求只保留本機、不要提交或不要發布，任何資料更新、錯誤修正、功能新增與判斷規則調整都必須在以下條件全部成立後，才可宣告完成：

1. 所有來源檔、腳本、規則與產出都更新在本專案根目錄 `pro_ranking`，不得另建 Codex 或 OpenCode 專用副本。
2. 執行與變更範圍相符的語法、資料契約及瀏覽器操作驗證；修正匯入、登入、追蹤等功能時，必須使用實際檔案或實際操作流程重現並驗證。
3. 需要更新報告或公開網頁時，執行 `scripts/Update-ProfessionalScreen.ps1 -Publish`，不得只修改本機 `index.html` 或只回報程式碼完成。
4. 只提交本次任務相關檔案，提交並推送至 `origin/main`；不得清除、覆寫或夾帶原有無關變更。
5. 完成前確認 `git status --porcelain` 無輸出，且本機 `HEAD`、`origin/main` 與 GitHub Pages 最新建置提交一致。
6. 實際讀取 GitHub Pages 線上檔案或執行瀏覽器測試，確認本次關鍵功能已上線；只有 Pages 顯示建置成功但線上內容未更新，不算完成。
7. 最終回報必須包含資料日期（資料更新任務）、提交版本、分支與公開網址，讓下一個 Codex 或 OpenCode 可直接從同一資料夾接手。
8. 瀏覽器 `localStorage`、登入狀態與使用者下載的布局追蹤 JSON 屬私人本機資料，不得為了交接寫入 Git 或公開報告；交接只保存功能與資料格式規則。

## 重要檔案

- `full-professional-stock-screen.js`：資料抓取、評分與報告產生器。
- `fetch-events.js`：事件輔助層抓取、欄位語意驗證與去重；新聞與AI摘要不直接改變三時間尺度分數。
- `scripts/Update-ProfessionalScreen.ps1`：每日更新、驗證與發布入口。
- `scripts/Test-OpenCodeHandoff.ps1`：OpenCode、GitHub、資料契約與線上版本的交接預檢。
- `scripts/Invoke-OpenCodeDailyUpdate.ps1`：先預檢再以 OpenCode CLI 非互動模式執行每日發布；Desktop 直接使用 `/update-report`。
- `OPENCODE_HANDOFF.md`：完整交接清單、一次性設定與故障邊界。
- `opencode.json`、`.opencode/commands/update-report.md`：限制 OpenCode 權限並提供 `/update-report`。
- `index.html`：GitHub Pages 首頁，由更新腳本從最新報告複製產生。
- `professional-screen-report/latest.json`：最新完整分析資料。
- `professional-screen-report/full-professional-*`：依 ETF 資料日保存的版本。

## 非日常任務

只有使用者明確要求新增欄位、修改評分、調整版面或修正錯誤時，才分析與編輯產生器。完成後必須遵守「Codex／OpenCode 統一完成條件」，不得留下只有其中一個工具知道的未提交版本。

2026-08-06 使用者已明確授權 OpenCode 的 Build 主代理具備完整專案權限，可自行規劃、編輯、測試、查詢網路、提交、推送與發布，權限不再只限每日更新。模型由使用者在 OpenCode 選擇，專案不得鎖死 GPT‑5.6 Luna、Kimi K3 或其他特定模型。完整權限不取消安全邊界：不得清除不明變更、不得未經授權操作外部資料夾、不得跳過資料契約、瀏覽器與 Pages 驗證，日常 `/update-report` 仍只執行受控更新器。<!-- OPENCODE_BUILD_FULL_ACCESS_V1 -->

同日使用者也授權 OpenCode 以 `/implement-horizon-ui` 接手短／中／長期評分明細介面的規劃與執行。這次任務必須維持中期為唯一排名主軸，短期為 1–20 個交易日的時機判斷，中期為約 1–6 個月的研究排序，長期為 1 年以上且價值投資宜觀察 3–5 年以上的初篩。三頁籤與跨尺度解讀只能解釋既有分數，不得改變分數、排名、動作或硬門檻；長期資本配置品質 15 分維持尚未計分。完整驗收契約以 `.opencode/commands/implement-horizon-ui.md` 為準。<!-- OPENCODE_HORIZON_UI_HANDOFF_V1 -->

評分明細 UI 契約：同一明細視窗提供「短期時機／中期研究／長期初篩」三頁籤，預設中期；每頁只顯示既有構面、實得／最高、證據、來源、改變條件與下一次檢查時間。短期只解釋進場時機，長期只作企業品質與估值初篩；頁籤、分數入口與跨時間尺度解讀不得覆蓋今天動作、建立新部位、已持有動作、排名或任何硬性門檻。長期資本配置品質維持「尚未計分／15」，方法覆蓋固定85%。<!-- HORIZON_SCORE_DETAIL_UI_V1 -->

## 事件資料契約與限制

1. 已完成的原始事件來源是：籌碼小宇 `events.json` 的庫藏股、處置與內部人異動；證交所／公開資訊觀測站上市公司重大訊息；以及最多 500 檔股票、每檔最多 5 則的 Yahoo Finance RSS 新聞。內部人異動僅可保留於原始事件檔以維持來源契約，不得進入個股評估、風險原因、動作判斷或前台顯示。
2. `material_info` 已接入官方重大訊息；`investor_conf` 只代表重大訊息文字明確出現「法人說明會／法說會」，不得宣稱已取得完整法說會資料庫。
3. 籌碼小宇庫藏股欄位 `f` 是事件起日、`t` 是預定結束日。輸出的 `publishTime` 目前承載可排序的事件日期，但必須等於 `f`，並以 `dateKind=event_start` 說明其不是公告發布時間；不得再把 `t` 映射成發布時間。
4. 抓取器必須保留 `sourceStartDate`、`sourceEndDate` 與 `dateKind`，並在覆寫 `latest-events.json` 前執行資料契約檢查。檢查失敗即退出，不得用猜測修正來源欄位。
5. Yahoo RSS 新聞必須維持 `confirmed=false` 與 `eventType=news_pending`，只供查核，不得直接加減評分。
6. 修改事件來源前，先保存一筆原始資料樣本並確認欄位語意，再新增映射；不得只依欄位名稱、排序或畫面推測。
7. 發布後至少檢查：事件資料契約通過、未出現庫藏股結束日誤標、網頁清楚揭露實際來源與未實作範圍、GitHub Pages 對應本次提交。
8. 每日發布必須重新產生 `latest-events.json`，且包含 `sourceStatus`；ETF股票代號不得少於300，官方重大訊息不得為空。Yahoo RSS 是 C 級待確認資訊；成功率低於80%或完全受限流時，必須以 `complete`、`partial` 或 `unavailable` 揭露狀態與成功率，但不得因此阻斷官方事件、收盤價與報告時間的更新。不得把舊新聞冒充本次新抓取資料。<!-- OPTIONAL_YAHOO_NEWS_V1 -->
