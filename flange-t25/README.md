# Flange T25 / T28 / GT25 (entrada de turbina)

Plano y archivos de corte del flange estándar T25 de 4 agujeros.

| Archivo | Uso |
|---|---|
| `flange_t25_plano.pdf` | Plano acotado (A4) con notas de material, espesor y tolerancias |
| `flange_t25_corte_roscado_M8.dxf` | Geometría de corte, agujeros Ø6.8 mm para roscar M8x1.25 |
| `flange_t25_corte_pasante_9mm.dxf` | Geometría de corte, agujeros Ø9 mm pasantes |
| `flange_t25_plano_con_cotas.dxf` | DXF con cotas, solo para consulta en CAD |
| `generar_flange_t25.py` | Script que genera todos los archivos anteriores |

## Cotas nominales (mm)

- Patrón de agujeros: 72.4 x 40.6 (2.85" x 1.60"), 4x M8x1.25
- Puerto: 44.45 x 38.1 (1.75" x 1.50"), esquinas R6
- Exterior: 89 x 64, esquinas R8
- Espesor recomendado: 12 mm (mínimo 10 mm)

Los DXF están en milímetros, en capas `CONTORNO`, `PUERTO` y `AGUJEROS`, con el origen
en el centro del flange. El puerto es nominal: conviene verificarlo contra la carcasa de la
turbina antes de cortar.

## Regenerar

```bash
pip install ezdxf matplotlib
python3 flange-t25/generar_flange_t25.py
```
