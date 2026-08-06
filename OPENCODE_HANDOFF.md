# OpenCode 執行交接手冊

## 結論

可以交給 OpenCode Desktop 或 OpenCode CLI 執行，但 OpenCode 是流程操作者，不是資料來源。實際資料抓取、新聞彙整、評分、產檔、Git 提交、推送與 GitHub Pages 驗證，全部由本專案既有腳本完成。只要新電腦具備必要工具與個人登入權限，OpenCode 可用單一指令完成完整更新。

## Obsidian 已設為新工作階段自動必讀

OpenCode 原本只有 Obsidian MCP 工具，不會因此自動掃描或讀取 vault。本專案現已在 `opencode.json` 的 `instructions` 同時載入本交接檔與下列 Obsidian SOP：

`G:\我的雲端硬碟\Obsidian\2ndbrain\Codex操作累積\pro_ranking上市股票專業選股系統-開發與部署SOP.md`

使用規則：

- 更新 `opencode.json`、`AGENTS.md` 或 Obsidian SOP 後，必須回到 OpenCode 主工作階段並開新對話；舊對話可能已經載入舊版指示。
- 換電腦或 Google Drive 磁碟代號改變時，只需更新 `opencode.json` 的 Obsidian 絕對路徑，再以 `opencode debug config` 確認 `instructions` 已出現。
- Obsidian 用來保存完整理由與歷史；實際執行以 repo 的腳本、驗證器與當前 `AGENTS.md` 為準。每次發現可重用的新做法時，必須同時更新 repo 與原 Obsidian SOP，不只留在對話中。<!-- OBSIDIAN_AUTOREAD_V1 -->

Pages 部署現統一由 `.github/workflows/deploy-pages.yml` 處理，不再把 legacy `pages/builds/latest` 當成成敗單一來源。預檢要等待 active Actions run，更新器推送前要再等待佇列排空；workflow 設為 `cancel-in-progress: false` 與 15 分鐘 deploy timeout。失敗時僅允許對原 workflow 執行一次 failed-job rerun，不重抓資料、不製造空白 commit。HTTP 200 與線上 byte match 代表內容上線；Actions 結論是獨立稽核狀態。任何代理都不得說「跳過預檢」並直接執行 `Update-ProfessionalScreen.ps1 -Publish`；OpenCode 權限已否決此命令，只允許單一控制入口。<!-- PAGES_DEPLOYMENT_LOOP_GUARD_V1 --><!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

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

OpenCode Desktop 日常只需在主工作階段執行 `/update-report`。命令檔會在執行前明確切換至 **Build 主代理**，並以單一 `Invoke-ProfessionalScreenUpdateCommand.ps1` Shell 項目完成預檢、背景更新、內部等待與終態輸出；不得由代理反覆建立 `Get-ProfessionalScreenUpdateStatus.ps1` Shell 項目。若畫面底部出現 `Subagent sessions cannot be prompted`，該頁是子代理結果頁，必須先按 **Back to main session**；不可在子代理頁面輸入任何命令。`/update-report-status` 只在使用者關閉原對話後需要查詢既有工作的備援：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1
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
| OpenCode 權限 | `opencode.json` | Build 主代理可完整規劃、編輯、測試、查網路、提交與發布；外部資料夾仍需確認 |
| OpenCode 指令 | `.opencode/commands/update-report.md`、`update-report-status.md`、`implement-horizon-ui.md` | 提供日常更新、狀態查詢及本次授權功能的快捷指令 |
| 交接說明 | `OPENCODE_HANDOFF.md` | 安裝、執行、驗證、來源與故障處理 |
| CLI單鍵入口 | `scripts/Invoke-OpenCodeDailyUpdate.ps1` | 先做交接預檢，再以CLI非互動呼叫 OpenCode；Desktop 不需要此檔來啟動 |
| 交接預檢 | `scripts/Test-OpenCodeHandoff.ps1` | 檢查工具、登入、遠端、分支、檔案、資料契約與線上頁面 |
| 背景更新啟動 | `scripts/Start-ProfessionalScreenUpdate.ps1` | 以獨立 PowerShell 程序啟動完整更新，避免 Shell 等待上限中止工作 |
| 背景更新狀態 | `scripts/Get-ProfessionalScreenUpdateStatus.ps1` | 回報 running、published 或 failed 與紀錄檔位置 |
| 每日管線 | `scripts/Update-ProfessionalScreen.ps1` | 抓取、重算、驗證、提交、推送與 Pages 驗證 |
| 事件新聞 | `fetch-events.js` | 籌碼小宇事件、官方重大訊息、Yahoo 新聞、去重與選配 AI 摘要 |
| 分析核心 | `full-professional-stock-screen.js` | 全部市場資料抓取、特徵、評分、風險門檻與報告生成 |
| 發布首頁 | `index.html` | GitHub Pages 首頁，由每日管線自動生成，不得手改 |
| 目前資料 | `professional-screen-report/latest.json` | 最新完整分析資料與各來源日期 |
| 事件快照 | `professional-screen-report/events/latest-events.json` | 最新事件、新聞、來源狀態與抓取時間 |

