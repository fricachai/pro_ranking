---
description: 完成 Obsidian 最小寫回、六檔本機維護驗收與三檔 ChatGPT Project 上傳候選成果
agent: build
---

執行 `OPENCODE_OBSIDIAN_WRITEBACK_V3`。本命令不是複製整段對話，也不是重新修改文章、研究計畫或研究資料；它是「Obsidian 知識寫回＋六檔本機維護 release＋三檔 ChatGPT Project 候選成果」的受控流程。

## 強制邊界

1. 先讀取目前專案 `AGENTS.md`、`OPENCODE_HANDOFF.md`、相關 SOP、Obsidian 寫回規則與最接近的 1–3 個模組；不得假設其他 session 或隱藏記憶可用。
2. 不得修改 manuscript、研究計畫、問卷、原始資料、SmartPLS 模型、正式統計輸出或其他正式研究成果；需要修改時另立任務。
3. 數值、引用、研究事實與軟體結果必須回到正式來源／原始檔案／原生輸出。

## Obsidian 寫回

1. 確認 Obsidian MCP；不可用時才使用已確認安全的 Vault 絕對路徑備援。
2. 以專案名稱、檔名、工具、錯誤、方法與同義詞搜尋既有內容，檢查版本、來源、適用範圍、重複與衝突。
3. 將成果分類為 `REUSABLE_RULE`、`ONE_TIME_CONTENT`、`RESEARCH_FACT`、`USER_DECISION`、`MODEL_INFERENCE` 或 `PENDING_OR_CONTRADICTION`。
4. 對每項判定補充、修正、限縮、退役、待確認或不寫入；優先更新既有筆記，執行最小寫入。
5. 寫入後讀回正文、frontmatter、來源、連結、檢索入口、重複與矛盾。

## 六檔本機維護驗收集合

本案六檔集合為：

1. `期刊論文知識庫\撰寫期刊原則.md`
2. `期刊論文知識庫\wiki\maintenance\codex-operation-memory.md`
3. `期刊論文知識庫\wiki\maintenance\chatgpt-project-instructions.md`
4. `SmartPLS\Ver25.md`
5. `期刊論文知識庫\wiki\maintenance\APER-v18-ChatGPT-Project-Candidate-Package-YYYYMMDD.md`（依實際案件檔名）
6. `SmartPLS\OPENCODE_HANDOFF.md`

在本使用者目前工作區，六檔的已確認根目錄為 `D:\USB_Data\個人研究\實用分析分類\ChatGPT_個人累積\ChatGPT_Codex_專案資料夾`；執行時應先以實際存在的絕對路徑鎖定檔案，不得因目前工作目錄不同而改用猜測路徑。

前三項與 `Ver25.md` 逐檔判定 `REPLACE`、`SUPPLEMENT`、`MAINTAIN`、`PENDING_REBUILD` 或 `RETIRE`，列出理由與來源。一次性研究事實只留在交接／候選包，不得混入跨專案規則。

六檔逐一確認存在、可讀取、新增段落、既有內容、來源版本與 SHA-256；任一失敗時不得回報 `WRITEBACK_COMPLETE`。

## 三檔 ChatGPT Project 候選成果

固定檔案：`codex-operation-memory.md`、`Ver25.md`、`chatgpt-project-instructions.md`。

候選上傳目錄：

`D:\USB_Data\個人研究\實用分析分類\ChatGPT_個人累積\1_期刊文章撰寫`

先確認目錄存在、來源已鎖定，再複製三支完整檔案；逐檔計算 SHA-256，確認來源／目的檔一致並讀回目的檔。路徑不存在或雜湊不一致時標示 `PENDING`，不得猜測替代位置。

## 完整回報

必須列出六檔路徑、處置判定、理由、六檔 SHA-256、三檔目的路徑與雜湊比對、候選包／交接讀回、指定 anchors、重複／矛盾檢查，以及 `LocalBuildVerified`、`ProjectSourcesReplaced`、`FreshRetrievalTested`、`WritingQualityRegressionTested`。未上傳或未測試只能寫 `NOT_PERFORMED`；涉及 SmartPLS 但沒有原生證據只能寫 `Computer Use native control=NOT_VERIFIED`。

若存在 `Sync-OpenCodeObsidianHandoff.ps1`，回報前執行並要求 `HANDOFF_READY=true`。

主終態只能是 `WRITEBACK_COMPLETE`、`WRITEBACK_PARTIAL`、`WRITEBACK_PENDING` 或 `WRITEBACK_BLOCKED`。只有六檔本機成果與三檔目的檔均寫入、讀回、雜湊比對成功，才可標示 `LocalBuildVerified=PASS`。

$ARGUMENTS

<!-- OPENCODE_OBSIDIAN_WRITEBACK_V3 -->
