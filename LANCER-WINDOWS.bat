@echo off
REM =====================================================================
REM  Shisnekai no Kami - Lancement automatique (Windows)
REM  Double-cliquez simplement sur ce fichier.
REM =====================================================================
title Shisnekai no Kami
cd /d "%~dp0"

echo.
echo   ==============================================
echo    SHISNEKAI NO KAMI  -  Demarrage
echo   ==============================================
echo.

REM 1) Verifier Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo   [!] Node.js n'est pas installe.
  echo       Installez-le ici (gratuit) : https://nodejs.org  ^(version LTS^)
  echo       Puis relancez ce fichier.
  echo.
  pause
  exit /b
)
for /f "delims=" %%v in ('node --version') do echo   [OK] Node.js detecte : %%v

REM 2) Installer les dependances si besoin
if not exist node_modules (
  echo   [..] Installation des composants ^(une seule fois^)...
  call npm install
)
echo   [OK] Composants prets.

REM 3) Trouver l'adresse IP locale
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  if not defined IP set IP=%%a
)
set IP=%IP: =%
if "%IP%"=="" set IP=^<votre-IP-locale^>

echo.
echo   ==============================================
echo    C'EST PRET !  Ouvrez ces adresses :
echo   ----------------------------------------------
echo    ANIMATEUR (vous) :  http://localhost:3000
echo    JOUEURS (memes WiFi):  http://%IP%:3000/play
echo   ----------------------------------------------
echo    Connexion admin/demo :
echo      Identifiant : Adonaishinsekai
echo      Mot de passe: 1234567
echo   ==============================================
echo    (Laissez cette fenetre ouverte pendant le jeu)
echo    (Pour arreter : fermez cette fenetre)
echo.

call npm start
pause
