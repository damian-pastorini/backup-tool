<#
 Backup Tool - desktop shortcuts (Windows only)

 Creates a desktop shortcut that starts the Backup Tool (web panel and scheduled backups) and opens the panel in the
 default browser. If the Backup Tool is already running, the shortcut only opens the panel.

 - Default: "Backup Tool" runs it as a tray icon, without a console window (scripts\tray.vbs and scripts\tray.ps1).
   Stop it with the tray icon's Exit.
 - -Console: "Backup Tool (console)" runs "node index.js --open" in a minimized console window, like starting it from
   a terminal. Stop it by closing that window.

 The shortcuts point to this folder, so they are created on each computer instead of being kept in the project.

 USAGE (from the project folder):
 - npm run shortcut
 - npm run shortcut -- -Console
#>
param([switch]$Console)

$projectPath = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $projectPath 'public\backup-tool.ico'
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')

if($Console){
    $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Backup Tool (console).lnk'))
    $shortcut.TargetPath = (Get-Command node -ErrorAction Stop).Source
    $shortcut.Arguments = 'index.js --open'
    # 7 = minimized window
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Start the Backup Tool in a console window and open its panel in the browser'
}
if(-not $Console){
    $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Backup Tool.lnk'))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $shortcut.Arguments = '"'+(Join-Path $projectPath 'scripts\tray.vbs')+'" -Open'
    $shortcut.Description = 'Start the Backup Tool in the tray and open its panel in the browser'
}
$shortcut.WorkingDirectory = $projectPath
$shortcut.IconLocation = $icon
$shortcut.Save()
Write-Output ('Created: '+$shortcut.FullName)
