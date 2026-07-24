---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

執行下列受信任命令插補。它在送交模型前完成 PowerShell 預檢、背景更新與自動輪詢，因此不依賴此對話是否提供 Bash 工具：

!`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-ProfessionalScreenUpdateCommand.ps1`

僅依上方輸出回報最終 `STATUS`、提交、公開網址與 `RUN_LOG`。不要呼叫 Bash、不要修改檔案、不要猜測結果或以舊資料發布。`/update-report-status` 僅供使用者關閉原對話後查詢既有背景工作的備援。<!-- COMMAND_SHELL_INTERPOLATION_V1 -->

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
