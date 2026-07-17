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

1. 每日更新不得改動 `full-professional-stock-screen.js` 的評分權重、硬性條件、資料來源或版面。
2. 不要重新閱讀完整 `index.html` 或 `professional-screen-report/latest.json`；它們很大，腳本已負責驗證。
3. 成功時只回報腳本最後輸出的精簡摘要：資料日期、股票數、前三名、提交版本及公開網址。
4. 失敗時停止，不要猜測、不降低門檻，也不要自行填造資料。只讀取腳本指出的紀錄檔尾端，說明失敗步驟。
5. 若工作區原本有未提交變更，腳本會停止。不得清除或覆蓋這些變更。
6. ETF 20 日資料只作背景，10 日確認延續，5 日看轉折；不得把 20 日累積直接寫成買進訊號。
7. ETF 資料日、法人買賣超日、外資持股日、價量估值日與即時報價時間必須分開呈現。
8. 報告是研究排序，不是保證報酬或個人化投資建議。

## 重要檔案

- `full-professional-stock-screen.js`：資料抓取、評分與報告產生器。
- `fetch-events.js`：事件輔助層抓取、欄位語意驗證與去重；不直接改變六構面分數。
- `scripts/Update-ProfessionalScreen.ps1`：每日更新、驗證與發布入口。
- `index.html`：GitHub Pages 首頁，由更新腳本從最新報告複製產生。
- `professional-screen-report/latest.json`：最新完整分析資料。
- `professional-screen-report/full-professional-*`：依 ETF 資料日保存的版本。

## 非日常任務

只有使用者明確要求新增欄位、修改評分、調整版面或修正錯誤時，才分析與編輯產生器。完成後必須先在本機驗證，再提交、推送並檢查公開 Pages 內容。

## 事件資料契約與限制

1. 目前真正完成的事件來源只有：籌碼小宇 `events.json` 的庫藏股、處置、內部人異動，以及最多 100 檔股票、每檔最多 5 則的 Yahoo Finance RSS 新聞。
2. `material_info` 與 `investor_conf` 只是預留類型；在正式完成公開資訊觀測站重大訊息及法說會抓取、測試與來源驗證前，不得宣稱系統已涵蓋這兩類資料。
3. 籌碼小宇庫藏股欄位 `f` 是事件起日、`t` 是預定結束日。輸出的 `publishTime` 目前承載可排序的事件日期，但必須等於 `f`，並以 `dateKind=event_start` 說明其不是公告發布時間；不得再把 `t` 映射成發布時間。
4. 抓取器必須保留 `sourceStartDate`、`sourceEndDate` 與 `dateKind`，並在覆寫 `latest-events.json` 前執行資料契約檢查。檢查失敗即退出，不得用猜測修正來源欄位。
5. Yahoo RSS 新聞必須維持 `confirmed=false` 與 `eventType=news_pending`，只供查核，不得直接加減評分。
6. 修改事件來源前，先保存一筆原始資料樣本並確認欄位語意，再新增映射；不得只依欄位名稱、排序或畫面推測。
7. 發布後至少檢查：事件資料契約通過、未出現庫藏股結束日誤標、網頁清楚揭露實際來源與未實作範圍、GitHub Pages 對應本次提交。
