---
description: Check the controlled professional-screen update status
---

Do not edit files. Run only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60
```

Report the returned status, commit when published, and run-log path. If the status is failed, report only the failure summary and run-log path. Do not rerun the update automatically. <!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
