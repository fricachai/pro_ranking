# OpenCode 執行交接手冊

## 結論

可以交給 OpenCode Desktop 或 OpenCode CLI 執行。OpenCode Build 與 Codex 在本專案採相同的工程權限與完成責任：可理解需求、規劃、讀取、查詢、編輯、執行、測試、診斷、修正、提交、推送、發布與線上驗證；既有腳本是可驗證的執行工具，不是限制 OpenCode 只能做每日更新的邊界。只要新電腦具備必要工具與個人登入權限，OpenCode 可在同一工作階段完成從根因修正到發布驗證的完整閉環。

## Obsidian 已設為新工作階段自動必讀

OpenCode 原本只有 Obsidian MCP 工具，不會因此自動掃描或讀取 vault。本專案現已在 `opencode.json` 的 `instructions` 同時載入本交接檔與下列 Obsidian SOP：

`G:\我的雲端硬碟\Obsidian\2ndbrain\Codex操作累積\pro_ranking上市股票專業選股系統-開發與部署SOP.md`

使用規則：

- 更新 `opencode.json`、`AGENTS.md` 或 Obsidian SOP 後，必須回到 OpenCode 主工作階段並開新對話；舊對話可能已經載入舊版指示。
- 換電腦或 Google Drive 磁碟代號改變時，只需更新 `opencode.json` 的 Obsidian 絕對路徑，再以 `opencode debug config` 確認 `instructions` 已出現。
- Obsidian 用來保存完整理由與歷史；實際執行以 repo 的腳本、驗證器與當前 `AGENTS.md` 為準。每次發現可重用的新做法時，必須同時更新 repo 與原 Obsidian SOP，不只留在對話中。<!-- OBSIDIAN_AUTOREAD_V1 -->

## 後續規劃／執行立即接續規則

這是本次對話完成後的固定接手方式：

1. 在同一個 `pro_ranking` 專案根目錄開啟 OpenCode，回到主工作階段並建立新對話；不要在 `Subagent sessions cannot be prompted` 的子代理結果頁繼續輸入。
2. 選擇 `Build` 主代理。`opencode.json` 與全域 OpenCode 設定已授權它在所有一般專案工作中規劃、編輯、執行 Shell、查詢網路、使用子代理、測試、提交、推送與發布；跨專案路徑也可處理。敏感資料與破壞性操作仍受安全規則限制，但不得因此限制正常的跨層級程式修正。
3. 新對話會自動載入 `OPENCODE_HANDOFF.md`、`AGENTS.md` 與指定的 Obsidian SOP；若剛修改這些檔案，必須開新對話，不要依賴舊對話回溯更新。可用 `opencode debug config` 確認三份 `instructions` 都存在。
4. 每日資料更新可輸入 `/update-report`；已授權的評分介面功能可輸入 `/implement-horizon-ui`；其他規劃、修正、補足來源、改善判讀或新功能直接描述目標。若更新流程失敗，Build 必須讀取狀態與紀錄、找根因、跨層級修正、測試並重試，不需要第二個「開始執行」指令。
5. `Build` 的完整權限不等於跳過品質門檻：命令列／非互動發布使用 `Invoke-ProfessionalScreenUpdateCommand.ps1`；OpenCode Desktop `/update-report` 使用 `Start` 一次加循序 `Get-Status`，兩者都必須保留預檢、資料契約、GitHub Pages 與線上 byte match。這是可驗證的發布流程，不是禁止 OpenCode 修正或發布的權限規則。<!-- OPENCODE_IMMEDIATE_CONTINUATION_V1 -->
6. Codex 或其他工具每次完成 Obsidian 寫回後，必須執行 `Sync-OpenCodeObsidianHandoff.ps1 -CheckOpenCodeConfig`；只有 `HANDOFF_READY=true` 才算可交接。若驗證失敗，先修正指示路徑、契約或權限，不得只把筆記寫入就宣稱已完成。<!-- CODEX_OBSIDIAN_WRITEBACK_HANDOFF_V1 -->

Pages 部署現統一由 `.github/workflows/deploy-pages.yml` 處理，不再把 legacy `pages/builds/latest` 當成成敗單一來源。預檢要等待 active Actions run，更新器推送前要再等待佇列排空；workflow 設為 `cancel-in-progress: false` 與 15 分鐘 deploy timeout。失敗時僅允許對原 workflow 執行一次 failed-job rerun，不重抓資料、不製造空白 commit。HTTP 200 與線上 byte match 代表內容上線；Actions 結論是獨立稽核狀態。任何代理都不得跳過預檢或把舊資料冒充新發布；OpenCode 可以修正根因並使用單一控制入口完成驗證。<!-- PAGES_DEPLOYMENT_LOOP_GUARD_V1 --><!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

## OpenCode 全能力修正與失敗復原契約

本節是本專案對全域 OpenCode Build 能力契約的具體落實，適用所有專案工作與所有對話：

1. `/update-report` 是日常更新快捷入口，不是「只能更新、不能修正」的模式。若狀態檔或 RUN_LOG 顯示失敗，Build 必須先確認既有背景程序、讀取失敗關卡與相關程式，再在同一工作階段完成根因修正、測試與有界重試。
2. 單一來源失敗不得把整體判讀改成模糊拒答。Build 必須依資料契約尋找官方替代端點、日期回補、重試、第二來源或最近一次已驗證快照，並以現有可追溯資料產生明確的市場方向、新資金做法與已持有做法。
3. `MI_QFIIS` 至少 11 個有效交易日、真實高低收 KD、官方資料語意、治理排除與其他硬性門檻一律保留；補資料可以增加來源與韌性，不可以降低門檻或編造數值。
4. Build 可修改資料抓取、產生器、判讀、UI、測試、交接文件與發布流程；模型、推理等級、每日命令或先前失敗的背景程序不得限制它完成上述工作。
5. 驗收至少包含語法、資料契約、fallback／失敗路徑、公開畫面禁用模糊結論掃描、必要的瀏覽器與線上發布驗證。<!-- OPENCODE_AUTONOMOUS_REPAIR_V1 -->

## 最簡單的日常操作

### 已安裝 OpenCode Desktop

