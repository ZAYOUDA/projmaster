@echo off
title ProjMaster - Serveur local (dev)
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERREUR] npm/Node.js introuvable sur cette machine.
    echo Installez Node.js ^(https://nodejs.org^) puis relancez ce fichier.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Premiere utilisation : installation des dependances...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERREUR] echec de "npm install". Verifiez votre connexion internet.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Demarrage de ProjMaster sur http://localhost:5175 ...
echo (laissez cette fenetre ouverte tant que vous utilisez l'application - fermez-la pour arreter le serveur)
echo.

REM Ouvre le navigateur automatiquement une fois le serveur pret, sans bloquer le demarrage.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5175"

call npm run dev

echo.
echo Serveur arrete.
pause
