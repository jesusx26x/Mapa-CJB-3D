"""
Genera la capa «Activos de Ciudad» del mapa de Ciudad Juan Bosch (CJB).

Qué hace:
  1. Lee el Master Plan (MAPA NUEVO - CJB/assets/mapa.svg) y la base de lotes (Datos de CJB.csv).
  2. Georreferencia el SVG en UTM 19N (EPSG:32619):
        E = E0 + s·x   ;   N = N0 − s·y        (x, y en unidades del SVG)
     Por defecto reutiliza la georreferencia ya guardada en data/activos_cjb.json.
     Con --recalibrar la recalcula ajustando el SVG a los imbornales levantados
     (deben caer sobre los lotes viales 15-01-xx), y la escala se contrasta con las
     áreas de los lotes.
  3. Normaliza el levantamiento de imbornales de Verasol, ubica cada punto
     (calle con nombre / dentro de lote / fuera) y su lote más cercano.
  4. Escribe:
       MAPA NUEVO - CJB/data/activos_cjb.json   (lo lee js/activos-ciudad.js)
       Activos/INVENTARIO_ACTIVOS_CJB_IMBORNALES.xlsx

Uso:
    python tools/generar_activos_cjb.py [ruta_levantamiento.xlsx] [--recalibrar]

Requisitos (una sola vez):
    pip install openpyxl shapely pyproj svgelements numpy
    (con --recalibrar también: scipy pillow)
"""

import csv
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import openpyxl
from pyproj import Transformer
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CJB = os.path.join(ROOT, "MAPA NUEVO - CJB")
SVG_PATH = os.path.join(CJB, "assets", "mapa.svg")
CSV_PATH = os.path.join(ROOT, "Datos de CJB.csv")
JSON_OUT = os.path.join(CJB, "data", "activos_cjb.json")
XLSX_OUT = os.path.join(ROOT, "Activos", "INVENTARIO_ACTIVOS_CJB_IMBORNALES.xlsx")
LEVANTAMIENTO_DEF = os.path.join(ROOT, "fuentes_y_matrices", "LVTOInbornalesCJB20260727.xlsx")
PLANO_KMZ_DEF = os.path.join(ROOT, "fuentes_y_matrices", "Registro_Pluviales_CJB_Julio_2026.kmz")
LEYENDA_PLANO = {"Filtrante simple": 373, "Filtrante doble": 101}   # leyenda del PDF de Verasol
CONFIRMACION = os.path.join(ROOT, "Activos", "CONFIRMACION_VERASOL_IMBORNALES.xlsx")
RESP_OK = "Correcto como está en el Excel"
RESP_SIMPLE = "Es filtrante simple"
RESP_DOBLE = "Es filtrante doble"
RESP_COORD = "Corregir coordenada"
RESP_ELIMINAR = "Eliminar (no existe o es duplicado)"
RESPUESTAS = [RESP_OK, RESP_SIMPLE, RESP_DOBLE, RESP_COORD, RESP_ELIMINAR]
# Charcos: la Dirección Técnica llena la plantilla y la guarda con este nombre.
# Tanto el Excel lleno como la capa resultante quedan FUERA del repositorio público (.gitignore).
CHARCOS_XLSX = os.path.join(ROOT, "Activos", "ANALISIS_CHARCOS_CJB.xlsx")
CHARCOS_JSON = os.path.join(CJB, "data", "charcos_cjb.json")
CHARCOS_CAT = {"id": "charcos", "nombre": "Charcos / puntos de acumulación", "icono": "🌊", "estado": "levantado",
               "fuente": "Análisis técnico de la Dirección Técnica",
               "subcategorias": [{"id": "rojo", "nombre": "Muy crítico", "color": "#dc2626"},
                                 {"id": "amarillo", "nombre": "Intermedio", "color": "#f59e0b"},
                                 {"id": "verde", "nombre": "Menor", "color": "#16a34a"}]}
FECHA_LEVANTAMIENTO = "27/07/2026"

TIPOS = {
    "filtrante": "Filtrante simple", "filtrant": "Filtrante simple",
    "filtrante doble": "Filtrante doble", "filtrantedoble": "Filtrante doble",
    "filtrante a": "Filtrante simple", "pg cisterna": "Cisterna (PG)",
}
SUBCATS = [
    ("filtrante_simple", "Filtrante simple", "#0ea5e9"),
    ("filtrante_doble", "Filtrante doble", "#4f46e5"),
    ("cisterna", "Cisterna (PG)", "#14b8a6"),
]
SUB_ID = {n: i for i, n, _ in SUBCATS}
CATEGORIAS = [
    {"id": "drenaje_pluvial", "nombre": "Drenaje pluvial", "icono": "💧", "estado": "levantado",
     "fuente": f"Levantamiento de imbornales de Verasol ({FECHA_LEVANTAMIENTO}): Excel, plano DWG/PDF y KMZ",
     "subcategorias": [{"id": i, "nombre": n, "color": c} for i, n, c in SUBCATS]},
    {"id": "charcos", "nombre": "Charcos / puntos de acumulación", "icono": "🌊", "estado": "pendiente",
     "fuente": "Análisis técnico de la Dirección Técnica (en preparación)", "subcategorias": []},
    {"id": "alumbrado", "nombre": "Alumbrado público (postes)", "icono": "💡", "estado": "pendiente",
     "fuente": "Próximo levantamiento de Verasol", "subcategorias": []},
    {"id": "accesibilidad", "nombre": "Accesibilidad (rampas)", "icono": "♿", "estado": "pendiente",
     "fuente": "Próximo levantamiento de Verasol", "subcategorias": []},
]
SAT_ATRIB = "Imágenes satelitales: Esri, Maxar, Earthstar Geographics y la comunidad de usuarios SIG"


# --------------------------------------------------------------------------
# Lectura de insumos
# --------------------------------------------------------------------------
def leer_lotes_svg():
    from svgelements import SVG, Path, Shape
    svg = SVG.parse(SVG_PATH, reify=True)
    lotes = {}
    for el in svg.elements():
        if not isinstance(el, Shape):
            continue
        eid = el.values.get("id")
        if not eid or not re.match(r"^\d{2}-\d{2}-\d{2}$", eid):
            continue
        partes = []
        for sub in Path(el).as_subpaths():
            sp = Path(sub)
            largo = sp.length(error=1e-3) if len(sp) else 0
            n = max(8, int(largo / 0.5)) if largo else 0
            if n:
                partes.append([(sp.point(t / n).x, sp.point(t / n).y) for t in range(n + 1)])
        polys = [Polygon(p).buffer(0) for p in partes if len(p) >= 4]
        if polys:
            lotes[eid] = max(polys, key=lambda p: p.area)
    vb = svg.viewbox
    return lotes, (vb.x, vb.y, vb.width, vb.height)


