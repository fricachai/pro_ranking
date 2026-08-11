# ETF持有上市股多因子研究報告

以 ETF 持有且可辨識的上市普通股為研究母體，產生研究優先順序、進場時機與既有部位追蹤。候選排序不是保證報酬、完整公司研究或個人化投資建議。

## 資料架構

- A級官方原始資料：證交所／公開資訊觀測站的季報、月營收、估值、日行情、T86法人買賣超、外資持股、融資融券、借券賣出與重大營運／財務訊息。
- A級官方總體資料：集保股權分散表、經濟部外銷訂單與工業生產、中央銀行匯率／利率／貨幣供給。
- B級次級整理：籌碼小宇 ETF 持股與結構化事件；法人資料只作官方資料備援或交叉檢查。
- C級待確認：Yahoo Finance 新聞，只顯示、不直接計分。

`HORIZON_SCORE_V2` 將研究拆為短期時機、中期研究與長期初篩三個100分尺度；只有中期研究分數用於排名。長期初篩目前只覆蓋85%方法權重，尚缺完整自由現金流、ROIC與資本配置紀律，因此不得當成完整長期價值評估。資料健康度另外呈現，只決定資料是否足以採用，不進入分數或乘數；低於65%不得進入A級。介面以整數顯示分數，JSON保留一位小數供稽核。

反重複計分規則：本益比只在估值構面計分，不再以盈餘殖利率重複；營收趨勢不再同時放入基本面與事件催化；資料健康度不再同時出現在風險分數、總分乘數與硬門檻。季報毛利率、營業利益率、淨利率與營業外依賴納入企業營運品質；宏觀、信用交易與集保維持獨立覆蓋或風險門檻。

季報申報切換保護：官方最新季報端點在申報期可能只包含已完成申報的公司。本次端點有資料者使用本次官方資料；尚未回傳者最多沿用同季或前一季、已在日期版報告驗證過的官方快照，並在個股明細揭露實際季別、來源與時效扣分。同季快照扣5點資料健康度，前一季快照扣10點，但不修改投資分數。超過一季或沒有可驗證快照時維持缺漏，缺少的計分證據不給分；長期初篩另顯示每檔股票的資料覆蓋率。

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，不納入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示，也不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。原始事件檔若因來源契約仍含內部人異動，只作來源留存，不得影響任何投資判斷。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->

官方外資持股會查詢最近 45 個日曆日，採逐日循序抓取以避免來源在並行請求時暫時少回資料。10 日變化需要目前快照加第 10 個交易日前快照，因此報告至少要有 11 個有效交易日；不足就停止，不以縮短期間、補值或降低門檻完成發布。

## 每日更新

需要 Node.js 18 以上。完整更新、驗證、提交、推送與 GitHub Pages 線上驗證：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

同一日可重複執行。每次都會重新查詢盤中／收盤行情、新聞、重大訊息與其他來源，不再被日期標籤提前攔截。每次成功檢查都會回報 `STATUS=published`、更新前台的報告與事件檢查時間，並建立 `published/YYYYMMDD-HHmmss` 稽核標籤；`DATA_CHANGED=false` 表示排除時間戳後沒有實質內容變化。Yahoo RSS 若受 429 限流會標示為部分成功或暫時無法取得，但不阻斷官方事件與行情更新。<!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 --><!-- OPTIONAL_YAHOO_NEWS_V1 -->

GitHub Pages 由 `.github/workflows/deploy-pages.yml` 單一發布，Actions 與線上檔案 byte match 才是完成依據。工作流不取消執行中部署，deploy 最長等待 15 分鐘。預檢不得繞過，OpenCode 不得直接執行底層 `Update-ProfessionalScreen.ps1 -Publish`。<!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

只在本機更新與驗證：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1
```

生成內容位於 `professional-screen-report`：

- `latest.html`／`latest.json`：最新版本
- `full-professional-screen-YYYYMMDD.html`／`.json`：按 ETF 資料日保存
- `full-professional-ranking-YYYYMMDD.csv`：完整排名

`index.html` 與報告檔是生成品，應修改 `full-professional-stock-screen.js` 後重新產生，不要直接手改生成頁面。持倉追蹤使用瀏覽器 `localStorage`；換裝置、換瀏覽器或清除網站資料前請先下載備份。

線上版本：<https://fricachai.github.io/pro_ranking/>

## 離線策略驗證

策略改良先使用離線回測工具，不直接修改正式 `HORIZON_SCORE_V2`：

```powershell
node .\scripts\Backtest-HorizonStrategy.js
```

正式發布流程會在收盤後自動保存 close-only point-in-time 快照；盤中報告會跳過，避免下一交易日行情污染前一日訊號。工具會比較現行 A 級候選、中期分數候選及非生產環境的品質／價值／動能實驗模型，並納入樣本長度、未來資料隔離、交易成本與快照間隔檢查。完整規則見 [`STRATEGY_VALIDATION.md`](STRATEGY_VALIDATION.md)。
<!-- STRATEGY_VALIDATION_V1 -->

## OpenCode 交接

完整交接清單、一次性安裝、權限設計、新聞彙整方式與失敗防護請見 [`OPENCODE_HANDOFF.md`](OPENCODE_HANDOFF.md)。先執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
```

出現 `HANDOFF_READY=true` 後，OpenCode Desktop 可在專案內輸入 `/update-report`。只有需要從 PowerShell 非互動啟動 OpenCode 時，才使用下列 CLI 單鍵入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-OpenCodeDailyUpdate.ps1
```

使用者已授權 OpenCode 的 Build 主代理具備完整專案權限，可自行規劃、編輯、測試、查詢網路、提交、推送與發布；外部資料夾仍需逐次確認，且不得清除不明變更或跳過驗證。模型不在專案內鎖定，可由使用者在 OpenCode 選擇 GPT‑5.6 Luna、Kimi K3 或其他可用高階模型。日常 `/update-report` 仍只執行受控更新器。<!-- OPENCODE_BUILD_FULL_ACCESS_V1 -->

已授權的「短／中／長期評分明細介面」可在 OpenCode Desktop 的 Build 主工作階段輸入 `/implement-horizon-ui`；它會依 `.opencode/commands/implement-horizon-ui.md` 完成三頁籤介面、文件與驗證器同步、桌機／手機測試、提交、發布及線上驗證。<!-- OPENCODE_HORIZON_UI_HANDOFF_V1 -->

評分明細使用同一視窗的三個頁籤，預設「中期研究／排名主軸」。短期是1–20個交易日的進場時機，中期是約1–6個月的研究排序，長期是1年以上的企業品質與估值初篩；頁籤只解釋既有分數，不改排名、今天動作、建立新部位或已持有動作。長期資本配置品質15分仍顯示尚未計分，方法覆蓋固定85%。<!-- HORIZON_SCORE_DETAIL_UI_V1 -->

前30名與完整排名表的短期時機、中期研究／排名、長期初篩表頭可點選排序；第一次由小到大，再次點選改為由大到小。這只改變表格顯示順序，不改變中期排名資料、分數、硬門檻或投資動作。