在 OpenCode Desktop 開啟「上市股票專業選股網頁」專案，輸入：

```text
/update-report
```

或直接輸入「依 AGENTS.md 執行每日更新」。這就是目前電腦已可使用的方式，不需要為此另外安裝 CLI。

### 需要從 PowerShell 非互動啟動 OpenCode

只有這種模式才需要另外安裝 `opencode` CLI，然後在本專案根目錄執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-OpenCodeDailyUpdate.ps1
```

OpenCode Desktop 日常只需在主工作階段執行 `/update-report`。命令檔會在執行前明確切換至 **Build 主代理**，依序完成一次預檢、一次 `Start-ProfessionalScreenUpdate.ps1`，再以 `Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60` 每 60 秒讀取同一個 state／RUN_LOG；每次 Shell 返回後，Build 必須立即把進度轉成可見回報。當輸出 `FINAL_RESULT_READY=true` 時，Build 必須停止工具呼叫，在同一主回覆逐項呈現 `FINAL_*` 終態欄位；若缺少該標記，即使 state 顯示 published，也只能回報 `OPEN_CODE_FINAL_REPORT_PENDING`，不得宣稱使用者已收到完整結果。Status 呼叫必須循序、不可平行，也不得再次 Start；這不是第二份更新程序。命令列或非互動 fallback 才使用單一 `Invoke-ProfessionalScreenUpdateCommand.ps1` 控制器。不得讓使用者只看到「思考中」或未完成待辦。<!-- OPENCODE_PROGRESS_OUTPUT_V3 --> 若畫面底部出現 `Subagent sessions cannot be prompted`，該頁是子代理結果頁，必須先按 **Back to main session**；不可在子代理頁面輸入任何命令。`/update-report-status` 可在原對話關閉後查詢既有工作的同一套 Status 入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60
```

## 目前已授權 OpenCode 接手的功能任務

使用者已於 2026-08-06 明確授權 OpenCode 規劃、實作、驗證並發布「短／中／長期評分明細介面」。在 OpenCode Desktop 的主工作階段輸入：

```text
/implement-horizon-ui
```

此命令使用具完整專案權限的 Build 主代理。它可以修改本次功能所需的來源、文件與驗證器，並必須在同一工作階段完成測試、提交、推送、Pages 發布與線上驗證；不可只輸出規劃。完整且具約束力的需求保存在 `.opencode/commands/implement-horizon-ui.md`。<!-- OPENCODE_HORIZON_UI_HANDOFF_V1 -->

本次功能的核心邊界如下：

- 短期為 1–20 個交易日（約 1 日至 1 個月）、中期約 1–6 個月、長期 1 年以上且價值投資宜觀察 3–5 年以上。
- 同一明細視窗使用三個頁籤，一次只顯示一套構面；中期為預設頁籤與唯一排名主軸。
- 短期只解釋時機，長期只作企業品質與估值初篩；頁籤及跨尺度解讀不得改變分數、排名、今天動作或任何硬門檻。
- 長期資本配置品質 15 分維持「尚未計分」，不得顯示為 0 分或冒充完整價值評估。
- 完成後必須更新兩支 PowerShell 驗證器與 `design-qa.md`，並以實際桌機、手機及線上 Pages 驗證收尾。

### 評分明細 UI 契約

同一分數明細視窗提供短期時機、中期研究／排名主軸、長期初篩三頁籤，預設中期；短期範圍為1–20個交易日，中期約1–6個月，長期為1年以上且價值投資宜觀察3–5年以上。每頁顯示既有構面、實得／最高、證據、來源、改變條件與下一次檢查時間。頁籤與跨時間尺度解讀只解釋分數，不改變排名、今天動作、新部位、持有動作或硬門檻；長期資本配置品質15分尚未計分，方法覆蓋固定85%。<!-- HORIZON_SCORE_DETAIL_UI_V1 -->

## 必須一起交接的檔案

最安全的方式是直接複製完整 Git 儲存庫，或在新電腦執行 `git clone https://github.com/fricachai/pro_ranking.git`，不要挑檔複製。下列檔案是交接核心：

| 類別 | 檔案 | 用途 |
|---|---|---|
| OpenCode 規則 | `AGENTS.md` | 資料邊界、評分保護、完成條件與禁止事項 |
| OpenCode 權限 | `opencode.json` 與全域 `C:\Users\user\.config\opencode\opencode.jsonc` | Build 主代理可完整規劃、編輯、測試、查網路、提交、推送、發布與處理一般外部專案路徑；敏感資料邊界仍優先 |
| OpenCode 指令 | `.opencode/commands/update-report.md`、`update-report-status.md`、`implement-horizon-ui.md`、`continue-codex-handoff.md` | 提供日常更新、狀態查詢、功能開發及 Codex 寫回後的接手指令 |
| 交接說明 | `OPENCODE_HANDOFF.md` | 安裝、執行、驗證、來源與故障處理 |
| CLI單鍵入口 | `scripts/Invoke-OpenCodeDailyUpdate.ps1` | 先做交接預檢，再以CLI非互動呼叫 OpenCode；Desktop 不需要此檔來啟動 |
| 交接預檢 | `scripts/Test-OpenCodeHandoff.ps1` | 檢查工具、登入、遠端、分支、檔案、資料契約與線上頁面 |
| Codex→OpenCode 接手驗證 | `scripts/Sync-OpenCodeObsidianHandoff.ps1` | 每次 Obsidian 寫回後確認三份指示、Build 權限與現行契約，輸出 `HANDOFF_READY=true` |
| 背景更新啟動 | `scripts/Start-ProfessionalScreenUpdate.ps1` | 以獨立 PowerShell 程序啟動完整更新，避免 Shell 等待上限中止工作 |
| 背景更新狀態 | `scripts/Get-ProfessionalScreenUpdateStatus.ps1` | 回報 running、published 或 failed 與紀錄檔位置 |
| 每日管線 | `scripts/Update-ProfessionalScreen.ps1` | 抓取、重算、驗證、提交、推送與 Pages 驗證 |
| 事件新聞 | `fetch-events.js` | 籌碼小宇事件、官方重大訊息、Yahoo 新聞、去重與選配 AI 摘要 |
| 分析核心 | `full-professional-stock-screen.js` | 全部市場資料抓取、特徵、評分、風險門檻與報告生成 |
| 發布首頁 | `index.html` | GitHub Pages 首頁，由每日管線自動生成，不得手改 |
| 目前資料 | `professional-screen-report/latest.json` | 最新完整分析資料與各來源日期 |
| 事件快照 | `professional-screen-report/events/latest-events.json` | 最新事件、新聞、來源狀態與抓取時間 |

