@echo off
title Presentacion Sistema VBC - Iniciando...
color 0A

echo.
echo ========================================================
echo   SISTEMA DE GESTION TERRITORIAL VBC
echo   Presentacion para Direccion Territorial
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Iniciando servidor HTTP en puerto 8888...
start /min cmd /c "npx -y http-server -p 8888 --cors -c-1"

echo [2/3] Esperando inicio del servidor...
timeout /t 4 /nobreak >nul

echo [3/3] Abriendo presentacion en navegador...
start http://127.0.0.1:8888/Presentacion_Mapas_VBC.html

echo.
echo ========================================================
echo   SERVIDOR ACTIVO EN: http://127.0.0.1:8888
echo ========================================================
echo.
echo   Mapas disponibles:
echo   - CJB:      http://127.0.0.1:8888/MAPA%%20NUEVO%%20-%%20CJB/index.html
echo   - CPAG:     http://127.0.0.1:8888/MAPA%%20CPAG/index.html
echo   - Combinado: http://127.0.0.1:8888/vista-combinada.html
echo.
echo   Presiona cualquier tecla para cerrar esta ventana.
echo   (El servidor seguira activo en segundo plano)
echo ========================================================
pause >nul
