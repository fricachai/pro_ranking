---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

先讀取專案根目錄 `AGENTS.md` 與 `OPENCODE_HANDOFF.md`。這是受控的每日更新，不得直接編輯任何檔案。先執行 Windows PowerShell 5.1 相容性與完整交接預檢，再執行更新：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

不要預先讀取完整 `index.html` 或 `professional-screen-report/latest.json`，也不要修改評分公式、資料來源、驗證門檻或版面。腳本會強制重新抓取事件與新聞；任一必要來源、資料契約、新聞覆蓋率、Git 推送或 GitHub Pages 線上驗證失敗，都會停止且不得以舊資料發布。

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