`.git` 目錄包含版本歷史與遠端設定；若以 `git clone` 取得就會自動建立。登入憑證、API 金鑰、瀏覽器持倉與登入狀態不屬於交接檔案，禁止提交到 Git。

`opencode.json` 明確使用 Windows `powershell.exe`，並依使用者授權讓 Build 主代理具備完整專案權限：可規劃、直接編輯、執行 Shell 與測試、查詢網路、提交、推送及發布。專案不鎖定模型，使用者可在 OpenCode 自行選擇 GPT‑5.6 Luna、Kimi K3 或其他可用高階模型。一般外部專案路徑可直接處理；敏感資料、未授權破壞性操作與發布前完整驗證仍依全域安全政策及 AGENTS.md。日常 `/update-report` 只是快捷入口，若更新失敗可以在同一 Build 工作階段修正程式與流程，不受「只跑更新器」限制。全域設定與 Build 覆寫均採 allow，OpenCode 的匹配以最後規則為準。<!-- OPENCODE_BUILD_FULL_ACCESS_V1 -->

## 新電腦一次性準備

1. 安裝 Node.js 18 以上、Git、GitHub CLI，以及 OpenCode Desktop 或 OpenCode CLI 其中一種。
2. 如果使用 OpenCode Desktop，直接在桌面版加入本專案即可，不需要 `opencode` 命令出現在 PATH。
3. 只有需要排程或從 PowerShell 非互動啟動時，才用官方支援的 NPM 安裝 CLI：

   ```powershell
   npm install -g opencode-ai
   ```

4. CLI 模式需登入 OpenCode 的模型供應商；Desktop 模式沿用桌面版已設定的帳號與模型：

   ```powershell
   opencode auth login
   opencode auth list
   ```

5. 登入 GitHub，帳號必須能推送 `fricachai/pro_ranking`：

   ```powershell
   gh auth login
   gh auth status
   ```

6. 第一次執行完整預檢。預檢會接受 Desktop 或 CLI 任一安裝方式：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
   ```

只有最後出現 `HANDOFF_READY=true` 才算可以交接執行。

若要特別確認非互動 CLI 也可用，增加 `-RequireCli`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1 -RequireCli
```

## 每次更新會重新抓取什麼

| 資料層 | 來源與處理 |
|---|---|
| ETF 持股 | B 級籌碼小宇 ETF 持股快照；以 TWSE／TPEX 官方主檔辨識臺灣上市／上櫃普通股；20日只作背景、10日確認延續、5日觀察轉折 |
| 法人與外資 | 證交所 T86、官方外資持股；買賣流量與持股存量分開 |
| 基本面與估值 | 證交所／公開資訊觀測站月營收、季報、EPS、估值、日行情 |
| 市場與技術 | TWSE／TPEX 日行情、Yahoo 日K高低收、EMA、RSI、MACD、標準 KD 與乖離 |
| 交易與事件風險 | 融資融券、借券、集保，以及重大營運／財務訊息 |
| 宏觀 | 經濟部外銷訂單與工業生產、中央銀行匯率／利率／貨幣供給 |
| 事件 | 籌碼小宇庫藏股、處置，以及官方重大營運／財務訊息 |
| 新聞 | 最多 500 檔股票、每檔最多 5 則 Yahoo Finance RSS；標示待確認，不直接計分 |

### ETF 母體與資料新鮮度（本次對話完成版）

- 研究母體是當次 ETF 快照中，與 TWSE／TPEX 官方證券主檔相符的所有臺灣上市／上櫃普通股；先前「473 檔上市」只是當時 TWSE 子集合，不能再當成完整母體。
- 全球型 ETF 的海外四碼代碼保留在來源稽核，卻不補造臺股資料或排名。官方主檔只確認市場別；未逐檔對帳基金公司／投信官方檔案前，ETF 持股仍是 B 級，不得稱為全部官方持股。
- 落後 ETF 的持股保留避免漏股，但個股須顯示 `laggingExposure` 的資料健康限制，流向不可宣稱全體同日完整。`lagging_etfs` 與實際 `updated=false` 清單不一致時，產生器必須停止；主動 ETF 當日不完整時 A 級必為 0。
- 上櫃若沒有官方外資持股 5／10 日歷史，只可標示「部分可比」且不給該趨勢分，不能當成籌碼轉弱。資料健康度不進入任何分數或乘數。<!-- ETF_UNIVERSE_FRESHNESS_V1 ETF_FRESHNESS_EXPOSURE_V1 -->

新聞會去重、保留來源連結與抓取時間，並與個股報告一起呈現。沒有 AI 金鑰時仍會完成新聞彙整；若另以環境變數提供 `AI_PROVIDER`、`AI_API_KEY`，才會對新事件加上選配的 AI 影響摘要。任何 AI 摘要仍不得直接改變評分。金鑰只能放在使用者環境變數，不可寫進本專案。

### 治理資料排除規則

董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。原始事件來源若仍含內部人異動，只是為了維持來源檔契約與可追溯性，OpenCode 不得把它重新接回投資判斷或醒目揭露。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->

### 官方外資持股的固定抓取與判讀規則

- `MI_QFIIS` 最近 45 個日曆日採逐日循序查詢並保留短暫延遲。2026-07-21 曾因多日期並行查詢暫時只取得 10 個有效交易日；改為循序查詢後，同一官方來源取得 24 日，證明這不是官方只能提供 10 日。
- 10 日變化需要目前快照與第 10 個交易日前快照，因此最低門檻是 11 個有效交易日。不得為完成更新而放寬、補值或縮短後仍稱為 10 日。
- 只有無結構性異動且具完整 5／10 日資料的 `trendReliable=true` 個股，外資持股趨勢才可參與評分與風險判斷。
### 官方 T86 與 Windows runner 執行契約

