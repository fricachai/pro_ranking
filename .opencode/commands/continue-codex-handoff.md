---
description: 驗證最新 Codex 對話寫回內容並立即接續目前專案工作
agent: build
---

這是 Codex 對話完成後的固定接手指令。請在同一個 `pro_ranking` 專案根目錄、OpenCode 主工作階段、Build 主代理中執行。

1. 先執行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Sync-OpenCodeObsidianHandoff.ps1 -CheckOpenCodeConfig
   ```

2. 只有輸出 `HANDOFF_READY=true` 時，才可宣告已接手。讀取目前 `AGENTS.md`、`OPENCODE_HANDOFF.md` 與 Obsidian SOP 的現行優先契約，確認本次任務目標、已完成項目、未完成項目與資料邊界。
3. 接著直接依使用者目前的要求建立計畫並執行；不要只回覆「已讀取」，也不要要求第二個開始指令。若工作區有不明或非本次任務的未提交變更，先停止並回報，不得清除。
4. 每次 Codex 將可重用內容寫回 Obsidian 後，下一個 OpenCode 主工作階段都以本指令作為接續入口。聊天逐字稿不會被假設已轉移；只有已驗證寫回的規則、來源、狀態與接續邊界可作為交接依據。

<!-- OPENCODE_IMMEDIATE_CONTINUATION_V1 -->
