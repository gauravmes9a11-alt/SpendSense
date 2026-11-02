@echo off
echo ============================================
echo   SpendSense - Starting Backend + Frontend
echo ============================================
echo.

REM Check if backend .env exists
if not exist "%~dp0backend\.env" (
    echo [WARNING] backend\.env not found!
    echo           Copy backend\.env.example to backend\.env and fill in your MySQL credentials.
    echo.
    pause
    exit /b 1
)

REM Start FastAPI backend (port 8000)
start "SpendSense Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

REM Small delay so backend starts first
timeout /t 2 /nobreak >nul

REM Start Vite frontend (port 5173)
start "SpendSense Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

echo.
echo SpendSense is launching!
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://127.0.0.1:8000/docs
echo.
echo Keep both console windows open.