- T86 最近 45 個日曆日必須逐日循序查詢並保留延遲；暫時失敗日期最多重試三輪，不得使用 4 路並行。
- T86 歷史優先使用官方有效資料；至少要有 5 個官方有效交易日，報告驗證器仍須拒絕不足的正式歷史，不得降低門檻或冒充當日資料。
- 每次成功報告都必須包含 meta.foreignHoldingHistoryDays >= 11；若不足，管線應停止並檢查最大可查日期、週末／休市與暫時性限流後重試，不調整選股權重。
- Node stderr 只保留在 run log；PowerShell runner 以 Node exit code 判斷成功或失敗，不能把正常 retry 診斷轉成 NativeCommandError。交接預檢必須執行 scripts/Test-ProfessionalScreenPowerShellBoundary.ps1。

### 三時間尺度評分與資料健康度

- 現行模型版本是 `HORIZON_SCORE_V2`。每檔股票必須同時輸出 `horizonScores.short`、`horizonScores.medium`、`horizonScores.long` 與 `dataHealth`。
- 只有中期研究分數用於排名，並映射到相容欄位 `score`。短期分數只回答時機；長期分數只作初篩，不得各自建立另一套排名或直接買賣動作。
- 長期初篩目前方法覆蓋率固定為85%，另有15%的資本配置品質因尚缺完整自由現金流、ROIC與資本配置紀律而不計分；不得把正規化後的100分稱為完整長期價值分數。
- `dataHealth` 不進入任何分數、風險分數或分數乘數；低於65%仍屬硬性淘汰。發布驗證必須確認 `score` 等於 `horizonScores.medium.score`、所有分數介於0至100、長期 `methodCoverage=85`。
- 本益比不得與盈餘殖利率重複計分；營收不得同時放入事件催化；畫面使用整數分數，JSON可保留一位小數。
- 季報申報切換時，本次官方端點有資料者使用本次資料；未回傳者只可沿用日期版報告中同季或前一季的已驗證官方快照。每檔必須揭露 `financialPeriod`、`financialSourceMode`、`dataHealth.freshnessPenalty`、`dataHealth.missingCore`、`dataHealth.staleCore` 與長期 `dataCoverage`；同季快照扣5點資料健康度，前一季快照扣10點，歷史快照不得跨越一季，也不得冒充本次新取得資料。
- 發布驗證必須確認 `financialCurrentCount + financialFallbackCount + financialUnavailableCount = stockCount`。個別計分證據缺漏時該證據不給分，不得以中性預設值墊高分數。

### 離線策略驗證與 V3 實驗邊界

- 新因子、權重或核心／衛星配置先使用 `node .\scripts\Backtest-HorizonStrategy.js`，不得直接改動正式 `HORIZON_SCORE_V2`。
- 正式發布流程會由 `Capture-HorizonBacktestSnapshot.js` 自動建立 close-only point-in-time 快照；工具只讀取 `professional-screen-report/backtest-snapshots/`，舊模型及盤中／隔日快照會明確排除，並揭露交易成本、資料日期、快照間隔、benchmark 與樣本長度。
- `insufficient_data` 只能表示資料不足，不能解讀成策略失敗或成功；`shadow-qvm` 是非生產實驗，不代表已完成 ROIC、自由現金流或 12 個月動能因子。
- 升級 `HORIZON_SCORE_V3` 前，必須完成含未來資料隔離、交易成本、存活者偏誤控制、完整市場階段及大盤 ETF 基準的樣本外驗證。<!-- STRATEGY_VALIDATION_V1 -->

### 持股決策總覽與純 UI 維護

- 決策卡的閱讀順序固定為「目前狀態 → 今天動作 → 下一次確認 → 執行觀察區 → 改變條件 → 原因」。盤中跌破只顯示「保護持有／盤中待收盤」，不得直接當成確認減碼。
- `POSITION_ACTION_PRIORITY_V2`：每檔既有部位依「重大事件／基本面硬風險 → 價格技術結構 → 法人籌碼」判斷。法人中兩項偏弱但價格仍在20／60日EMA之上，不得直接變成「降低部位」；漲停或強勢確認且無硬風險時，顯示「正常持有／續抱、不追價」，籌碼分歧只作觀察。只有價格結構破壞且法人同步轉弱，或硬風險成立，才觸發降低部位／優先降低風險；新部位門檻維持獨立。
- 觀察價位使用符合台股跳動單位的區間呈現；底層仍以原始EMA執行判斷。區間是決策支援，不是保證成交、自動停損或精準預測。
- 摘要的四類動作與每張卡必須共用 `positionDecisionMeta`。驗證時確認摘要數量、個股代號與卡片分類一致，並測試成本保存、完整依據展開及「我尚未持有」錨點。
- 純 UI／文案修改可在不抓新資料的前提下執行 `node .\full-professional-stock-screen.js --render-existing`；既有JSON必須已是 `HORIZON_SCORE_V2`。此模式會同步重產日期版 HTML、`latest.html` 與 `index.html`，但不得被回報為資料已更新。
- 同一日可以重複執行 `/update-report`。舊的 `published/YYYYMMDD` 只是歷史紀錄，不再阻擋來源檢查；每次都會重新抓取盤中行情、新聞、重大訊息與其他來源。<!-- INTRADAY_REFRESH_V1 -->
- 決策卡中等寬度（761–1180px）採「標的摘要／今天動作」上列與全寬決策區下列；下列並排下一次確認／執行觀察區／改變條件，以及主要原因／直接可見的持有計畫，禁止留下內容稀少的大面積原因空白區。900px 以下收為單欄，完整依據仍可展開。純 UI 調整後必測 1050×900 與 390×844，無頁面級水平溢出與 console warnings 才可發布。<!-- POSITION_CARD_RESPONSIVE_DENSITY_V1 -->
- 更新器會排除純生成／抓取時間戳後比較報告指紋，但每次成功檢查都會提交本次報告與事件檢查時間、發布並建立 `published/YYYYMMDD-HHmmss` 稽核標籤。`DATA_CHANGED=false` 代表沒有實質內容變化，不得說成失敗。<!-- REFRESH_TIMESTAMP_V1 -->
- Yahoo RSS 是 C 級待確認資訊；若 429 限流造成部分或全部失敗，事件檔必須揭露 `partial` 或 `unavailable`、成功率與限流數，但仍以本次重新取得的官方重大訊息與結構化事件完成報告。不得沿用舊新聞冒充本次抓取。<!-- OPTIONAL_YAHOO_NEWS_V1 -->
- 只要涉及資料來源、資料日期、評分、排名、動作規則或品質門檻，就不得使用純 UI 例外流程。
- 本機登入、成本、追蹤部位與測試狀態不得進入 Git 或 Obsidian；只保存功能規格、測試方法與不含個資的結果。