`.git` 目錄包含版本歷史與遠端設定；若以 `git clone` 取得就會自動建立。登入憑證、API 金鑰、瀏覽器持倉與登入狀態不屬於交接檔案，禁止提交到 Git。

`opencode.json` 明確使用 Windows `powershell.exe`，並依使用者授權讓 Build 主代理具備完整專案權限：可規劃、直接編輯、執行 Shell 與測試、查詢網路、提交、推送及發布。專案不鎖定模型，使用者可在 OpenCode 自行選擇 GPT‑5.6 Luna、Kimi K3 或其他可用高階模型。外部資料夾維持逐次確認；AGENTS.md 的不清除不明變更、不做未授權破壞性操作及發布前完整驗證仍然有效。日常 `/update-report` 雖由同一 Build 代理執行，但指令本身仍固定只跑受控更新器，不得藉機改碼。全域預設仍維持 deny，完整權限只在 Build 主代理覆寫。OpenCode 的匹配以最後規則為準。<!-- OPENCODE_BUILD_FULL_ACCESS_V1 -->

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
| ETF 持股 | 籌碼小宇 ETF 持股資料；20日只作背景、10日確認延續、5日觀察轉折 |
| 法人與外資 | 證交所 T86、官方外資持股；買賣流量與持股存量分開 |
| 基本面與估值 | 證交所／公開資訊觀測站月營收、季報、EPS、估值、日行情 |
| 市場與技術 | 上市日行情、Yahoo 日K高低收、EMA、RSI、MACD、標準 KD 與乖離 |
| 交易與事件風險 | 融資融券、借券、集保，以及重大營運／財務訊息 |
| 宏觀 | 經濟部外銷訂單與工業生產、中央銀行匯率／利率／貨幣供給 |
| 事件 | 籌碼小宇庫藏股、處置，以及官方重大營運／財務訊息 |
| 新聞 | 最多 500 檔股票、每檔最多 5 則 Yahoo Finance RSS；標示待確認，不直接計分 |

新聞會去重、保留來源連結與抓取時間，並與個股報告一起呈現。沒有 AI 金鑰時仍會完成新聞彙整；若另以環境變數提供 `AI_PROVIDER`、`AI_API_KEY`，才會對新事件加上選配的 AI 影響摘要。任何 AI 摘要仍不得直接改變評分。金鑰只能放在使用者環境變數，不可寫進本專案。

### 治理資料排除規則

董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。原始事件來源若仍含內部人異動，只是為了維持來源檔契約與可追溯性，OpenCode 不得把它重新接回投資判斷或醒目揭露。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->

### 官方外資持股的固定抓取與判讀規則

