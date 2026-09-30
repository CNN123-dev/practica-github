#!/usr/bin/env python3
"""Genera el plano (PDF) y los archivos de corte (DXF) del flange T25 estándar.

Cotas nominales del patrón T25 / T28 / GT25 (entrada de turbina):
  - Patrón de agujeros: 72.9 x 39.9 mm (2.87" x 1.57"), 4 agujeros M8 x 1.25
  - Puerto: 53.8 x 41.9 mm (2.12" x 1.65") con esquinas redondeadas
  - Exterior: 93.0 x 59.9 mm (3.66" x 2.36") con esquinas R8 (radios estimados)
Unidades: milímetros. Origen en el centro del flange.
"""
import math
from pathlib import Path

import ezdxf
from ezdxf.enums import TextEntityAlignment
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

OUT = Path(__file__).resolve().parent

# ---- Parámetros (mm) ----
ANCHO, ALTO, R_EXT = 93.0, 59.9, 8.0          # contorno exterior (3.66" x 2.36")
PUERTO_W, PUERTO_H, R_PUERTO = 53.8, 41.9, 8.0  # puerto (2.12" x 1.65")
AGUJ_DX, AGUJ_DY = 72.9, 39.9                 # patrón de agujeros (2.87" x 1.57")
D_ROSCA = 6.8      # broca para rosca M8 x 1.25
D_PASANTE = 9.0    # agujero pasante para tornillo M8
ESPESOR = 12.0     # espesor recomendado

CENTROS = [(sx * AGUJ_DX / 2, sy * AGUJ_DY / 2) for sx in (-1, 1) for sy in (-1, 1)]


def rect_redondeado(w, h, r):
    """Vértices (x, y, bulge) de un rectángulo con esquinas redondeadas, centrado en 0,0."""
    b = math.tan(math.radians(90) / 4)  # bulge de un arco de 90°
    hw, hh = w / 2, h / 2
    return [
        (-hw + r, -hh, 0), (hw - r, -hh, b),
        (hw, -hh + r, 0), (hw, hh - r, b),
        (hw - r, hh, 0), (-hw + r, hh, b),
        (-hw, hh - r, 0), (-hw, -hh + r, b),
    ]


def dxf_corte(nombre, d_agujero):
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 4  # milímetros
    msp = doc.modelspace()
    doc.layers.add("CONTORNO", color=7)
    doc.layers.add("PUERTO", color=1)
    doc.layers.add("AGUJEROS", color=3)
    msp.add_lwpolyline(rect_redondeado(ANCHO, ALTO, R_EXT), format="xyb",
                       close=True, dxfattribs={"layer": "CONTORNO"})
    msp.add_lwpolyline(rect_redondeado(PUERTO_W, PUERTO_H, R_PUERTO), format="xyb",
                       close=True, dxfattribs={"layer": "PUERTO"})
    for cx, cy in CENTROS:
        msp.add_circle((cx, cy), d_agujero / 2, dxfattribs={"layer": "AGUJEROS"})
    doc.saveas(OUT / nombre)


def dxf_plano(nombre):
    """DXF con geometría + cotas (para consulta, no para la máquina de corte)."""
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    doc.layers.add("CONTORNO", color=7)
    doc.layers.add("PUERTO", color=1)
    doc.layers.add("AGUJEROS", color=3)
    doc.layers.add("COTAS", color=4)
    doc.layers.add("TEXTO", color=2)
    msp.add_lwpolyline(rect_redondeado(ANCHO, ALTO, R_EXT), format="xyb",
                       close=True, dxfattribs={"layer": "CONTORNO"})
    msp.add_lwpolyline(rect_redondeado(PUERTO_W, PUERTO_H, R_PUERTO), format="xyb",
                       close=True, dxfattribs={"layer": "PUERTO"})
    for cx, cy in CENTROS:
        msp.add_circle((cx, cy), D_ROSCA / 2, dxfattribs={"layer": "AGUJEROS"})
    hw, hh = ANCHO / 2, ALTO / 2
    ov = {"dimtxt": 3, "dimasz": 2.5, "dimexo": 1, "dimdec": 2}
    dims = [
        ((-hw, -hh), (hw, -hh), (0, -hh - 22)),                      # ancho total
        ((-AGUJ_DX / 2, -AGUJ_DY / 2), (AGUJ_DX / 2, -AGUJ_DY / 2), (0, -hh - 12)),
        ((-PUERTO_W / 2, hh), (PUERTO_W / 2, hh), (0, hh + 12)),
        ((hw, -hh), (hw, hh), (hw + 22, 0)),
        ((AGUJ_DX / 2, -AGUJ_DY / 2), (AGUJ_DX / 2, AGUJ_DY / 2), (hw + 12, 0)),
        ((-hw, -PUERTO_H / 2), (-hw, PUERTO_H / 2), (-hw - 12, 0)),
    ]
    for p1, p2, base in dims:
        angle = 0 if p1[1] == p2[1] else 90
        d = msp.add_linear_dim(base=base, p1=p1, p2=p2, angle=angle,
                               override=ov, dxfattribs={"layer": "COTAS"})
        d.render()
    msp.add_text(f"4x M8x1.25 (broca {D_ROSCA} mm)  o  4x Ø{D_PASANTE} pasante",
                 height=3, dxfattribs={"layer": "TEXTO"}).set_placement(
        (-hw, -hh - 32), align=TextEntityAlignment.LEFT)
    msp.add_text(f"Esquinas ext. R{R_EXT:g} - puerto R{R_PUERTO:g} - espesor {ESPESOR:g} mm",
                 height=3, dxfattribs={"layer": "TEXTO"}).set_placement(
        (-hw, -hh - 38), align=TextEntityAlignment.LEFT)
    doc.saveas(OUT / nombre)


