@echo off
setlocal

cd /d "%~dp0"

echo Iniciando Brasil Express CRM...
npm.cmd run dev

if errorlevel 1 (
  echo.
  echo O servidor parou com erro.
  if /i not "%1"=="--hidden" pause
)
