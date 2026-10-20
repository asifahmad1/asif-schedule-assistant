@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
node -e "if(!(Number(process.versions.node.split('.')[0])>=24))process.exit(1)"
if errorlevel 1 (
  echo Please install Node.js 24 or newer.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection.
    pause
    exit /b 1
  )
)
echo.
echo Starting the app for PHONE access. Connect your phone to the SAME Wi-Fi as this laptop.
echo The phone address will be printed below. On your phone, open it in Chrome, then
echo use the browser menu -^> "Add to Home screen" to install the app.
echo.
set ASIF_BIND=lan
node server.mjs
pause
