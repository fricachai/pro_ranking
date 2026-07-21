---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

先讀取專案根目錄 `AGENTS.md` 與 `OPENCODE_HANDOFF.md`。這是受控的每日更新，不得直接編輯任何檔案。只執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-ProfessionalScreen.ps1 -Publish
```

不要預先讀取完整 `index.html` 或 `professional-screen-report/latest.json`，也不要修改評分公式、資料來源、驗證門檻或版面。腳本會強制重新抓取事件與新聞；任一必要來源、資料契約、新聞覆蓋率、Git 推送或 GitHub Pages 線上驗證失敗，都會停止且不得以舊資料發布。成功後只回報腳本的精簡摘要；失敗時只回報失敗關卡與紀錄檔位置。