def cota(ax, p1, p2, offset, texto, vertical=False):
    """Línea de cota sencilla con líneas de extensión."""
    kw = dict(color="#1f5fbf", lw=0.8)
    if not vertical:
        y = p1[1] + offset
        ax.plot([p1[0], p1[0]], [p1[1], y + (2 if offset > 0 else -2)], **kw)
        ax.plot([p2[0], p2[0]], [p2[1], y + (2 if offset > 0 else -2)], **kw)
        ax.annotate("", xy=(p1[0], y), xytext=(p2[0], y),
                    arrowprops=dict(arrowstyle="<->", color="#1f5fbf", lw=0.8))
        ax.text((p1[0] + p2[0]) / 2, y + 1.2, texto, ha="center", va="bottom",
                fontsize=8, color="#1f5fbf")
    else:
        x = p1[0] + offset
        ax.plot([p1[0], x + (2 if offset > 0 else -2)], [p1[1], p1[1]], **kw)
        ax.plot([p2[0], x + (2 if offset > 0 else -2)], [p2[1], p2[1]], **kw)
        ax.annotate("", xy=(x, p1[1]), xytext=(x, p2[1]),
                    arrowprops=dict(arrowstyle="<->", color="#1f5fbf", lw=0.8))
        ax.text(x + 1.2, (p1[1] + p2[1]) / 2, texto, ha="left", va="center",
                fontsize=8, color="#1f5fbf", rotation=90)


