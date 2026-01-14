# Guía: Exportar Lotes de AutoCAD para Mapa Interactivo Web

## Objetivo
Convertir los polígonos de lotes del dibujo AutoCAD en un formato que permita crear un mapa web interactivo donde cada lote sea un objeto clickeable con datos asociados.

---

## Método Recomendado: Exportar a SVG

### Paso 1: Preparar el Dibujo en AutoCAD

1. **Abrir el archivo DWG** con los lotes
2. **Organizar por capas (layers)** - Crear o verificar capas separadas:
   - `LOTES_COMERCIALES`
   - `LOTES_INSTITUCIONALES`
   - `LOTES_HABITACIONALES_E1`
   - `LOTES_HABITACIONALES_E2`
   - etc.

3. **Verificar que cada lote sea un polígono cerrado**:
   - Usar comando `BOUNDARY` o `REGION` si es necesario
   - Cada lote debe ser una polyline cerrada o región

---

## 📐 SECCIÓN ESPECIAL: Verificar y Corregir Polígonos Abiertos

> [!IMPORTANT]
> **¿Por qué es crítico?** Un polígono abierto NO se exportará correctamente como un área rellena en SVG. Solo los polígonos cerrados pueden representar lotes con color de relleno y ser clickeables.

### Método 1: Verificación Visual Rápida

1. **Seleccionar el polígono** haciendo clic sobre él
2. **Observar los grips (cuadrados azules)**:
   - ✅ **Cerrado**: Los grips forman un circuito completo
   - ❌ **Abierto**: Hay dos grips en los extremos que no se conectan

3. **Verificar propiedades**:
   ```
   Comando: PROPERTIES (o Ctrl+1)
   ```
   - Buscar el campo **"Closed"** o **"Cerrado"**
   - Debe decir **"Yes"** o **"Sí"**

### Método 2: Usar el Comando LIST

```
Comando: LIST
Seleccionar: [clic en el polígono]
Enter
```

En la ventana de texto buscar:
- **Para Polylines**: `Closed` o `Open`
- **Para otras entidades**: Verificar que sea `REGION` o `HATCH`

### Método 3: Verificación con QSELECT (Selección Múltiple)

Para verificar TODOS los polígonos de una vez:

```
Comando: QSELECT
```

1. En el diálogo:
   - **Apply to**: Entire drawing
   - **Object type**: Polyline
   - **Properties**: Closed
   - **Operator**: = Equals
   - **Value**: No

2. Clic en **OK**
3. AutoCAD seleccionará TODOS los polígonos abiertos
4. El contador en la parte inferior mostrará cuántos hay

---

### 🔧 MÉTODOS PARA CERRAR POLÍGONOS ABIERTOS

#### Opción A: Comando CLOSE (Más Rápido)

```
1. Seleccionar la polyline abierta
2. Comando: PEDIT
3. Escribir: C (Close)
4. Enter para terminar
```

**Atajo rápido**:
```
Seleccionar polyline → Clic derecho → Polyline → Close
```

#### Opción B: Unir Segmentos Separados con JOIN

Si el polígono está formado por líneas separadas:

```
Comando: JOIN (o J)
Seleccionar: Todas las líneas que forman el lote
Enter
```

Esto las convertirá en una sola polyline. Luego cerrar con PEDIT > C.

#### Opción C: Usar BOUNDARY para Crear Nuevo Polígono

Si las líneas son muy complicadas:

```
Comando: BOUNDARY (o BO)
```

1. En el diálogo:
   - **Object type**: Polyline
   - **Boundary set**: Current viewport
2. Clic en **Pick Points**
3. Hacer clic DENTRO del área del lote
4. AutoCAD creará automáticamente una polyline cerrada

> [!TIP]
> Después de usar BOUNDARY, puede eliminar las líneas originales y quedarse solo con el nuevo polígono cerrado.

#### Opción D: Extender y Cerrar Manualmente

Si hay una pequeña brecha:

```
Comando: EXTEND
Seleccionar borde límite: [seleccionar una línea]
Seleccionar objeto a extender: [seleccionar el extremo abierto]
```

O usar grips:
1. Seleccionar polyline
2. Clic en el grip del extremo abierto
3. Arrastrarlo hasta el otro extremo
4. Escribir `CLOSE` o usar snap `ENDPOINT`

---

### 🔍 VERIFICACIÓN FINAL ANTES DE EXPORTAR

Ejecutar este procedimiento de control de calidad:

#### Paso 1: Seleccionar Todos los Lotes
```
Comando: QSELECT
Object type: Polyline
Properties: Closed
Operator: = Equals  
Value: Yes
```

#### Paso 2: Contar y Comparar
- Anotar cuántos polígonos cerrados hay
- Comparar con la cantidad esperada de lotes

