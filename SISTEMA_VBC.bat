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

echo [1/2] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado o no esta en el PATH
    echo Por favor instala Python desde https://python.org
    pause
    exit /b 1
)

echo [2/2] Iniciando servidor en puerto 9000...
echo.
echo ============================================================
echo   SISTEMA ACTIVO
echo ============================================================
echo.
echo   Presentacion:      http://localhost:9000/Presentacion_Mapas_VBC.html
echo   Vista Combinada:   http://localhost:9000/vista-combinada.html
echo   CPAG:              http://localhost:9000/MAPA%%20CPAG/index.html
echo   CJB:               http://localhost:9000/MAPA%%20NUEVO%%20-%%20CJB/index.html
echo.
echo   Archivos de Datos:
echo     - Datos de CPAG.csv  (editar para actualizar mapa CPAG)
echo     - Datos de CJB.csv   (editar para actualizar mapa CJB)
echo.
echo   Para cerrar: Cierra esta ventana o presiona Ctrl+C
echo ============================================================
echo.

REM Abrir navegador automaticamente despues de 1 segundo
start "" cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:9000/Presentacion_Mapas_VBC.html"

REM Iniciar servidor Python (esto mantiene la ventana abierta)
python -m http.server 9000