- `MI_QFIIS` 最近 45 個日曆日採逐日循序查詢並保留短暫延遲。2026-07-21 曾因多日期並行查詢暫時只取得 10 個有效交易日；改為循序查詢後，同一官方來源取得 24 日，證明這不是官方只能提供 10 日。
- 10 日變化需要目前快照與第 10 個交易日前快照，因此最低門檻是 11 個有效交易日。不得為完成更新而放寬、補值或縮短後仍稱為 10 日。
- 只有無結構性異動且具完整 5／10 日資料的 `trendReliable=true` 個股，外資持股趨勢才可參與評分與風險判斷。
- 每次成功報告都必須包含 `meta.foreignHoldingHistoryDays >= 11`，網頁也會顯示有效交易日數。若不足，管線應停止並檢查最大可查日期、週末／休市與暫時性限流後重試，不調整選股權重。

### 三時間尺度評分與資料健康度

- 現行模型版本是 `HORIZON_SCORE_V2`。每檔股票必須同時輸出 `horizonScores.short`、`horizonScores.medium`、`horizonScores.long` 與 `dataHealth`。
- 只有中期研究分數用於排名，並映射到相容欄位 `score`。短期分數只回答時機；長期分數只作初篩，不得各自建立另一套排名或直接買賣動作。
- 長期初篩目前方法覆蓋率固定為85%，另有15%的資本配置品質因尚缺完整自由現金流、ROIC與資本配置紀律而不計分；不得把正規化後的100分稱為完整長期價值分數。
- `dataHealth` 不進入任何分數、風險分數或分數乘數；低於65%仍屬硬性淘汰。發布驗證必須確認 `score` 等於 `horizonScores.medium.score`、所有分數介於0至100、長期 `methodCoverage=85`。
- 本益比不得與盈餘殖利率重複計分；營收不得同時放入事件催化；畫面使用整數分數，JSON可保留一位小數。
- 季報申報切換時，本次官方端點有資料者使用本次資料；未回傳者只可沿用日期版報告中同季或前一季的已驗證官方快照。每檔必須揭露 `financialPeriod`、`financialSourceMode`、`dataHealth.freshnessPenalty`、`dataHealth.missingCore`、`dataHealth.staleCore` 與長期 `dataCoverage`；同季快照扣5點資料健康度，前一季快照扣10點，歷史快照不得跨越一季，也不得冒充本次新取得資料。
- 發布驗證必須確認 `financialCurrentCount + financialFallbackCount + financialUnavailableCount = stockCount`。個別計分證據缺漏時該證據不給分，不得以中性預設值墊高分數。

### 持股決策總覽與純 UI 維護

- 決策卡的閱讀順序固定為「目前狀態 → 今天動作 → 下一次確認 → 執行觀察區 → 改變條件 → 原因」。盤中跌破只顯示「保護持有／盤中待收盤」，不得直接當成確認減碼。
- 觀察價位使用符合台股跳動單位的區間呈現；底層仍以原始EMA執行判斷。區間是決策支援，不是保證成交、自動停損或精準預測。
- 摘要的四類動作與每張卡必須共用 `positionDecisionMeta`。驗證時確認摘要數量、個股代號與卡片分類一致，並測試成本保存、完整依據展開及「我尚未持有」錨點。
- 純 UI／文案修改可在不抓新資料的前提下執行 `node .\full-professional-stock-screen.js --render-existing`；既有JSON必須已是 `HORIZON_SCORE_V2`。此模式會同步重產日期版 HTML、`latest.html` 與 `index.html`，但不得被回報為資料已更新。
- 同一日可以重複執行 `/update-report`。舊的 `published/YYYYMMDD` 只是歷史紀錄，不再阻擋來源檢查；每次都會重新抓取盤中行情、新聞、重大訊息與其他來源。<!-- INTRADAY_REFRESH_V1 -->
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
