@echo off
setlocal
cd /d "%~dp0"
title Generator Narasi Multi-Agent - Launcher

echo ==============================================
echo   Generator Narasi Multi-Agent - Launcher
echo ==============================================
echo.

set PYTHONIOENCODING=utf-8

where python >nul 2>nul
if errorlevel 1 (
    echo [X] Python tidak ditemukan di PATH. Install Python 3 dulu, lalu jalankan ulang.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [X] npm tidak ditemukan di PATH. Install Node.js dulu, lalu jalankan ulang.
    pause
    exit /b 1
)

REM ---------- Backend ----------
if not exist "backend\.venv\Scripts\python.exe" (
    echo [Setup] Membuat virtualenv backend + install dependensi ^(sekali saja^)...
    pushd "backend"
    python -m venv .venv
    .venv\Scripts\python -m pip install --upgrade pip >nul
    .venv\Scripts\python -m pip install -r requirements.txt
    popd
    echo [Setup] Backend siap.
    echo.
)

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo [Backend] Port 8000 sudah terpakai - dilewati ^(server mungkin sudah berjalan^).
) else (
    echo [Backend] Menjalankan FastAPI di http://localhost:8000 ...
    start "Narasi-Backend" /d "%~dp0backend" cmd /k ".venv\Scripts\python -m uvicorn app.main:app --port 8000 --host 127.0.0.1"
)

REM ---------- Frontend ----------
if not exist "frontend\node_modules" (
    echo [Setup] npm install frontend ^(sekali saja, agak lama^)...
    pushd "frontend"
    call npm install
    popd
    echo [Setup] Frontend siap.
    echo.
)

netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo [Frontend] Port 3000 sudah terpakai - dilewati ^(server mungkin sudah berjalan^).
) else (
    echo [Frontend] Menjalankan Next.js di http://localhost:3000 ...
    start "Narasi-Frontend" /d "%~dp0frontend" cmd /k "npm run dev"
)

echo.
echo Menunggu server siap...
%SystemRoot%\System32\timeout.exe /t 8 /nobreak >nul
start "" http://localhost:3000

echo.
echo Selesai. Ada dua jendela terpisah: "Narasi-Backend" dan "Narasi-Frontend".
echo Tutup kedua jendela itu untuk menghentikan server.
echo   - Backend : http://localhost:8000/docs
echo   - Frontend: http://localhost:3000
echo   - Hentikan: tutup jendela Narasi-Backend dan Narasi-Frontend
pause
