---
description: Check the controlled professional-screen update status
agent: build
---

Run the trusted command interpolation. It does not rely on the model Bash tool:

!`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Get-ProfessionalScreenUpdateStatus.ps1 -WaitSeconds 60`

Report the returned status, commit when published, and run-log path. If the status is failed, report only the failure summary and run-log path. Do not rerun the update automatically. <!-- COMMAND_SHELL_INTERPOLATION_V1 --><!-- GOVERNANCE_EXCLUSION_RULE_V1 -->
