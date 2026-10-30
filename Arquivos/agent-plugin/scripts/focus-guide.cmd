@echo off
rem Starts the Focus Guide MCP server or a hook. The app writes agent-launch.cmd with the path of its executable
rem each time it starts, so this plugin needs no absolute path.
set "FOCUS_GUIDE_LAUNCH=%APPDATA%\Focus Guide\agent-launch.cmd"
if not exist "%FOCUS_GUIDE_LAUNCH%" (
  echo Focus Guide: open the Focus Guide app once, then try again. File not found: "%FOCUS_GUIDE_LAUNCH%" 1>&2
  exit /b 1
)
call "%FOCUS_GUIDE_LAUNCH%" %*
exit /b %ERRORLEVEL%
