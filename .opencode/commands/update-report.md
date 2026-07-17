---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

依照專案根目錄 `AGENTS.md` 執行每日更新。只執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

不要預先讀取完整 `index.html` 或 `professional-screen-report/latest.json`，也不要修改評分公式、資料來源或版面。成功後依 `AGENTS.md` 的「Codex／OpenCode 統一完成條件」確認工作區乾淨、本機 `HEAD` 等於 `origin/main`、GitHub Pages 建置提交一致且線上內容已更新，再回報腳本精簡摘要。任何一項未通過都不得宣告完成；失敗時停止並回報錯誤步驟與紀錄檔位置。
