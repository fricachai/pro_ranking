---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

先讀取專案根目錄 `AGENTS.md` 與 `OPENCODE_HANDOFF.md`。這是受控的每日更新，不得直接編輯任何檔案。完整更新需要數分鐘；不得直接以 Shell 等待 `Update-ProfessionalScreen.ps1` 完成，因為 OpenCode 的 Shell 生命週期可能中斷長工作。先執行 Windows PowerShell 5.1 相容性與完整交接預檢，再啟動受控背景工作：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1
```

啟動後，必須自動輪詢直到完成；使用下列指令，每次最多等待 60 秒。若回傳 `STATUS=running`，立即重複同一指令；只有 `STATUS=published` 或 `STATUS=failed` 才可結束本次 `/update-report`。使用者不需要輸入第二個 slash command。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60
```

成功時回報 `STATUS=published`、提交、公開網址與 `RUN_LOG`；失敗時回報失敗關卡與 `RUN_LOG`。不要猜測結果或以舊資料發布。`/update-report-status` 僅供使用者關閉對話後查詢既有背景工作的備援。不要預先讀取完整 `index.html` 或 `professional-screen-report/latest.json`，也不要修改評分公式、資料來源、驗證門檻或版面。腳本會強制重新抓取事件與新聞；任一必要來源、資料契約、新聞覆蓋率、Git 推送或 GitHub Pages 線上驗證失敗，都會停止且不得以舊資料發布。

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
