@echo off
title Sistema VBC - Mapas de Obras
color 0A

echo.
echo ============================================================
echo    SISTEMA DE MEDICION DE OBRAS - FIDEICOMISO VBC
echo    Ciudad Juan Bosch + Ciudad Pres. Antonio Guzman
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/3] Limpiando procesos...
:: Mata cualquier python.exe zombie que este corriendo localmente y en conflicto con el puerto 9000
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9000" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo [2/3] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado o no esta en el PATH
    echo Por favor instala Python desde https://python.org
    pause
    exit /b 1
)

echo [3/3] Iniciando servidor dedicado en puerto 9000...
echo.
echo ============================================================
echo   SISTEMA ACTIVO
echo ============================================================
echo.
echo   Presentacion:      http://127.0.0.1:9000/Presentacion_Mapas_VBC.html
echo   Vista Combinada:   http://127.0.0.1:9000/vista-combinada.html
echo   CPAG:              http://127.0.0.1:9000/MAPA%%20CPAG/index.html
echo   CJB:               http://127.0.0.1:9000/MAPA%%20NUEVO%%20-%%20CJB/index.html
echo.
echo   Archivos de Datos:
echo     - Datos de CPAG.csv  (editar para actualizar mapa CPAG)
echo     - Datos de CJB.csv   (editar para actualizar mapa CJB)
echo.
echo   Para cerrar: Cierra esta ventana o presiona Ctrl+C
echo ============================================================
echo.

REM Inicia navegador apuntando de forma segura a 127.0.0.1
start "" cmd /c "timeout /t 1 /nobreak >nul && start http://127.0.0.1:9000/Presentacion_Mapas_VBC.html"

REM Servidor Python optimizado y multihilo para Evitar ERR_EMPTY_RESPONSE
python server_vbc.py
