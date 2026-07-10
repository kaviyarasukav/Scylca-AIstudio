@echo off
echo Starting Delta Trading Bot Dev Server...
echo.
REM Bypass PowerShell execution policies by invoking Node.js directly
node node_modules\tsx\dist\cli.mjs server.ts
pause