def leer_csv():
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def leer_levantamiento(ruta):
    ws = openpyxl.load_workbook(ruta, data_only=True).active
    puntos, descartadas = [], []
    for fila, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(v is not None for v in r):
            continue
        if not isinstance(r[1], (int, float)):
            descartadas.append({"fila_excel": fila, "valores": [str(v) for v in r],
                                "motivo": "Fila sin coordenadas (parece un encabezado intermedio)"})
            continue
        no, n, e, z, t = r[:5]
        puntos.append({"fila": fila, "no": no, "E": float(e), "N": float(n), "Z": float(z),
                       "tipo_original": (t or "").strip()})
    return puntos, descartadas


def leer_confirmaciones():
    """Respuestas ya anotadas en Activos/CONFIRMACION_VERASOL_IMBORNALES.xlsx (si existe)."""
    if not os.path.exists(CONFIRMACION):
        return {}
    ws = openpyxl.load_workbook(CONFIRMACION, data_only=True)["Confirmación"]
    enc = {str(c.value).replace(" *", "").strip(): i for i, c in enumerate(ws[5]) if c.value}
    out = {}
    for r in ws.iter_rows(min_row=6, values_only=True):
        fid = r[enc["ID"]]
        if not fid:
            continue
        num = lambda v: float(str(v).replace(",", "")) if v not in (None, "") else None
        fecha = r[enc["Fecha de confirmación"]]
        out[fid] = {"respuesta": r[enc["Respuesta de Verasol"]] if r[enc["Respuesta de Verasol"]] in RESPUESTAS else None,
                    "E": num(r[enc["Este corregido"]]), "N": num(r[enc["Norte corregido"]]),
                    "comentario": r[enc["Comentario de Verasol"]],
                    "fecha": fecha.strftime("%d/%m/%Y") if hasattr(fecha, "strftime") else (str(fecha) if fecha else None)}
    return out


def leer_plano_kmz(ruta):
    """Símbolos del plano de Verasol (KMZ exportado del DWG): círculos azules = registro simple,
    rojos = registro doble. Devuelve [(E, N, tipo)] en UTM 19N, sin duplicar relleno y contorno."""
    import zipfile
    import xml.etree.ElementTree as ET
    if not ruta or not os.path.exists(ruta):
        return None
    colores = {"fffe0000": "Filtrante simple", "ff130ff3": "Filtrante doble"}
    a_utm = Transformer.from_crs("EPSG:4326", "EPSG:32619", always_xy=True)
    K = "{http://earth.google.com/kml/2.0}"
    simbolos = []
    with zipfile.ZipFile(ruta) as z:
        kml = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        with z.open(kml) as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag != K + "Placemark":
                    continue
                nombre = el.findtext(K + "name") or ""
                if nombre.startswith(("Hatch", "Circle")):
                    cols = {c.text for c in el.iter(K + "color")}
                    if len(cols) == 1 and next(iter(cols)) in colores:
                        pts = [tuple(map(float, t.split(",")[:2]))
                               for c in el.iter(K + "coordinates") for t in c.text.split()]
                        if pts:
                            xs, ys = zip(*pts)
                            E, N = a_utm.transform(sum(xs) / len(xs), sum(ys) / len(ys))
                            simbolos.append((E, N, colores[next(iter(cols))]))
                el.clear()
    unicos = []
    for E, N, t in simbolos:
        if not any(t == u[2] and math.hypot(E - u[0], N - u[1]) < 2.5 for u in unicos):
            unicos.append((E, N, t))
    return unicos


# --------------------------------------------------------------------------
# Georreferencia
# --------------------------------------------------------------------------
class Georef:
    def __init__(self, s, theta_deg, E0, N0):
        self.s, self.th, self.E0, self.N0 = s, math.radians(theta_deg), E0, N0
        self.theta_deg = theta_deg

    def a_svg(self, E, N):
        dE, dN = E - self.E0, -(N - self.N0)
        c, s_ = math.cos(self.th), math.sin(self.th)
        return (c * dE - s_ * dN) / self.s, (s_ * dE + c * dN) / self.s

    def a_utm(self, x, y):
        a, b = self.s * x, self.s * y
        c, s_ = math.cos(self.th), math.sin(self.th)
        return self.E0 + c * a + s_ * b, self.N0 - (-s_ * a + c * b)


def recalibrar(lotes_svg, viales, puntos):
    """Ajusta escala, rotación y traslación para que los imbornales caigan en las calles."""
    from PIL import Image, ImageDraw
    from scipy import ndimage, optimize, signal

    # Escala de referencia por áreas de lotes (m² del CSV vs. unidades² del SVG)
    filas = leer_csv()
    razones = []
    for k, p in lotes_svg.items():
        try:
            a = float(str(filas.get(k, {}).get("area_m2", "")).replace(",", ""))
            if a > 0 and p.area > 0:
                razones.append(math.sqrt(a / p.area))
        except ValueError:
            pass
    s0 = float(np.median(razones))
    R0 = s0
    W, H = int(800 * R0) + 1, int(1130 * R0) + 1
    im = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(im)
    for k, p in lotes_svg.items():
        if k not in viales:
            dr.polygon([(x * R0, y * R0) for x, y in p.exterior.coords], fill=1)
    dentro = np.array(im, bool)
    d_out = ndimage.distance_transform_edt(~dentro)
    d_in = ndimage.distance_transform_edt(dentro)
    score = np.zeros(dentro.shape, np.float32)
    score[(~dentro) & (d_out <= 12)] = 1
    score[dentro & (d_in > 3)] = -1

    pts = np.array([(p["E"], p["N"]) for p in puntos])
    c = pts.mean(0)
    mejor = None
    for ang in np.arange(-20, 20.01, 1.0):
        t = np.radians(ang)
        R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
        q = (pts - c) @ R.T
        cols, rows = q[:, 0], -q[:, 1]
        cmin, rmin = cols.min(), rows.min()
        k = np.zeros((int(rows.max() - rmin) + 3, int(cols.max() - cmin) + 3), np.float32)
        np.add.at(k, ((rows - rmin).round().astype(int), (cols - cmin).round().astype(int)), 1)
        corr = signal.fftconvolve(score, k[::-1, ::-1], mode="valid")
        i = np.unravel_index(np.argmax(corr), corr.shape)
        if mejor is None or corr[i] > mejor[0]:
            mejor = (corr[i], ang, i, cmin, rmin)
    _, ang, (i0, j0), cmin, rmin = mejor
    if abs(ang) > 0.5:
        print(f"  Aviso: la mejor rotación gruesa fue {ang}°; se refina desde 0°.")
    P0 = [s0, 0.0, c[0] + cmin - j0, c[1] - rmin + i0]
    suave = ndimage.gaussian_filter(score, 3)

    def valor(P, arr):
        g = Georef(*P)
        xy = np.array([g.a_svg(e, n) for e, n in pts])
        r = np.clip((xy[:, 1] * R0).round().astype(int), 0, arr.shape[0] - 1)
        cc = np.clip((xy[:, 0] * R0).round().astype(int), 0, arr.shape[1] - 1)
        return arr[r, cc].sum()

    res = optimize.minimize(lambda P: -valor(P, suave), P0, method="Nelder-Mead",
                            options={"xatol": 1e-3, "fatol": 1e-3, "maxiter": 4000})
    s, th, E0, N0 = res.x
    print(f"  Escala {s:.4f} m/unidad · rotación {th:.4f}° · origen ({E0:.2f}, {N0:.2f})")
    return Georef(s, th, E0, N0)


