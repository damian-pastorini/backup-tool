<#
 Backup Tool - tray icon (Windows only)

 Starts the Backup Tool (node index.js: the web panel and the scheduled backups) without a console window and shows a
 tray icon instead. Double-click the icon to open the panel; right-click for Open panel, Open logs folder and Exit.
 Exit stops the Backup Tool cleanly: the running jobs save their logs first. The console output goes to
 logs\console-YYYYMMDD.log.

 If the Backup Tool is already running (started from a terminal with "node ." or by a tray that was closed), the
 icon controls that process instead of starting a second one. If a tray icon is already running, starting it again
 only opens the panel (with -Open).

 USAGE (the desktop shortcut created by "npm run shortcut" does this):
 - wscript scripts\tray.vbs -Open    (no window at all)
 - powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tray.ps1 -Open
 -Open opens the panel in the default browser once the Backup Tool is running.
#>
param([switch]$Open)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectPath = Split-Path -Parent $PSScriptRoot
$port = '9977'
if($env:BACKUP_TOOL_PORT){
    $port = $env:BACKUP_TOOL_PORT
}
$panelUrl = 'http://localhost:'+$port
$apiUrl = 'http://127.0.0.1:'+$port+'/api'
$script:nodeProcess = $null
$script:isExiting = $false
$script:wasRunning = $false

function Open-Panel
{
    Start-Process $panelUrl
}

function Test-BackupToolRunning
{
    try{
        Invoke-RestMethod -Uri ($apiUrl+'/status') -TimeoutSec 3 | Out-Null
        return $true
    }catch{
        return $false
    }
}

function Start-BackupTool([bool]$openPanel)
{
    $node = (Get-Command node -ErrorAction Stop).Source
    $arguments = @('index.js', '--log-console')
    if($openPanel){
        $arguments += '--open'
    }
    $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru
    # keeps the process handle, so the exit code can be read after it ends:
    $null = $process.Handle
    return $process
}

# only one tray icon at a time, starting it again only opens the panel:
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\BackupToolTray', [ref]$createdNew)
if(-not $createdNew){
    if($Open){
        Open-Panel
    }
    exit
}

# when the Backup Tool already runs (for example "node ." in a terminal), the icon controls it instead of starting another:
if(Test-BackupToolRunning){
    $script:wasRunning = $true
    if($Open){
        Open-Panel
    }
}
if(-not $script:wasRunning){
    $script:nodeProcess = Start-BackupTool $Open.IsPresent
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = New-Object System.Drawing.Icon (Join-Path $projectPath 'public\backup-tool.ico')
$notifyIcon.Text = 'Backup Tool - starting'
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add('Open panel')
$logsItem = $menu.Items.Add('Open logs folder')
$restartItem = $menu.Items.Add('Restart')
$restartItem.Visible = $false
[void]$menu.Items.Add('-')
$exitItem = $menu.Items.Add('Exit')
$notifyIcon.ContextMenuStrip = $menu

function Set-TrayText([string]$text)
{
    # Windows limits the tray tooltip to 63 characters:
    if(63 -lt $text.Length){
        $text = $text.Substring(0, 60)+'...'
    }
    $notifyIcon.Text = $text
}

function Test-NodeAlive
{
    if($null -ne $script:nodeProcess){
        return -not $script:nodeProcess.HasExited
    }
    return Test-BackupToolRunning
}

function Update-Status
{
    if($script:isExiting){
        return
    }
    if(-not (Test-NodeAlive)){
        if(-not $restartItem.Visible){
            $restartItem.Visible = $true
            Set-TrayText 'Backup Tool - stopped'
            $reason = 'The Backup Tool stopped.'
            if($null -ne $script:nodeProcess){
                $reason = 'The Backup Tool stopped (exit code '+$script:nodeProcess.ExitCode+').'
            }
            $notifyIcon.ShowBalloonTip(10000, 'Backup Tool stopped', $reason+' Right-click the tray icon to restart it.', [System.Windows.Forms.ToolTipIcon]::Warning)
        }
        return
    }
    try{
        $status = Invoke-RestMethod -Uri ($apiUrl+'/status') -TimeoutSec 5
    }catch{
        Set-TrayText 'Backup Tool - starting'
        return
    }
    $text = 'Backup Tool - idle'
    $scheduledRunning = @($status.scheduler.state.running).Count
    if($scheduledRunning -gt 0){
        $text = 'Backup Tool - running '+$scheduledRunning+' scheduled job(s)'
    }
    if($status.job -and $status.job.running){
        $text = 'Backup Tool - running: '+$status.job.label
    }
    $nextJob = @($status.schedule.jobs) | Where-Object { $_.nextRunAt } | Sort-Object nextRunAt | Select-Object -First 1
    if($nextJob){
        $text = $text+"`nNext: "+([datetime]$nextJob.nextRunAt).ToLocalTime().ToString('ddd dd/MM HH:mm')
    }
    Set-TrayText $text
}

function Stop-BackupTool
{
    $script:isExiting = $true
    $timer.Stop()
    Set-TrayText 'Backup Tool - stopping'
    if(Test-NodeAlive){
        try{
            Invoke-RestMethod -Method Post -Uri ($apiUrl+'/shutdown') -TimeoutSec 5 | Out-Null
        }catch{
            # it may already be stopping
        }
        # the running jobs save their logs before it exits:
        for($i = 0; $i -lt 60 -and (Test-NodeAlive); $i++){
            Start-Sleep -Milliseconds 500
        }
        if($null -ne $script:nodeProcess -and -not $script:nodeProcess.HasExited){
            Stop-Process -Id $script:nodeProcess.Id -Force
        }
    }
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
}

$openItem.add_Click({ Open-Panel })
$logsItem.add_Click({ Start-Process explorer.exe (Join-Path $projectPath 'logs') })
$notifyIcon.add_DoubleClick({ Open-Panel })
$restartItem.add_Click({
    $script:nodeProcess = Start-BackupTool $true
    $restartItem.Visible = $false
    Set-TrayText 'Backup Tool - starting'
})
$exitItem.add_Click({ Stop-BackupTool })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.add_Tick({ Update-Status })
$timer.Start()

[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
