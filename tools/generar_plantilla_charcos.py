"""
Genera la plantilla de Excel para el análisis técnico de charcos de la Dirección Técnica.

Cada fila es un charco: ID, ubicación, coordenadas, criticidad (rojo / amarillo / verde)
y los lotes de donde proviene el agua. La estructura está pensada para que el archivo
lleno se cargue directo en el mapa (capa «Charcos» de Activos de Ciudad).

Uso:
    python tools/generar_plantilla_charcos.py
Salida:
    Activos/PLANTILLA_ANALISIS_CHARCOS_CJB.xlsx
"""

import csv
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "Datos de CJB.csv")
ACTIVOS = os.path.join(ROOT, "MAPA NUEVO - CJB", "data", "activos_cjb.json")
SALIDA = os.path.join(ROOT, "Activos", "PLANTILLA_ANALISIS_CHARCOS_CJB.xlsx")

F, FS = "Segoe UI", "Segoe UI Semibold"
NAVY, RED, SLATE, INK, LINE = "1B3A6B", "E63946", "64748B", "0F172A", "E2E8F0"
ENTIDAD = "FIDEICOMISO PARA LA CONSTRUCCIÓN DE VIVIENDAS DE BAJO COSTO (FIDEICOMISO VBC RD)"
N_FILAS = 150
P = 6  # primera fila de datos

CRITICIDAD = [
    ("Rojo – Muy crítico", "FEE2E2", "991B1B",
     "Impide el paso de vehículos o peatones, alcanza viviendas o locales, o tarda muchas horas en drenar."),
    ("Amarillo – Intermedio", "FEF3C7", "92400E",
     "Dificulta el paso y molesta a residentes, pero drena en pocas horas."),
    ("Verde – Menor", "DCFCE7", "166534",
     "Acumulación pequeña o momentánea que no impide el paso."),
]
CAUSAS = ["Falta de imbornal o filtrante", "Imbornal obstruido o sucio", "Capacidad de captación insuficiente",
          "Agua que sale de un residencial o plaza", "Pendiente o nivel de la vía", "Otra (detallar en observaciones)"]

COLUMNAS = [
    # (encabezado, obligatoria, ancho, tipo, lista, pista)
    ("ID del charco", True, 11, "auto", None, "Ya numerado"),
    ("Ubicación de referencia", True, 30, "texto", None, "Calle, esquina o lugar"),
    ("Coordenadas", True, 24, "texto", None, "Ej.: 18.494633, -69.746710"),
    ("Criticidad", True, 20, "lista", "lst_criticidad", "Rojo · Amarillo · Verde"),
    ("Lote de origen principal", True, 14, "lista", "lst_lotes", "ID del lote (lista)"),
    ("Otros lotes de origen", False, 22, "texto", None, "IDs separados por coma"),
    ("Causa probable", False, 30, "lista", "lst_causas", "Seleccione de la lista"),
    ("Área aproximada (m²)", False, 12, "numero", None, "Número"),
    ("Profundidad aproximada (cm)", False, 12, "numero", None, "Número"),
    ("Tiempo en drenar (horas)", False, 11, "numero", None, "Número"),
    ("Imbornales cercanos", False, 18, "texto", None, "Ej.: IMB-120, IMB-121"),
    ("Evidencia (enlace a foto o video)", False, 26, "texto", None, "Enlace de OneDrive"),
    ("Observaciones", False, 36, "texto", None, "Texto libre"),
]


def fill(c):
    return PatternFill("solid", fgColor=c, bgColor=c)


def font(sz=10, color=INK, name=F, bold=False, italic=False):
    return Font(name=name, size=sz, color=color, bold=bold, italic=italic)


def banda(ws, ult, titulo, sub):
    for r in (1, 2):
        for c in range(1, ult + 1):
            ws.cell(row=r, column=c).fill = fill(NAVY)
    for c in range(1, ult + 1):
        ws.cell(row=3, column=c).fill = fill(RED)
    ws["A1"], ws["A2"] = titulo, sub
    ws["A1"].font = font(15, "FFFFFF", FS)
    ws["A2"].font = font(9, "C7D2FE")
    ws["A1"].alignment = Alignment(vertical="bottom", indent=1)
    ws["A2"].alignment = Alignment(vertical="top", indent=1)
    ws.row_dimensions[1].height, ws.row_dimensions[2].height, ws.row_dimensions[3].height = 28, 20, 3
    ws.sheet_view.showGridLines = False