# --------------------------------------------------------------------------
# Construcción de la capa
# --------------------------------------------------------------------------
def construir(ruta_lev, forzar_calibracion=False, ruta_kmz=PLANO_KMZ_DEF):
    filas = leer_csv()
    lotes_svg, viewbox = leer_lotes_svg()
    viales = {k for k, r in filas.items()
              if r.get("tipo") == "Infraestructura" and "vial" in r.get("subtipo", "").lower().replace("í", "i")}
    viales &= set(lotes_svg)
    puntos, descartadas = leer_levantamiento(ruta_lev)

    previo = None
    if os.path.exists(JSON_OUT) and not forzar_calibracion:
        g = json.load(open(JSON_OUT, encoding="utf-8"))["meta"]["georreferencia_master_plan"]
        previo = Georef(g["escala_m_por_unidad_svg"], g["rotacion_grados"], *g["origen_utm"])
        print("Georreferencia: se reutiliza la guardada en data/activos_cjb.json")
    geo = previo or recalibrar(lotes_svg, viales, puntos)

    lotes = {k: Polygon([geo.a_utm(x, y) for x, y in p.exterior.coords]) for k, p in lotes_svg.items()}
    claves = list(lotes)
    arbol = STRtree([lotes[k] for k in claves])
    no_viales = [k for k in claves if k not in viales]
    a_geo = Transformer.from_crs("EPSG:32619", "EPSG:4326", always_xy=True)
    plano = leer_plano_kmz(ruta_kmz)
    if plano:
        print(f"Plano de Verasol: {len(plano)} símbolos ({dict(Counter(t for *_, t in plano))})")

    respuestas = leer_confirmaciones()
    if respuestas:
        print(f"Confirmaciones de Verasol leídas: {sum(1 for r in respuestas.values() if r['respuesta'])}")

    def ubicar(E, N):
        P = Point(E, N)
        hits = [claves[i] for i in arbol.query(P) if lotes[claves[i]].covers(P)]
        hv = [h for h in hits if h in viales]
        hl = [h for h in hits if h not in viales]
        if hv:
            ubic, lote, calle = "Calle", None, hv[0]
        elif hl:
            ubic, lote, calle = "Dentro de lote", hl[0], None
        else:
            dv = min((lotes[k].distance(P), k) for k in viales)
            ubic, lote, calle = ("Calle", None, dv[1]) if dv[0] <= 15 else ("Fuera de lotes del Master Plan", None, None)
        dl = min((lotes[k].distance(P), k) for k in no_viales)
        return ubic, lote, calle, dl

    activos, vistos = [], set()
    for p in puntos:
        t_low = p["tipo_original"].lower()
        tipo = TIPOS.get(t_low, "Filtrante simple")
        fid = f"IMB-{int(p['no']):03d}"
        if fid in vistos:
            fid += "B"
        vistos.add(fid)
        resp = respuestas.get(fid, {})
        E_orig, N_orig = p["E"], p["N"]
        coord_corregida = False
        if resp.get("respuesta") == RESP_COORD and resp.get("E") and resp.get("N"):
            p = dict(p, E=resp["E"], N=resp["N"])
            coord_corregida = True
        ubic, lote, calle, dl = ubicar(p["E"], p["N"])

        pend, notas = [], []     # pend = requiere confirmación de Verasol; notas = informativas
        if t_low == "filtrant":
            notas.append("Tipo escrito «filtrant» en el levantamiento; se tomó como filtrante simple.")
        if t_low == "filtrantedoble":
            notas.append("Tipo escrito «filtrantedoble»; se tomó como filtrante doble.")
        if t_low == "filtrante a":
            notas.append("Anotado «filtrante a»: error de captura confirmado; es filtrante simple.")
        if t_low not in TIPOS:
            pend.append(f"Tipo «{p['tipo_original']}» no reconocido.")
        if fid.endswith("B"):
            notas.append(f"Número {p['no']} repetido en el levantamiento; se asignó {fid}.")
        if tipo == "Cisterna (PG)":
            pend.append("No figura en el plano; parece un punto de referencia (cisterna), no un imbornal. "
                        "¿Se incluye en el inventario?")
        tipo_plano = None
        if plano:
            d_min, t_min = min((math.hypot(E_orig - e, N_orig - n), t) for e, n, t in plano)
            if d_min <= 6:
                tipo_plano = t_min
                if t_min != tipo and tipo != "Cisterna (PG)":
                    pend.append(f"Tipo distinto: el Excel dice {tipo.lower()} y el plano {t_min.lower()}. "
                                "¿Cuál es el correcto?")
            elif tipo != "Cisterna (PG)":
                pend.append(f"No aparece en el plano (el símbolo más cercano está a {d_min:.0f} m). "
                            "¿Existe y la coordenada es correcta?")
        ubic_orig = ubicar(E_orig, N_orig)[0] if coord_corregida else ubic
        if ubic_orig == "Fuera de lotes del Master Plan":
            pend.append("Queda fuera de los lotes del Master Plan. ¿Pertenece a CJB y la coordenada es correcta?")

        x, y = geo.a_svg(p["E"], p["N"])
        lon, lat = a_geo.transform(p["E"], p["N"])
        activos.append({
            "id": fid, "no_levantamiento": p["no"], "fila_excel": p["fila"],
            "categoria": "drenaje_pluvial", "subcategoria": SUB_ID[tipo], "tipo": tipo,
            "tipo_original": p["tipo_original"],
            "utm_e": round(p["E"], 3), "utm_n": round(p["N"], 3), "cota": round(p["Z"], 3),
            "lat": round(lat, 7), "lon": round(lon, 7), "svg_x": round(x, 3), "svg_y": round(y, 3),
            "ubicacion": ubic, "calle_id": calle, "calle": filas[calle]["nombre"] if calle else None,
            "lote_id": lote, "lote_nombre": filas[lote]["nombre"] if lote else None,
            "lote_tipo": filas[lote]["tipo"] if lote else None,
            "lote_frente_id": dl[1], "lote_frente_dist_m": round(dl[0], 1),
            "tipo_en_plano": tipo_plano, "pendientes": pend, "observaciones": notas,
            "_coord_original": (round(E_orig, 3), round(N_orig, 3)), "_coord_corregida": coord_corregida,
        })

    grupos = defaultdict(list)
    for a in activos:
        grupos[a["_coord_original"][0] // 0.1, a["_coord_original"][1] // 0.1].append(a)
    for g in grupos.values():
        if len(g) > 1:
            for a in g:
                otros = ", ".join(o["id"] for o in g if o is not a)
                a["pendientes"].append(f"Misma coordenada que {otros}: ¿son dos imbornales o un registro "
                                       "duplicado? (si es duplicado, marque «Eliminar» en uno de los dos)")

    # Aplicar las respuestas de Verasol
    confirmados, en_validacion, eliminados = [], [], []
    for a in activos:
        a["motivos_validacion"] = list(a["pendientes"])
        r = respuestas.get(a["id"], {})
        resp = r.get("respuesta")
        if resp and a["pendientes"]:
            nota = f"Confirmado por Verasol{(' el ' + r['fecha']) if r.get('fecha') else ''}: {resp.lower()}"
            if r.get("comentario"):
                nota += f" ({r['comentario']})"
            if resp == RESP_ELIMINAR:
                a["observaciones"].append(nota)
                eliminados.append(a)
                continue
            if resp in (RESP_SIMPLE, RESP_DOBLE):
                a["tipo"] = "Filtrante simple" if resp == RESP_SIMPLE else "Filtrante doble"
                a["subcategoria"] = SUB_ID[a["tipo"]]
            if resp == RESP_COORD and not a["_coord_corregida"]:
                a["pendientes"] = ["Se indicó «Corregir coordenada» pero faltan el Este y el Norte corregidos."]
            else:
                a["pendientes"] = []
                a["observaciones"].append(nota)
        (en_validacion if a["pendientes"] else confirmados).append(a)
    for a in activos:
        a.pop("_coord_original", None)
        a.pop("_coord_corregida", None)

    resumen = {}
    for k in claves:
        dentro = [a["id"] for a in confirmados if a["lote_id"] == k or a["calle_id"] == k]
        frente = [] if k in viales else [a["id"] for a in confirmados if a["ubicacion"] == "Calle"
                                         and a["lote_frente_id"] == k and a["lote_frente_dist_m"] <= 20]
        if dentro or frente:
            resumen[k] = {"dentro": dentro, "frente": frente}

    # Solo se ofrecen en el mapa las subcategorías que tienen activos confirmados
    presentes = {a["subcategoria"] for a in confirmados}
    categorias = json.loads(json.dumps(CATEGORIAS))
    for c in categorias:
        c["subcategorias"] = [s for s in c["subcategorias"] if s["id"] in presentes or c["id"] != "drenaje_pluvial"]

    vx, vy, vw, vh = viewbox
    (e1, n1), (e2, n2) = geo.a_utm(vx, vy), geo.a_utm(vx + vw, vy + vh)
    xmin, xmax, ymin, ymax = min(e1, e2), max(e1, e2), min(n1, n2), max(n1, n2)
    # Transformación afín lon/lat → SVG (en 4–5 km el error frente a la proyección exacta es < 0.1 m).
    # La usa el visor para colocar los mosaicos (tiles) en caché de Esri, que están en Web Mercator.
    a_lonlat = Transformer.from_crs("EPSG:32619", "EPSG:4326", always_xy=True)
    muestras = []
    for fx in np.linspace(0, 1, 7):
        for fy in np.linspace(0, 1, 7):
            x, y = vx + fx * vw, vy + fy * vh
            lon, lat = a_lonlat.transform(*geo.a_utm(x, y))
            muestras.append((lon, lat, x, y))
    M = np.array([[lo, la, 1] for lo, la, _, _ in muestras])
    cx, *_ = np.linalg.lstsq(M, np.array([m[2] for m in muestras]), rcond=None)
    cy, *_ = np.linalg.lstsq(M, np.array([m[3] for m in muestras]), rcond=None)
    resid = max(abs(M @ cx - np.array([m[2] for m in muestras])).max(),
                abs(M @ cy - np.array([m[3] for m in muestras])).max()) * geo.s
    print(f"  Afín lon/lat→SVG: error máximo {resid:.3f} m")
    sat = {
        "bbox_utm": [round(xmin, 2), round(ymin, 2), round(xmax, 2), round(ymax, 2)],
        "svg_rect": [vx, vy, vw, vh],
        "tiles_url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "zooms": [15, 16, 17, 18, 19],
        "lonlat_a_svg": [float(v) for v in (*cx, *cy)],
        "m_por_unidad_svg": round(geo.s, 5),
        "atribucion": SAT_ATRIB,
    }
    salida = {
        "meta": {
            "version": "1.0", "generado": __import__("datetime").date.today().isoformat(),
            "sistema_coordenadas": "WGS 84 / UTM zona 19N (EPSG:32619)",
            "georreferencia_master_plan": {
                "metodo": "Calibración del SVG del Master Plan con los imbornales georreferenciados "
                          "y verificación visual sobre imagen satelital Esri",
                "escala_m_por_unidad_svg": round(geo.s, 5), "rotacion_grados": round(geo.theta_deg, 5),
                "origen_utm": [round(geo.E0, 3), round(geo.N0, 3)],
                "formula": "E = E0 + s·x ; N = N0 − s·y  (x, y en unidades del SVG)",
                "precision_estimada_m": "1–2 m en zonas urbanizadas"},
            "satelite": sat},
        "plano_verasol": None if not plano else {
            "simbolos": dict(Counter(t for *_, t in plano)), "leyenda": LEYENDA_PLANO},
        "categorias": categorias, "activos": confirmados,
        "en_validacion": [{k: a[k] for k in ("id", "tipo", "calle", "utm_e", "utm_n", "lat", "lon",
                                             "tipo_en_plano", "pendientes")} for a in en_validacion],
        "eliminados": [{k: a[k] for k in ("id", "tipo", "utm_e", "utm_n", "observaciones")} for a in eliminados],
        "resumen_por_lote": resumen, "filas_descartadas": descartadas,
    }
    construir_charcos(geo, ubicar, filas, confirmados)
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Capa: {JSON_OUT}  ({len(confirmados)} en el mapa · {len(en_validacion)} en validación · "
          f"{len(eliminados)} eliminados)")
    print("  Tipos en el mapa:", dict(Counter(a["tipo"] for a in confirmados)))
    salida["_todos"] = activos          # para los Excel (no se guarda en el JSON)
    return salida


# --------------------------------------------------------------------------
# Charcos (análisis de la Dirección Técnica)
# --------------------------------------------------------------------------
def _coordenadas(texto):
    """Acepta «18.494633, -69.746710» (Google Maps), «-69.74, 18.49» o UTM «421172.8, 2045074.2»."""
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", str(texto or "").replace(",", " , ").replace(" , ", " "))]
    if len(nums) < 2:
        return None
    a, b = nums[0], nums[1]
    if abs(a) > 1000 and abs(b) > 1000:
        e, n = (a, b) if a < b else (b, a)
        return "utm", e, n
    lat, lon = (a, b) if abs(a) < abs(b) else (b, a)
    if not (17 < lat < 20 and -72 < lon < -68):
        return None
    return "geo", lon, lat


def construir_charcos(geo, ubicar, filas, imbornales):
    if not os.path.exists(CHARCOS_XLSX):
        if os.path.exists(CHARCOS_JSON):      # sin análisis de charcos: no dejar una capa vieja
            os.remove(CHARCOS_JSON)
        return
    ws = openpyxl.load_workbook(CHARCOS_XLSX, data_only=True)["Charcos"]
    enc = {str(c.value).replace(" *", "").strip(): i for i, c in enumerate(ws[5]) if c.value}
    val = lambda r, k: r[enc[k]] if k in enc else None
    a_utm = Transformer.from_crs("EPSG:4326", "EPSG:32619", always_xy=True)
    a_geo = Transformer.from_crs("EPSG:32619", "EPSG:4326", always_xy=True)
    sub = {"rojo": "rojo", "amarillo": "amarillo", "verde": "verde"}
    charcos, problemas = [], []
    for r in ws.iter_rows(min_row=6, values_only=True):
        cid, coords = val(r, "ID del charco"), val(r, "Coordenadas")
        if not cid or not coords:
            continue
        c = _coordenadas(coords)
        if not c:
            problemas.append(f"{cid}: coordenadas no válidas «{coords}»")
            continue
        if c[0] == "geo":
            E, N = a_utm.transform(c[1], c[2])
        else:
            E, N = c[1], c[2]
        crit_txt = str(val(r, "Criticidad") or "").lower()
        crit = next((v for k, v in sub.items() if crit_txt.startswith(k)), None)
        if not crit:
            problemas.append(f"{cid}: sin criticidad")
            continue
        principal = str(val(r, "Lote de origen principal") or "").strip()
        otros = re.findall(r"\d{2}-\d{2}-\d{2}", str(val(r, "Otros lotes de origen") or ""))
        origen = [l for l in [principal] + otros if l]
        desconocidos = [l for l in origen if l not in filas]
        if desconocidos:
            problemas.append(f"{cid}: lotes no encontrados {', '.join(desconocidos)}")
        origen = [l for l in dict.fromkeys(origen) if l in filas]
        ubic, lote, calle, _ = ubicar(E, N)
        x, y = geo.a_svg(E, N)
        lon, lat = a_geo.transform(E, N)
        cercanos = re.findall(r"IMB-\d{3}B?", str(val(r, "Imbornales cercanos") or "").upper())
        if not cercanos:
            cercanos = [a["id"] for a in sorted(imbornales, key=lambda a: math.hypot(a["utm_e"] - E, a["utm_n"] - N))
                        if math.hypot(a["utm_e"] - E, a["utm_n"] - N) <= 40][:6]
        num = lambda k: (float(val(r, k)) if isinstance(val(r, k), (int, float)) else None)
        charcos.append({
            "id": str(cid), "categoria": "charcos", "subcategoria": crit,
            "tipo": next(s_["nombre"] for s_ in CHARCOS_CAT["subcategorias"] if s_["id"] == crit),
            "referencia": val(r, "Ubicación de referencia"), "utm_e": round(E, 3), "utm_n": round(N, 3),
            "lat": round(lat, 7), "lon": round(lon, 7), "svg_x": round(x, 3), "svg_y": round(y, 3),
            "ubicacion": ubic, "calle_id": calle, "calle": filas[calle]["nombre"] if calle else None, "lote_id": lote,
            "lotes_origen": origen, "causa": val(r, "Causa probable"), "area_m2": num("Área aproximada (m²)"),
            "profundidad_cm": num("Profundidad aproximada (cm)"), "drenaje_horas": num("Tiempo en drenar (horas)"),
            "imbornales_cercanos": cercanos, "evidencia": val(r, "Evidencia (enlace a foto o video)"),
            "observaciones": val(r, "Observaciones"),
        })
    with open(CHARCOS_JSON, "w", encoding="utf-8") as f:
        json.dump({"generado": __import__("datetime").date.today().isoformat(), "categoria": CHARCOS_CAT,
                   "charcos": charcos, "problemas": problemas}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Charcos: {CHARCOS_JSON}  ({len(charcos)} charcos · {Counter(c['subcategoria'] for c in charcos)})")
    for pr in problemas:
        print("  Revisar:", pr)


# --------------------------------------------------------------------------
# Excel del inventario
# --------------------------------------------------------------------------
def excel_inventario(datos):
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.hyperlink import Hyperlink

    F, FS = "Segoe UI", "Segoe UI Semibold"
    NAVY, RED, SLATE, LINE, CARD = "1B3A6B", "E63946", "64748B", "E2E8F0", "F8FAFC"
    fill = lambda c: PatternFill("solid", fgColor=c, bgColor=c)
    font = lambda sz=10, color="0F172A", name=F, bold=False, italic=False, u=None: Font(
        name=name, size=sz, color=color, bold=bold, italic=italic, underline=u)
    linea = Border(bottom=Side(style="thin", color=LINE))
    ENTIDAD = "FIDEICOMISO PARA LA CONSTRUCCIÓN DE VIVIENDAS DE BAJO COSTO (FIDEICOMISO VBC RD)"

    def banda(ws, ult, titulo, sub):
        for r in (1, 2):
            for c in range(1, ult + 1):
                ws.cell(row=r, column=c).fill = fill(NAVY)
        for c in range(1, ult + 1):
            ws.cell(row=3, column=c).fill = fill(RED)
        ws["A1"] = titulo
        ws["A1"].font = font(15, "FFFFFF", FS)
        ws["A1"].alignment = Alignment(vertical="bottom", indent=1)
        ws["A2"] = sub
        ws["A2"].font = font(9, "C7D2FE")
        ws["A2"].alignment = Alignment(vertical="top", indent=1)
        ws.row_dimensions[1].height, ws.row_dimensions[2].height, ws.row_dimensions[3].height = 28, 20, 3
        ws.sheet_view.showGridLines = False

    def encabezado(ws, fila, textos):
        for j, t in enumerate(textos, start=1):
            c = ws.cell(row=fila, column=j, value=t)
            c.font = font(9.5, "FFFFFF", FS)
            c.fill = fill(NAVY)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = Border(left=Side(style="thin", color="FFFFFF"), right=Side(style="thin", color="FFFFFF"))
        ws.row_dimensions[fila].height = 34

    activos = sorted(datos["activos"], key=lambda a: a["id"])
    wb = openpyxl.Workbook()

    # --- Inventario ----------------------------------------------------------
    ws = wb.active
    ws.title = "Inventario"
    cols = [("ID", 11), ("Tipo", 22), ("Ubicación", 15), ("Calle", 30), ("Lote donde está", 13),
            ("Nombre del lote", 30), ("Lote más cercano", 13), ("Distancia al lote (m)", 11),
            ("Cota (m)", 10), ("UTM Este", 13), ("UTM Norte", 13), ("Latitud", 12), ("Longitud", 12),
            ("No. en levantamiento", 12), ("Tipo anotado", 14), ("Tipo en plano de Verasol", 16),
            ("Observaciones", 48), ("Mapa", 12)]
    banda(ws, len(cols), "Inventario de activos de ciudad · Imbornales de Ciudad Juan Bosch",
          f"Fuente: levantamiento de Verasol ({FECHA_LEVANTAMIENTO}) · Coordenadas UTM 19N (WGS 84) · {ENTIDAD}")
    encabezado(ws, 5, [c for c, _ in cols])
    for j, (_, w) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w
    for i, a in enumerate(activos):
        r = 6 + i
        vals = [a["id"], a["tipo"], a["ubicacion"], a["calle"], a["lote_id"], a["lote_nombre"],
                a["lote_frente_id"], a["lote_frente_dist_m"], a["cota"], a["utm_e"], a["utm_n"],
                a["lat"], a["lon"], a["no_levantamiento"], a["tipo_original"], a.get("tipo_en_plano") or "—",
                " ".join(a["observaciones"]) or None, "Ver ↗"]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = font(9.5)
            c.border = linea
            c.alignment = Alignment(vertical="center", wrap_text=j in (4, 6, 17))
            if i % 2:
                c.fill = fill("FAFBFD")
        ws.cell(row=r, column=8).number_format = "0.0"
        ws.cell(row=r, column=9).number_format = "0.00"
        for j in (10, 11):
            ws.cell(row=r, column=j).number_format = "0.000"
        for j in (12, 13):
            ws.cell(row=r, column=j).number_format = "0.000000"
        link = ws.cell(row=r, column=18)
        link.hyperlink = f"https://www.google.com/maps?q={a['lat']},{a['lon']}"
        link.font = font(9.5, "1D4ED8", u="single")
    ult = 5 + len(activos)
    ws.freeze_panes = "B6"
    ws.auto_filter.ref = f"A5:{get_column_letter(len(cols))}{ult}"
    tonos = {"Filtrante simple": ("E0F2FE", "075985"), "Filtrante doble": ("E0E7FF", "3730A3"),
             "Cisterna (PG)": ("CCFBF1", "115E59")}
    for t, (bg, fg) in tonos.items():
        ws.conditional_formatting.add(f"B6:B{ult}", FormulaRule(formula=[f'$B6="{t}"'], fill=fill(bg),
                                                                font=Font(color=fg, bold=True)))
    ws.conditional_formatting.add(f"Q6:Q{ult}", FormulaRule(formula=['LEN($Q6)>0'], fill=fill("FFF7ED")))
    ws["A4"] = (f"{len(activos)} imbornales · un clic en «Ver ↗» abre el punto en Google Maps · "
                "las observaciones señalan datos a confirmar con Verasol")
    ws["A4"].font = font(8.5, SLATE, italic=True)

    # --- Resumen por calle (fórmulas) ----------------------------------------
    rs = wb.create_sheet("Resumen por calle")
    tipos = [n for _, n, _ in SUBCATS]
    banda(rs, 2 + len(tipos), "Resumen por calle", "Se calcula con fórmulas a partir de la hoja Inventario")
    encabezado(rs, 5, ["Calle / ubicación"] + tipos + ["Total"])
    rs.column_dimensions["A"].width = 38
    for j in range(2, 3 + len(tipos)):
        rs.column_dimensions[get_column_letter(j)].width = 15
    calles = Counter(a["calle"] for a in activos if a["calle"])
    filas = [(c, "calle") for c, _ in calles.most_common()]
    filas += [("Dentro de lote", "ubic"), ("Fuera de lotes del Master Plan", "ubic")]
    rng = lambda col: f"Inventario!${col}$6:${col}${ult}"
    for i, (nombre, modo) in enumerate(filas):
        r = 6 + i
        rs.cell(row=r, column=1, value=nombre).font = font(9.5, name=FS if modo == "ubic" else F)
        crit_col = "D" if modo == "calle" else "C"
        for j, t in enumerate(tipos, start=2):
            c = rs.cell(row=r, column=j, value=f'=COUNTIFS({rng(crit_col)},$A{r},{rng("B")},"{t}")')
            c.alignment = Alignment(horizontal="center")
            c.font = font(9.5)
        tot = rs.cell(row=r, column=2 + len(tipos), value=f"=SUM(B{r}:{get_column_letter(1 + len(tipos))}{r})")
        tot.font = font(9.5, name=FS)
        tot.alignment = Alignment(horizontal="center")
        for j in range(1, 3 + len(tipos)):
            rs.cell(row=r, column=j).border = linea
    rt = 6 + len(filas)
    rs.cell(row=rt, column=1, value="Total").font = font(10, name=FS)
    for j in range(2, 3 + len(tipos)):
        col = get_column_letter(j)
        c = rs.cell(row=rt, column=j, value=f"=SUM({col}6:{col}{rt - 1})")
        c.font = font(10, name=FS)
        c.alignment = Alignment(horizontal="center")
        c.fill = fill(CARD)
    rs.cell(row=rt, column=1).fill = fill(CARD)
    rs.freeze_panes = "B6"

    # --- En validación -------------------------------------------------------
    pr = wb.create_sheet("En validación")
    banda(pr, 5, "Imbornales en validación con Verasol",
          "No se muestran en el mapa ni se cuentan en el inventario hasta que Verasol los confirme "
          "(archivo CONFIRMACION_VERASOL_IMBORNALES.xlsx)")
    encabezado(pr, 5, ["ID", "Tipo en Excel", "Tipo en plano", "Calle", "Qué hay que confirmar"])
    for col, w in zip("ABCDE", (12, 18, 18, 30, 80)):
        pr.column_dimensions[col].width = w
    for r, a in enumerate(sorted(datos["en_validacion"], key=lambda x: x["id"]), start=6):
        vals = [a["id"], a["tipo"], a["tipo_en_plano"] or "Sin símbolo", a["calle"], " ".join(a["pendientes"])]
        for j, v in enumerate(vals, start=1):
            c = pr.cell(row=r, column=j, value=v)
            c.font = font(9.5)
            c.border = linea
            c.alignment = Alignment(wrap_text=True, vertical="center")

    # --- Metodología -----------------------------------------------------------
    me = wb.create_sheet("Metodología")
    banda(me, 3, "Cómo se construyó el inventario", "Georreferencia del Master Plan y ubicación de cada imbornal")
    me.column_dimensions["A"].width = 30
    me.column_dimensions["B"].width = 95
    g = datos["meta"]["georreferencia_master_plan"]
    cuenta = Counter(a["tipo"] for a in activos)
    todos = Counter(a["tipo"] for a in datos["_todos"])
    conteos = (f"Excel normalizado: {todos.get('Filtrante simple', 0)} simples, {todos.get('Filtrante doble', 0)} "
               f"dobles y {todos.get('Cisterna (PG)', 0)} cisterna. En el inventario (confirmados): "
               f"{cuenta.get('Filtrante simple', 0)} simples y {cuenta.get('Filtrante doble', 0)} dobles; "
               f"{len(datos['en_validacion'])} en validación y {len(datos['eliminados'])} eliminados.")
    pv = datos.get("plano_verasol")
    if pv:
        conteos += (f" Símbolos dibujados en el plano: {pv['simbolos'].get('Filtrante simple', 0)} simples y "
                    f"{pv['simbolos'].get('Filtrante doble', 0)} dobles. Leyenda del PDF: "
                    f"{pv['leyenda']['Filtrante simple']} simples y {pv['leyenda']['Filtrante doble']} dobles.")
    textos = [
        ("Fuente de los puntos", f"Levantamiento de imbornales de Verasol del {FECHA_LEVANTAMIENTO} "
                                 "(coordenadas Norte, Este y cota)."),
        ("Sistema de coordenadas", datos["meta"]["sistema_coordenadas"]),
        ("Master Plan", "SVG del sistema de mapas (MAPA NUEVO - CJB/assets/mapa.svg). No se contó con el plano "
                        "de AutoCAD, por lo que el SVG se georreferenció por calibración."),
        ("Calibración", f"Escala {g['escala_m_por_unidad_svg']} m por unidad del SVG, rotación "
                        f"{g['rotacion_grados']}°. Fórmula: {g['formula']}. La escala coincide con la obtenida "
                        "comparando las áreas de los lotes del SVG con las áreas registradas en la base de datos."),
        ("Verificación", "Superposición sobre la imagen satelital de Esri (World Imagery): los bordes de los "
                         f"lotes coinciden con las manzanas reales con una precisión de {g['precision_estimada_m']}."),
        ("Ubicación de cada punto", "«Calle»: el punto cae en un lote vial del Master Plan (15-01-xx), cuyo nombre "
                                    "es la calle. «Dentro de lote»: cae dentro de un lote no vial. «Lote más "
                                    "cercano»: el lote no vial más próximo y su distancia."),
        ("Cotejo con el plano", "Cada punto del Excel se comparó con el símbolo más cercano del plano de "
                                "Verasol (KMZ exportado del DWG): azul = registro simple, rojo = registro doble. "
                                "Los puntos con diferencias quedan «en validación»: no se muestran en el mapa hasta que Verasol "
                                "responda en CONFIRMACION_VERASOL_IMBORNALES.xlsx y se vuelva a ejecutar el script."),
        ("Conteos", conteos),
        ("Alcance", "El levantamiento cubre los imbornales de calles y áreas públicas; no incluye los filtrantes "
                    "internos de residenciales y plazas comerciales."),
        ("Actualización", "Ejecutar tools/generar_activos_cjb.py con el nuevo levantamiento: regenera esta hoja y "
                          "la capa del mapa (MAPA NUEVO - CJB/data/activos_cjb.json)."),
    ]
    for i, (k, v) in enumerate(textos):
        r = 5 + i
        a_ = me.cell(row=r, column=1, value=k)
        a_.font = font(10, NAVY, FS)
        a_.alignment = Alignment(vertical="top")
        b_ = me.cell(row=r, column=2, value=v)
        b_.font = font(10)
        b_.alignment = Alignment(wrap_text=True, vertical="top")
        me.row_dimensions[r].height = 18 * max(1, math.ceil(len(v) / 105))

    for hoja in wb.worksheets:
        hoja.page_setup.orientation = "landscape"
        hoja.page_setup.fitToWidth = 1
        hoja.page_setup.fitToHeight = 0
        hoja.sheet_properties.pageSetUpPr.fitToPage = True
    os.makedirs(os.path.dirname(XLSX_OUT), exist_ok=True)
    wb.save(XLSX_OUT)
    print(f"Inventario: {XLSX_OUT}")


def excel_confirmacion(datos):
    """Tabla para confirmar con Verasol. Conserva las respuestas ya anotadas."""
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.workbook.defined_name import DefinedName
    from openpyxl.worksheet.datavalidation import DataValidation

    previas = leer_confirmaciones()
    filas = [a for a in datos["_todos"] if a["motivos_validacion"]]
    filas.sort(key=lambda a: a["id"])
    F, FS = "Segoe UI", "Segoe UI Semibold"
    NAVY, RED, SLATE, LINE = "1B3A6B", "E63946", "64748B", "E2E8F0"
    fill = lambda c: PatternFill("solid", fgColor=c, bgColor=c)
    font = lambda sz=10, color="0F172A", name=F, italic=False, u=None: Font(name=name, size=sz, color=color,
                                                                          italic=italic, underline=u)
    cols = [("ID", 10, False), ("No. en Excel de Verasol", 10, False), ("Fila del Excel", 8, False),
            ("Calle / ubicación", 26, False), ("Tipo en Excel", 15, False), ("Tipo en plano", 15, False),
            ("Qué hay que confirmar", 52, False), ("UTM Este", 12, False), ("UTM Norte", 12, False),
            ("Ver en Google Maps", 11, False), ("Respuesta de Verasol", 26, True), ("Este corregido", 12, True),
            ("Norte corregido", 12, True), ("Comentario de Verasol", 34, True), ("Fecha de confirmación", 13, True)]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Confirmación"
    ult = len(cols)
    for r in (1, 2):
        for c in range(1, ult + 1):
            ws.cell(row=r, column=c).fill = fill(NAVY)
    for c in range(1, ult + 1):
        ws.cell(row=3, column=c).fill = fill(RED)
    ws["A1"] = "Confirmación de imbornales con Verasol · Ciudad Juan Bosch"
    ws["A1"].font = font(15, "FFFFFF", FS)
    ws["A2"] = (f"Levantamiento del {FECHA_LEVANTAMIENTO} · Estos puntos no se muestran en el mapa hasta que se "
                "confirmen · Complete las columnas en amarillo")
    ws["A2"].font = font(9, "C7D2FE")
    ws.row_dimensions[1].height, ws.row_dimensions[2].height, ws.row_dimensions[3].height = 28, 20, 3
    ws["A4"] = ("Respuesta: elija de la lista. Si es «Corregir coordenada», escriba el Este y el Norte corregidos "
                "(UTM 19N). Para un duplicado, marque «Eliminar» en uno de los dos y «Correcto» en el otro.")
    ws["A4"].font = font(9, SLATE, italic=True)
    ws.sheet_view.showGridLines = False
    for j, (t, w, editable) in enumerate(cols, start=1):
        c = ws.cell(row=5, column=j, value=t + (" *" if t == "Respuesta de Verasol" else ""))
        c.font = font(9.5, "FFFFFF", FS)
        c.fill = fill("B45309" if editable else NAVY)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[5].height = 34
    for i, a in enumerate(filas):
        r = 6 + i
        prev = previas.get(a["id"], {})
        vals = [a["id"], a["no_levantamiento"], a["fila_excel"], a["calle"] or a["ubicacion"], a["tipo_original"],
                a["tipo_en_plano"] or "Sin símbolo", " ".join(a["motivos_validacion"]), a["utm_e"], a["utm_n"],
                "Ver ↗", prev.get("respuesta"), prev.get("E"), prev.get("N"), prev.get("comentario"),
                prev.get("fecha")]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = font(9.5)
            c.border = Border(bottom=Side(style="thin", color=LINE), right=Side(style="thin", color=LINE))
            c.alignment = Alignment(vertical="center", wrap_text=j in (4, 7, 14))
            if cols[j - 1][2]:
                c.fill = fill("FFF8E1")
                c.protection = Protection(locked=False)
        for j in (8, 9, 12, 13):
            ws.cell(row=r, column=j).number_format = "0.000"
        link = ws.cell(row=r, column=10)
        link.hyperlink = f"https://www.google.com/maps?q={a['lat']},{a['lon']}"
        link.font = font(9.5, "1D4ED8", u="single")
        ws.row_dimensions[r].height = 42
    fin = 5 + max(len(filas), 1)
    lista = wb.create_sheet("Listas")
    for i, v in enumerate(RESPUESTAS, start=1):
        lista.cell(row=i, column=1, value=v)
    lista.sheet_state = "hidden"
    wb.defined_names["lst_respuesta"] = DefinedName("lst_respuesta", attr_text=f"Listas!$A$1:$A${len(RESPUESTAS)}")
    dv = DataValidation(type="list", formula1="=lst_respuesta", allow_blank=True, showErrorMessage=True,
                        errorTitle="Respuesta no válida", error="Elija una respuesta de la lista.")
    dv.add(f"K6:K{fin}")
    ws.add_data_validation(dv)
    for col in "LM":
        d2 = DataValidation(type="decimal", operator="greaterThan", formula1="0", allow_blank=True,
                            showErrorMessage=True, error="Escriba la coordenada UTM en metros.")
        d2.add(f"{col}6:{col}{fin}")
        ws.add_data_validation(d2)
    d3 = DataValidation(type="date", operator="greaterThan", formula1="1", allow_blank=True)
    d3.add(f"O6:O{fin}")
    ws.add_data_validation(d3)
    for r in range(6, fin + 1):
        ws.cell(row=r, column=15).number_format = "dd/mm/yyyy"
    ws.conditional_formatting.add(f"A6:J{fin}", FormulaRule(formula=['$K6<>""'], fill=fill("DCFCE7")))
    ws.conditional_formatting.add(f"L6:M{fin}", FormulaRule(
        formula=[f'AND($K6="{RESP_COORD}",L6="")'], fill=fill("FED7AA")))
    ws["G4"] = f'=COUNTA(K6:K{fin})&" de "&COUNTA(A6:A{fin})&" respondidos"'
    ws["G4"].font = font(10, NAVY, FS)
    ws["G4"].alignment = Alignment(horizontal="right")
    ws.freeze_panes = "B6"
    ws.auto_filter.ref = f"A5:{get_column_letter(ult)}{fin}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.protection.sheet = True
    ws.protection.autoFilter = False
    ws.protection.sort = False
    ws.protection.formatColumns = False
    ws.protection.formatRows = False
    os.makedirs(os.path.dirname(CONFIRMACION), exist_ok=True)
    wb.save(CONFIRMACION)
    print(f"Confirmación: {CONFIRMACION}  ({len(filas)} puntos, {sum(1 for a in filas if previas.get(a['id'], {}).get('respuesta'))} respondidos)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ruta = args[0] if args else LEVANTAMIENTO_DEF
    datos = construir(ruta, forzar_calibracion="--recalibrar" in sys.argv)
    excel_inventario(datos)
    excel_confirmacion(datos)