#### Paso 3: Verificar Áreas
```
Comando: AREA
Opción: Object
Seleccionar: [cada polígono]
```
- Cada lote debe mostrar un área válida
- Si muestra 0 o error, el polígono no está cerrado

#### Paso 4: Prueba de Sombreado
```
Comando: HATCH
Seleccionar: [clic dentro del lote]
```
- ✅ Si el sombreado aparece: El polígono está cerrado
- ❌ Si no aparece o se desborda: Hay una brecha

---

### 📋 Lista de Verificación Rápida

| # | Verificación | Comando | Resultado Esperado |
|---|-------------|---------|-------------------|
| 1 | ¿Es polyline cerrada? | `PROPERTIES` | Closed = Yes |
| 2 | ¿Tiene área válida? | `AREA > Object` | Área > 0 |
| 3 | ¿Se puede sombrear? | `HATCH` | Relleno contenido |
| 4 | ¿Cuántos lotes abiertos? | `QSELECT` | 0 polígonos abiertos |

---

### ⚠️ Problemas Comunes y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Polyline no se cierra con PEDIT | Extremos no coinciden exactamente | Usar `FILLET` con radio 0 para conectar |
| JOIN no funciona | Líneas en diferentes elevaciones Z | Comando `FLATTEN` primero |
| BOUNDARY no detecta el área | Hay brechas en el contorno | Hacer zoom y buscar la brecha, usar EXTEND |
| Polígono se ve cerrado pero no lo está | Líneas superpuestas | Usar `OVERKILL` para eliminar duplicados |

#### Comando FILLET con Radio 0 (Para cerrar esquinas):
```
Comando: FILLET
Escribir: R (radius)
Valor: 0
Seleccionar primera línea
Seleccionar segunda línea
```

#### Comando OVERKILL (Limpiar duplicados):
```
Comando: OVERKILL
Seleccionar: Todos los objetos del lote
Enter
Aceptar opciones por defecto
```

---

4. **Asignar identificadores únicos**:
   - Añadir texto o atributo con el ID del lote dentro de cada polígono
   - Formato sugerido: `COM-001`, `INST-015`, `HAB-E1-B12`

### Paso 2: Exportar a DXF

```
Comando: SAVEAS
Tipo: AutoCAD 2018 DXF (*.dxf)
```

> [!TIP]
> El formato DXF es más fácil de convertir que DWG.

### Paso 3: Convertir DXF a SVG

**Opción A: Usando Inkscape (Gratis)**

