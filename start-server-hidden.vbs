Set shell = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run Chr(34) & projectDir & "\start-server.cmd" & Chr(34) & " --hidden", 0, False
