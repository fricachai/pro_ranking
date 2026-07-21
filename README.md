# ETF持有上市股多因子研究報告

以 ETF 持有且可辨識的上市普通股為研究母體，產生研究優先順序、進場時機與既有部位追蹤。候選排序不是保證報酬、完整公司研究或個人化投資建議。

## 資料架構

- A級官方原始資料：證交所／公開資訊觀測站的季報、月營收、估值、日行情、T86法人買賣超、外資持股、融資融券、借券賣出、重大訊息、董監持股設質、內部人轉讓、裁處與資訊申報違規。
- A級官方總體資料：集保股權分散表、經濟部外銷訂單與工業生產、中央銀行匯率／利率／貨幣供給。
- B級次級整理：籌碼小宇 ETF 持股與結構化事件；法人資料只作官方資料備援或交叉檢查。
- C級待確認：Yahoo Finance 新聞，只顯示、不直接計分。

100分仍由基本面、估值、籌碼、技術面、催化與風險六構面組成。季報毛利率、營業利益率、淨利率與營業外依賴已納入獲利品質；宏觀、信用交易、集保與治理資料維持獨立覆蓋或風險門檻，避免重複計分。

官方外資持股會查詢最近 45 個日曆日，採逐日循序抓取以避免來源在並行請求時暫時少回資料。10 日變化需要目前快照加第 10 個交易日前快照，因此報告至少要有 11 個有效交易日；不足就停止，不以縮短期間、補值或降低門檻完成發布。

## 每日更新

需要 Node.js 18 以上。完整更新、驗證、提交、推送與 GitHub Pages 線上驗證：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

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

## OpenCode 交接

完整交接清單、一次性安裝、權限設計、新聞彙整方式與失敗防護請見 [`OPENCODE_HANDOFF.md`](OPENCODE_HANDOFF.md)。先執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
```

出現 `HANDOFF_READY=true` 後，OpenCode Desktop 可在專案內輸入 `/update-report`。只有需要從 PowerShell 非互動啟動 OpenCode 時，才使用下列 CLI 單鍵入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-OpenCodeDailyUpdate.ps1
```