1. Descargar [Inkscape](https://inkscape.org/release/) 
2. Abrir Inkscape → `Archivo` → `Importar` → Seleccionar archivo `.dxf`
3. En opciones de importación:
   - Scale: 1.0
   - Check "Use automatic scaling"
4. Guardar como SVG: `Archivo` → `Guardar como` → `SVG plano (*.svg)`

**Opción B: Usando AutoCAD directamente (si tienen versión 2017+)**

1. Instalar plugin de exportación o usar script LISP
2. O exportar a PDF y luego convertir PDF a SVG online

**Opción C: Usando convertidor online**

- [CloudConvert](https://cloudconvert.com/dxf-to-svg)
- [Convertio](https://convertio.co/dxf-svg/)

### Paso 4: Preparar el SVG para Web

Una vez tengan el archivo SVG, necesitan:

1. **Abrir en Inkscape o editor de texto**
2. **Asignar IDs únicos a cada polígono**:

Cada lote debe tener un `id` único en el código SVG:
```xml
<path id="HAB-E1-01" d="M100,100 L200,100 L200,200 L100,200 Z" fill="#ff6b6b"/>
<path id="HAB-E1-02" d="M200,100 L300,100 L300,200 L200,200 Z" fill="#ff6b6b"/>
<path id="COM-001" d="M400,100 L500,100 L500,200 L400,200 Z" fill="#ffd93d"/>
```

3. **Agregar clase según tipo de lote**:
```xml
<path id="HAB-E1-01" class="lote habitacional" .../>
<path id="COM-001" class="lote comercial" .../>
<path id="INST-001" class="lote institucional" .../>
```

---

## 🎨 SECCIÓN ESPECIAL: Asignar IDs en Inkscape (Paso a Paso Detallado)

![SVG importado en Inkscape](C:/Users/John Marte/.gemini/antigravity/brain/b40dc0b3-232e-461d-9e29-8b92e7192e5b/uploaded_image_1765988865472.png)

> [!NOTE]
> Los IDs ya están visibles como texto dentro de cada polígono. Ahora debemos asignar esos IDs como atributos a los objetos del SVG.

---

### Método 1: Usando el Panel de Objetos (Más Visual)

#### Paso 1: Abrir el Panel de Objetos
```
Menú: Object → Objects... 
Atajo: Ctrl + Shift + O
```

Esto muestra el panel "Layers and Objects" que ya ves en tu pantalla.

#### Paso 2: Seleccionar un Polígono

1. **Hacer clic** en el polígono del lote en el canvas
2. El objeto se resaltará en el panel de capas
3. Alternativamente, expandir la capa (ej: "LOTES Y CALLES") y clic en el objeto

#### Paso 3: Asignar el ID

1. **Clic derecho** en el objeto seleccionado
2. Seleccionar **"Object Properties..."** (o presionar `Ctrl + Shift + O`)
3. En el campo **"ID"**, escribir el identificador:
   - Ejemplo: `HAB-E1-01` o `COM-001`
4. En el campo **"Class"**, escribir: `lote habitacional` o `lote comercial`
5. Clic en **"Set"** para aplicar

> [!IMPORTANT]
> **Reglas para IDs válidos:**
> - NO usar espacios (usar guiones: `HAB-E1-01`)
> - NO empezar con números (usar `L01` no `01`)
> - Solo letras, números, guiones y guiones bajos

---

### 🔗 CASO ESPECIAL: Un Polígono con Múltiples Lotes

Si un polígono representa **varios lotes** (por ejemplo, 3 lotes en una sola forma):

#### En Inkscape (Editor XML - Ctrl+Shift+X):

1. **Seleccionar el polígono** que contiene múltiples lotes
2. **Asignar un ID de grupo**: Ejemplo: `GRUPO-34`
3. **Agregar atributo `data-lotes`** con los IDs separados por comas:

```xml
<path id="GRUPO-34" 
      class="lote habitacional lote-grupo"
      data-lotes="00-34-01, 00-34-02, 00-34-03"
      d="M..." />
```

#### Pasos en el Editor XML:

1. Abrir Editor XML (`Ctrl + Shift + X`)
2. Seleccionar el polígono
3. En el panel derecho, clic en **"+"** para agregar atributo
4. Nombre: `data-lotes`
5. Valor: `00-34-01, 00-34-02, 00-34-03` (los IDs separados por comas)
6. Presionar Enter

> [!NOTE]
> El dashboard mostrará automáticamente la información de TODOS los lotes incluidos en `data-lotes` cuando se haga clic en ese polígono.

#### En el CSV:

Cada lote debe tener su propia fila en el archivo `lotes.csv`:

```csv
id,tipo,subtipo,etapa,...
00-34-01,Habitacional,Unifamiliar,Etapa 1,...
00-34-02,Habitacional,Unifamiliar,Etapa 1,...
00-34-03,Habitacional,Unifamiliar,Etapa 1,...
```

---

### Método 2: Usando el Editor XML (Más Rápido para Expertos)

#### Paso 1: Abrir el Editor XML
```
Menú: Edit → XML Editor...
Atajo: Ctrl + Shift + X
```

#### Paso 2: Navegar al Objeto

1. En el panel izquierdo, expandir la estructura del SVG
2. Buscar el nodo `<g>` de la capa (ej: "LOTES Y CALLES")
3. Expandir para ver los `<path>` o `<polygon>` individuales
4. Hacer clic en un objeto para seleccionarlo en el canvas

#### Paso 3: Editar el Atributo ID

1. En el panel derecho, buscar el atributo `id`
2. Si no existe, hacer clic en el botón **"+"** para agregar atributo
3. Escribir `id` como nombre del atributo
4. Escribir el valor (ej: `HAB-E1-01`)
5. Presionar **Enter** para aplicar

#### Paso 4: Agregar Clase

1. Clic en **"+"** para agregar nuevo atributo
2. Nombre: `class`
3. Valor: `lote habitacional` (o `comercial`, `institucional`)

---

### Método 3: Flujo de Trabajo Eficiente (Recomendado)

Para asignar IDs a muchos lotes rápidamente:

#### Preparación

1. **Maximizar la ventana** de Inkscape
2. **Abrir dos paneles lado a lado**:
   - Panel de Objetos (`Ctrl + Shift + O`)
   - Propiedades del Objeto (se abre al hacer clic derecho)
3. **Hacer zoom** a una sección del mapa

#### Flujo Repetitivo

```
1. Clic en polígono del lote
2. Leer el texto/ID visible dentro del lote
3. Ctrl + Shift + O → escribir ID → Set
4. Repetir con el siguiente lote
```

#### Atajos Útiles

| Acción | Atajo |
|--------|-------|
| Seleccionar objeto | Clic |
| Propiedades de objeto | Ctrl + Shift + O |
| Editor XML | Ctrl + Shift + X |
| Zoom in | + o rueda del mouse |
| Zoom out | - o rueda del mouse |
| Pan (mover vista) | Barra espaciadora + arrastrar |
| Deshacer | Ctrl + Z |
| Guardar | Ctrl + S |

---

### Método 4: Edición Directa del Archivo SVG (Para Programadores)

Si prefieres editar el código directamente:

#### Paso 1: Guardar como SVG Plano
```
Archivo → Guardar como → SVG Plano (*.svg)
```

#### Paso 2: Abrir en Editor de Texto
Usar VS Code, Notepad++, o cualquier editor de texto.

#### Paso 3: Buscar y Editar Paths

El archivo se verá así:
```xml
<g inkscape:label="LOTES Y CALLES" id="layer1">
  <path d="M 100,100 L 200,100 L 200,200 L 100,200 Z" 
        style="fill:#ff0000" 
        id="path1234"/>
  <path d="M 200,100 L 300,100 L 300,200 L 200,200 Z" 
        style="fill:#0000ff" 
        id="path5678"/>
</g>
```

Cambiar los IDs generados (`path1234`) por los IDs de lote:
```xml
<g inkscape:label="LOTES Y CALLES" id="layer1">
  <path d="M 100,100 L 200,100 L 200,200 L 100,200 Z" 
        style="fill:#ff0000" 
        id="HAB-E1-01"
        class="lote habitacional"/>
  <path d="M 200,100 L 300,100 L 300,200 L 200,200 Z" 
        style="fill:#0000ff" 
        id="COM-001"
        class="lote comercial"/>
</g>
```

---

### 📝 Organización por Capas

Según tu screenshot, ya tienes las capas organizadas:

| Capa en Inkscape | Tipo de Lote | Prefijo de ID | Clase CSS |
|------------------|--------------|---------------|-----------|
| H COMERCIAL | Comercial | `COM-` | `lote comercial` |
| H INSTITUCIONAL | Institucional | `INST-` | `lote institucional` |
| HABITACIONAL H | Habitacional | `HAB-` | `lote habitacional` |
| H VERDE | Áreas Verdes | `VERDE-` | `lote verde` |

---

### ✅ Verificación Final

Después de asignar todos los IDs:

1. **Guardar el archivo** como `lotes_mapa.svg`
2. **Abrir en navegador** (arrastrar archivo a Chrome/Firefox)
3. **Abrir DevTools** (F12) → Inspeccionar
4. **Verificar** que cada polígono tenga su ID correcto
5. **Probar** haciendo clic en los lotes (aunque no harán nada aún)

#### Prueba Rápida en Consola del Navegador:
```javascript
// Contar lotes por tipo
console.log('Habitacionales:', document.querySelectorAll('.habitacional').length);
console.log('Comerciales:', document.querySelectorAll('.comercial').length);
console.log('Institucionales:', document.querySelectorAll('.institucional').length);

// Listar todos los IDs de lotes
document.querySelectorAll('.lote').forEach(el => console.log(el.id));
```

---

## Método Alternativo: Exportar Coordenadas a CSV

Si prefieren un enfoque más estructurado:

### En AutoCAD:

1. Usar comando `DATAEXTRACTION` para extraer:
   - ID del lote
   - Coordenadas de vértices del polígono
   - Layer/Capa
   - Área

2. Exportar a Excel/CSV con formato:

| ID | Tipo | Layer | Vertices | Area_m2 |
|----|------|-------|----------|---------|
| HAB-E1-01 | Habitacional | ETAPA1 | "100,100;200,100;200,200;100,200" | 500 |

---

## Archivos a Entregar

Por favor generar los siguientes archivos:

1. **`lotes_comerciales.svg`** - Mapa de lotes comerciales
2. **`lotes_institucionales.svg`** - Mapa de lotes institucionales  
3. **`lotes_habitacionales.svg`** - Mapa de etapas habitacionales
4. **`lotes_master.csv`** - Lista de todos los lotes con sus IDs

### Formato del CSV de Lotes:

```csv
id,tipo,subtipo,etapa,nombre,area_m2,desarrollador
HAB-E1-01,Habitacional,Unifamiliar,Etapa 1,Bloque A-1,120,BISONÓ
HAB-E1-02,Habitacional,Unifamiliar,Etapa 1,Bloque A-2,120,BISONÓ
COM-001,Comercial,Plaza,N/A,Plaza Central,2500,CODELPA
INST-001,Institucional,Escuela,N/A,Escuela Primaria #1,800,Gobierno
```

---

## Soporte

Una vez tengan los archivos SVG y CSV listos, envíenlos y yo crearé:
- Mapa web interactivo con hover y click en cada lote
- Panel de información al seleccionar lote
- Filtros por tipo, etapa, estado
- Exportación de datos filtrados

---

## Diagrama del Flujo de Trabajo

```
┌─────────────────┐
│  AutoCAD DWG    │
│  (Lotes)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Exportar DXF   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Inkscape       │
│  DXF → SVG      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Asignar IDs    │
│  a polígonos    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Mapa Web       │
│  Interactivo    │
└─────────────────┘
```