## 防止錯誤發布的關卡

每日管線會在下列任一情況停止，不會拿舊資料更新網站：

1. 工作區有未提交變更，或本機 `main` 與 `origin/main` 不一致。
2. Node.js、Git、GitHub CLI、GitHub 登入或遠端儲存庫不正確。
3. 結構化事件或官方重大訊息抓取失敗。
4. ETF 股票代號少於 300，或 Yahoo 新聞未實際嘗試／來源狀態未揭露。Yahoo 成功率低於 80%本身不是失敗。
5. 報告沒有使用本次剛抓取的事件新聞檔。
6. 官方法人、外資持股（含至少 11 個有效交易日）、信用交易、集保、標準 KD、股票數或決策欄位不符合資料契約。
7. 生成檔出現預期外變更、提交失敗、推送失敗或 GitHub Pages 未部署同一提交。
8. 線上頁面 HTTP、資料日期或必要畫面標記驗證失敗。
9. 預檢在事件抓取開始前失敗後，既有 `latest-events.json` 被改動；此情況必須以 `PRECHECK_PRESERVES_EVENT_FILE=PASS` 回歸檢查防止。<!-- EVENT_PREFLIGHT_PRESERVATION_V1 -->

### Pages artifact 與本機 hash 的換行格式誤判

若 `deploy-pages.yml` 的 `pages_build_version` 已等於目前 HEAD，workflow 為 `completed/success`，且下載的 artifact `index.html` 與線上頁面 hash 相同，但本機 hash 不同，先檢查 Jekyll 將 CRLF 正規化為 LF 的差異。此情況標記為 `PAGES_LINE_ENDING_FALSE_MISMATCH_V1`：不是 CDN 尚未傳播，不得重抓資料、製造空白 commit、跳過預檢或直接執行 `Update-ProfessionalScreen.ps1 -Publish`。預檢器應先正規化換行再比較內容，並保留 workflow SHA、HTTP、必要頁面標記與資料契約驗證。

## 成功後的完成證據

OpenCode 必須依結果回報：

- 成功：`STATUS=published`、`CHECKED_AT`、`DATA_CHANGED`、來源日期、Yahoo 新聞狀態、外資持股有效交易日數、股票數、前三名、新 Git 提交、`PUBLISHED_TAG`、公開網址與紀錄檔。
- `DATA_CHANGED=false` 時要明確說明「來源已重新檢查，實質內容未變；本次檢查時間已發布」。
- 所有成功更新都必須確認治理資料排除與資料品質閘門通過。

此外，工作區必須乾淨，本機 `HEAD` 必須等於 `origin/main`，GitHub Pages 最新建置提交也必須是同一版本。

## 已知限制

- Yahoo Finance 新聞是 C 級待確認資訊，不是官方證據，也不直接加減分。
- 法說會目前只從官方重大訊息文字中的「法人說明會／法說會」辨識，不等於完整法說會資料庫。
- 券商一致預估、目標價、完整自由現金流與使用者個人持倉成本仍未取得。
- 網路來源若停機或改欄位，管線會停止等待修復；OpenCode 不得自行降低門檻或編造替代資料。
- 持倉追蹤位於瀏覽器 `localStorage`；換電腦或瀏覽器前須由使用者自行匯出 JSON，且不得提交到公開儲存庫。

## 2026-09-19 跨 Agent 接手：國際資料與股票決策關聯 UI

### 使用者目標

國際市場區塊目前只有數值與折線圖，使用者看不出與股票策略分析及買賣決策的關聯。介面必須讓投資人一眼理解每組資料的用途、可支持的判斷與不可過度解讀的限制。

### 權威設計邊界

- 國際資料是獨立的環境濾網，不是個股買賣訊號。
- 不得改變 `HORIZON_SCORE_V2`、排名、`entryAction`、`holdingAction`、`todayAction`、`nextCheck` 或任何硬性門檻。
- 三組用途固定為：進場節奏、產業／資金確認、事件風險檢查。
- 所有指標需同時顯示「對決策的作用」；期貨部位、公告與匯率等資料仍需揭露限制，不能單獨翻譯成買進或賣出。

### 目前工作狀態

- 已修改：`international-ui.js`。
- 已加入：國際區塊總說明、三步決策地圖、主要卡片的「對決策的作用」、半導體／能源／法人部位用途說明、事件公告的風險檢查說明。
- 已追加：每張指標卡的「簡單判讀」，明確使用「可找符合條件個股／先觀望、不新增部位／提高警戒／不可單獨買賣」語意；美元／臺幣等指標不再只提供抽象的資金壓力說明。
- 已追加：區塊上方的簡易判讀圖例，以及所有主卡／展開卡統一使用「目前建議：……」句型，讓中性狀態也明確說明「先不因該指標買進或賣出」。
- 已修正：期交所匯率／臺指期端點偶發 HTTP 403 的資料補強；匯率保留官方來源並加入 Yahoo 日行情替代參考，臺指期加入日期參數、標準請求標頭與重試。stale 資料採保守判讀，前台不再以「資料不足」取代台股方向建議。<!-- INTERNATIONAL_CONTEXT_FALLBACK_V1 -->
- 已同步規則：`AGENTS.md` 已加入 `INTERNATIONAL_CONTEXT_DECISION_GUIDE_V1`。
- 已完成：純 UI 重產、Node 語法檢查、`INTERNATIONAL_CONTEXT_TESTS=PASS`、1050×900／390×844 瀏覽器 QA、`design-qa.md` 紀錄；兩種尺寸均無頁面級水平溢出，console errors/warnings 為 0。
- 已發布：提交 `ebcce3562fc84eb98ebfb27e774c308f164fdf09` 已推送 `origin/main`；Pages workflow run `35434394717` 成功，線上 byte match 通過，正式網址為 `https://fricachai.github.io/pro_ranking/`。

