@echo off
setlocal
REM Atalho para desenvolvimento no Windows. Requer apenas o Node.js 20+.
REM O banco PostgreSQL e escolhido automaticamente: Docker (se estiver rodando) > PostgreSQL ja ativo na porta 5432 > banco local embutido.
cd /d %~dp0
title Controle BSC - Iniciar

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale o Node.js 20 ou superior: https://nodejs.org
  goto :fim
)

if not exist backend\.env copy backend\.env.example backend\.env >nul
REM Sempre confere as dependencias (rapido quando ja estao em dia; necessario apos atualizacoes)
echo Conferindo dependencias...
call npm --prefix backend install --no-audit --no-fund
call npm --prefix frontend install --no-audit --no-fund

REM ---- Banco de dados ----
where docker >nul 2>&1
if errorlevel 1 goto :semdocker
docker info >nul 2>&1
if errorlevel 1 goto :semdocker

echo Iniciando o banco PostgreSQL com Docker...
docker compose up -d db
if errorlevel 1 (
  echo [AVISO] O Docker nao conseguiu iniciar o banco. Vou usar o banco local embutido.
  goto :semdocker
)
set /a tentativas=0
:esperar
docker compose exec -T db pg_isready -U bsc -d bsc >nul 2>&1
if not errorlevel 1 goto :api
set /a tentativas+=1
if %tentativas% GEQ 40 (
  echo [ERRO] O banco nao ficou pronto em 80 segundos. Rode "docker compose logs db" para ver o motivo.
  goto :fim
)
echo Aguardando o banco ficar pronto... ^(%tentativas%/40^)
timeout /t 2 /nobreak >nul
goto :esperar

:semdocker
call :testaporta
if not errorlevel 1 (
  echo Ja existe um PostgreSQL ativo na porta 5432. Vou usa-lo ^(confira DATABASE_URL em backend\.env^).
  goto :api
)
echo Docker indisponivel: iniciando o banco PostgreSQL local embutido ^(dados em .dados-pg^)...
start "Banco PostgreSQL - Controle BSC (nao feche)" cmd /k "cd backend && npm run banco:local"
set /a tentativas=0
:esperalocal
call :testaporta
if not errorlevel 1 goto :api
set /a tentativas+=1
if %tentativas% GEQ 60 (
  echo [ERRO] O banco local nao iniciou. Veja a janela "Banco PostgreSQL - Controle BSC".
  goto :fim
)
echo Aguardando o banco local... ^(%tentativas%/60^)
timeout /t 2 /nobreak >nul
goto :esperalocal

:api
call npm run preparar
if errorlevel 1 (
  echo.
  echo [ERRO] Nao foi possivel preparar o banco. Veja a mensagem acima ^(confira DATABASE_URL em backend\.env^).
  goto :fim
)
start "API - Controle BSC" cmd /k "cd backend && npm run dev"
start "Web - Controle BSC" cmd /k "cd frontend && npm run dev"
echo.
echo Abra http://localhost:5173  ^(usuario: admin / senha inicial: Trocar@123^)
timeout /t 8 >nul
goto :eof

:testaporta
node -e "require('net').connect(5432,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
exit /b %errorlevel%

:fim
echo.
pause
