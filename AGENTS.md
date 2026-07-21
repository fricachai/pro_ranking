# 上市股票專業選股報告操作規則

## 專案用途

本專案每日重新抓取 ETF、證交所、公開資訊觀測站與即時行情資料，產生台灣上市股票研究排序報告並發布到 GitHub Pages。

## 每日更新唯一入口

日常資料更新只執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

此腳本會依序完成資料抓取、報告產生、輸出驗證、限定檔案提交、推送，以及 GitHub Pages 線上驗證。不要另外手動修改產出的 HTML、JSON 或 CSV。

## OpenCode 執行規則

1. 先讀 `OPENCODE_HANDOFF.md`。每日更新不得改動 `full-professional-stock-screen.js` 的評分權重、硬性條件、資料來源、驗證門檻或版面。
2. 不要重新閱讀完整 `index.html` 或 `professional-screen-report/latest.json`；它們很大，腳本已負責驗證。
3. 成功時只回報腳本最後輸出的精簡摘要：資料日期、股票數、前三名、提交版本及公開網址。
4. 失敗時停止，不要猜測、不降低門檻，也不要自行填造資料。只讀取腳本指出的紀錄檔尾端，說明失敗步驟。
5. 若工作區原本有未提交變更，腳本會停止。不得清除或覆蓋這些變更。
6. ETF 20 日資料只作背景，10 日確認延續，5 日看轉折；不得把 20 日累積直接寫成買進訊號。
7. ETF 資料日、法人買賣超日、外資持股日、價量估值日與即時報價時間必須分開呈現。
8. 報告是研究排序，不是保證報酬或個人化投資建議。
9. 每次執行都會重新排序；掉出前三名不是賣出訊號。不得用本次排名取代既有部位的續抱、停加碼、減碼與出脫判斷。
10. 每檔股票必須同時輸出 `entryAction` 與 `holdingAction`。新部位只有「可開始承接」才可進入分批布局；既有部位依基本面破壞、技術趨勢與 ETF／外資／投信轉弱程度判斷。
11. 使用者標記的布局部位保存在瀏覽器 `proRankingPositionsV1`，不因重跑或掉出前三名自動移除；不得把本地持倉追蹤資料上傳或寫入公開報告。
12. 技術面15分內，標準KD（9,3,3）只占1.5分，必須使用每日最高、最低與收盤價計算。KD不得用收盤價近似；低檔黃金交叉不可單獨列為買進，高檔死亡交叉不可單獨列為減碼或出脫。
13. 布局追蹤匯出／匯入只處理本機JSON。匯入必須驗證四碼代號與正數成本，採同代號更新、其他原有追蹤保留，不得把持倉寫入Git、公開HTML或網路來源。
14. 報告使用Obsidian既有重用規格的純前端登入遮罩，只保留使用者指定的帳密清單。日常更新不得移除 `loginGate`、`pro-ranking-auth-v1`、任何已設定帳號、記住登入或登出控制；登入遮罩不得宣稱為伺服器端安全驗證。

## 官方外資持股歷史完整性

1. 證交所 `MI_QFIIS` 最近 45 個日曆日必須逐日、循序抓取，日期間保留短暫延遲；不得恢復多日期並行，因來源曾在並行查詢時只回傳 10 個有效交易日。
2. 外資持股 10 日變化需要「當日加前 10 個有效交易日」，所以最低完整度固定為 11 日。不得降低門檻、把週末算成交易日、以舊快照補值，或把較短期間仍標示為 10 日。
3. 只有 `trendReliable=true` 的個股，外資持股 5／10 日趨勢才可進入評分、正面理由、風險判斷與持倉動作；期間若有非市場結構異動，維持不可直接計分。
4. 報告必須輸出 `meta.foreignHoldingHistoryDays` 並在頁面揭露有效交易日數；每日管線與交接預檢都必須確認至少 11 日。
5. 再次不足時，先檢查官方最大可查日期、週末／休市日、回應狀態及暫時性限流，再以循序方式重試。這是資料取得故障，不是修改選股權重或放寬品質標準的理由。

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
- `fetch-events.js`：事件輔助層抓取、欄位語意驗證與去重；不直接改變六構面分數。
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

## 事件資料契約與限制

1. 已完成的事件來源是：籌碼小宇 `events.json` 的庫藏股、處置、內部人異動；證交所／公開資訊觀測站上市公司重大訊息；以及最多 500 檔股票、每檔最多 5 則的 Yahoo Finance RSS 新聞。
2. `material_info` 已接入官方重大訊息；`investor_conf` 只代表重大訊息文字明確出現「法人說明會／法說會」，不得宣稱已取得完整法說會資料庫。
3. 籌碼小宇庫藏股欄位 `f` 是事件起日、`t` 是預定結束日。輸出的 `publishTime` 目前承載可排序的事件日期，但必須等於 `f`，並以 `dateKind=event_start` 說明其不是公告發布時間；不得再把 `t` 映射成發布時間。
4. 抓取器必須保留 `sourceStartDate`、`sourceEndDate` 與 `dateKind`，並在覆寫 `latest-events.json` 前執行資料契約檢查。檢查失敗即退出，不得用猜測修正來源欄位。
5. Yahoo RSS 新聞必須維持 `confirmed=false` 與 `eventType=news_pending`，只供查核，不得直接加減評分。
6. 修改事件來源前，先保存一筆原始資料樣本並確認欄位語意，再新增映射；不得只依欄位名稱、排序或畫面推測。
7. 發布後至少檢查：事件資料契約通過、未出現庫藏股結束日誤標、網頁清楚揭露實際來源與未實作範圍、GitHub Pages 對應本次提交。
8. 每日發布必須重新產生 `latest-events.json`，且包含 `sourceStatus`；ETF股票代號不得少於300、Yahoo新聞成功讀取率不得低於80%，官方重大訊息與新聞不得為空。未通過時必須停止，不得沿用舊事件檔。
