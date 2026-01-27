@echo off
title Servidor de Mapas - Ciudad Juan Bosch / CPAG
color 0A

echo.
echo ========================================
echo   SERVIDOR DE MAPAS INTERACTIVOS
echo   Ciudad Juan Bosch + CPAG
echo ========================================
echo.

cd /d "%~dp0"

echo Iniciando servidor en http://localhost:9000
echo.
echo Puedes acceder a:
echo   - Vista Combinada: http://localhost:9000/vista-combinada.html
echo   - Mapa CPAG:       http://localhost:9000/MAPA%%20CPAG/index.html
echo   - Mapa CJB:        http://localhost:9000/MAPA%%20NUEVO%%20-%%20CJB/index.html
echo.
echo Presiona Ctrl+C para detener el servidor
echo ========================================
echo.

REM Open browser after a short delay
start "" timeout /t 2 /nobreak >nul && start http://localhost:9000/vista-combinada.html

REM Start the Python HTTP server
python -m http.server 9000

pause