### 下一個 Agent 直接接手

1. 先確認 `git status --short --branch`，不得清除或覆寫非本次任務變更。
2. 執行 `node --check .\international-ui.js` 與 `node --check .\full-professional-stock-screen.js`。
3. 以既有 `HORIZON_SCORE_V2` 報告執行 `node .\full-professional-stock-screen.js --render-existing`；不得直接手改生成 HTML，也不得重新抓資料冒充每日更新。
4. 若需重驗，啟動本機 HTTP server，以至少 1050×900 與 390×844 檢查三步決策地圖、卡片用途文字、折疊區說明、頁面級水平溢出與 console warnings。
5. `design-qa.md` 已記錄本次來源／實作、尺寸、互動、console、水平溢出與 `Final result: passed`。
6. 若後續再次修改本區塊，依純 UI 發布契約完成限定檔案提交、Pages workflow、線上內容與 byte-match 驗證；Build 可依根因選擇底層腳本，正式發布優先使用受控控制入口。

<!-- INTERNATIONAL_CONTEXT_DECISION_GUIDE_V1 -->

## 2026-09-19 新手版國際市場快速判讀 UI

### 使用者目標

使用者要求國際市場區塊版面與圖面更簡單、容易吸引一般人閱讀，並能快速回答「現在適不適合新增部位」與「已持有時先看什麼」。

### 本次已完成

- `international-ui.js` 新增「給不熟投資的人」方向框，依 `summary.regime` 顯示「可找個股／先觀望／先保守／資料不足」，並分開呈現尚未持有與已經持有的行動提示。
- 新增三組快速摘要：市場氣氛、半導體與能源、外資與利率；每組都同時顯示數值、資料日期、簡短判讀與限制。
- 明確揭露「沒有同口徑全球能源法人持倉」與「淨空單不等於現貨賣股」，避免把目前可取得的廣泛期貨資料誤解成產業法人真實持倉。
- 新增折線圖讀法提示，說明上升／下降只表示近期變化，不能單獨決定買賣。
- 以 `node .\full-professional-stock-screen.js --render-existing` 同步重產 `index.html`、日期版 HTML 與 `latest.html`；沒有重新抓資料，沒有修改 `HORIZON_SCORE_V2`、排名、個股動作或硬性門檻。
- `design-qa.md` 已記錄 1050×900、390×844、折疊區、來源表格、水平溢出與 console QA，結果為 passed。

### 保留與排除

- 保留現有官方來源、資料日期、證據級別、時效與限制；國際區塊仍是獨立環境濾網。
- 不把 CFTC 金融期貨部位說成半導體／能源法人現貨部位；若未來納入同口徑產業部位，必須先完成官方資料契約、時效與回測驗證。
- 不保存帳號、密碼、token、cookie、個人持股成本或其他受保護資料。

### 下一步與未驗證項目

- 待完成限定檔案 commit、推送 `origin/main`、Pages workflow 與線上內容驗證。
- 待線上驗證新標記、三組快速摘要、1050／390 寬度與 console 0；完成前不得宣稱網站已發布本次 UI。

<!-- INTERNATIONAL_CONTEXT_BEGINNER_GUIDE_V1 -->

## 2026-09-19 使用者回饋後：台股方向與個股操作改為直接結論

### 使用者修正要求

原本「可找個股」「不可單獨買賣」「等待承接條件」等語句不夠具體。前台必須直接回答台股目前偏多、偏空或中性偏保守，並且說明新資金與已持有部位現在要做什麼；個股也必須列出實際價格區間、ETF 方向與外資持股方向。

### 本次已完成

- `international-ui.js` 新增可重現的國際方向判讀：使用 S&P 500、VIX、費城半導體、美元／臺幣、10 年債殖利率與外資臺指期近 5 筆／水位，分成「偏多／中性偏保守／偏空／資料不足」。
- 頁面先顯示「台股執行結論」，再顯示尚未持有與已經持有的明確做法；目前報告的結論是「中性偏保守：不適合追買，也沒有足夠證據全面賣出」。
- 每個主要國際指標改用「對台股：……」直接說明支持買進、支持維持或支持保守；不再把數值後面只接抽象的「回看個股條件」。
- 個股快速卡改為四種直接動作：現在可分批買、現在不追價／等價格回到區間、維持持有、現在減碼。6770 範例會顯示 `74.00` 高於 `70.10–70.90`，因此明確顯示「現在不追價：等回到 70.10–70.90 再分批買」。
- 個股理由直接列出 ETF 5 日與外資持股 5 日數值及偏強／偏弱／分歧結論；操作對照也固定顯示在快速操作區上方。
- `AGENTS.md` 已同步規則：國際區塊可提供環境方向結論，但不得改寫個股評分、排名、動作欄位或硬性門檻。

### 驗證與限制

- 已以 `--render-existing` 重產頁面；沒有重新抓資料，也沒有改動 `HORIZON_SCORE_V2`。
- `INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、兩個 Node 語法檢查通過。
- 1050×900 與 390×844 實際瀏覽器檢查：方向結論、6770 個股卡、三組摘要可讀，console errors/warnings 為 0，無水平溢出。
- 已完成 commit `2f2898b`、推送 `origin/main` 與 Pages workflow `35442315388`；線上 HTTP 200、方向結論、三組摘要、1050／390 寬度與 console 0 均已驗證，公開網址為 `https://fricachai.github.io/pro_ranking/`。

<!-- INTERNATIONAL_DIRECT_ACTION_GUIDE_V2 -->

### 長期解讀補強

- `full-professional-stock-screen.js` 的長期初篩解讀已改成直接句子：可列入長期研究、不列入長期優先、目前不買，或依個股卡維持／減碼；仍不改正式分數與動作計算。
- 本次待以最新工作區 commit 完成推送與 Pages 驗證。

## 2026-09-19 個股 entryPlan 文字契約補強

