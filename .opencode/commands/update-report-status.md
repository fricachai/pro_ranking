---
description: Check the controlled professional-screen update status
agent: build
---

Run only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 10
```

Report the returned status, checked time, `DATA_CHANGED`, commit, publication tag, live URL, and run-log path. `DATA_CHANGED=false` means the current sources were checked and the new checked-at timestamp was published even though the material content did not change. If the status is failed, treat the result as a repair trigger: inspect the state／run log, identify the root cause, fix the relevant source／script／rule／test, and continue through the primary controlled update entry after the existing process has reached a terminal state. Do not create a competing background update, lower a quality threshold, fabricate data, or declare completion before validation. <!-- OPENCODE_AUTONOMOUS_REPAIR_V1 --><!-- BUILD_BASH_DAILY_UPDATE_V1 --><!-- GOVERNANCE_EXCLUSION_RULE_V1 --><!-- INTRADAY_REFRESH_V1 --><!-- REFRESH_TIMESTAMP_V1 -->
