$ErrorActionPreference = "Stop"
Stop-ScheduledTask -TaskName "Branchport" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Branchport" -Confirm:$false -ErrorAction SilentlyContinue
Write-Output "Uninstalled: Branchport"
