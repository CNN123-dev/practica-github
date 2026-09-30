# Flange T25 / T28 / GT25 (entrada de turbina)

Plano y archivos de corte del flange estándar T25 de 4 agujeros.

| Archivo | Uso |
|---|---|
| `flange_t25_plantilla_escala_1a1.pdf` | Plantilla A4 a escala real 1:1 para imprimir al 100 %, con regla de 100 mm para comprobar |
| `flange_t25_plano.pdf` | Plano acotado (A4) con notas de material, espesor y tolerancias |
| `flange_t25_corte_roscado_M8.dxf` | Geometría de corte, agujeros Ø6.8 mm para roscar M8x1.25 |
| `flange_t25_corte_pasante_9mm.dxf` | Geometría de corte, agujeros Ø9 mm pasantes |
| `flange_t25_plano_con_cotas.dxf` | DXF con cotas, solo para consulta en CAD |
| `generar_flange_t25.py` | Script que genera todos los archivos anteriores |

## Cotas (mm)

Tomadas del plano de referencia indicado por el usuario (pulgadas convertidas a mm).

- Exterior: 93.0 x 59.9 (3.66" x 2.36")
- Puerto: 53.8 x 41.9 (2.12" x 1.65")
- Patrón de agujeros: 72.9 x 39.9 (2.87" x 1.57"), 4x M8x1.25
- Espesor recomendado: 12 mm (mínimo 10 mm)
- Radios de esquina (R8 exterior y R8 puerto): estimados a partir de la imagen

Los DXF están en milímetros, en capas `CONTORNO`, `PUERTO` y `AGUJEROS`, con el origen
en el centro del flange. Conviene verificar contra la carcasa de la turbina o el flange original
antes de cortar.

## Regenerar

```bash
pip install ezdxf matplotlib
python3 flange-t25/generar_flange_t25.py
```