- `entryPlanText` 已改為輸出目前價格與實際區間，並直接說明「現在不追價／現在可分批買／現在不買」。
- 同時列出 ETF 總持有、主動 ETF 與外資持股 5 日增加／減少張數及偏強／偏弱結果；未來每日更新不再產生「只有未轉弱才考慮下一批」這類沒有數值的句子。
- 本次仍只改判讀文字，不改評分、排名、門檻或個股決策計算；純 UI 重產與資料契約驗證已通過。
- 待完成最新 commit、推送與 Pages 驗證。

## 2026-09-20 每日更新長時間執行與即時 log 修正

### 已確認原因

- 受控更新不是單純檢查；本次實際重新抓取 500 檔 Yahoo RSS、578 檔股票的法人／外資／信用／KD／財務／估值／行情與國際資料，完整流程約 14 分鐘。
- 先前 `Invoke-NodeLogged` 使用 `@(& node ...)`，會等 Node 程序結束後才把輸出寫入 `RUN_LOG`。因此外層控制命令長時間只顯示事件階段，看起來像卡住；外層 Shell 120 秒等待上限也可能先結束等待，但背景更新仍繼續。

### 已修正

- `scripts/Update-ProfessionalScreen.ps1` 的 `Invoke-NodeLogged` 已改為逐行串流 Node stdout／stderr 到 `RUN_LOG`，並保留原本以 Node exit code 判斷成功／失敗的 fail-closed 行為。
- `AGENTS.md` 已加入即時 log 串流規則，避免其他 Agent 恢復成整批緩存。
- `scripts/Test-ProfessionalScreenPowerShellBoundary.ps1` 已實測 `POWERSHELL_BOUNDARY_TEST=pass`、成功 exit code 0、失敗 exit code 1。

### 下一步

1. 提交本次 runner／交接規則修正後，命令列以 `Invoke-ProfessionalScreenUpdateCommand.ps1` 完整重跑；OpenCode Desktop 以 `Start` 一次、`Get-Status -WaitSeconds 60` 依序回報。
2. 每次更新只能有一個背景 runner；Status Shell 只能是對既有 runner 的循序唯讀觀察，不得平行或另建第二份更新。
3. 回報時分開列出資料更新總時間、`RUN_LOG`、Pages byte match 與 Actions 稽核狀態。

### 2026-09-20 實際復驗結果

- 修正後以唯一受控入口完成完整更新，`STATUS=published`、`EXIT_CODE=0`。
- 即時 `RUN_LOG` 已在執行中顯示事件完成、報告產生完成、發布與 Pages 等待階段；不再等 Node 結束後才一次寫入。
- 本次發布報告提交 `c7a5be7502ef4b87352b947331e03ff78d9a58b3`，稽核標籤 `published/20260920-094908`。
- 外資持股有效交易日 11 日、Yahoo 新聞 complete、coverage 100%、股票數 578；Pages byte match 與 Actions 稽核均通過。
- `RUN_LOG`：`professional-screen-report/logs/daily-refresh-20260920-094420.log`。

<!-- UPDATE_RUNTIME_STREAMING_V1 -->

## 2026-09-20 OpenCode 全域 Build 能力與失敗復原契約

### 使用者已再次確認的目標

- 所有 OpenCode 專案與所有對話，都要具備與 Codex 相同的完整工程能力：需求理解、規劃、讀取、網路查詢、跨檔案／跨層級編輯、Shell、測試、失敗診斷、根因修正、提交、推送、發布與線上驗證。
- `/update-report` 只是日常更新入口，不是 OpenCode 的能力上限。
- 單一來源失敗不得讓整體判讀變成模糊拒答；必須採用官方替代端點、日期回補、重試、第二來源或前次已驗證快照，並給出明確方向與操作。
- 不得在公開畫面顯示「資料不足」、「資料待更新」、「無法判定」等沒有行動價值的句子。

### 已完成的全域與專案修正

- `C:\Users\user\.config\opencode\opencode.jsonc` 已將一般 Build 工具能力設為 allow：讀取／編輯、glob／grep／list、Shell、子代理、skill、LSP、webfetch／websearch、提問、外部專案路徑與 doom-loop；敏感檔案的檔案級 deny 與全域資料邊界政策保留。
- `C:\Users\user\.config\opencode\AGENTS.md` 已加入 `OPENCODE_GLOBAL_BUILD_CAPABILITY_V1`，明定所有專案／對話的自主修正與失敗復原契約。
- 本專案 `opencode.json` 已移除專案級預設 deny；Build 主代理的 Bash、編輯、網路、規劃、子代理、skill、外部路徑與發布均 allow，不再有 `Update-ProfessionalScreen.ps1 -Publish` 的 deny 規則。
- `AGENTS.md`、本交接檔、`.opencode/commands/update-report.md`、`.opencode/commands/update-report-status.md` 與 `scripts/Test-OpenCodeHandoff.ps1` 已加入／驗證 `OPENCODE_AUTONOMOUS_REPAIR_V1`。
- `scripts/Sync-OpenCodeObsidianHandoff.ps1` 已同步接受完整 Build 與外部專案路徑能力；OpenCode 設定檢查已通過。
- `international-context.js`、`international-ui.js`、`full-professional-stock-screen.js` 已將單一來源缺失改為採可驗證訊號與明確操作，並清除首頁／最新報告的模糊拒答字眼。既有報告以 `--render-existing` 重產，不重新抓取資料、不改 `HORIZON_SCORE_V2`、排名、11 日門檻或個股硬性規則。

### 實際驗證結果

- `node --check international-context.js`、`international-ui.js`、`full-professional-stock-screen.js`：通過。
- `node scripts/Test-InternationalContext.js --report professional-screen-report/latest.json`：`INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`。
- `scripts/Test-OpenCodeHandoff.ps1 -SkipOpenCode -SkipLive -AllowDirty`：`HANDOFF_READY=true`，`FOREIGN_HOLDING_HISTORY_DAYS=11`、`NEWS_FEED_COVERAGE=100%`。
- `scripts/Sync-OpenCodeObsidianHandoff.ps1 -CheckOpenCodeConfig`：`HANDOFF_READY=true`、`BUILD_PERMISSION=full-project-with-guardrails`、`RELOAD_REQUIRED=true`。
- 首頁與 `professional-screen-report/latest.html` 掃描：`資料不足=0`、`資料待更新=0`、`無法判定=0`、`暫不提供=0`。

