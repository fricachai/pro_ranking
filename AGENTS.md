# 上市股票專業選股報告操作規則

## Obsidian 與 OpenCode 自動交接

1. 專案 `opencode.json` 的 `instructions` 已列入 `OPENCODE_HANDOFF.md` 與 Obsidian 的 `Codex操作累積/pro_ranking上市股票專業選股系統-開發與部署SOP.md`；OpenCode 必須在新工作階段啟動時自動載入兩者。
2. Obsidian MCP 只是讀寫工具；若沒有 `instructions` 或本檔明確要求，OpenCode 不會自行掃描整個 vault。更新必讀規則後要開新工作階段，不要假設舊工作階段會回溯替換已載入的指示。
3. 權威層級依序為：可執行的腳本與驗證器、repo `AGENTS.md` / `OPENCODE_HANDOFF.md`、Obsidian 歷史理由與 SOP。若舊筆記與現行腳本衝突，不得依舊筆記操作；必須同步更新這三層。<!-- OBSIDIAN_AUTOREAD_V1 -->

## 專案用途

本專案每日重新抓取 ETF、證交所、公開資訊觀測站與即時行情資料，產生「目前 ETF 持有且經官方主檔辨識的臺灣上市／上櫃普通股」研究排序報告並發布到 GitHub Pages。

## Obsidian 與 OpenCode 自動交接

1. 專案 `opencode.json` 的 `instructions` 已列入 `OPENCODE_HANDOFF.md` 與 Obsidian 的 `Codex操作累積/pro_ranking上市股票專業選股系統-開發與部署SOP.md`；OpenCode 必須在新工作階段啟動時自動載入兩者。
2. Obsidian MCP 只是讀寫工具；若沒有 `instructions` 或本檔明確要求，OpenCode 不會自行掃描整個 vault。更新必讀規則後要開新工作階段，不要假設舊工作階段會回溯替換已載入的指示。
3. 權威層級依序為：可執行的腳本與驗證器、repo `AGENTS.md` / `OPENCODE_HANDOFF.md`、Obsidian 歷史理由與 SOP。若舊筆記與現行腳本衝突，不得依舊筆記操作；必須同步更新這三層。<!-- OBSIDIAN_AUTOREAD_V1 -->
4. Pages 唯一權威部署流程是 `.github/workflows/deploy-pages.yml`；`pages/builds/latest` 的 legacy 紀錄只供歷史稽核，不得單獨決定成敗。預檢必須先等待 active Actions run 結束，不得繞過；更新器推送前也必須等待整個 Pages 佇列排空。工作流不取消執行中部署，deploy timeout 為 15 分鐘；明確失敗只可 rerun 失敗 job 一次，不得重跑資料或製造新 commit。線上 byte match 與 Actions 稽核必須分開回報。Build 可依根因需要直接使用底層腳本；正式發布優先使用 `Invoke-ProfessionalScreenUpdateCommand.ps1`，以保留統一預檢、狀態與線上驗證。<!-- PAGES_DEPLOYMENT_LOOP_GUARD_V1 --><!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

## 盤中／每日更新唯一入口

