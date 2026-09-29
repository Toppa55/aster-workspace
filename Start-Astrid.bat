@echo off
setlocal
cd /d "%~dp0"
title Astrid Workspace

echo.
echo ========================================
echo         Starting Astrid Workspace
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 22 or newer from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

node -e "const major=Number(process.versions.node.split('.')[0]);if(major<22){console.error('Astrid requires Node.js 22 or newer. Installed: '+process.versions.node);process.exit(1)}"
if errorlevel 1 goto :failed

if not exist "node_modules" (
  echo Installing Astrid for the first time...
  call npx --yes pnpm@11.25.0 install
  if errorlevel 1 goto :failed
)

node scripts/setup-local-env.mjs
if errorlevel 1 goto :failed

echo Checking the application and database...
call npx --yes pnpm@11.25.0 build
if errorlevel 1 goto :failed

if not exist ".wrangler\.aster-migrated" (
  call node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_thankful_blonde_phantom.sql
  if errorlevel 1 goto :failed

  call node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_ancient_midnight.sql
  if errorlevel 1 goto :failed

  if not exist ".wrangler" mkdir ".wrangler"
  echo ready>".wrangler\.aster-migrated"
)

if not exist ".wrangler\.migration-0002" (
  echo Adding secure external connections...
  call node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_clear_jean_grey.sql
  if errorlevel 1 goto :failed
  echo ready>".wrangler\.migration-0002"
)

echo.
echo Astrid will open at http://localhost:5173
echo Keep this window open while using Astrid.
echo Press Ctrl+C here when you want to stop it.
echo.

start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5173"
call npx --yes pnpm@11.25.0 dev
exit /b 0

:failed
echo.
echo Astrid could not start. The error is shown above.
pause
exit /b 1
