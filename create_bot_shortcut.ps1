$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Antigravity Bot.lnk")
$Shortcut.TargetPath = "c:\Users\plane\.gemini\antigravity\playground\white-magnetar\start_bot.bat"
$Shortcut.WorkingDirectory = "c:\Users\plane\.gemini\antigravity\playground\white-magnetar"
$Shortcut.Save()
Write-Host "Shortcut created successfully at $DesktopPath\Antigravity Bot.lnk"
