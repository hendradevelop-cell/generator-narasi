@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo [X] Docker tidak ditemukan. Install Docker Desktop dulu.
  echo     https://docs.docker.com/desktop/
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [X] Docker Desktop belum berjalan. Buka Docker Desktop lalu coba lagi.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo [X] backend\.env belum ada. Salin dari backend\.env.example lalu isi kredensial Supabase.
  pause
  exit /b 1
)

if not exist "frontend\.env.local" (
  echo [X] frontend\.env.local belum ada. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.
  pause
  exit /b 1
)

set "COMPOSE=docker compose"
docker compose version >nul 2>nul
if errorlevel 1 set "COMPOSE=docker-compose"

echo Membangun dan menjalankan container...
%COMPOSE% --env-file frontend\.env.local up -d --build
if errorlevel 1 (
  echo.
  echo [X] Gagal menjalankan Docker Compose. Periksa pesan di atas.
  pause
  exit /b 1
)

echo.
echo Aplikasi : http://localhost:3000
echo API docs : http://localhost:8000/docs
echo Logs     : %COMPOSE% logs -f
echo Stop     : %COMPOSE% down
echo.
echo Untuk akses LAN, buka http://^<IP-LAN^>:3000 dan izinkan port 3000/8000 di firewall.
pause
