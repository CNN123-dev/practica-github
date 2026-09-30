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
- Puerto: 50.8 x 38.2 (2.00" x 1.50")
- Exterior: 91.6 x 62.7
- Espesor recomendado: 12 mm (mínimo 10 mm)
- Radios de esquina (R8 exterior, R6 puerto): estimados, no vienen en las fichas

Fuentes: fichas de Vibrant 1430 (exterior 91.61 x 62.7, puerto 50.8 x 38.2, agujeros
40.6 x 72.8) y Ace Race Parts (agujeros 40.6 x 72.3, puerto 50.8 de ancho). Los fabricantes
difieren unas décimas en la separación horizontal de agujeros; se usó el nominal de 2.85".

Los DXF están en milímetros, en capas `CONTORNO`, `PUERTO` y `AGUJEROS`, con el origen
en el centro del flange. Conviene verificar las cotas contra la carcasa de la turbina o el flange
original antes de cortar.

## Regenerar

```bash
pip install ezdxf matplotlib
python3 flange-t25/generar_flange_t25.py
```
