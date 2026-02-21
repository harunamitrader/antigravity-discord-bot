$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Antigravity Debug Mode.lnk")
$Shortcut.TargetPath = "C:\Users\plane\AppData\Local\Programs\Antigravity\Antigravity.exe"
$Shortcut.Arguments = "--remote-debugging-port=9222"
$Shortcut.WorkingDirectory = "C:\Users\plane\AppData\Local\Programs\Antigravity"
$Shortcut.Save()
Write-Host "Shortcut created successfully at $DesktopPath\Antigravity Debug Mode.lnk"