日常資料更新的發布入口是：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-ProfessionalScreenUpdateCommand.ps1
```

此控制入口會依序完成預檢、資料抓取、報告產生、輸出驗證、限定檔案提交、推送，以及 GitHub Pages 線上驗證。不要直接手改產出的 HTML、JSON 或 CSV；若流程失敗，Build 可先修正來源、產生器、驗證器或流程，再由同一入口重試。

## OpenCode 執行規則

1. 先讀 `OPENCODE_HANDOFF.md`。單純每日更新不改動評分權重與硬性條件；但使用者要求修正，或更新流程因來源、產檔、驗證、UI、Git／Pages 失敗時，Build 必須進入跨層級修正流程，不得把每日模式當成編輯權限上限。
2. 不要重新閱讀完整 `index.html` 或 `professional-screen-report/latest.json`；它們很大，腳本已負責驗證。
3. 成功時依腳本狀態回報：`published` 顯示本次檢查時間、資料日期、是否有實質資料變化、股票數、前三名、提交版本與公開網址。
4. 失敗時先讀取狀態檔與紀錄檔尾端，定位根因，修正可修正的程式／來源／流程，再做有界重試；不得只回報失敗、等待使用者或建立競爭中的第二個背景更新。不得猜測、不降低門檻，也不得填造資料。
5. 若工作區原本有未提交變更，腳本會停止。不得清除或覆蓋這些變更。
6. ETF 20 日資料只作背景，10 日確認延續，5 日看轉折；不得把 20 日累積直接寫成買進訊號。
7. ETF 資料日、法人買賣超日、外資持股日、價量估值日與即時報價時間必須分開呈現。
8. 報告是研究排序，不是保證報酬或個人化投資建議。
9. 每次執行都會重新排序；掉出前三名不是賣出訊號。不得用本次排名取代既有部位的續抱、停加碼、減碼與出脫判斷。
10. 每檔股票必須同時輸出 `entryAction`、`holdingAction`、`todayAction` 與 `nextCheck`。新部位只有「可開始承接」才可進入分批布局；既有部位依基本面破壞、技術趨勢與 ETF／外資／投信轉弱程度判斷。
10a. `POSITION_ACTION_PRIORITY_V2`：既有部位的判斷順序固定為「重大事件／基本面硬風險 → 價格技術結構 → 法人籌碼」。ETF、外資、投信中兩項偏弱但價格仍站在20／60日EMA之上時，不得單獨觸發「降低部位」；若盤中漲停或價格已強勢確認且無硬風險，顯示「正常持有」與「續抱／不追價」，籌碼分歧只列為觀察。只有價格結構破壞且法人同步轉弱，或硬風險成立，才可顯示降低部位／優先降低風險。此規則逐檔套用，但每檔仍以自己的即時行情與資料判斷；新部位門檻不因此放寬。<!-- POSITION_ACTION_PRIORITY_V2 -->
11. 使用者標記的布局部位保存在瀏覽器 `proRankingPositionsV1`，不因重跑或掉出前三名自動移除；不得把本地持倉追蹤資料上傳或寫入公開報告。
12. 標準KD（9,3,3）固定只占各技術單元的10%（短期最高3分、中期最高2分），必須使用每日最高、最低與收盤價計算。KD不得用收盤價近似；低檔黃金交叉不可單獨列為買進，高檔死亡交叉不可單獨列為減碼或出脫。
13. 布局追蹤匯出／匯入只處理本機JSON。匯入必須驗證四碼代號與正數成本，採同代號更新、其他原有追蹤保留，不得把持倉寫入Git、公開HTML或網路來源。
14. 報告使用Obsidian既有重用規格的純前端登入遮罩，只保留使用者指定的帳密清單。日常更新不得移除 `loginGate`、`pro-ranking-auth-v1`、任何已設定帳號、記住登入或登出控制；登入遮罩不得宣稱為伺服器端安全驗證。
15. 治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使仍存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
16. 所有規劃、執行、錯誤修正、功能新增與發布統一使用 `opencode.json` 的 `build` 主代理；其權限為讀取、編輯、Shell、網路查詢、提問、規劃、子代理、提交、推送與發布均可，外部專案路徑亦可使用。受控入口是品質與發布流程，不是限制 Build 修正程式的權限；不得再把 OpenCode 鎖在每日更新或禁止直接修正的模式。敏感資料、憑證、破壞性刪除與未授權外部操作仍受全域安全政策約束。
17. 每次更新 `AGENTS.md`、`OPENCODE_HANDOFF.md`、`opencode.json` 或 Obsidian 必讀 SOP 後，舊 OpenCode 對話不可視為已更新；必須回到主工作階段開新對話，選擇 Build 主代理，讓 `instructions` 重新載入，才能立即依現行規則接續。<!-- OPENCODE_IMMEDIATE_CONTINUATION_V1 -->
18. 任何任務完成 Obsidian 寫回後，必須在回報完成前執行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Sync-OpenCodeObsidianHandoff.ps1 -CheckOpenCodeConfig`；只有輸出 `HANDOFF_READY=true` 才可宣稱已完成 Codex→OpenCode 交接。<!-- CODEX_OBSIDIAN_WRITEBACK_HANDOFF_V1 -->

## OpenCode 全能力修正與失敗復原契約

OpenCode Build 與 Codex 在本專案採相同的工程權限與完成責任；`/update-report` 只是日常更新的快捷入口，不是能力邊界。使用者只要要求「修正、完成、補齊、判定、發布」或更新流程出現失敗，Build 就必須自行完成下列閉環：

