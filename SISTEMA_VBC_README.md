# Sistema de Medición de Obras - Fideicomiso VBC

## Descripción
Sistema unificado para el monitoreo y medición de avance de obras en las ciudades:
- **Ciudad Presidente Antonio Guzmán (CPAG)** - Santiago
- **Ciudad Juan Bosch (CJB)**

## Arquitectura

```
📁 Mapa/
├── 🚀 SISTEMA_VBC.bat          # Punto de entrada - DOBLE CLICK PARA INICIAR
├── 📊 vista-combinada.html      # Vista dual de ambos mapas
│
├── 📁 MAPA CPAG/                # Ciudad Pres. Antonio Guzmán
│   ├── index.html
│   ├── js/app.js
│   ├── data/lotesv2.csv
│   └── assets/mapa.svg
│
└── 📁 MAPA NUEVO - CJB/         # Ciudad Juan Bosch
    ├── index.html
    ├── js/app.js
    ├── data/lotesv2.csv
    └── assets/mapa.svg
```

## Cómo Usar

### Iniciar el Sistema
1. Navega a la carpeta `Mapa`
2. Doble click en **`SISTEMA_VBC.bat`**
3. Se abrirá automáticamente la vista combinada en el navegador

### URLs Disponibles
- Vista Combinada: `http://localhost:9000/vista-combinada.html`
- CPAG Completo: `http://localhost:9000/MAPA%20CPAG/index.html`
- CJB Completo: `http://localhost:9000/MAPA%20NUEVO%20-%20CJB/index.html`

## Notas para Desarrollo

### Sincronización de Cambios
Cuando se realicen mejoras o auditorías, aplicar a AMBOS mapas:
- `MAPA CPAG/js/app.js` y `MAPA NUEVO - CJB/js/app.js`
- `MAPA CPAG/index.html` y `MAPA NUEVO - CJB/index.html`
- Estilos CSS compartidos

### Datos CSV
Cada ciudad tiene su propio archivo de datos:
- `MAPA CPAG/data/lotesv2.csv`
- `MAPA NUEVO - CJB/data/lotesv2.csv`

---
*Fideicomiso VBC - Sistema de Obras 2025*
