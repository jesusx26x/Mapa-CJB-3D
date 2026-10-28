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
FECHA_LEVANTAMIENTO = "27/07/2026"

TIPOS = {
    "filtrante": "Filtrante simple", "filtrant": "Filtrante simple",
    "filtrante doble": "Filtrante doble", "filtrantedoble": "Filtrante doble",
    "filtrante a": "Filtrante tipo «A» (por confirmar)", "pg cisterna": "Cisterna (PG)",
}
SUBCATS = [
    ("filtrante_simple", "Filtrante simple", "#0ea5e9"),
    ("filtrante_doble", "Filtrante doble", "#6366f1"),
    ("filtrante_a", "Filtrante tipo «A» (por confirmar)", "#f59e0b"),
    ("cisterna", "Cisterna (PG)", "#14b8a6"),
]
SUB_ID = {n: i for i, n, _ in SUBCATS}
CATEGORIAS = [
    {"id": "drenaje_pluvial", "nombre": "Drenaje pluvial", "icono": "💧", "estado": "levantado",
     "fuente": f"Levantamiento de imbornales de Verasol ({FECHA_LEVANTAMIENTO})",
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
def construir(ruta_lev, forzar_calibracion=False):
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

    activos, vistos = [], set()
    for p in puntos:
        t_low = p["tipo_original"].lower()
        tipo = TIPOS.get(t_low, "Filtrante simple")
        fid = f"IMB-{int(p['no']):03d}"
        if fid in vistos:
            fid += "B"
        vistos.add(fid)
        P = Point(p["E"], p["N"])
        hits = [claves[i] for i in arbol.query(P) if lotes[claves[i]].covers(P)]
        hv = [h for h in hits if h in viales]
        hl = [h for h in hits if h not in viales]
        ubic, lote, calle = None, None, None
        if hv:
            ubic, calle = "Calle", hv[0]
        elif hl:
            ubic, lote = "Dentro de lote", hl[0]
        else:
            dv = min((lotes[k].distance(P), k) for k in viales)
            ubic, calle = ("Calle", dv[1]) if dv[0] <= 15 else ("Fuera de lotes del Master Plan", None)
        dl = min((lotes[k].distance(P), k) for k in no_viales)
        obs = []
        if t_low == "filtrant":
            obs.append("Tipo escrito «filtrant» en el levantamiento; se asumió filtrante simple.")
        if t_low == "filtrantedoble":
            obs.append("Tipo escrito «filtrantedoble»; se asumió filtrante doble.")
        if t_low == "filtrante a":
            obs.append("Tipo «filtrante a» sin definición: confirmar con Verasol.")
        if t_low not in TIPOS:
            obs.append(f"Tipo «{p['tipo_original']}» no reconocido; se asumió filtrante simple.")
        if fid.endswith("B"):
            obs.append(f"Número {p['no']} repetido en el levantamiento; se asignó {fid}.")
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
            "lote_frente_id": dl[1], "lote_frente_dist_m": round(dl[0], 1), "observaciones": obs,
        })

    grupos = defaultdict(list)
    for a in activos:
        grupos[(round(a["utm_e"], 1), round(a["utm_n"], 1))].append(a)
    for g in grupos.values():
        if len(g) > 1:
            for a in g:
                otros = ", ".join(o["id"] for o in g if o is not a)
                a["observaciones"].append(f"Misma coordenada que {otros}: posible registro duplicado.")

    resumen = {}
    for k in claves:
        dentro = [a["id"] for a in activos if a["lote_id"] == k or a["calle_id"] == k]
        frente = [] if k in viales else [a["id"] for a in activos if a["ubicacion"] == "Calle"
                                         and a["lote_frente_id"] == k and a["lote_frente_dist_m"] <= 20]
        if dentro or frente:
            resumen[k] = {"dentro": dentro, "frente": frente}

    vx, vy, vw, vh = viewbox
    (e1, n1), (e2, n2) = geo.a_utm(vx, vy), geo.a_utm(vx + vw, vy + vh)
    xmin, xmax, ymin, ymax = min(e1, e2), max(e1, e2), min(n1, n2), max(n1, n2)
    alto = 4096
    ancho = round(alto * (xmax - xmin) / (ymax - ymin))
    sat = {
        "bbox_utm": [round(xmin, 2), round(ymin, 2), round(xmax, 2), round(ymax, 2)],
        "svg_rect": [vx, vy, vw, vh],
        "url": ("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
                f"?bbox={xmin:.2f},{ymin:.2f},{xmax:.2f},{ymax:.2f}&bboxSR=32619&imageSR=32619"
                f"&size={ancho},{alto}&format=jpg&f=image"),
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
        "categorias": CATEGORIAS, "activos": activos,
        "resumen_por_lote": resumen, "filas_descartadas": descartadas,
    }
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Capa: {JSON_OUT}  ({len(activos)} activos)")
    print("  Tipos:", dict(Counter(a["tipo"] for a in activos)))
    print("  Ubicación:", dict(Counter(a["ubicacion"] for a in activos)))
    return salida


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
            ("No. en levantamiento", 12), ("Tipo anotado", 14), ("Observaciones", 48), ("Mapa", 12)]
    banda(ws, len(cols), "Inventario de activos de ciudad · Imbornales de Ciudad Juan Bosch",
          f"Fuente: levantamiento de Verasol ({FECHA_LEVANTAMIENTO}) · Coordenadas UTM 19N (WGS 84) · {ENTIDAD}")
    encabezado(ws, 5, [c for c, _ in cols])
    for j, (_, w) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w
    for i, a in enumerate(activos):
        r = 6 + i
        vals = [a["id"], a["tipo"], a["ubicacion"], a["calle"], a["lote_id"], a["lote_nombre"],
                a["lote_frente_id"], a["lote_frente_dist_m"], a["cota"], a["utm_e"], a["utm_n"],
                a["lat"], a["lon"], a["no_levantamiento"], a["tipo_original"],
                " ".join(a["observaciones"]) or None, "Ver ↗"]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = font(9.5)
            c.border = linea
            c.alignment = Alignment(vertical="center", wrap_text=j in (4, 6, 16))
            if i % 2:
                c.fill = fill("FAFBFD")
        ws.cell(row=r, column=8).number_format = "0.0"
        ws.cell(row=r, column=9).number_format = "0.00"
        for j in (10, 11):
            ws.cell(row=r, column=j).number_format = "0.000"
        for j in (12, 13):
            ws.cell(row=r, column=j).number_format = "0.000000"
        link = ws.cell(row=r, column=17)
        link.hyperlink = f"https://www.google.com/maps?q={a['lat']},{a['lon']}"
        link.font = font(9.5, "1D4ED8", u="single")
    ult = 5 + len(activos)
    ws.freeze_panes = "B6"
    ws.auto_filter.ref = f"A5:{get_column_letter(len(cols))}{ult}"
    tonos = {"Filtrante simple": ("E0F2FE", "075985"), "Filtrante doble": ("E0E7FF", "3730A3"),
             "Filtrante tipo «A» (por confirmar)": ("FEF3C7", "92400E"), "Cisterna (PG)": ("CCFBF1", "115E59")}
    for t, (bg, fg) in tonos.items():
        ws.conditional_formatting.add(f"B6:B{ult}", FormulaRule(formula=[f'$B6="{t}"'], fill=fill(bg),
                                                                font=Font(color=fg, bold=True)))
    ws.conditional_formatting.add(f"P6:P{ult}", FormulaRule(formula=['LEN($P6)>0'], fill=fill("FFF7ED")))
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

    # --- Por revisar ---------------------------------------------------------
    pr = wb.create_sheet("Por revisar con Verasol")
    banda(pr, 4, "Datos a confirmar con Verasol",
          "Diferencias encontradas al procesar el levantamiento; ninguna impide usar el inventario")
    encabezado(pr, 5, ["ID", "Fila en el Excel original", "Situación", "Coordenada (UTM E / N)"])
    for col, w in zip("ABCD", (12, 14, 70, 26)):
        pr.column_dimensions[col].width = w
    r = 6
    for a in activos:
        for o in a["observaciones"]:
            for j, v in enumerate([a["id"], a["fila_excel"], o, f"{a['utm_e']:.2f} / {a['utm_n']:.2f}"], start=1):
                c = pr.cell(row=r, column=j, value=v)
                c.font = font(9.5)
                c.border = linea
                c.alignment = Alignment(wrap_text=True, vertical="center")
            r += 1
    for d in datos["filas_descartadas"]:
        for j, v in enumerate(["—", d["fila_excel"], d["motivo"] + " Valores: " + ", ".join(d["valores"]), "—"], 1):
            c = pr.cell(row=r, column=j, value=v)
            c.font = font(9.5)
            c.border = linea
            c.alignment = Alignment(wrap_text=True, vertical="center")
        r += 1
    for a in activos:
        if a["ubicacion"] == "Fuera de lotes del Master Plan":
            for j, v in enumerate([a["id"], a["fila_excel"], "El punto queda fuera de los lotes del Master Plan; "
                                   "verificar si pertenece a CJB o si la coordenada es correcta.",
                                   f"{a['utm_e']:.2f} / {a['utm_n']:.2f}"], start=1):
                c = pr.cell(row=r, column=j, value=v)
                c.font = font(9.5)
                c.border = linea
                c.alignment = Alignment(wrap_text=True, vertical="center")
            r += 1

    # --- Metodología -----------------------------------------------------------
    me = wb.create_sheet("Metodología")
    banda(me, 3, "Cómo se construyó el inventario", "Georreferencia del Master Plan y ubicación de cada imbornal")
    me.column_dimensions["A"].width = 30
    me.column_dimensions["B"].width = 95
    g = datos["meta"]["georreferencia_master_plan"]
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


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ruta = args[0] if args else LEVANTAMIENTO_DEF
    datos = construir(ruta, forzar_calibracion="--recalibrar" in sys.argv)
    excel_inventario(datos)
