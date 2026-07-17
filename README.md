# 上市股票 ETF、外資與投信專業選股

此專案提供可重跑的台灣上市股票篩選程式與互動報告，整合：

- ETF 1／3／5／10／20日持股變化
- 主動ETF與被動ETF籌碼
- 外資實際持股1／5／10／20日變化
- 外資、投信與自營商1／5／10／20日買賣超
- 投信連續買賣天數與估算金額
- 月營收、EPS、營業利益率、財務結構與估值
- EMA、RSI、MACD、標準KD（9,3,3）、乖離、波動與事件風險

## 查看報告

直接開啟根目錄的 `index.html`。股票名稱可另開 Yahoo 股市技術分析頁；點擊總分可查看該股六大構面實得分、判斷數據、資料日期與來源。完整排名表提供左右箭頭、上下兩組水平捲動方式，並固定排名與股票欄。

報告使用純前端登入遮罩。登入狀態預設只保留在目前分頁的 `sessionStorage`；勾選「記住登入狀態」後改存 `localStorage`，因此重新整理、`Ctrl+F5`與每日報告更新後仍可保持登入。登出只清除登入狀態，不會刪除布局追蹤。這是避免一般誤入的便利遮罩，HTML、JSON與CSV仍位於公開GitHub Pages，不能視為伺服器端安全驗證。

每檔股票分開顯示「建立新部位」與「已經持有」的動作。使用者可勾選「我已開始布局」；起始價格與起始排名會保存在目前瀏覽器，即使之後多次重跑、排名改變或掉出前三名，仍會留在「我的布局追蹤」並更新續抱、停加碼、減碼或出脫判斷。前三名只是本次執行的研究優先順序，不是持倉或出場清單。

`Ctrl+F5`、一般重新整理與每日報告更新不會刪除布局追蹤。更換瀏覽器、裝置、無痕視窗或清除網站資料前，使用「下載追蹤備份」保存JSON；「匯入追蹤備份」會以同代號備份更新、其他原有追蹤保留。追蹤與備份只在使用者本機處理，不會寫入公開報告或上傳GitHub。

## 重新產生

需要 Node.js 18 以上版本：

```powershell
node .\full-professional-stock-screen.js
```

輸出會寫入 `professional-screen-report`：

- `latest.html`：最新互動報告
- `latest.json`：完整分析資料
- `full-professional-ranking-YYYYMMDD.csv`：完整排名

## 每日更新與發布

不需要 AI、最省 Token 的方式，是直接執行固定更新器：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

更新器會自動抓取資料、產生報告、驗證輸出、更新 `index.html`、限定提交本次報告檔案、推送到 `main`，並等待 GitHub Pages 完成本次提交後再檢查公開頁。若工作區已有未提交變更、股票數異常、必要輸出缺漏或 Pages 未完成，腳本會停止而不宣稱成功。

只產生與驗證、不提交發布：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1
```

## 交給 OpenCode

OpenCode 會讀取根目錄 `AGENTS.md`，專案也提供 `/update-report` 指令。Windows 可依官方方式安裝：

```powershell
npm install -g opencode-ai
opencode auth login
```

互動方式：在本專案執行 `opencode`，輸入 `/update-report`。

非互動一鍵方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Invoke-OpenCodeDailyUpdate.ps1
```

日常更新不需要 OpenCode 分析完整報告；OpenCode只執行固定更新器並讀取數行摘要，只有失敗時才分析紀錄，因此可顯著減少 AI Token。若只是固定時間每天發布，直接用 Windows 工作排程器呼叫更新器會比呼叫任何 AI 更省成本。

## 資料邊界

目前只篩選 ETF 資料集內持有的上市股票，排除上櫃股票。ETF來源可能標示資料不完整或部分ETF更新落後，因此20日資料只作背景，10日確認延續，5日用於判斷轉折。外資持股變化也可能受借券、海外存託憑證、股本異動與非市場交易影響，不能直接等同外資買賣超。投信與自營商欄位是每日買賣超流量，不等同基金完整持股明細。

標準KD使用Yahoo Finance每日最高、最低與收盤價計算，僅占總分1.5分。低檔黃金交叉不是獨立買進訊號，高檔死亡交叉也不是獨立賣出訊號；必須與EMA趨勢、乖離及ETF／法人籌碼共同判斷。

篩選結果是研究排序與風險檢查，不是保證報酬或個人化投資建議。
