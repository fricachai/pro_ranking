# OpenCode 執行交接手冊

## 結論

可以交給 OpenCode Desktop 或 OpenCode CLI 執行，但 OpenCode 是流程操作者，不是資料來源。實際資料抓取、新聞彙整、評分、產檔、Git 提交、推送與 GitHub Pages 驗證，全部由本專案既有腳本完成。只要新電腦具備必要工具與個人登入權限，OpenCode 可用單一指令完成完整更新。

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

兩種方式最後都只會執行這個受控入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

## 必須一起交接的檔案

最安全的方式是直接複製完整 Git 儲存庫，或在新電腦執行 `git clone https://github.com/fricachai/pro_ranking.git`，不要挑檔複製。下列檔案是交接核心：

| 類別 | 檔案 | 用途 |
|---|---|---|
| OpenCode 規則 | `AGENTS.md` | 資料邊界、評分保護、完成條件與禁止事項 |
| OpenCode 權限 | `opencode.json` | 禁止代理直接改檔，只允許受控更新命令 |
| OpenCode 指令 | `.opencode/commands/update-report.md` | 提供 `/update-report` 快捷指令 |
| 交接說明 | `OPENCODE_HANDOFF.md` | 安裝、執行、驗證、來源與故障處理 |
| CLI單鍵入口 | `scripts/Invoke-OpenCodeDailyUpdate.ps1` | 先做交接預檢，再以CLI非互動呼叫 OpenCode；Desktop 不需要此檔來啟動 |
| 交接預檢 | `scripts/Test-OpenCodeHandoff.ps1` | 檢查工具、登入、遠端、分支、檔案、資料契約與線上頁面 |
| 每日管線 | `scripts/Update-ProfessionalScreen.ps1` | 抓取、重算、驗證、提交、推送與 Pages 驗證 |
| 事件新聞 | `fetch-events.js` | 籌碼小宇事件、官方重大訊息、Yahoo 新聞、去重與選配 AI 摘要 |
| 分析核心 | `full-professional-stock-screen.js` | 全部市場資料抓取、特徵、評分、風險門檻與報告生成 |
| 發布首頁 | `index.html` | GitHub Pages 首頁，由每日管線自動生成，不得手改 |
| 目前資料 | `professional-screen-report/latest.json` | 最新完整分析資料與各來源日期 |
| 事件快照 | `professional-screen-report/events/latest-events.json` | 最新事件、新聞、來源狀態與抓取時間 |

`.git` 目錄包含版本歷史與遠端設定；若以 `git clone` 取得就會自動建立。登入憑證、API 金鑰、瀏覽器持倉與登入狀態不屬於交接檔案，禁止提交到 Git。

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
| 風險與治理 | 融資融券、借券、集保、重大訊息、董監持股設質、內部人轉讓、裁處與申報違規 |
| 宏觀 | 經濟部外銷訂單與工業生產、中央銀行匯率／利率／貨幣供給 |
| 事件 | 籌碼小宇庫藏股、處置、內部人異動，以及官方重大訊息 |
| 新聞 | 最多 500 檔股票、每檔最多 5 則 Yahoo Finance RSS；標示待確認，不直接計分 |

新聞會去重、保留來源連結與抓取時間，並與個股報告一起呈現。沒有 AI 金鑰時仍會完成新聞彙整；若另以環境變數提供 `AI_PROVIDER`、`AI_API_KEY`，才會對新事件加上選配的 AI 影響摘要。任何 AI 摘要仍不得直接改變評分。金鑰只能放在使用者環境變數，不可寫進本專案。

## 防止錯誤發布的關卡

每日管線會在下列任一情況停止，不會拿舊資料更新網站：

1. 工作區有未提交變更，或本機 `main` 與 `origin/main` 不一致。
2. Node.js、Git、GitHub CLI、GitHub 登入或遠端儲存庫不正確。
3. 事件、官方重大訊息或 Yahoo 新聞抓取失敗。
4. ETF 股票代號少於 300，或 Yahoo 新聞成功讀取率低於 80%。
5. 報告沒有使用本次剛抓取的事件新聞檔。
6. 官方法人、外資持股、信用交易、集保、標準 KD、股票數或決策欄位不符合資料契約。
7. 生成檔出現預期外變更、提交失敗、推送失敗或 GitHub Pages 未部署同一提交。
8. 線上頁面 HTTP、資料日期或必要畫面標記驗證失敗。

## 成功後的完成證據

OpenCode 必須回報：

- `STATUS=published`
- ETF、法人、外資持股、信用交易、集保及市場資料日期
- 股票數與前三名研究候選
- Git 提交版本
- `https://fricachai.github.io/pro_ranking/`
- 本次執行紀錄檔位置

此外，工作區必須乾淨，本機 `HEAD` 必須等於 `origin/main`，GitHub Pages 最新建置提交也必須是同一版本。

## 已知限制

- Yahoo Finance 新聞是 C 級待確認資訊，不是官方證據，也不直接加減分。
- 法說會目前只從官方重大訊息文字中的「法人說明會／法說會」辨識，不等於完整法說會資料庫。
- 券商一致預估、目標價、完整自由現金流與使用者個人持倉成本仍未取得。
- 網路來源若停機或改欄位，管線會停止等待修復；OpenCode 不得自行降低門檻或編造替代資料。
- 持倉追蹤位於瀏覽器 `localStorage`；換電腦或瀏覽器前須由使用者自行匯出 JSON，且不得提交到公開儲存庫。
