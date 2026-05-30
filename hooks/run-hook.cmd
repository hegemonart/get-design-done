@echo off
REM hooks/run-hook.cmd — Windows polyglot wrapper that invokes a GDD .sh hook
REM through bash.
REM
REM Workaround for Claude Code's Windows auto-bash bug: CC can mis-handle a
REM SessionStart `command` that points directly at a `.sh` file on Windows
REM shells. This .cmd shim locates bash and runs the script explicitly, so the
REM SessionStart inject (hooks/inject-using-gdd.sh) fires on Windows too.
REM
REM Usage:  run-hook.cmd <script-name.sh> [args...]
REM Default (no arg): inject-using-gdd.sh — the SessionStart using-gdd injector.
REM The host harness's env (CLAUDE_PLUGIN_ROOT / CURSOR_PLUGIN_ROOT / COPILOT_CLI)
REM is inherited by bash and drives the emitter's per-harness branch.
setlocal

REM Script to run, relative to this .cmd's own directory (%~dp0 ends with a backslash).
set "HOOK_SCRIPT=%~1"
if "%HOOK_SCRIPT%"=="" set "HOOK_SCRIPT=inject-using-gdd.sh"
if not "%~1"=="" shift

set "HOOK_PATH=%~dp0%HOOK_SCRIPT%"

REM Prefer bash on PATH; fall back to a typical Git-for-Windows install location.
where bash >nul 2>nul
if %ERRORLEVEL%==0 (
  bash "%HOOK_PATH%" %*
) else if exist "%ProgramFiles%\Git\bin\bash.exe" (
  "%ProgramFiles%\Git\bin\bash.exe" "%HOOK_PATH%" %*
) else (
  REM No bash available: emit a valid empty SDK-shape JSON object so the
  REM SessionStart pipeline still receives parseable output and never breaks.
  echo {"additionalContext": ""}
)

endlocal
