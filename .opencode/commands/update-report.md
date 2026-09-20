---
description: 更新、驗證並發布每日上市股票專業選股報告
agent: build
---

這是日常更新的可見進度入口，不是只允許更新而禁止修正的模式。Build 主代理已獲准使用完整工程能力；專案 `opencode.json` 已在新工作階段自動載入 `OPENCODE_HANDOFF.md` 與 pro_ranking Obsidian SOP，並同時套用根目錄 `AGENTS.md`。不得直接編輯生成檔案，但若預檢、來源、產檔、驗證、UI、Git 或 Pages 失敗，必須先讀狀態檔與紀錄檔、定位根因，編輯必要的來源／腳本／規則／測試並完成驗證，再依同一受控 runner 重試：<!-- OBSIDIAN_AUTOREAD_V1 -->

```text
診斷 → 根因修正 → 語法／資料契約／fallback 測試 → 產生報告 → 發布 → 線上驗證
```

單一來源失敗不得直接改成整體無法判讀；必須尋找官方替代端點、日期回補、重試、第二來源或已驗證快照。不得降低 `MI_QFIIS` 11 個有效交易日等硬性門檻，不得編造資料，不得建立第二個競爭中的背景更新。

預檢不得跳過，Pages 由 `deploy-pages.yml` 單一 workflow 負責；active run 只等待、不取消，推送前必須排空佇列，明確失敗只 rerun 原 failed job 一次。線上 byte match 與 Actions 稽核狀態分開回報。使用者不需要輸入第二個 slash command。<!-- PAGES_DEPLOYMENT_LOOP_GUARD_V1 --><!-- PAGES_WORKFLOW_V1 --><!-- PREFLIGHT_BYPASS_GUARD_V1 -->

為了讓 OpenCode 畫面逐段刷新，Build 必須在同一個主工作階段依序執行下列短 Shell；每次 Shell 返回後先把輸出中的進度回報給使用者，再決定下一步。這不是競爭中的第二份更新：`Start` 只能成功一次，後續只讀取同一個 state／RUN_LOG。

1. 預檢一次：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-OpenCodeHandoff.ps1
```

2. 啟動一次：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-ProfessionalScreenUpdate.ps1
```

3. 依序讀取進度，每次等待最多 10 秒；不得平行呼叫：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 10
```

4. 若輸出 `STATUS=running`，立即顯示 `LOG_TAIL_BEGIN` 與 `LOG_TAIL_END` 之間的新階段，再重複第 3 步；若輸出 `STATUS=published` 或 `STATUS=failed`，停止讀取並回報終態。若啟動器回報已有背景程序，禁止再次執行 Start，只讀取該既有程序的 Status。

Build 不得把整段更新包成一個長時間 Shell，也不得只顯示「思考中」。成功終態必須整理 `STATUS`、`CHECKED_AT`、`DATA_CHANGED`、資料日期、提交、Pages byte match、Actions 稽核狀態、公開網址與 `RUN_LOG`；失敗終態必須指出最後一個 log 階段與紀錄檔。<!-- OPENCODE_PROGRESS_OUTPUT_V2 -->

`STATUS=published` 代表本次已重新檢查盤中／收盤行情、新聞、重大訊息與其他來源，並把本次報告及事件檢查時間發布。`DATA_CHANGED=false` 只表示排除時間戳後沒有實質內容變化。Yahoo RSS 若受 429 限流可降級為 `partial` 或 `unavailable`，但官方重大訊息、收盤價及其他品質閘門仍須通過。成功時回報狀態、檢查時間、資料是否實質變更、提交、公開網址與 `RUN_LOG`；失敗時回報根因、已完成的修正／重試與下一個可驗證步驟，不得只丟回「失敗」。不要猜測結果或以舊資料發布。<!-- BUILD_BASH_DAILY_UPDATE_V1 --><!-- OPENCODE_AUTONOMOUS_REPAIR_V1 --><!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 --><!-- OPTIONAL_YAHOO_NEWS_V1 -->

治理資料排除規則：董監持股設質、內部人轉讓、裁處、資訊申報違規及其他治理查核資料，即使存在於原始事件來源，也不得進入評分、排名、風險原因、前三名資格、建立新部位、持有動作或前台顯示；不得產生 G 級、「待查核候選」、「治理查核」或「治理警示」。成功後只回報腳本的精簡摘要，並確認治理資料排除驗證通過；失敗時只回報失敗關卡與紀錄檔位置。<!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