def pdf_plano(nombre):
    fig = plt.figure(figsize=(11.69, 8.27))  # A4 horizontal
    ax = fig.add_axes([0.05, 0.22, 0.9, 0.74])
    ax.set_aspect("equal")
    ax.axis("off")
    hw, hh = ANCHO / 2, ALTO / 2

    ax.add_patch(FancyBboxPatch((-hw + R_EXT, -hh + R_EXT), ANCHO - 2 * R_EXT, ALTO - 2 * R_EXT,
                                boxstyle=f"round,pad={R_EXT}", fc="#e9edf2", ec="black", lw=1.4))
    ax.add_patch(FancyBboxPatch((-PUERTO_W / 2 + R_PUERTO, -PUERTO_H / 2 + R_PUERTO),
                                PUERTO_W - 2 * R_PUERTO, PUERTO_H - 2 * R_PUERTO,
                                boxstyle=f"round,pad={R_PUERTO}", fc="white", ec="black", lw=1.2))
    for cx, cy in CENTROS:
        ax.add_patch(Circle((cx, cy), D_ROSCA / 2, fc="white", ec="black", lw=1.0))
        ax.add_patch(Circle((cx, cy), 4.0, fc="none", ec="black", lw=0.5, ls=(0, (3, 2))))
        ax.plot([cx - 6, cx + 6], [cy, cy], color="gray", lw=0.4, ls="-.")
        ax.plot([cx, cx], [cy - 6, cy + 6], color="gray", lw=0.4, ls="-.")
    ax.plot([-hw - 4, hw + 4], [0, 0], color="gray", lw=0.4, ls="-.")
    ax.plot([0, 0], [-hh - 4, hh + 4], color="gray", lw=0.4, ls="-.")

    cota(ax, (-hw, -hh), (hw, -hh), -24, f"{ANCHO:.1f}  (3.66\")")
    cota(ax, (-AGUJ_DX / 2, -AGUJ_DY / 2), (AGUJ_DX / 2, -AGUJ_DY / 2), -12 - (hh - AGUJ_DY / 2),
         f"{AGUJ_DX:g}  (2.87\")")
    cota(ax, (-PUERTO_W / 2, hh), (PUERTO_W / 2, hh), 12, f"{PUERTO_W:g}  (2.12\")")
    cota(ax, (hw, -hh), (hw, hh), 24, f"{ALTO:.1f}  (2.36\")", vertical=True)
    cota(ax, (AGUJ_DX / 2, -AGUJ_DY / 2), (AGUJ_DX / 2, AGUJ_DY / 2), 12 + (hw - AGUJ_DX / 2),
         f"{AGUJ_DY:g}  (1.57\")", vertical=True)
    cota(ax, (-hw, -PUERTO_H / 2), (-hw, PUERTO_H / 2), -12, f"{PUERTO_H:g}  (1.65\")", vertical=True)

    cx, cy = CENTROS[3]
    ax.annotate(f"4x M8x1.25\n(broca Ø{D_ROSCA} mm)\nó 4x Ø{D_PASANTE} pasante",
                xy=(cx + 2.5, cy + 2.5), xytext=(hw + 14, hh + 14), fontsize=8,
                arrowprops=dict(arrowstyle="->", lw=0.7), ha="left")
    ax.annotate(f"R{R_EXT:g} (4 esquinas)", xy=(-hw + 2, hh - 2), xytext=(-hw - 10, hh + 14),
                fontsize=8, arrowprops=dict(arrowstyle="->", lw=0.7), ha="right")
    ax.annotate(f"R{R_PUERTO:g} (4 esquinas)", xy=(PUERTO_W / 2 - 1.5, -PUERTO_H / 2 + 1.5),
                xytext=(PUERTO_W / 2 + 4, -hh - 6), fontsize=8,
                arrowprops=dict(arrowstyle="->", lw=0.7), ha="left")
    ax.set_xlim(-hw - 36, hw + 48)
    ax.set_ylim(-hh - 34, hh + 26)

    fig.text(0.5, 0.965, "FLANGE T25 / T28 / GT25 - ENTRADA DE TURBINA (4 agujeros)",
             ha="center", fontsize=13, weight="bold")
    notas = (
        f"ESPESOR RECOMENDADO: {ESPESOR:g} mm (1/2\" = 12.7 mm equivalente). Mínimo 10 mm.\n"
        "MATERIAL: acero al carbono (A36 / SAE 1020) o inoxidable 304 / 304L.\n"
        "AGUJEROS: roscar M8x1.25 (cortar a Ø6.8 y machuelear) o Ø9 pasante si se usan tuercas.\n"
        "Si se corta por plasma, dejar los agujeros marcados o subdimensionados y terminarlos con taladro.\n"
        "COTAS: tomadas del plano de referencia del usuario (3.66 x 2.36 in exterior, 2.12 x 1.65 in puerto, 2.87 x 1.57 in agujeros).\n"
        "Radios de esquina estimados a partir de la imagen de referencia.\n"
        "VERIFICAR contra la carcasa de la turbina o el flange original antes de cortar.\n"
        "TOLERANCIAS: patrón de agujeros ±0.2 mm, resto ±0.5 mm. Planitud de la cara de sello 0.1 mm. Unidades: mm."
    )
    fig.text(0.05, 0.185, notas, fontsize=8.5, va="top", family="DejaVu Sans")
    fig.text(0.05, 0.015, "Archivos de corte: flange_t25_corte_roscado_M8.dxf (Ø6.8)  |  "
             "flange_t25_corte_pasante_9mm.dxf (Ø9)  -  Escala: libre  -  Hoja A4",
             fontsize=8, color="gray")
    fig.savefig(OUT / nombre, format="pdf")
    fig.savefig(OUT / nombre.replace(".pdf", ".png"), dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    dxf_corte("flange_t25_corte_roscado_M8.dxf", D_ROSCA)
    dxf_corte("flange_t25_corte_pasante_9mm.dxf", D_PASANTE)
    dxf_plano("flange_t25_plano_con_cotas.dxf")
    pdf_plano("flange_t25_plano.pdf")
    print("Listo:", sorted(p.name for p in OUT.iterdir()))
