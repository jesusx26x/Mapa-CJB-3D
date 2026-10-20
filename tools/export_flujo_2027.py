"""
Exporta el modelo «Flujo de Caja VBC Oct2026-Dic2027 v*.xlsx» a data/flujo_2027.json
para la pestaña «💰 Flujo 2027» del Sistema VBC.

Sin --src usa la versión más alta del modelo en la carpeta 2027 (v1, v1.1, v1.2…;
a igual versión, el archivo guardado más recientemente).

Pasos:
  1. Copia el Excel a una carpeta temporal (el original nunca se abre ni se guarda).
  2. Por cada escenario escribe el nombre en Panel!D5, recalcula con Excel por COM
     (PowerShell + Excel.Application, sin dependencias nuevas) y guarda una copia por escenario.
  3. Lee las copias con openpyxl (data_only=True), validando los encabezados de cada hoja.
  4. Cuadra los detalles contra Flujo_Mensual y el Panel, y escribe el JSON.

Uso:  python tools/export_flujo_2027.py [--src RUTA_EXCEL] [--out RUTA_JSON]
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
MODELO_DIR = Path(
    r"C:\Users\John Marte\Fideicomiso VBCRD\Fonvivienda - IDMP\VBC2\Planificación Estratégica"
    r"\01 Autosuficiencia Financiera\Presupuesto\2027"
)
MODELO_PATRON = "Flujo de Caja VBC Oct2026-Dic2027 v*.xlsx"
DEFAULT_OUT = ROOT / "data" / "flujo_2027.json"
ESCENARIOS = ["Pesimista", "Base", "Optimista"]
TOL = 1.0  # RD$ de tolerancia al cuadrar

# Claves con lote real en el mapa: CJB-04-13-01, CPAG-01-01-01, CPAG-C-05
RE_CLAVE_REAL = re.compile(r"^(CJB|CPAG)-(\d{2}-\d{2}-\d{2}|C-\d{2})$")

POWERSHELL_RECALC = r"""
$ErrorActionPreference = 'Stop'
$src = $env:VBC_FLUJO_SRC
$dir = $env:VBC_FLUJO_DIR
$escenarios = $env:VBC_FLUJO_ESC -split ','
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.AskToUpdateLinks = $false
try {
  $wb = $xl.Workbooks.Open($src, 0, $false)
  foreach ($e in $escenarios) {
    $wb.Worksheets.Item('Panel').Range('D5').Value2 = $e
    $xl.CalculateFull()
    $dest = Join-Path $dir ("flujo_" + $e + ".xlsx")
    $wb.SaveCopyAs($dest)
    Write-Output ("OK " + $e)
  }
  $wb.Close($false)
} finally {
  $xl.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
"""


# ----------------------------------------------------------------------------- utilidades
def norm(v):
    """Normaliza un encabezado para compararlo (minúsculas, sin espacios extra)."""
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip().lower()


def mes_key(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return f"{v.year:04d}-{v.month:02d}"
    return None


def num(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return 0.0


def r2(x):
    return round(float(x), 2)


def fail(msg):
    raise SystemExit(f"ERROR: {msg}")


def find_header_row(ws, required, max_row=12):
    """Devuelve (fila, {encabezado_normalizado: columna}) de la primera fila que tenga todos los requeridos."""
    req = [norm(r) for r in required]
    for r in range(1, max_row + 1):
        hdr = {}
        for c in range(1, ws.max_column + 1):
            h = norm(ws.cell(r, c).value)
            if h and h not in hdr:
                hdr[h] = c
        if all(x in hdr for x in req):
            return r, hdr
    fail(f"Hoja «{ws.title}»: no encontré los encabezados {required}")


def month_cols(ws, row, meses):
    """Columnas del primer bloque contiguo de fechas en `row` que coincide con `meses`."""
    for c in range(1, ws.max_column + 1):
        if mes_key(ws.cell(row, c).value) == meses[0]:
            cols = list(range(c, c + len(meses)))
            got = [mes_key(ws.cell(row, cc).value) for cc in cols]
            if got == meses:
                return cols
    fail(f"Hoja «{ws.title}» fila {row}: no encontré los meses {meses[0]}…{meses[-1]} contiguos")


def col(hdr, name, sheet):
    k = norm(name)
    if k not in hdr:
        fail(f"Hoja «{sheet}»: falta la columna «{name}»")
    return hdr[k]


def data_rows(ws, start, key_col):
    """Filas de datos desde `start` hasta la primera fila vacía o 'TOTAL' en key_col."""
    r = start
    while r <= ws.max_row:
        v = ws.cell(r, key_col).value
        if v is None or norm(v) == "total":
            break
        yield r
        r += 1


def table_rows(ws, name):
    """Filas de una tabla de Excel como lista de dicts por encabezado."""
    if name not in ws.tables:
        fail(f"Hoja «{ws.title}»: no existe la tabla «{name}»")
    ref = ws.tables[name].ref
    rows = list(ws[ref])
    heads = [c.value for c in rows[0]]
    out = []
    for row in rows[1:]:
        d = {h: c.value for h, c in zip(heads, row)}
        if any(v is not None for v in d.values()):
            out.append(d)
    return heads, out


def split_clave(clave):
    m = RE_CLAVE_REAL.match(clave or "")
    return (m.group(1), m.group(2)) if m else (None, None)


def zeros(n):
    return [0.0] * n


def add_into(acc, arr):
    for i, v in enumerate(arr):
        acc[i] += v


# ----------------------------------------------------------------------------- recálculo
def recalcular(src, tmpdir):
    copia = Path(tmpdir) / "modelo.xlsx"
    try:
        shutil.copyfile(src, copia)  # el original no se toca
    except PermissionError:
        # Archivos de OneDrive (reparse points): Python no siempre puede abrirlos; Copy-Item sí.
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Copy-Item -LiteralPath $env:VBC_FLUJO_ORIG -Destination $env:VBC_FLUJO_COPIA -Force"],
            env=dict(os.environ, VBC_FLUJO_ORIG=str(src), VBC_FLUJO_COPIA=str(copia)),
            capture_output=True, text=True, timeout=120,
        )
        if res.returncode != 0 or not copia.exists():
            fail("No pude copiar el Excel a la carpeta temporal:\n" + res.stdout + res.stderr)
    env = dict(os.environ)
    env.update(VBC_FLUJO_SRC=str(copia), VBC_FLUJO_DIR=str(tmpdir), VBC_FLUJO_ESC=",".join(ESCENARIOS))
    ps1 = Path(tmpdir) / "recalc.ps1"
    ps1.write_text(POWERSHELL_RECALC, encoding="utf-8-sig")
    print("Recalculando con Excel (COM)…")
    res = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1)],
        env=env, capture_output=True, text=True, timeout=600,
    )
    if res.returncode != 0:
        fail("Excel COM falló:\n" + res.stdout + res.stderr)
    out = {}
    for e in ESCENARIOS:
        p = Path(tmpdir) / f"flujo_{e}.xlsx"
        if not p.exists():
            fail(f"No se generó la copia recalculada del escenario {e}")
        out[e] = p
    return out


# ----------------------------------------------------------------------------- lectura
PANEL_KPIS = [
    ("saldoInicial", "Saldo inicial de caja"),
    ("ingresos", "Ingresos proyectados"),
    ("egresos", "Egresos proyectados"),
    ("saldoFinal", "Saldo final a dic-2027"),
    ("saldoMin", "Saldo más bajo del período"),
    ("mesSaldoMin", "Mes del saldo más bajo"),
    ("mesesNegativos", "Meses con saldo negativo"),
    ("colchon", "Colchón mínimo de caja"),
    ("disponiblePACC", "Disponible para presupuesto de áreas (PACC)"),
    ("disponibleCierre", "Disponible al cierre de dic-2027"),
]

FLUJO_FILAS = {
    "saldoInicial": "Saldo inicial",
    "cartera": "Cartera con plan de pagos",
    "recupLegal": "Recuperación de cartera en gestión legal",
    "lic2026": "Licitación 2026-01",
    "lic2027": "Licitación 2027-01",
    "zfi": "Zona Franca Industrial",
    "adicionales": "Lotes adicionales",
    "cpag2027": "Licitaciones CPAG 2027",
    "otros": "Otros ingresos",
    "totalIngresos": "TOTAL INGRESOS",
    "obrasCJB": "Cubicaciones obras CJB",
    "obrasCPAG": "Cubicaciones obras CPAG",
    "mantGeneral": "Reserva Mantenimiento General",
    "complementarias": "Obras complementarias",
    "costoAtraso": "Costo de atrasar obras",
    "retenidos": "Devolución de retenidos",
    "gfRRHH": "Gastos fijos – Recursos Humanos",
    "gfCargaFija": "Gastos fijos – Carga Fija",
    "gfAdmin": "Gastos fijos – Administrativos",
    "gfMant": "Gastos fijos – Mantenimientos",
    "gfBienes": "Bienes muebles",
    "totalEgresos": "TOTAL EGRESOS",
    "neto": "FLUJO NETO DEL MES",
    "lineaDesembolso": "Desembolso de línea de crédito",
    "lineaPago": "Pago de línea de crédito",
    "lineaIntereses": "Intereses de línea de crédito",
    "lineaDeuda": "Deuda de la línea de crédito",
    "saldo": "SALDO FINAL DE CAJA",
    "colchon": "Colchón mínimo",
    "estado": "Estado",
}

GRUPO_CAMPO = {"LIC 2026-01": "lic2026", "LIC 2027-01": "lic2027", "ZFI 2027-02": "zfi", "Lotes adicionales": "adicionales",
               "CPAG HAB 2027": "cpag2027", "CPAG COM 2027": "cpag2027"}
ING_KEYS = ["cartera", "recupLegal", "lic2026", "lic2027", "zfi", "adicionales", "cpag2027"]
# grupo de licitación -> categoría de color en el mapa
GRUPO_CAT = {"LIC 2026-01": "adjudicada", "LIC 2027-01": "licitar", "ZFI 2027-02": "licitar",
             "CPAG HAB 2027": "licitar", "CPAG COM 2027": "licitar"}


def leer_panel(wb):
    ws = wb["Panel"]
    escenario = ws["D5"].value
    kpis = {}
    labels = {norm(ws.cell(r, 2).value): r for r in range(1, 40) if ws.cell(r, 2).value}
    for key, label in PANEL_KPIS:
        r = labels.get(norm(label))
        if r is None:
            fail(f"Panel: no encontré el indicador «{label}» en la columna B")
        v = ws.cell(r, 4).value
        if key == "mesSaldoMin":
            kpis[key] = mes_key(v)
        elif key == "mesesNegativos":
            kpis[key] = int(num(v))
        else:
            kpis[key] = r2(num(v))
    return escenario, kpis


def leer_flujo(wb):
    ws = wb["Flujo_Mensual"]
    if norm(ws["A4"].value) != "concepto":
        fail("Flujo_Mensual: se esperaba «Concepto» en A4")
    meses = [mes_key(ws.cell(4, c).value) for c in range(2, 17)]
    if None in meses or len(set(meses)) != 15:
        fail(f"Flujo_Mensual: fila 4 B:P no son 15 meses: {meses}")
    filas = {}
    for r in range(5, ws.max_row + 1):
        lab = norm(ws.cell(r, 1).value)
        if lab:
            filas.setdefault(lab, r)
    out = {}
    for key, label in FLUJO_FILAS.items():
        lab = norm(label)
        r = next((rr for l, rr in filas.items() if l.startswith(lab)), None)
        if r is None:
            fail(f"Flujo_Mensual: no encontré la fila «{label}»")
        vals = [ws.cell(r, c).value for c in range(2, 17)]
        out[key] = [str(v) if v is not None else "" for v in vals] if key == "estado" else [num(v) for v in vals]
    return meses, out


def leer_obras(wb, meses):
    ws = wb["Obras"]
    hr, hdr = find_header_row(ws, ["#", "Proyecto", "ID lote", "Clave mapa", "Obra", "Contratista", "Tipo", "Estatus",
                                   "Confianza del ID", "Contrato", "Adenda", "Restante por pagar", "Incluir",
                                   "Modo de programa", "Total horizonte", "Posterior (2028+)"])
    mc = month_cols(ws, hr, meses)
    S = "Obras"
    out = []
    for r in data_rows(ws, hr + 1, col(hdr, "#", S)):
        g = lambda name: ws.cell(r, col(hdr, name, S)).value  # noqa: E731
        clave = str(g("Clave mapa") or "").strip()
        pagos = [num(ws.cell(r, c).value) for c in mc]
        out.append({
            "clave": clave,
            "proyecto": str(g("Proyecto") or "").strip(),
            "id": str(g("ID lote") or "").strip(),
            "obra": str(g("Obra") or "").strip(),
            "contratista": str(g("Contratista") or "").strip(),
            "tipo": str(g("Tipo") or "").strip(),
            "estatus": str(g("Estatus") or "").strip(),
            "confianza": str(g("Confianza del ID") or "").strip(),
            "contrato": r2(num(g("Contrato"))),
            "adenda": r2(num(g("Adenda"))),
            "restante": r2(num(g("Restante por pagar"))),
            "pagos": [r2(v) for v in pagos],
            "totalHorizonte": r2(num(g("Total horizonte"))),
            "posterior": r2(num(g("Posterior (2028+)"))),
            "incluida": norm(g("Incluir")) in ("sí", "si"),
            "modo": str(g("Modo de programa") or "").strip(),
            "enMapa": bool(RE_CLAVE_REAL.match(clave)),
            "_pagosRaw": pagos,
        })
    if not out:
        fail("Obras: no hay filas de datos")
    return out


def leer_cuotas(wb, meses):
    ws = wb["Cuotas"]
    heads, rows = table_rows(ws, "tCuotas")
    # Desde v1.7 cada cuota se reparte por mes (retraso, renegociación, legal, terreno) en «Cobro aaaa-mm»
    cols_mes = [f"Cobro {m}" for m in meses]
    need = ["Grupo", "Proyecto", "IDLote", "ClaveMapa", "Cuota"] + cols_mes
    for h in need:
        if h not in heads:
            fail(f"Cuotas/tCuotas: falta la columna «{h}»")
    por_clave = defaultdict(lambda: zeros(len(meses)))
    for d in rows:
        for i, c in enumerate(cols_mes):
            por_clave[d["ClaveMapa"]][i] += num(d[c])
    return por_clave


def leer_licitaciones(wb, meses, cuotas):
    ws = wb["Licitaciones"]
    S = "Licitaciones"
    hr, hdr = find_header_row(ws, ["Grupo", "Proyecto", "ID lote", "Clave mapa", "Área m² (licitación)",
                                   "Precio aplicado RD$/m²", "Valor de venta", "Adjudicatario", "Fecha firma (lote)",
                                   "Incluir lote", "Probabilidad", "Valor esperado", "Cobro en horizonte",
                                   "Cobro posterior (2028+)"])
    out = []
    for r in data_rows(ws, hr + 1, col(hdr, "Grupo", S)):
        g = lambda name: ws.cell(r, col(hdr, name, S)).value  # noqa: E731
        clave = str(g("Clave mapa") or "").strip()
        firma = g("Fecha firma (lote)")
        cobros = cuotas.get(clave, zeros(len(meses)))
        cobro_h = num(g("Cobro en horizonte"))
        if abs(sum(cobros) - cobro_h) > TOL:
            fail(f"Licitaciones {clave}: cuotas ({sum(cobros):,.2f}) ≠ cobro en horizonte ({cobro_h:,.2f})")
        out.append({
            "clave": clave,
            "proyecto": str(g("Proyecto") or "").strip(),
            "id": str(g("ID lote") or "").strip(),
            "grupo": str(g("Grupo") or "").strip(),
            "area": r2(num(g("Área m² (licitación)"))),
            "precio": r2(num(g("Precio aplicado RD$/m²"))),
            "valor": r2(num(g("Valor de venta"))),
            "adjudicatario": str(g("Adjudicatario") or "").strip(),
            "fechaFirma": firma.strftime("%Y-%m-%d") if isinstance(firma, (dt.datetime, dt.date)) else None,
            "incluida": norm(g("Incluir lote")) in ("sí", "si"),
            "probabilidad": num(g("Probabilidad")),
            "valorEsperado": r2(num(g("Valor esperado"))),
            "cobros": [r2(v) for v in cobros],
            "cobroHorizonte": r2(cobro_h),
            "posterior": r2(num(g("Cobro posterior (2028+)"))),
            "enMapa": bool(RE_CLAVE_REAL.match(clave)),
            "_cobrosRaw": cobros,
        })
    return out


def leer_mes_recup_legal(wb):
    ws = wb["Decisiones"]
    for r in range(1, ws.max_row + 1):
        if norm(ws.cell(r, 2).value).startswith("mes estimado de esa recuperación"):
            return mes_key(ws.cell(r, 3).value)
    fail("Decisiones: no encontré «Mes estimado de esa recuperación»")


def leer_cartera(wb, meses):
    ws = wb["CxC_Cartera"]
    S = "CxC_Cartera"
    hr, hdr = find_header_row(ws, ["Proyecto", "ID lote", "Clave mapa", "Cliente (archivo)", "Nombre (mapa)",
                                   "Saldo según archivo", "Situación", "Recuperación legal esperada",
                                   "Total horizonte", "Posterior (2028+)"])
    mc = month_cols(ws, hr, meses)
    mes_legal = leer_mes_recup_legal(wb)
    out = []
    for r in data_rows(ws, hr + 1, col(hdr, "Proyecto", S)):
        g = lambda name: ws.cell(r, col(hdr, name, S)).value  # noqa: E731
        clave = str(g("Clave mapa") or "").strip()
        cobros = [num(ws.cell(r, c).value) for c in mc]
        recup = num(g("Recuperación legal esperada"))
        out.append({
            "clave": clave,
            "proyecto": str(g("Proyecto") or "").strip(),
            "id": str(g("ID lote") or "").strip(),
            "cliente": str(g("Cliente (archivo)") or "").strip(),
            "nombre": str(g("Nombre (mapa)") or "").strip(),
            "situacion": str(g("Situación") or "").strip(),
            "saldo": r2(num(g("Saldo según archivo"))),
            "cobros": [r2(v) for v in cobros],
            "totalHorizonte": r2(num(g("Total horizonte"))),
            "posterior": r2(num(g("Posterior (2028+)"))),
            "recupLegal": r2(recup),
            "mesRecupLegal": mes_legal if recup else None,
            "enMapa": bool(RE_CLAVE_REAL.match(clave)),
            "_cobrosRaw": cobros,
            "_recupRaw": recup,
        })
    return out, mes_legal


def leer_retenidos(wb, meses):
    ws = wb["Retenidos"]
    S = "Retenidos"
    hr, hdr = find_header_row(ws, ["#", "Proyecto", "ID lote", "Clave mapa", "Contratista", "Obra", "Monto retenido",
                                   "Mes de pago (calculado)", "Total horizonte", "Posterior (2028+)"])
    mc = month_cols(ws, hr, meses)
    out = []
    for r in data_rows(ws, hr + 1, col(hdr, "#", S)):
        g = lambda name: ws.cell(r, col(hdr, name, S)).value  # noqa: E731
        clave = str(g("Clave mapa") or "").strip()
        pagos = [num(ws.cell(r, c).value) for c in mc]
        out.append({
            "clave": clave,
            "proyecto": str(g("Proyecto") or "").strip(),
            "id": str(g("ID lote") or "").strip(),
            "contratista": str(g("Contratista") or "").strip(),
            "obra": str(g("Obra") or "").strip(),
            "monto": r2(num(g("Monto retenido"))),
            "mes": mes_key(g("Mes de pago (calculado)")),
            "pagos": [r2(v) for v in pagos],
            "totalHorizonte": r2(num(g("Total horizonte"))),
            "posterior": r2(num(g("Posterior (2028+)"))),
            "enMapa": bool(RE_CLAVE_REAL.match(clave)),
            "_pagosRaw": pagos,
        })
    return out


def leer_maestro(wb):
    ws = wb["Lotes_Maestro"]
    heads, rows = table_rows(ws, "tLotes")
    need = ["Proyecto", "IDLote", "ClaveMapa", "Tipo", "Subtipo", "Nombre", "Desarrollador", "AreaM2", "Estado",
            "IngresosHorizonte", "EgresosObrasHorizonte", "FlujoNetoLote", "ConMovimiento"]
    for h in need:
        if h not in heads:
            fail(f"Lotes_Maestro/tLotes: falta la columna «{h}»")
    return rows


# ----------------------------------------------------------------------------- armado
CATEGORIAS = ["obra", "adjudicada", "licitar", "opcional", "cartera", "legal"]


def armar_escenario(wb, meses):
    nombre, kpis = leer_panel(wb)
    meses_f, f = leer_flujo(wb)
    if meses_f != meses:
        fail("Los meses de Flujo_Mensual no coinciden entre escenarios")
    obras = leer_obras(wb, meses)
    cuotas = leer_cuotas(wb, meses)
    lics = leer_licitaciones(wb, meses, cuotas)
    cartera, _ = leer_cartera(wb, meses)
    retenidos = leer_retenidos(wb, meses)
    maestro = leer_maestro(wb)
    n = len(meses)
    idx = {m: i for i, m in enumerate(meses)}

    # --- cuadre de detalles contra Flujo_Mensual
    def check(nombre_fila, calc, ref):
        for i, (a, b) in enumerate(zip(calc, ref)):
            if abs(a - b) > TOL:
                fail(f"No cuadra «{nombre_fila}» en {meses[i]}: detalle {a:,.2f} vs Flujo_Mensual {b:,.2f}")

    acc = defaultdict(lambda: zeros(n))
    for o in obras:
        if o["tipo"].lower() == "reserva":
            add_into(acc["mantGeneral"], o["_pagosRaw"])
        else:
            add_into(acc["obras" + o["proyecto"]], o["_pagosRaw"])
    for l in lics:
        add_into(acc[GRUPO_CAMPO[l["grupo"]]], l["_cobrosRaw"])
    for c in cartera:
        add_into(acc["cartera"], c["_cobrosRaw"])
        if c["_recupRaw"]:
            acc["recupLegal"][idx[c["mesRecupLegal"]]] += c["_recupRaw"]
    for rt in retenidos:
        add_into(acc["retenidos"], rt["_pagosRaw"])
    for k in ["obrasCJB", "obrasCPAG", "mantGeneral", "retenidos"] + ING_KEYS:
        check(k, acc[k], f[k])

    gastos_fijos = [sum(v) for v in zip(f["gfRRHH"], f["gfCargaFija"], f["gfAdmin"], f["gfMant"], f["gfBienes"])]
    tot_ing = [sum(v) for v in zip(*(f[k] for k in ING_KEYS + ["otros"]))]
    tot_egr = [sum(v) for v in zip(f["obrasCJB"], f["obrasCPAG"], f["mantGeneral"], f["complementarias"],
                                   f["costoAtraso"], f["retenidos"], gastos_fijos)]
    check("TOTAL INGRESOS", tot_ing, f["totalIngresos"])
    check("TOTAL EGRESOS", tot_egr, f["totalEgresos"])

    # --- cuadre contra el Panel
    for key, serie in (("ingresos", f["totalIngresos"]), ("egresos", f["totalEgresos"])):
        if abs(sum(serie) - kpis[key]) > TOL:
            fail(f"Panel {key} ({kpis[key]:,.2f}) ≠ suma de Flujo_Mensual ({sum(serie):,.2f})")
    if abs(f["saldo"][-1] - kpis["saldoFinal"]) > TOL:
        fail("Panel saldo final ≠ Flujo_Mensual")
    if abs(min(f["saldo"]) - kpis["saldoMin"]) > TOL:
        fail("Panel saldo mínimo ≠ Flujo_Mensual")

    # --- categorías y totales por lote (solo claves reales)
    lotes = defaultdict(lambda: {"categorias": [], "ingresos": 0.0, "egresos": 0.0,
                                 "ingresosMes": zeros(n), "egresosMes": zeros(n), "atenuado": False})

    def tag(clave, cat):
        if RE_CLAVE_REAL.match(clave) and cat not in lotes[clave]["categorias"]:
            lotes[clave]["categorias"].append(cat)

    for o in obras:
        if o["enMapa"]:
            tag(o["clave"], "obra")
            add_into(lotes[o["clave"]]["egresosMes"], o["_pagosRaw"])
    for rt in retenidos:
        if rt["enMapa"]:
            add_into(lotes[rt["clave"]]["egresosMes"], rt["_pagosRaw"])
    for l in lics:
        cat = GRUPO_CAT.get(l["grupo"], "opcional")
        tag(l["clave"], cat)
        if l["enMapa"]:
            add_into(lotes[l["clave"]]["ingresosMes"], l["_cobrosRaw"])
            if not l["incluida"] or l["probabilidad"] == 0:
                lotes[l["clave"]]["atenuado"] = True
    for c in cartera:
        if c["situacion"] == "Con plan" and c["totalHorizonte"] > 0:
            tag(c["clave"], "cartera")
        elif c["situacion"].startswith("Sin plan"):
            tag(c["clave"], "legal")
        if c["enMapa"]:
            add_into(lotes[c["clave"]]["ingresosMes"], c["_cobrosRaw"])
            if c["_recupRaw"]:
                lotes[c["clave"]]["ingresosMes"][idx[c["mesRecupLegal"]]] += c["_recupRaw"]

    lotes_out = {}
    for clave, d in sorted(lotes.items()):
        cats = sorted(d["categorias"], key=CATEGORIAS.index)
        if not cats:
            continue  # solo retenidos sin obra: no colorea
        lotes_out[clave] = {
            "categoria": cats[0],
            "categorias": cats,
            "ingresos": r2(sum(d["ingresosMes"])),
            "egresos": r2(sum(d["egresosMes"])),
            "ingresosMes": [r2(v) for v in d["ingresosMes"]],
            "egresosMes": [r2(v) for v in d["egresosMes"]],
            "atenuado": d["atenuado"] and cats[0] in ("licitar", "opcional"),
        }

    # cuadre de ingresos/egresos por lote contra Lotes_Maestro
    for row in maestro:
        clave = row["ClaveMapa"]
        if not RE_CLAVE_REAL.match(clave or ""):
            continue  # claves virtuales: no van al mapa
        ing_m, egr_m = num(row["IngresosHorizonte"]), num(row["EgresosObrasHorizonte"])
        mine = lotes_out.get(clave, {"ingresos": 0.0, "egresos": 0.0})
        if abs(mine["ingresos"] - ing_m) > TOL or abs(mine["egresos"] - egr_m) > TOL:
            print(f"   aviso: {clave} JSON ing/egr {mine['ingresos']/1e6:,.2f}/{mine['egresos']/1e6:,.2f} "
                  f"vs Lotes_Maestro {ing_m/1e6:,.2f}/{egr_m/1e6:,.2f}")

    # --- totales por proyecto (gastos fijos no se reparten)
    por_proyecto = {}
    for p in sorted({o["proyecto"] for o in obras} | {l["proyecto"] for l in lics} | {c["proyecto"] for c in cartera}
                    | {rt["proyecto"] for rt in retenidos}):
        ing = defaultdict(lambda: zeros(n))
        egr = defaultdict(lambda: zeros(n))
        for c in cartera:
            if c["proyecto"] == p:
                add_into(ing["cartera"], c["_cobrosRaw"])
                if c["_recupRaw"]:
                    ing["recupLegal"][idx[c["mesRecupLegal"]]] += c["_recupRaw"]
        for l in lics:
            if l["proyecto"] == p:
                add_into(ing[GRUPO_CAMPO[l["grupo"]]], l["_cobrosRaw"])
        for o in obras:
            if o["proyecto"] == p:
                add_into(egr["mantGeneral" if o["tipo"].lower() == "reserva" else "obras"], o["_pagosRaw"])
        for rt in retenidos:
            if rt["proyecto"] == p:
                add_into(egr["retenidos"], rt["_pagosRaw"])
        ing_keys = ING_KEYS
        egr_keys = ["obras", "mantGeneral", "retenidos"]
        ing_d = {k: [r2(v) for v in ing[k]] for k in ing_keys}
        egr_d = {k: [r2(v) for v in egr[k]] for k in egr_keys}
        ing_d["total"] = [r2(sum(v)) for v in zip(*(ing[k] for k in ing_keys))]
        egr_d["total"] = [r2(sum(v)) for v in zip(*(egr[k] for k in egr_keys))]
        por_proyecto[p] = {"ingresos": ing_d, "egresos": egr_d}

    strip = lambda rows: [{k: v for k, v in d.items() if not k.startswith("_")} for d in rows]  # noqa: E731
    R = lambda arr: [r2(v) for v in arr]  # noqa: E731
    esc = {
        "kpis": kpis,
        "mensual": {
            "ingresos": {k: R(f[k]) for k in ING_KEYS + ["otros"]}
            | {"total": R(f["totalIngresos"])},
            "egresos": {"obrasCJB": R(f["obrasCJB"]), "obrasCPAG": R(f["obrasCPAG"]), "mantGeneral": R(f["mantGeneral"]),
                        "complementarias": R(f["complementarias"]), "costoAtraso": R(f["costoAtraso"]),
                        "retenidos": R(f["retenidos"]), "gastosFijos": R(gastos_fijos),
                        "gastosFijosDetalle": {"rrhh": R(f["gfRRHH"]), "cargaFija": R(f["gfCargaFija"]),
                                               "admin": R(f["gfAdmin"]), "mantenimientos": R(f["gfMant"]),
                                               "bienesMuebles": R(f["gfBienes"])},
                        "total": R(f["totalEgresos"])},
            "saldoInicial": R(f["saldoInicial"]),
            "neto": R(f["neto"]),
            "lineaCredito": {"desembolso": R(f["lineaDesembolso"]), "pago": R(f["lineaPago"]),
                             "intereses": R(f["lineaIntereses"]), "deuda": R(f["lineaDeuda"])},
            "saldo": R(f["saldo"]),
            "colchon": R(f["colchon"]),
            "estado": f["estado"],
        },
        "porProyecto": por_proyecto,
        "obras": strip(obras),
        "licitaciones": strip(lics),
        "cartera": strip(cartera),
        "retenidos": strip(retenidos),
        "lotes": lotes_out,
    }
    return nombre, esc, maestro


def modelo_vigente():
    """Versión más alta del modelo (v1 < v1.1 < v1.2 …); a igual versión, el guardado más reciente."""
    def version(p):
        m = re.search(r" v(\d+(?:\.\d+)*)", p.name)
        return tuple(int(x) for x in m.group(1).split(".")) if m else (0,)

    candidatos = [p for p in MODELO_DIR.glob(MODELO_PATRON) if not p.name.startswith("~$")]
    if not candidatos:
        fail(f"No encontré «{MODELO_PATRON}» en {MODELO_DIR}")
    return max(candidatos, key=lambda p: (version(p), p.stat().st_mtime))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="Excel del modelo (por defecto, la versión más alta en la carpeta 2027)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()
    src = Path(args.src) if args.src else modelo_vigente()
    if not src.exists():
        fail(f"No existe el Excel: {src}")
    print(f"Modelo: {src.name}")

    with tempfile.TemporaryDirectory(prefix="vbc_flujo_") as tmp:
        copias = recalcular(src, tmp)
        data = {
            "generado": dt.datetime.now().isoformat(timespec="seconds"),
            "fuente": src.name,
            "fuenteModificado": dt.datetime.fromtimestamp(src.stat().st_mtime).isoformat(timespec="seconds"),
            "unidad": "RD$",
            "meses": None,
            "escenarios": {},
            "maestro": {},
        }
        print()
        print(f"{'Escenario':<12}{'Ingresos':>11}{'Egresos':>11}{'Saldo fin':>11}{'Mínimo':>11}  Mes min   PACC   (RD$ M)")
        for e in ESCENARIOS:
            wb = openpyxl.load_workbook(copias[e], data_only=True)
            if data["meses"] is None:
                data["meses"] = [mes_key(wb["Flujo_Mensual"].cell(4, c).value) for c in range(2, 17)]
            nombre, esc, maestro = armar_escenario(wb, data["meses"])
            if nombre != e:
                fail(f"Panel!D5 dice «{nombre}» en la copia de «{e}»")
            data["escenarios"][e] = esc
            k = esc["kpis"]
            M = 1e6
            print(f"{e:<12}{k['ingresos']/M:>11,.1f}{k['egresos']/M:>11,.1f}{k['saldoFinal']/M:>11,.1f}"
                  f"{k['saldoMin']/M:>11,.1f}  {k['mesSaldoMin']}  {k['disponiblePACC']/M:,.1f}")
            for p, d in esc["porProyecto"].items():
                print(f"   {p:<14} ingresos {sum(d['ingresos']['total'])/M:>9,.1f}   obras+reserva "
                      f"{(sum(d['egresos']['obras']) + sum(d['egresos']['mantGeneral']))/M:>8,.1f}   retenidos "
                      f"{sum(d['egresos']['retenidos'])/M:>6,.1f}")
            if not data["maestro"]:
                for row in maestro:
                    data["maestro"][row["ClaveMapa"]] = {
                        "proyecto": row["Proyecto"], "id": row["IDLote"], "tipo": row["Tipo"] or "",
                        "subtipo": row["Subtipo"] or "", "nombre": row["Nombre"] or "",
                        "desarrollador": row["Desarrollador"] or "", "area": r2(num(row["AreaM2"])),
                        "estado": row["Estado"] or "",
                    }
            wb.close()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nEscrito {out}  ({out.stat().st_size/1024:,.0f} KB)")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
