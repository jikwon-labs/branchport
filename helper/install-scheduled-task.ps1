$ErrorActionPreference = "Stop"
$toolDir = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$server = Join-Path $PSScriptRoot "server.js"
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $server + '"') -WorkingDirectory $toolDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Branchport" -Action $action -Trigger $trigger -Settings $settings -Description "Branchport local helper" -Force | Out-Null
Start-ScheduledTask -TaskName "Branchport"
Write-Output "Installed and started: Branchport"
