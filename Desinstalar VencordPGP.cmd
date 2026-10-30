@echo off
setlocal EnableExtensions
title VencordPGP Uninstaller
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

if not exist "%~dp0installer\VencordPGP-Installer.ps1" goto missing

rem Idioma de los mensajes / message language: -Language auto|es|en (auto por defecto).
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\VencordPGP-Installer.ps1" -Uninstall %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo El desinstalador termino con codigo %RC% / The uninstaller exited with code %RC%.
    pause
)
exit /b %RC%

:missing
echo.
echo ERROR: falta installer\VencordPGP-Installer.ps1 / installer\VencordPGP-Installer.ps1 is missing.
echo Descomprime el ZIP completo "VencordPGP-Installer.zip" y ejecuta este archivo desde ahi.
echo Extract the full "VencordPGP-Installer.zip" and run this file from there.
echo.
pause
exit /b 2
