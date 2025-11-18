@echo off
echo ========================================
echo Starting React Dev Server
echo ========================================
echo.

REM Kill any existing Node processes
echo [1/4] Stopping any existing Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Clear cache
echo [2/4] Clearing React cache...
if exist node_modules\.cache rmdir /s /q node_modules\.cache

REM Set PORT environment variable
echo [3/4] Setting PORT to 3000...
set PORT=3000

REM Start the server
echo [4/4] Starting dev server...
echo.
echo ========================================
echo Server starting... Please wait
echo ========================================
echo.
echo Once you see "Compiled successfully!" and "Local: http://localhost:3000"
echo Open your browser to: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

npm start

