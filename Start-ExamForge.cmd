@echo off
setlocal
pushd "%~dp0" || exit /b 1

call :ready http://localhost:4000/api/health
if errorlevel 1 start "ExamForge Backend" "%ComSpec%" /k "npm.cmd run dev -w backend"

call :ready http://localhost:3000/login
if errorlevel 1 (
  set "EXAMFORGE_LOCAL_RUN=1"
  start "ExamForge Frontend" "%ComSpec%" /k "npm.cmd run start:local -w frontend"
)

for /l %%i in (1,1,120) do (
  call :ready http://localhost:4000/api/health && call :ready http://localhost:3000/login && goto :running
  powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1"
)

echo ExamForge did not start. Check the Backend and Frontend windows for errors.
popd
pause
exit /b 1

:running
echo ExamForge is running at http://localhost:3000
if /i not "%~1"=="--no-browser" start "" "http://localhost:3000"
popd
exit /b 0

:ready
curl.exe --silent --fail --max-time 2 --output NUL %1
exit /b %errorlevel%
