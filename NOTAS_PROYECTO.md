# 🗺️ SISTEMA VBC - MAPAS DE OBRAS
## Guía Rápida del Proyecto

---

## 📌 Cómo Iniciar
**Doble clic** en `SISTEMA_VBC.bat` → abre todo automáticamente

---

## 📁 Estructura del Proyecto

```
Mapa/
├── 📄 Datos de CPAG.csv          ← EDITAR para actualizar mapa CPAG
├── 📄 Datos de CJB.csv           ← EDITAR para actualizar mapa CJB
├── 📄 SISTEMA_VBC.bat            ← Doble clic para iniciar
├── 📄 Presentacion_Mapas_VBC.html  ← Presentación ejecutiva
├── 📄 vista-combinada.html         ← Vista lado a lado
├── 📄 flujo-2027.html              ← 💰 Flujo de caja 2027 sobre el mapa
├── 📄 Actualizar Flujo 2027.bat    ← Regenera data/flujo_2027.json desde el Excel
├── 📁 data/flujo_2027.json         ← Datos del flujo (generado, fuera de git)
├── 📁 tools/                       ← Script de exportación del flujo
├── 📁 vbc-core/                    ← Núcleo compartido (tema, eventos, reportes)
├── 📁 MAPA CPAG/                 ← App del mapa CPAG
├── 📁 MAPA NUEVO - CJB/          ← App del mapa CJB
├── 📁 Timelapse CJB/             ← Imágenes satelitales + vistas timelapse
├── 📁 assets/                    ← Logos institucionales
├── 📁 _RESPALDO/                 ← Archivos movidos (BHD, duplicados, etc.)
├── 📄 NOTAS_PROYECTO.md          ← Este archivo
└── 📄 README.md
```

---

## 🔄 Cómo Actualizar los Datos del Mapa

1. Abre `Datos de CPAG.csv` o `Datos de CJB.csv` con Excel
2. Modifica los datos que necesites
3. Guarda el archivo (mantener formato CSV)
4. Refresca el navegador (F5) → los cambios se reflejan inmediatamente

---

## 💰 Pestaña «Flujo 2027»

Muestra sobre el mapa y con gráficos el flujo de caja proyectado **oct-2026 → dic-2027**:
obras en ejecución (pagos), lotes adjudicados y a licitar (cobros) y cartera por cobrar.
Se ve por proyecto (**CJB / CPAG / Consolidado**) y por escenario (**Conservador / Base / Optimista**).

- **Fuente única:** `VBC2\Planificación Estratégica\01 Autosuficiencia Financiera\Presupuesto\2027\Flujo de Caja VBC Oct2026-Dic2027 v*.xlsx`.
  El script toma solo la versión más alta (v1 → v1.1 → v1.2…) e imprime cuál usó.
  La página no lee el Excel; lee `data/flujo_2027.json`.
- **Para actualizar los datos:** doble clic en `Actualizar Flujo 2027.bat` y refrescar la página (F5).
  El script (`tools/export_flujo_2027.py`) copia el Excel a una carpeta temporal (el original no se toca,
  puede estar abierto), recalcula los 3 escenarios con Excel, valida que cada detalle cuadre con
  `Flujo_Mensual` y el `Panel`, e imprime el resumen por escenario.
- **Llave del mapa:** `ClaveMapa` = Proyecto-ID (ej. `CJB-04-13-01`). CJB y CPAG repiten IDs.
  Las claves `CJB-GENERAL`, `*-POR-CONFIRMAR` y `PORCONF-*` no tienen lote en el mapa: salen en tablas y totales.
- `data/flujo_2027.json` está en `.gitignore`: tiene saldos de clientes y el repositorio es público.
- **Filtrar:** clic en un lote (mapa o tabla) muestra solo ese lote; **Ctrl+clic** suma o quita varios.
  La leyenda apaga/prende capas. Tarjetas, gráfico y barras se recalculan con lo seleccionado.
  **✕ Quitar filtros** vuelve a todo (Consolidado). El botón ◎ del mapa acerca a los lotes con movimiento.

## 🌗 Modo claro / oscuro

Todas las páginas tienen modo claro (`body.light-mode`). `vbc-core/vbc-theme-sync.js` guarda la
preferencia en `localStorage['vbc-theme']` y la aplica al navegar entre páginas.
La pestaña Flujo 2027 abre en claro si no hay preferencia guardada.

---

## 🌐 URLs del Sistema (puerto 9000)
| Vista | URL |
|---|---|
| Presentación | `http://localhost:9000/Presentacion_Mapas_VBC.html` |
| Vista Combinada | `http://localhost:9000/vista-combinada.html` |
| Flujo 2027 | `http://localhost:9000/flujo-2027.html` |
| CPAG | `http://localhost:9000/MAPA%20CPAG/index.html` |
| CJB | `http://localhost:9000/MAPA%20NUEVO%20-%20CJB/index.html` |

---

## 💬 Conversaciones en Antigravity
- **"Sistema VBC Mapas - Organización y Servidor"** ← Esta conversación
- **"Refining Santiago Map Display"** — Colores y leyenda del mapa
- **"Fixing Map Display Issues"** — Corrección de carga SVG/CSV
- **"Refining UI Theme Implementation"** — Tema elite para mapas

---

## 📝 Último Estado (Agosto 2026)
- ✅ Motor de cálculo de plazos y vencimientos dinámico en tiempo real (`new Date()`).
- ✅ Rediseño de panel de detalles con acordeones minimalistas (Emil Kowalski / UX-UI-Pro-Max).
- ✅ Eliminación global del campo duplicado Área en todos los lotes.
- ✅ Expediente jurídico y adendas estructurado sin cortes visuales (`.legal-dossier-list`).
- ✅ Filtro de plazos depurado con alertas preventivas (`⚡ Próximo a Vencer < 3 Meses`).
- 🟡 **En espera de información:** Recepción de matriz financiera de Francisco Joa y Master Plans técnicos de desarrolladores.
