---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

依照專案根目錄 `AGENTS.md` 執行每日更新。只執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

不要預先讀取完整 `index.html` 或 `professional-screen-report/latest.json`，也不要修改評分公式、資料來源或版面。成功時只回報腳本的精簡摘要；失敗時停止並回報錯誤步驟與紀錄檔位置。
