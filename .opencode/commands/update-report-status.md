---
description: Check the controlled professional-screen update status
agent: build
---

Run only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 10
```

每次返回後立即呈現 `STATUS`、`UPDATE_STAGE`／`UPDATE_PROGRESS`、檢查時間、`DATA_CHANGED`、提交、發布標籤、公開網址與紀錄檔路徑。`DATA_CHANGED=false` 表示本次來源仍已重新檢查，排除時間戳後沒有實質內容變化。若狀態為 `running`，下一次 Status 必須等待前一次返回後再循序執行；若狀態為 `published` 或 `failed`，停止輪詢並回報終態。失敗時把結果當成修正觸發：讀取 state／RUN_LOG、找出根因、修正相關來源／腳本／規則／測試，並在既有程序終態後由主要受控流程繼續。不得建立競爭中的背景更新、降低品質門檻、編造資料或在驗證前宣稱完成。<!-- OPENCODE_AUTONOMOUS_REPAIR_V1 --><!-- BUILD_BASH_DAILY_UPDATE_V1 --><!-- GOVERNANCE_EXCLUSION_RULE_V1 --><!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 --><!-- OPENCODE_PROGRESS_OUTPUT_V2 -->