1. 讀取 `.git/professional-screen-update-state.json`、最後一個 `opencode-update-*.log`／RUN_LOG、工作區狀態與相關原始程式，確認是否有既存背景程序；不得盲目再啟動第二份。
2. 依根因修改必要的資料來源、重試、日期回補、替代來源、已驗證快照、資料契約、判讀邏輯、UI、測試或發布腳本；可跨檔案、跨層級處理，不得只改表面文字。
3. 單一來源失敗不得阻斷整個判讀。只要其餘來源與現有個股資料仍可支持方向，就要輸出偏多／中性偏保守／偏空及新資金／既有持有部位的明確做法；來源健康度、日期與替代來源放在可追溯的資料說明，不得把模糊的「資料不足」當成使用者建議。
4. `MI_QFIIS` 至少 11 個有效交易日、KD 使用真實高低收、官方資料語意、治理排除規則與其他硬性品質門檻均不得降低或補造。補足資料的方式是增加可驗證來源與韌性，不是放寬門檻。
5. 修正後必須執行語法／資料契約／fallback／UI 禁用字眼掃描，必要時做瀏覽器與線上驗證；只有完成 `STATUS=published` 或明確完成修正後的發布驗證，才可宣稱完成。<!-- OPENCODE_AUTONOMOUS_REPAIR_V1 -->

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

## ETF 母體、證據與新鮮度契約

1. 研究母體固定為當次 B 級籌碼小宇 ETF 快照中，與當日 TWSE／TPEX 官方證券主檔相符的四碼臺灣上市／上櫃普通股；不得只保留 TWSE、以名稱猜市場別，或把先前 473 檔上市子集合稱為完整母體。
2. 來源中的四碼代碼若沒有 TWSE／TPEX 主檔相符項，可能是全球型 ETF 的海外持股；必須保留在來源稽核計數，卻不得補造臺股價格、財報、評分或排名。每次輸出須能驗證 `rawEtfHeldStocks = taiwanEtfHeldStocks + unknownMarketStockCount`。
3. 官方主檔只確認市場別；ETF 持股本身仍屬 B 級快照，未有逐檔基金公司／投信官方對帳前，前台與回報不得宣稱為「所有 ETF 官方持股」。Yahoo RSS 為 C 級待確認資訊，保持不計分。
4. `lagging_etfs` 必須與實際 `etf.updated=false` 清單一致，否則產生器停止。落後 ETF 的持股仍保留在母體避免漏股，但其流向不可宣稱為全體同日完整訊號；個股以 `laggingExposure`／`laggingHolderCount` 揭露資料健康限制，該限制不得進入投資分數或乘數。
5. `activeEtfDataComplete=false` 時，`bucketA` 必須為 0。上櫃若缺官方外資持股 5／10 日歷史，標示 `comparisonStatus=部分可比`、不給該趨勢分，不能把缺值解讀為轉弱。<!-- ETF_UNIVERSE_FRESHNESS_V1 ETF_FRESHNESS_EXPOSURE_V1 -->

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

## 官方 T86 抓取與 Windows 執行邊界

1. 證交所 T86 最近 45 個日曆日採逐日循序查詢，保留短暫延遲；暫時失敗日期最多重試三輪。不得恢復 4 路並行，也不得把單一日期失敗直接當成整個來源永久不可用。<!-- OFFICIAL_FETCH_RUNTIME_V2 -->
2. T86 至少保留 5 個官方有效交易日，正式 20 日歷史優先使用官方資料；不足時仍須依現有來源契約與報告驗證器處理，不能降低官方資料門檻或冒充當日新資料。
3. Node 的 stderr 只作為執行紀錄；PowerShell runner 必須以 Node exit code 判斷成功或失敗，不得因 console.warn／console.error 自動產生 NativeCommandError。所有 Node 輸出都要保留在 run log。
4. scripts/Test-ProfessionalScreenPowerShellBoundary.ps1 必須在交接預檢中執行，驗證 stderr 能被記錄、成功 exit code 能成功、失敗 exit code 仍會 fail-closed。
5. `Invoke-NodeLogged` 必須逐行串流 Node stdout／stderr 到 `RUN_LOG`，不得等整個 Node 程序結束後才寫入；長時間抓取或報告產生期間，控制命令必須能顯示實際進度。

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
3. 需要更新報告或公開網頁時，執行 `scripts/Invoke-ProfessionalScreenUpdateCommand.ps1`；不得只修改本機 `index.html` 或只回報程式碼完成。若先修正根因，修正後仍須由同一受控入口完成發布與線上驗證。
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
- `scripts/Sync-OpenCodeObsidianHandoff.ps1`：每次 Obsidian 寫回後驗證三份指示、Build 權限與現行契約，輸出 `HANDOFF_READY=true`。
- `scripts/Invoke-OpenCodeDailyUpdate.ps1`：先預檢再以 OpenCode CLI 非互動模式執行每日發布；Desktop 直接使用 `/update-report`。
- `OPENCODE_HANDOFF.md`：完整交接清單、一次性設定與故障邊界。
- `opencode.json`、`.opencode/commands/update-report.md`：授權 OpenCode Build 完整工程能力並提供 `/update-report`。
- `index.html`：GitHub Pages 首頁，由更新腳本從最新報告複製產生。
- `professional-screen-report/latest.json`：最新完整分析資料。
- `professional-screen-report/full-professional-*`：依 ETF 資料日保存的版本。

