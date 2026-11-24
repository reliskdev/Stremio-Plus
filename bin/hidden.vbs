' Runs the Stremio+ CLI with the given arguments and no console window (used by the Windows shortcuts).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
node = root & "\runtime\node\node.exe"
If Not fso.FileExists(node) Then node = "node"
args = ""
For Each a In WScript.Arguments
  args = args & " """ & a & """"
Next
sh.CurrentDirectory = root
sh.Run """" & node & """ """ & root & "\cli\index.js""" & args, 0, False
