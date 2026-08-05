---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

這是受控的每日更新。Build 主代理已明確獲准使用 Bash；先讀取專案根目錄 `AGENTS.md` 與 `OPENCODE_HANDOFF.md`，不得直接編輯檔案。只執行一次下列 Windows PowerShell 控制命令，不得自行拆成 Start／Status 輪詢：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-ProfessionalScreenUpdateCommand.ps1
```

控制命令會在同一個 Shell 項目內完成預檢、背景啟動、等待與終態輸出。不得另外重複呼叫 `Get-ProfessionalScreenUpdateStatus.ps1`。使用者不需要輸入第二個 slash command。

`STATUS=published` 代表本次已重新檢查盤中／收盤行情、新聞、重大訊息與其他來源，並把本次報告及事件檢查時間發布。`DATA_CHANGED=false` 只表示排除時間戳後沒有實質內容變化。Yahoo RSS 若受 429 限流可降級為 `partial` 或 `unavailable`，但官方重大訊息、收盤價及其他品質閘門仍須通過。成功時回報狀態、檢查時間、資料是否實質變更、提交、公開網址與 `RUN_LOG`；失敗時只回報失敗關卡與 `RUN_LOG`。不要猜測結果或以舊資料發布。<!-- BUILD_BASH_DAILY_UPDATE_V1 --><!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 --><!-- OPTIONAL_YAHOO_NEWS_V1 -->

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
