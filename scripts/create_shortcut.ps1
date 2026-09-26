$projectRoot = (Get-Item $PSScriptRoot).Parent.FullName
$ws = New-Object -ComObject WScript.Shell
$shortcutPath = "C:\Users\Admin\Desktop\TikTok Trend Radar - Login.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $projectRoot "TikTok_Login.cmd"
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "TikTok Trend Radar Manual Login Launcher"
$shortcut.Save()

[PSCustomObject]@{
    ResolvedProjectRoot = $projectRoot
    ShortcutExists      = (Test-Path $shortcutPath)
    TargetPath          = $shortcut.TargetPath
    TargetExists        = (Test-Path $shortcut.TargetPath)
    WorkingDirectory    = $shortcut.WorkingDirectory
} | Format-List
