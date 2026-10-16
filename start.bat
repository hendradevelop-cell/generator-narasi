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

REM ---------- Deteksi IP LAN (untuk akses dari perangkat lain) ----------
set LANIP=
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254."') do (
    if not defined LANIP set LANIP=%%i
)
if defined LANIP set LANIP=%LANIP: =%

REM ---------- Aturan firewall (otomatis bila dijalankan sebagai Administrator) ----------
net session >nul 2>&1
if errorlevel 1 (
    echo [Info] Tanpa hak admin. Bila Windows menanyakan izin firewall saat server
    echo        pertama kali berjalan, klik "Allow access" supaya bisa diakses dari
    echo        jaringan. Atau jalankan start.bat sebagai Administrator sekali saja
    echo        agar port 8000/3000 dibuka otomatis ^(berlaku terus^).
) else (
    netsh advfirewall firewall show rule name="Narasi Backend 8000" >nul 2>&1
    if errorlevel 1 (
        netsh advfirewall firewall add rule name="Narasi Backend 8000" dir=in action=allow protocol=TCP localport=8000 profile=domain,private >nul 2>&1
        echo [Firewall] Port 8000 dibuka ^(profil domain/privat^).
    )
    netsh advfirewall firewall show rule name="Narasi Frontend 3000" >nul 2>&1
    if errorlevel 1 (
        netsh advfirewall firewall add rule name="Narasi Frontend 3000" dir=in action=allow protocol=TCP localport=3000 profile=domain,private >nul 2>&1
        echo [Firewall] Port 3000 dibuka ^(profil domain/privat^).
    )
)
echo.

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
    echo [Backend] Menjalankan FastAPI di http://localhost:8000 ^(listen 0.0.0.0, bisa diakses dari jaringan^) ...
    start "Narasi-Backend" /d "%~dp0backend" cmd /k ".venv\Scripts\python -m uvicorn app.main:app --port 8000 --host 0.0.0.0"
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
    echo [Frontend] Menjalankan Next.js ^(localhost + jaringan^) ...
    start "Narasi-Frontend" /d "%~dp0frontend" cmd /k "npm run dev"
)

echo.
echo Menunggu server siap...
%SystemRoot%\System32\timeout.exe /t 8 /nobreak >nul
start "" http://localhost:3000

echo.
echo Selesai. Dua jendela terpisah: "Narasi-Backend" dan "Narasi-Frontend".
echo Tutup kedua jendela itu untuk menghentikan server.
echo   - Backend (lokal)  : http://localhost:8000/docs
echo   - Frontend (lokal) : http://localhost:3000
if defined LANIP (
    echo   - Dari perangkat lain di jaringan yang sama:
    echo       Frontend : http://%LANIP%:3000
    echo       Backend  : http://%LANIP%:8000/docs
    echo     ^(alamat pastinya juga tertulis sebagai baris "Network" di jendela Narasi-Frontend^)
)
echo   - Hentikan: tutup jendela Narasi-Backend dan Narasi-Frontend
pause
