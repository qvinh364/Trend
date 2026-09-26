$projectRoot = "D:\Antigravity\Project\Update tin tức"
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "TikTok Trend Radar - Search Diagnostic.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $projectRoot "TikTok_Search_Diagnostic.cmd"
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "TikTok Trend Radar Search Diagnostic Interactive Runner"
$shortcut.Save()

Write-Output "Shortcut created successfully at: $shortcutPath"
