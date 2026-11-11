@echo off
chcp 65001 >nul
echo === Folio Studio: сборка установщика для Windows ===
where node >nul 2>nul
if errorlevel 1 (
  echo Сначала установите Node.js с сайта nodejs.org ^(версия LTS^), затем запустите этот файл снова.
  pause
  exit /b
)
call npm install
call npm run dist
echo.
echo Готово! Установщик Folio Studio лежит в папке dist ^(файл Setup .exe^).
pause
