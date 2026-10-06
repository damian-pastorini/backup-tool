<#
 Backup Tool - shortcuts

 Creates the "Backup Tool" desktop shortcut: it starts the web panel in a minimized console window and opens it in
 the default browser (if the panel is already running it only opens the browser). Close that console window to
 stop the panel.

 With -Startup it also adds a "Backup Tool Scheduler" shortcut to the Windows Startup folder, which starts the
 scheduler (run-scheduler.js) in a minimized console window at login, so the scheduled backups run without the panel.

 USAGE (from the project folder):
 - npm run shortcut
 - npm run shortcut -- -Startup
#>
param([switch]$Startup)

$projectPath = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$icon = Join-Path $projectPath 'public\backup-tool.ico'
$shell = New-Object -ComObject WScript.Shell

function New-BackupToolShortcut([string]$shortcutPath, [string]$arguments, [string]$description)
{
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $node
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $projectPath
    $shortcut.IconLocation = $icon
    # 7 = minimized window
    $shortcut.WindowStyle = 7
    $shortcut.Description = $description
    $shortcut.Save()
    Write-Output ('Created: '+$shortcutPath)
}

$desktop = [Environment]::GetFolderPath('Desktop')
New-BackupToolShortcut (Join-Path $desktop 'Backup Tool.lnk') 'index.js --open' 'Start the Backup Tool panel and open it in the browser'

if($Startup){
    $startupFolder = [Environment]::GetFolderPath('Startup')
    New-BackupToolShortcut (Join-Path $startupFolder 'Backup Tool Scheduler.lnk') 'run-scheduler.js' 'Start the Backup Tool scheduler at login'
}
