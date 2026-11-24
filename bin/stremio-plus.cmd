@echo off
rem Stremio+ CLI wrapper (Windows). The CLI itself is cli\index.js; run "stremio-plus help" for commands.
setlocal
set "NODE=%~dp0..\runtime\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0..\cli\index.js" %*