### 完成狀態與下一步

- 本次能力與判讀修正已提交 `ac4bbe9ec51bf928c78c35c573db0157015f0bf2`、推送 `origin/main`，Pages workflow `35496218879` 成功；`PAGES_CONTENT_BYTE_MATCH=True`，正式網址已同步。
- 本次沒有重新抓取市場資料；正式資料更新仍須維持 `MI_QFIIS` 至少 11 個有效交易日與其他硬性門檻。下一個 OpenCode 主工作階段必須重新載入全域設定與本專案規則；若更新失敗，直接依 `OPENCODE_AUTONOMOUS_REPAIR_V1` 修正，不要只回報失敗或另建第二份背景更新。

<!-- OPENCODE_GLOBAL_BUILD_CAPABILITY_V1 -->

## 2026-09-20 國際資料最近營業日回溯與前期比較修正

### 使用者要求與根因

- 使用者指出美元／臺幣、外資臺指期與亞洲匯率卡片顯示「尚無前期比較」或日期空白，要求所有需要比較的資料都必須抓取上一個已結束營業日，不得把週末／休市日誤判成沒有資料。
- 根因是期交所外資期貨 JSON 端點接受日期參數但實際回傳同一筆最新資料；原程式重複查詢同一觀測日，無法建立前一營業日比較。匯率序列本身已有歷史資料，但來源日期回補欄位未明確保存。

### 已完成

- `international-context.js`：所有序列指標加入 `comparisonDate`、`comparisonValue`、`changeFromPrevious`；外資臺指期改用期交所官方「區分各期貨契約／依日期」查詢頁，以 `queryDate` 逐日回補，直到取得最新觀測與前一營業日，並保存 `observedAt`、`dateBackfillDays`、`historyRequestedThrough`。
- `international-ui.js`：移除「尚無前期比較」與「日期未知」顯示；卡片直接顯示資料日期、比較日期與變化值，回溯狀態有明確動作語意。
- `professional-screen-report/latest.json`、`full-professional-screen-20260918.json` 與對應 HTML／首頁已以本次官方國際資料快照重產；這是國際資料與介面補強，不冒充股票排名／基本面完整重抓。
- `scripts/Test-InternationalContext.js`：新增序列前期比較、期貨多日歷史與官方 HTML 解析回歸測試。

### 實際驗證結果

- 匯率：最新可用日 `2026-09-18`，官方序列可計算前期與 5 筆變化。
- 外資臺指期：最新可用日 `2026-09-18`，比較日 `2026-09-17`，淨部位 `-76,110` 口，較前一營業日 `+2,564` 口。
- 首頁與 `professional-screen-report/latest.html` 掃描：`尚無前期比較=0`、`日期未知=0`、`資料不足=0`、`無法判定=0`。
- `INTERNATIONAL_LIVE_RECONCILIATION=PASS`、`INTERNATIONAL_CONTEXT_TESTS=PASS`、`POSITION_DECISION_RULES_PASS`、`FETCH_RESILIENCE_TEST=pass`、`POWERSHELL_BOUNDARY_TEST=pass`。

### 保留邊界

- 不改 `HORIZON_SCORE_V2`、排名、個股動作、MI_QFIIS 至少 11 個有效交易日門檻或其他硬性資料門檻。
- 期貨資料仍是外資及陸資集合的 TX 未平倉部位，不能說成單一外資策略或現貨賣出訊號；畫面保留這項限制。
- 本次已提交 `4acd399a1a856d95e060fb8ab2b95ad2be76db38`、推送 `origin/main`；Pages workflow `35497230883` 成功，`PAGES_CONTENT_BYTE_MATCH=True`，線上已確認資料日期、比較日期與變化值，公開網址為 `https://fricachai.github.io/pro_ranking/`。

<!-- INTERNATIONAL_COMPARISON_BACKFILL_V1 -->

## 2026-09-20 OpenCode 可見進度模式改為 Start／Status 分段回報（目前有效版本）

### 修正目的與根因

- 單一長時間 Shell 即使底層 `RUN_LOG` 持續寫入，OpenCode Desktop 仍可能把整個工具回應緩衝到完成後才顯示，因此使用者只看到「思考中」。這是 OpenCode UI／Shell 回應渲染邊界，不是資料更新器沒有工作。
- 本專案不再把「只能一個 Shell、不能拆 Start／Status」當成 OpenCode Desktop 的前提。分段不是第二份更新，而是同一個 state／RUN_LOG 的可觀察介面。

### 目前有效操作契約

1. 先執行一次 `Test-OpenCodeHandoff.ps1` 預檢。
2. 再執行一次 `Start-ProfessionalScreenUpdate.ps1`；若回報已存在背景程序，禁止再次啟動，改為觀察既有 runner。
3. 依序執行 `Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60`，每次返回後立即呈現 `UPDATE_STAGE`、`UPDATE_PROGRESS`、`FINAL_RESULT_READY`、最後 log 階段與 `RUN_LOG`。
4. 直到 `STATUS=published` 或 `STATUS=failed` 且 `FINAL_RESULT_READY=true` 才停止；不得平行 Status、不得把長時間更新包回單一 Shell，也不得在沒有終態封包時宣稱完成。
5. `Invoke-ProfessionalScreenUpdateCommand.ps1` 保留作為命令列／非互動 fallback；兩種入口共用相同資料來源、硬性門檻、發布與線上驗證。

### 驗證與限制

- `OPENCODE_PROGRESS_OUTPUT_V3` 已同步寫入本專案 `AGENTS.md`、`OPENCODE_HANDOFF.md`、`.opencode/commands/update-report.md`、Status 命令與全域 OpenCode `AGENTS.md`。
- 本次只修改可見進度契約、交接文件與靜態驗證器，不執行或取消任何每日資料更新，不發布舊資料；下一個 OpenCode 主工作階段必須重新載入規則。

<!-- OPENCODE_PROGRESS_OUTPUT_V3 -->