def main():
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        lotes = list(csv.DictReader(f))
    activos = json.load(open(ACTIVOS, encoding="utf-8"))["activos"] if os.path.exists(ACTIVOS) else []

    wb = Workbook()

    # ---------------------------------------------------------------- Instrucciones
    ins = wb.active
    ins.title = "Instrucciones"
    banda(ins, 4, "Análisis técnico de charcos · Ciudad Juan Bosch",
          "Plantilla para la Dirección Técnica · los datos se cargan en el mapa de Activos de Ciudad")
    ins.column_dimensions["A"].width = 3
    ins.column_dimensions["B"].width = 26
    ins.column_dimensions["C"].width = 90
    parrafos = [
        ("Para qué sirve",
         "Registrar cada charco o punto de acumulación de agua en una fila de la hoja «Charcos», con su "
         "ubicación, qué tan crítico es y de qué lotes proviene el agua. Con eso el mapa mostrará cada charco "
         "con su color y lo conectará con los lotes que lo alimentan y con los imbornales cercanos."),
        ("Coordenadas",
         "En Google Maps, mantenga presionado (o clic derecho) sobre el punto del charco y copie las "
         "coordenadas que aparecen, por ejemplo «18.494633, -69.746710». Péguelas tal cual en la columna "
         "Coordenadas."),
        ("Lotes de origen",
         "El punto bajo donde se forma el charco no siempre es el que produce el agua. Seleccione en «Lote de "
         "origen principal» el lote que más agua aporta (la lista trae todos los lotes del Master Plan) y "
         "escriba en «Otros lotes de origen» los demás, separados por coma. La hoja «Lotes» sirve de consulta."),
        ("Imbornales cercanos",
         "Opcional. La hoja «Imbornales» trae el levantamiento de Verasol con el ID de cada imbornal y su calle."),
    ]
    r = 5
    for t, v in parrafos:
        ins.cell(row=r, column=2, value=t).font = font(10.5, NAVY, FS)
        c = ins.cell(row=r, column=3, value=v)
        c.font = font(10)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ins.cell(row=r, column=2).alignment = Alignment(vertical="top")
        ins.row_dimensions[r].height = 46
        r += 1
    r += 1
    ins.cell(row=r, column=2, value="Criticidad (referencia sugerida; la Dirección Técnica puede ajustarla)").font = font(10.5, NAVY, FS)
    r += 1
    for nombre, bg, fg, desc in CRITICIDAD:
        a = ins.cell(row=r, column=2, value=nombre)
        a.font = font(10, fg, FS)
        a.fill = fill(bg)
        a.alignment = Alignment(vertical="center", indent=1)
        b = ins.cell(row=r, column=3, value=desc)
        b.font = font(10)
        b.alignment = Alignment(wrap_text=True, vertical="center")
        ins.row_dimensions[r].height = 26
        r += 1
    r += 1
    ins.cell(row=r, column=2, value="Columnas obligatorias").font = font(10.5, NAVY, FS)
    ins.cell(row=r, column=3, value="Encabezado azul. Las grises son opcionales pero ayudan a priorizar.").font = font(10)
    ins.protection.sheet = True

    # ---------------------------------------------------------------- Charcos
    ws = wb.create_sheet("Charcos")
    ult = len(COLUMNAS)
    banda(ws, ult, "Charcos y puntos de acumulación de agua",
          f"Una fila por charco · {ENTIDAD}")
    for j, (enc, obl, ancho, tipo, lista, pista) in enumerate(COLUMNAS, start=1):
        L = get_column_letter(j)
        ws.column_dimensions[L].width = ancho
        p = ws.cell(row=4, column=j, value=pista)
        p.font = font(8, "94A3B8", italic=True)
        p.alignment = Alignment(horizontal="center")
        h = ws.cell(row=5, column=j, value=enc + (" *" if obl else ""))
        h.font = font(9.5, "FFFFFF", FS)
        h.fill = fill(NAVY if obl else SLATE)
        h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        h.border = Border(left=Side(style="thin", color="FFFFFF"), right=Side(style="thin", color="FFFFFF"))
        for i in range(N_FILAS):
            c = ws.cell(row=P + i, column=j)
            c.font = font(9.5)
            c.border = Border(bottom=Side(style="thin", color=LINE), right=Side(style="thin", color=LINE))
            c.alignment = Alignment(vertical="center", wrap_text=tipo == "texto",
                                    horizontal="center" if tipo in ("auto", "numero", "lista") else "left")
            if tipo == "auto":
                c.value = f"CH-{i + 1:03d}"
                c.font = font(9.5, SLATE, FS)
                c.fill = fill("F1F5F9")
            else:
                c.protection = Protection(locked=False)
                if tipo == "texto":
                    c.number_format = "@"
                if i % 2:
                    c.fill = fill("FAFBFD")
        rango = f"{L}{P}:{L}{P + N_FILAS - 1}"
        if tipo == "lista":
            dv = DataValidation(type="list", formula1=f"={lista}", allow_blank=True, showErrorMessage=True,
                                errorTitle="Valor no válido", error="Seleccione un valor de la lista.")
            dv.add(rango)
            ws.add_data_validation(dv)
        elif tipo == "numero":
            dv = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                                showErrorMessage=True, errorTitle="Valor no válido", error="Escriba solo un número.")
            dv.add(rango)
            ws.add_data_validation(dv)
    ws.row_dimensions[5].height = 36
    fin = P + N_FILAS - 1
    for nombre, bg, fg, _ in CRITICIDAD:
        ws.conditional_formatting.add(f"D{P}:D{fin}", FormulaRule(
            formula=[f'$D{P}="{nombre}"'], fill=fill(bg), font=Font(color=fg, bold=True)))
    # Coordenadas con formato raro: avisar en naranja
    ws.conditional_formatting.add(f"C{P}:C{fin}", FormulaRule(
        formula=[f'AND($C{P}<>"",ISERROR(FIND(",",$C{P})))'], fill=fill("FED7AA")))
    # Obligatorias vacías cuando la fila ya tiene datos
    for col in "BCDE":
        ws.conditional_formatting.add(f"{col}{P}:{col}{fin}", FormulaRule(
            formula=[f'AND(COUNTA($B{P}:$M{P})>0,{col}{P}="")'], fill=fill("FED7AA")))
    ws.freeze_panes = f"B{P}"
    ws.auto_filter.ref = f"A5:{get_column_letter(ult)}{fin}"
    pr = ws.protection
    pr.sheet = True
    pr.autoFilter = False
    pr.sort = False
    pr.formatColumns = False
    pr.formatRows = False

    # ---------------------------------------------------------------- Lotes
    lo = wb.create_sheet("Lotes")
    banda(lo, 4, "Lotes del Master Plan", "Consulta para las columnas de lotes de origen")
    for j, (t, w) in enumerate([("ID", 11), ("Nombre", 48), ("Tipo", 16), ("Subtipo", 24)], start=1):
        c = lo.cell(row=5, column=j, value=t)
        c.font = font(9.5, "FFFFFF", FS)
        c.fill = fill(NAVY)
        lo.column_dimensions[get_column_letter(j)].width = w
    for i, l in enumerate(sorted(lotes, key=lambda x: x["id"])):
        for j, k in enumerate(("id", "nombre", "tipo", "subtipo"), start=1):
            c = lo.cell(row=6 + i, column=j, value=l.get(k) or None)
            c.font = font(9.5)
            c.border = Border(bottom=Side(style="thin", color=LINE))
    lo.freeze_panes = "A6"
    lo.auto_filter.ref = f"A5:D{5 + len(lotes)}"
    wb.defined_names["lst_lotes"] = DefinedName("lst_lotes", attr_text=f"Lotes!$A$6:$A${5 + len(lotes)}")

    # ---------------------------------------------------------------- Imbornales
    if activos:
        im = wb.create_sheet("Imbornales")
        banda(im, 5, "Imbornales levantados (Verasol)", "Consulta para la columna «Imbornales cercanos»")
        for j, (t, w) in enumerate([("ID", 11), ("Tipo", 26), ("Calle / ubicación", 36), ("Cota (m)", 10),
                                    ("Coordenadas", 24)], start=1):
            c = im.cell(row=5, column=j, value=t)
            c.font = font(9.5, "FFFFFF", FS)
            c.fill = fill(NAVY)
            im.column_dimensions[get_column_letter(j)].width = w
        for i, a in enumerate(sorted(activos, key=lambda x: x["id"])):
            lugar = a["calle"] or (f"Dentro del lote {a['lote_id']}" if a["lote_id"] else a["ubicacion"])
            for j, v in enumerate([a["id"], a["tipo"], lugar, a["cota"], f"{a['lat']:.6f}, {a['lon']:.6f}"], 1):
                c = im.cell(row=6 + i, column=j, value=v)
                c.font = font(9.5)
                c.border = Border(bottom=Side(style="thin", color=LINE))
        im.freeze_panes = "A6"
        im.auto_filter.ref = f"A5:E{5 + len(activos)}"

    # ---------------------------------------------------------------- Listas
    ls = wb.create_sheet("Listas")
    for j, (nombre, vals) in enumerate([("lst_criticidad", [c[0] for c in CRITICIDAD]), ("lst_causas", CAUSAS)], 1):
        L = get_column_letter(j)
        ls.cell(row=1, column=j, value=nombre)
        for i, v in enumerate(vals, start=2):
            ls.cell(row=i, column=j, value=v)
        wb.defined_names[nombre] = DefinedName(nombre, attr_text=f"Listas!${L}$2:${L}${len(vals) + 1}")
    ls.sheet_state = "hidden"

    for hoja in wb.worksheets:
        hoja.page_setup.orientation = "landscape"
        hoja.page_setup.fitToWidth = 1
        hoja.page_setup.fitToHeight = 0
        hoja.sheet_properties.pageSetUpPr.fitToPage = True
    wb.active = 1
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    wb.save(SALIDA)
    print(f"Plantilla: {SALIDA}")


if __name__ == "__main__":
    main()
