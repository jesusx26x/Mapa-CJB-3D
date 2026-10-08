# Plan: pestaña «Flujo 2027» + modo claro en todo el Sistema VBC

Aprobado por John Marte el 8-oct-2026. Rama de trabajo: `flujo-2027`.
Diseño de referencia: [`flujo-2027-mockup.png`](flujo-2027-mockup.png). Mockup en HTML con datos reales: [`flujo-2027-mockup.html`](flujo-2027-mockup.html).

## 1. Objetivo

Agregar al sistema de mapas existente una pestaña nueva, **«💰 Flujo 2027»**, que muestre sobre el mapa y con gráficos el flujo de caja proyectado oct-2026 → dic-2027 del Fideicomiso VBC-RD:
- obras en ejecución (pagos de cubicaciones)
- lotes a licitar y adjudicados (cobros)
- cartera por cobrar

Se puede ver por proyecto **CJB / CPAG / Consolidado** y por escenario **Conservador / Base / Optimista**.

Además, **todo el sistema debe tener modo claro**, y la preferencia de tema debe mantenerse al navegar entre páginas.

Regla principal: **usar el mismo sistema, no crear uno nuevo**. Se usan los mismos SVG, las mismas librerías por CDN (Chart.js, PapaParse), el mismo servidor (`server_vbc.py`, puerto 9000), la misma tipografía (Inter / JetBrains Mono) y las mismas variables de color (`css/styles.css`: `--primary #0066cc` en claro, `#00a8ff` en oscuro, etc.).

## 2. Fuente de datos (fuente única de verdad)

El modelo financiero es el Excel:

`C:\Users\John Marte\Fideicomiso VBCRD\Fonvivienda - IDMP\VBC2\Planificación Estratégica\01 Autosuficiencia Financiera\Presupuesto\2027\Flujo de Caja VBC Oct2026-Dic2027 v1.xlsx`

La página **no** lee el Excel. Un script de exportación genera un JSON estático.

### 2.1 Script `tools/export_flujo_2027.py` + `Actualizar Flujo 2027.bat` (raíz de Mapa)

1. Copia el Excel a una carpeta temporal. **Nunca modificar ni guardar el Excel original** (puede estar abierto por el usuario).
2. Por cada escenario (`Conservador`, `Base`, `Optimista`):
   - escribe el nombre en `Panel!D5`
   - recalcula con **Excel por COM**: `Excel.Application`, `CalculateFull()`, guardar la copia. En esta máquina no hay LibreOffice; Excel 16 sí está instalado.
   - lee los valores, con openpyxl `data_only=True` o directo por COM.
3. Escribe `data/flujo_2027.json` (en la raíz de Mapa, junto a `Datos de CJB.csv`).
4. Imprime un resumen de control por escenario: ingresos, egresos, saldo final y saldo mínimo. Debe coincidir con `Panel!D9:D12` de ese escenario.

### 2.2 Mapa del Excel (verificar encabezados al leer; no confiar ciegamente en las letras)

Horizonte: 15 meses, oct-26 … dic-27.

