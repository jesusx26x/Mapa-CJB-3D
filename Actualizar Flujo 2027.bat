@echo off
title Sistema VBC - Actualizar Flujo 2027
color 0B

echo.
echo ============================================================
echo    ACTUALIZAR PESTANA "FLUJO 2027" DEL SISTEMA VBC
echo    Lee el modelo Excel (copia temporal), recalcula con Excel
echo    las 8 versiones x 3 escenarios (1-2 minutos) y escribe
echo    data\flujo_2027.json. Guarde el Excel antes de correrlo.
echo    Solo la version elegida en el Panel: agregue --solo-activa
echo ============================================================
echo.
echo   El Excel original NO se modifica. Puede estar abierto.
echo.

cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado o no esta en el PATH
    pause
    exit /b 1
)

python tools\export_flujo_2027.py %*
if errorlevel 1 (
    echo.
    echo ERROR: la exportacion no termino. Revise el mensaje de arriba.
    pause
    exit /b 1
)

echo.
echo   Listo. Refresque http://127.0.0.1:9000/flujo-2027.html (F5)
echo.
pause
