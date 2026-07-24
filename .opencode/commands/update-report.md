---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

這是受控的每日更新。Build 主代理已明確獲准使用 Bash；先讀取專案根目錄 `AGENTS.md` 與 `OPENCODE_HANDOFF.md`，不得直接編輯檔案。依序執行下列 Windows PowerShell 命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1
```

之後自動執行下列查詢，每次最多等待 60 秒；若回傳 `STATUS=running`，立即重複同一命令，直到 `STATUS=published` 或 `STATUS=failed` 才可結束。使用者不需要輸入第二個 slash command：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60
```

成功時只回報 `STATUS=published`、提交、公開網址與 `RUN_LOG`；失敗時只回報失敗關卡與 `RUN_LOG`。不要猜測結果或以舊資料發布。<!-- BUILD_BASH_DAILY_UPDATE_V1 -->

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
