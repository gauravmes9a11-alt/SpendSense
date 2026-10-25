@echo off
echo Starting SpendSense Backend and Frontend...
start "SpendSense Backend" cmd /k "cd /d %~dp0\backend && .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
start "SpendSense Frontend" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d %~dp0\frontend && npm.cmd run dev"
echo SpendSense is launching!
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
