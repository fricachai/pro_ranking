---
description: 將目前 OpenCode 對話中已驗證且可重用的知識整合回既有 Obsidian Vault
agent: build
---

執行「Obsidian 知識回寫流程」。本命令是全域 `OPENCODE_OBSIDIAN_WRITEBACK_V1` 的專案入口，不是只把目前對話複製到筆記。

1. 先讀取目前專案的 `AGENTS.md`、`OPENCODE_HANDOFF.md`、相關 SOP、`[[跨專案長期記憶中樞]]`、Obsidian 寫回規則及相關 AI／Agent／工作流程／Planning 指引。
2. 確認目前 OpenCode 對話實際可讀取；不得假設可讀取 Codex 隱藏記憶、未交接對話或其他 session。確認 Obsidian MCP 是否可用；MCP 不可用時，才驗證 Vault 絕對路徑並使用安全檔案系統備援。
3. 以專案、檔名、工具、錯誤、方法及同義概念搜尋現有筆記；優先讀取最近的中樞、SOP、工作流程與 Lessons Learned，依最終已驗證結果決定補充、修正、取代、限縮、標示衝突或不寫入。
4. 只保留可追溯、可重複使用且適用範圍清楚的結果、方法、判斷原則、錯誤原因、修正方式、驗證方法與限制。不得保存整段對話、一次性進度、未驗證推論、密碼、token、API key、cookie、登入資訊、`.env`、個資或機密資料。
5. 優先更新最近的既有筆記，不建立重複平行規則；若有 `updated`、`status`、`tags` 或來源欄位，必須明確更新並維持 YAML 可解析。
6. 寫入後重新讀回實際檔案或 MCP note，驗證正文、frontmatter、來源、連結、檢索入口及重複／矛盾；若有 `Sync-OpenCodeObsidianHandoff.ps1`，執行它並要求 `HANDOFF_READY=true`。
7. 只能使用 `WRITEBACK_COMPLETE`、`WRITEBACK_PARTIAL`、`WRITEBACK_PENDING` 或 `WRITEBACK_BLOCKED` 其中一個終態；沒有實際寫入與讀回證據，不得宣稱完成。

最後只回報完整檔案路徑、各檔案整合內容、是否修正既有內容、實際驗證方式，以及未完成／待確認事項。

<!-- OPENCODE_OBSIDIAN_WRITEBACK_V1 -->
