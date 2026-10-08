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

## 🌐 URLs del Sistema (puerto 9000)
| Vista | URL |
|---|---|
| Presentación | `http://localhost:9000/Presentacion_Mapas_VBC.html` |
| Vista Combinada | `http://localhost:9000/vista-combinada.html` |
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