| Hoja | Qué leer |
|---|---|
| `Panel` | `D5` escenario. KPIs en `B8:D17`: saldo inicial, ingresos, egresos, saldo final dic-27, saldo mínimo, mes del mínimo, meses negativos, colchón, **disponible PACC**, disponible al cierre. |
| `Flujo_Mensual` | Fila 4 = meses en `B:P`. Filas: 5 saldo inicial · 7 cartera · 8 recuperación legal · 9 LIC 2026-01 · 10 LIC 2027-01 · 11 ZFI · 12 lotes adicionales · 13 otros · **14 total ingresos** · 16 obras CJB · 17 obras CPAG · 18 reserva mant. general · 19 retenidos · 20–24 gastos fijos (RRHH, Carga fija, Admin, Mantenimientos, Bienes muebles) · **25 total egresos** · 26 neto · **27 saldo final** · 28 colchón · 30 estado. `Q/R/S` = totales oct–dic 26 / 2027 / período. |
| `Obras` | Filas 6–21 (16 obras). A #, B Proyecto, C ID lote, **D ClaveMapa**, E Obra, F Contratista, G Tipo (Contrato/Reserva), H Estatus, I Confianza del ID, J Contrato, K Adenda, N Restante, T Incluir, Y Modo. **Pagos por mes en `AC:AQ`** (fila 5 = fechas), `AR` total horizonte, `AS` posterior 2028+. |
| `Licitaciones` | Filas 6–22. A Grupo (`LIC 2026-01`, `LIC 2027-01`, `ZFI 2027-02`, `Lotes adicionales`), C ID, D ClaveMapa, E Área, J Precio aplicado, K Valor, L Adjudicatario, P Fecha firma, R Probabilidad, S Valor esperado, T Cobro en horizonte, U Posterior. |
| `Cuotas` | Tabla `tCuotas` (A4:M…): Grupo, Proyecto, IDLote, ClaveMapa, Cuota, Porcentaje, MesesDesdeFirma, FechaFirma, FechaCuota, **Mes**, MontoEsperado, EnHorizonte, MontoEnHorizonte. Úsala para el detalle mes a mes de cada lote a licitar. |
| `CxC_Cartera` | Filas 6–31. A Proyecto, B ID, C ClaveMapa, E Cliente, I Saldo, K Situación (`Con plan` / `Sin plan (legal)` / `Sin saldo`), O Recuperación legal. **Cobros por mes en `P:AD`**, `AE` total, `AF` posterior. |
| `Retenidos` | Filas 6–20. B Proyecto, D ClaveMapa, E Contratista, F Obra, G Monto, J Mes de pago ajustado, meses `K:Y`, `Z` total. |
| `Lotes_Maestro` | Tabla `tLotes`: Proyecto, IDLote, ClaveMapa, Tipo, Subtipo, Nombre, Desarrollador, AreaM2, …, **IngresosHorizonte (M)**, **EgresosObrasHorizonte (N)**, FlujoNetoLote, ConMovimiento. |

**Llave del mapa:** `ClaveMapa` = `Proyecto-ID`, por ejemplo `CJB-04-13-01`. En el SVG el `id` es solo `04-13-01`, así que hay que quitar el prefijo según el proyecto activo.

CJB y CPAG **repiten IDs** (ej. `01-01-01` existe en los dos). Nunca usar el ID sin el proyecto.

