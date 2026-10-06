' Backup Tool - starts scripts\tray.ps1 (the tray icon) without showing any window, not even for a moment.
' Used by the desktop shortcut created by "npm run shortcut". Pass -Open to open the panel in the browser.
Dim shell, scriptsFolder, extraArguments
Set shell = CreateObject("WScript.Shell")
scriptsFolder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
extraArguments = ""
If WScript.Arguments.Count > 0 Then
    extraArguments = " " & WScript.Arguments(0)
End If
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptsFolder & "\tray.ps1""" & extraArguments, 0, False
