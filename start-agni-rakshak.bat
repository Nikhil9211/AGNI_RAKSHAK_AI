@echo off
setlocal
cd /d "%~dp0"
title AGNI RAKSHAK AI

echo ==============================================
echo   AGNI RAKSHAK AI - STARTUP CHECK
echo ==============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Install Node.js 20 or newer, then reopen this file.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not installed or is not on PATH.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env. Add your NASA FIRMS key to enable live satellite data.
)

if not exist "node_modules\.bin\tsx.cmd" (
  echo Installing project dependencies. This can take a few minutes...
  call npm ci
  if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed. Check internet access and the npm error above.
    pause
    exit /b 1
  )
)
if not exist "node_modules\.bin\vite.cmd" (
  echo ERROR: Vite is missing after dependency installation. Run npm ci and retry.
  pause
  exit /b 1
)

REM Run the server in its own window so this launcher can wait for a healthy API.
start "AGNI RAKSHAK AI SERVER" /D "%~dp0" cmd /k "npm run dev"
echo Waiting for the server to become ready...
set "READY="
for /L %%i in (1,1,30) do (
  curl.exe -fsS http://localhost:3000/api/health >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :server_ready
  )
  timeout /t 2 /nobreak >nul
)

:server_ready
if not defined READY (
  echo ERROR: Server did not become healthy within 60 seconds.
  echo Check the AGNI RAKSHAK AI SERVER window for the actual error.
  pause
  exit /b 1
)
echo Server is ready. Opening http://localhost:3000
echo.
start "" "http://localhost:3000"
echo Keep the server window open while using AGNI RAKSHAK AI.
endlocal
