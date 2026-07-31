---
description: Check the controlled professional-screen update status
agent: build
---

Run only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60
```

Report the returned status, checked time, `DATA_CHANGED`, commit, publication tag, live URL, and run-log path. `DATA_CHANGED=false` means the current sources were checked and the new checked-at timestamp was published even though the material content did not change. If the status is failed, report only the failure summary and run-log path. Do not rerun the update automatically. <!-- BUILD_BASH_DAILY_UPDATE_V1 --><!-- GOVERNANCE_EXCLUSION_RULE_V1 --><!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 -->