Claves virtuales sin lote en el mapa (van solo en tablas y números):
- `CJB-GENERAL` (Señalización, Mantenimiento General)
- `CJB-POR-CONFIRMAR` (Vial #1, Vial #2)
- `CPAG-POR-CONFIRMAR` (Tramo #2 CPAG, Vías Internas Santiago)
- `PORCONF-22-B` y `PORCONF-22-C` (cartera sin ID)

### 2.3 Esquema propuesto de `data/flujo_2027.json`

```json
{
  "generado": "2026-10-08T10:00:00",
  "fuente": "Flujo de Caja VBC Oct2026-Dic2027 v1.xlsx",
  "meses": ["2026-10", "...", "2027-12"],
  "escenarios": {
    "Base": {
      "kpis": {"saldoInicial":0, "ingresos":0, "egresos":0, "saldoFinal":0, "saldoMin":0, "mesSaldoMin":"2027-04",
               "mesesNegativos":0, "colchon":0, "disponiblePACC":0, "disponibleCierre":0},
      "mensual": {"ingresos": {"cartera":[], "recupLegal":[], "lic2026":[], "lic2027":[], "zfi":[], "adicionales":[], "otros":[], "total":[]},
                  "egresos": {"obrasCJB":[], "obrasCPAG":[], "mantGeneral":[], "retenidos":[], "gastosFijos":[], "total":[]},
                  "neto":[], "saldo":[], "estado":[]},
      "obras": [{"clave":"CJB-04-13-01", "proyecto":"CJB", "id":"04-13-01", "obra":"", "contratista":"", "estatus":"", "confianza":"",
                 "restante":0, "pagos":[], "totalHorizonte":0, "posterior":0, "incluida":true}],
      "licitaciones": [{"clave":"", "proyecto":"CJB", "id":"", "grupo":"LIC 2027-01", "area":0, "valor":0, "adjudicatario":"",
                        "fechaFirma":"2027-06-16", "probabilidad":1, "cobros":[], "cobroHorizonte":0, "posterior":0}],
      "cartera": [{"clave":"", "proyecto":"CJB", "id":"", "cliente":"", "situacion":"Con plan", "saldo":0, "cobros":[], "totalHorizonte":0, "recupLegal":0}],
      "retenidos": [{"clave":"", "proyecto":"CJB", "obra":"", "monto":0, "mes":"2027-03", "pagos":[]}],
      "lotes": {"CJB-04-13-01": {"categoria":"obra", "ingresos":0, "egresos":0}}
    },
    "Conservador": {},
    "Optimista": {}
  }
}
```

**Categoría de cada lote para colorear el mapa.** Si un lote cae en varias categorías, gana la que aparece primero en la tabla:

| Categoría | Color | Regla |
|---|---|---|
| `obra` | `#f97316` | Clave en `Obras` con ID real (no virtual) |
| `adjudicada` | `#0d9488` | Grupo `LIC 2026-01` |
| `licitar` | `#22c55e` | `LIC 2027-01` o `ZFI 2027-02` |
| `opcional` | `#a3e635` | `Lotes adicionales`; atenuado si su probabilidad es 0 |
| `cartera` | `#3b82f6` | `CxC_Cartera` con plan y cobro > 0 |
| `legal` | `#ef4444` | Situación `Sin plan (legal)` |
| sin movimiento | `#e9edf2` (claro) / `#1e293b` (oscuro) | Todo lo demás |

## 3. Página nueva `flujo-2027.html` (raíz de Mapa, junto a `vista-combinada.html`)

El layout es exactamente el del mockup, de arriba hacia abajo:

1. **Header** igual al de las apps (logo, título «Fideicomiso VBC-RD · Flujo de Caja y Presupuesto 2027»), con la navegación del sistema y la pestaña «💰 Flujo 2027» activa. Botones: modo oscuro/claro, pantalla completa, exportar PDF (html2pdf, igual que vista-combinada).
2. **Toolbar**:
   - selector **Proyecto**: CJB · Ciudad Juan Bosch / CPAG · Santiago / Consolidado
   - selector **Escenario**: Conservador / Base / Optimista
   - a la derecha: período, unidad (RD$ millones), archivo fuente y fecha de `generado`
3. **KPIs**: 4 tarjetas del proyecto activo, más 1 tarjeta naranja **«Caja del Fideicomiso (consolidado, incluye gastos fijos)»**.
   - Tarjetas del proyecto: ingresos del proyecto, pagos a obras del proyecto, aporte neto (ingresos − obras), lotes con movimiento (x de N).
   - Tarjeta naranja: saldo más bajo con su mes y número de meses negativos; disponible para áreas (PACC).
   - Si el saldo inicial es 0, mostrar la nota «Falta saldo inicial al 1-oct».
   - Los gastos fijos son comunes y **no se reparten por proyecto**.
4. **Mapa de flujos**: el SVG del proyecto activo, cargado con `fetch()` como lo hace `vista-combinada.html` (`MAPA NUEVO - CJB/assets/mapa.svg` o `MAPA CPAG/assets/mapa.svg`).
   - Encuadre: usar el bounding box de los lotes, no la hoja completa. En CJB los lotes ocupan aprox. `viewBox="38 205 610 880"`; calcularlo con `getBBox` al cargar.
   - Ocultar los textos del DXF.
   - Zoom/pan con los mismos controles + − ⟲.
   - **Hover:** tooltip. **Clic:** ficha flotante con categoría, clave, nombre, contratista o adjudicatario, restante o valor, total en el período, próximo pago o cobro, y mini-barras de los 15 meses.
   - **Leyenda lateral** con conteo y monto por capa; clic en una capa la muestra u oculta.
   - En **Consolidado** se muestran los dos mapas lado a lado, como en vista-combinada.
5. **Gráficos** (Chart.js):
   - «Ingresos vs. egresos por mes»: barras verde/naranja y línea de saldo que se pinta roja en los tramos negativos.
   - «¿De dónde viene el dinero?» y «¿A dónde va?»: barras horizontales.
   - En la vista de un proyecto, los gráficos de flujo mensual muestran solo ese proyecto, con un enlace para ver la caja consolidada.
6. **Tablas**:
   - «Obras en ejecución»: obra + clave, contratista, restante, próximo pago, mapa de calor de 15 meses.
   - «Lotes a licitar y adjudicados»: lote + adjudicatario, estado (chip), área, valor, firma, cobro en el período.
   - Ordenables. Clic en una fila resalta el lote en el mapa.
7. **CPAG**: sus obras (Tramo #2, Vías Internas) no tienen todavía ID de vía (`C-01`…`C-17`). Se muestran en tablas y números con el aviso «ubicación por confirmar» y no se pintan en el mapa. Hoy no hay lotes CPAG en venta ni en cartera.

Integración en la navegación (solo agregar el enlace, sin rediseñar nada):
- `MAPA NUEVO - CJB/index.html`, `timelapse.html`, `evolucion.html`: `<a href="../flujo-2027.html" class="nav-link">💰 Flujo 2027</a>` en `.header-nav`
- `MAPA CPAG/index.html`: igual en `.header-nav`
- `vista-combinada.html`: un `.nav-btn` más en `.nav-buttons`
- `Presentacion_Mapas_VBC.html`: un botón o enlace de acceso
- `SISTEMA_VBC.bat`: imprimir la URL `http://127.0.0.1:9000/flujo-2027.html`
- `NOTAS_PROYECTO.md`: documentar la pestaña y cómo actualizar los datos

## 4. Modo claro en todo el sistema

- Ya tienen `body.light-mode`: apps CJB y CPAG (`App.UI.toggleTheme`), `timelapse.html`, `evolucion.html`.
- **No lo tienen:** `vista-combinada.html` y `Presentacion_Mapas_VBC.html`. Hay que agregarles variables `body.light-mode { … }` con la misma paleta clara de `css/styles.css` y un botón 🌙/☀️.
- **Persistencia compartida:** crear `vbc-core/vbc-theme-sync.js` e incluirlo en **todas** las páginas.
  - Al cargar: aplicar el tema guardado en `localStorage['vbc-theme']`.
  - Usar un `MutationObserver` sobre `body.class` para guardar cada cambio.
  - Actualizar el ícono de `#themeToggle` si existe.
  - No reemplazar los toggles existentes; solo sincronizarlos.
  - Ojo con `app.js`: cuando cambia el tema repinta el SVG (lee `light-mode` en `getColor`). Verificar que el mapa se repinte bien si el tema se aplica al cargar.
- La pestaña nueva abre en **claro** por defecto, y respeta el tema guardado si existe.

## 5. Restricciones y cuidados

- **No hacer `git push`.** El remoto `jesusx26x/Mapa-CJB-3D` es público (GitHub Pages).
- **No hacer `git add -A`.** Hay contratos PDF, zips de cientos de MB, matrices financieras y textos OCR sin seguimiento que **no deben entrar al repo**. Agregar archivos por nombre.
- No modificar el Excel del modelo.
- No romper los flujos existentes: los CSV `Datos de CJB.csv` y `Datos de CPAG.csv`, el panel de detalles y los filtros.
- Mantener sin dependencias nuevas: todo vanilla JS + CDN que ya usa el sistema.

## 6. Verificación antes de terminar

1. `python tools/export_flujo_2027.py`: el resumen por escenario debe coincidir con el Panel del Excel. Base: ingresos 2,189.5 · egresos 1,788.9 · saldo final 400.6 · mínimo −293.1 en abr-27 (RD$ M). CJB: ingresos 2,157.3 · obras 938.8.
2. Levantar `server_vbc.py` y abrir `flujo-2027.html` en el navegador:
   - probar CJB / CPAG / Consolidado × 3 escenarios
   - clic en lotes y en la leyenda
   - claro y oscuro
   - sin errores en consola
3. Navegar entre todas las páginas y confirmar que el tema se mantiene. Vista combinada y Presentación deben verse bien en claro.
4. Los totales de la página deben cuadrar con el JSON: la suma por capa es igual al total del KPI.
5. Commits pequeños en la rama `flujo-2027`, con mensajes en español.