## 非日常任務

使用者要求新增欄位、修改評分、調整版面、補足來源、改善判讀或修正任何錯誤時，Build 可直接分析與編輯產生器、資料層、驗證器與發布流程。每日更新遇到可修復失敗時，也必須自動進入同一修正流程。完成後必須遵守「Codex／OpenCode 統一完成條件」，不得留下只有其中一個工具知道的未提交版本。

2026-08-06 使用者已明確授權 OpenCode 的 Build 主代理具備完整專案權限，可自行規劃、編輯、測試、查詢網路、提交、推送與發布，能力不再只限每日更新；本次再次確認此授權適用所有專案工作與所有對話。模型由使用者在 OpenCode 選擇，專案不得鎖死 GPT‑5.6 Luna、Kimi K3 或其他特定模型。完整權限不取消敏感資料與破壞性操作安全邊界，但不得用一般流程規則限制跨層級修正。<!-- OPENCODE_BUILD_FULL_ACCESS_V1 -->

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
9. 更新器在事件抓取實際開始前的預檢失敗（例如髒工作區）不得刪除、還原或覆寫既有 `latest-events.json`；只有事件抓取已開始而後續失敗時，才可還原已驗證的先前版本。維持回歸檢查 `PRECHECK_PRESERVES_EVENT_FILE=PASS`。<!-- EVENT_PREFLIGHT_PRESERVATION_V1 -->

## GitHub Pages byte-match 換行格式防呆

Pages workflow 使用 Jekyll 建置時，可能將 Windows CRLF HTML 正規化為 LF。若 workflow 的 `pages_build_version` 等於本機 HEAD，且 artifact hash 與線上頁面 hash 相同，但本機原始 `index.html` hash 不同，先檢查換行格式；這是已驗證的 `PAGES_LINE_ENDING_FALSE_MISMATCH_V1` 情況，不得當成 CDN 尚未傳播，也不得跳過預檢或直接執行 `Update-ProfessionalScreen.ps1 -Publish`。預檢器應正規化換行後比較內容，並保留 workflow SHA、HTTP、頁面標記與資料契約驗證。

## 跨 Agent UI 交接規則

1. 國際市場脈動區是獨立的環境方向濾網，不得單獨改變 `HORIZON_SCORE_V2`、排名、`entryAction`、`holdingAction`、`todayAction` 或硬性門檻；但前台必須先給出明確的台股環境結論（偏多／中性偏保守／偏空），再分開說明新資金與已持有部位的具體做法。
2. 國際資料介面必須讓使用者看出三組用途：進場節奏、產業／資金確認、事件風險檢查；每個指標應同時提供一般使用者看得懂的「直接結論」（支持買進、支持維持、支持保守或不可單獨買賣）、實際數值與限制，不得只寫「回看個股條件」或「等待承接」而不說明怎麼做。
3. 跨 Agent 接手的目前任務狀態、已修改檔案、尚待驗證項目與下一步，必須同步記錄於 `OPENCODE_HANDOFF.md`；不得只保留在聊天逐字稿。
4. 本規則標記為 `INTERNATIONAL_CONTEXT_DECISION_GUIDE_V1`。純 UI 修改完成前，必須重產報告並完成 Node 語法、資料契約、桌機／手機版面與 console 檢查；不得直接手改生成 HTML。
5. 國際方向判讀必須先嘗試官方資料；期交所端點失敗時，應使用已驗證的替代來源並揭露證據層級與資料日期。stale 資料可作保守判讀；單一來源失敗時仍須輸出可執行的台股方向、新資金做法與持有做法，不得只留下模糊狀態字眼。<!-- INTERNATIONAL_CONTEXT_FALLBACK_V1 -->
