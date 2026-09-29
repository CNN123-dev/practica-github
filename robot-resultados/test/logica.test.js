const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../apps-script/Logica.js');

test('limpiarAsunto quita prefijos de respuesta y reenvío', () => {
  assert.equal(L.limpiarAsunto('Re: RV:  Fwd: 123456 - Juan   Pérez '), '123456 - Juan Pérez');
});

test('normalizarDocumento acepta formatos comunes', () => {
  assert.equal(L.normalizarDocumento('1.234.567'), '1234567');
  assert.equal(L.normalizarDocumento('C.C. 1.234.567'), '1234567');
  assert.equal(L.normalizarDocumento('cc 12345'), '12345');
  assert.equal(L.normalizarDocumento('TI 1234567890'), '1234567890');
  assert.equal(L.normalizarDocumento('AB123456'), 'AB123456');
  assert.equal(L.normalizarDocumento('900123456-7'), '9001234567');
  assert.equal(L.normalizarDocumento('Juan Pérez'), '');
  assert.equal(L.normalizarDocumento('Ida López'), '');
  assert.equal(L.normalizarDocumento('123'), '');
});

test('interpretarAsunto: DOCUMENTO - NOMBRE', () => {
  const r = L.interpretarAsunto('123456 - Juan Pérez');
  assert.deepEqual(r, { ok: true, documento: '123456', nombre: 'Juan Pérez' });
});

test('interpretarAsunto: NOMBRE - DOCUMENTO y otros separadores', () => {
  assert.deepEqual(L.interpretarAsunto('María José Gómez - 1.234.567'), { ok: true, documento: '1234567', nombre: 'María José Gómez' });
  assert.deepEqual(L.interpretarAsunto('CC 1234567 | Ana-María Ruiz'), { ok: true, documento: '1234567', nombre: 'Ana-María Ruiz' });
  assert.deepEqual(L.interpretarAsunto('Pedro Pablo; 98765432'), { ok: true, documento: '98765432', nombre: 'Pedro Pablo' });
});

test('interpretarAsunto: sin separador y con palabras de relleno', () => {
  assert.deepEqual(L.interpretarAsunto('Resultados 1.234.567 Juan Pérez'), { ok: true, documento: '1234567', nombre: 'Juan Pérez' });
  assert.deepEqual(L.interpretarAsunto('Fwd: Paciente: Luis Ríos CC 7654321'), { ok: true, documento: '7654321', nombre: 'Luis Ríos' });
  assert.deepEqual(L.interpretarAsunto('123456-Juan Pérez'), { ok: true, documento: '123456', nombre: 'Juan Pérez' });
});

test('interpretarAsunto: errores claros', () => {
  assert.equal(L.interpretarAsunto('').ok, false);
  assert.match(L.interpretarAsunto('').error, /vacío/);
  assert.match(L.interpretarAsunto('Juan Pérez').error, /número de documento/);
  assert.match(L.interpretarAsunto('123456').error, /nombre del paciente/);
  assert.match(L.interpretarAsunto('Resultados de hoy').error, /número de documento/);
});

test('numeroDePaginaDesdeTexto detecta marcas en español e inglés', () => {
  assert.deepEqual(L.numeroDePaginaDesdeTexto('... Página 2 de 4 ...'), { numero: 2, total: 4 });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('Pag. 3/5'), { numero: 3, total: 5 });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('HOJA N° 1 DE 3'), { numero: 1, total: 3 });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('Página: 4 de 4'), { numero: 4, total: 4 });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('Page 2 of 3'), { numero: 2, total: 3 });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('Hoja 2'), { numero: 2, total: null });
  assert.deepEqual(L.numeroDePaginaDesdeTexto('Resultado\n\n 1 de 3'), { numero: 1, total: 3 });
  assert.equal(L.numeroDePaginaDesdeTexto('Glucosa 1 de 3 y 2 de 3'), null);
  assert.equal(L.numeroDePaginaDesdeTexto('Sin marca alguna'), null);
  assert.equal(L.numeroDePaginaDesdeTexto(''), null);
});

test('numeroDesdeNombreArchivo toma el último número', () => {
  assert.equal(L.numeroDesdeNombreArchivo('hoja_2.pdf'), 2);
  assert.equal(L.numeroDesdeNombreArchivo('Resultado (3).pdf'), 3);
  assert.equal(L.numeroDesdeNombreArchivo('123456_1.pdf'), 1);
  assert.equal(L.numeroDesdeNombreArchivo('resultado.pdf'), null);
});

function hoja(indice, nombre, pagina, texto) {
  return { indice, nombre, pagina: pagina || null, texto: texto === undefined ? null : texto };
}

test('ordenarHojas usa el texto, luego el nombre de archivo, luego los adjuntos', () => {
  const porTexto = L.ordenarHojas([hoja(0, 'x.pdf', { numero: 3, total: 3 }), hoja(1, 'y.pdf', { numero: 1, total: 3 }), hoja(2, 'z.pdf', { numero: 2, total: 3 })]);
  assert.equal(porTexto.metodo, 'texto');
  assert.deepEqual(porTexto.hojas.map((h) => h.nombre), ['y.pdf', 'z.pdf', 'x.pdf']);

  const porArchivo = L.ordenarHojas([hoja(0, 'r_3.pdf'), hoja(1, 'r_1.pdf'), hoja(2, 'r_2.pdf', { numero: 2, total: 3 })]);
  assert.equal(porArchivo.metodo, 'archivo');
  assert.deepEqual(porArchivo.hojas.map((h) => h.nombre), ['r_1.pdf', 'r_2.pdf', 'r_3.pdf']);

  const porAdjuntos = L.ordenarHojas([hoja(0, 'b.pdf'), hoja(1, 'a.pdf')]);
  assert.equal(porAdjuntos.metodo, 'adjuntos');
  assert.deepEqual(porAdjuntos.hojas.map((h) => h.nombre), ['b.pdf', 'a.pdf']);

  const repetidos = L.ordenarHojas([hoja(0, '123_1.pdf'), hoja(1, '124_1.pdf')]);
  assert.equal(repetidos.metodo, 'adjuntos');
});

test('validarOrden detecta hojas faltantes, repetidas y totales inconsistentes', () => {
  const cfg = { RECHAZAR_SI_FALTAN_HOJAS: true };
  const completo = L.validarOrden([hoja(0, 'a', { numero: 1, total: 2 }), hoja(1, 'b', { numero: 2, total: 2 })], 'texto', cfg);
  assert.equal(completo.error, null);
  assert.deepEqual(completo.advertencias, []);

  const falta = L.validarOrden([hoja(0, 'a', { numero: 1, total: 3 }), hoja(1, 'b', { numero: 3, total: 3 })], 'texto', cfg);
  assert.match(falta.error, /faltan las hojas 2 de 3/);

  const repetida = L.validarOrden([hoja(0, 'a', { numero: 1, total: 2 }), hoja(1, 'b', { numero: 1, total: 2 }), hoja(2, 'c', { numero: 2, total: 2 })], 'texto', cfg);
  assert.match(repetida.error, /repetidas: 1/);

  const totales = L.validarOrden([hoja(0, 'a', { numero: 1, total: 2 }), hoja(1, 'b', { numero: 2, total: 3 })], 'texto', cfg);
  assert.match(totales.error, /totales distintos/);

  const soloAdvierte = L.validarOrden([hoja(0, 'a', { numero: 1, total: 3 })], 'texto', { RECHAZAR_SI_FALTAN_HOJAS: false });
  assert.equal(soloAdvierte.error, null);
  assert.equal(soloAdvierte.advertencias.length, 1);

  const sinTotal = L.validarOrden([hoja(0, 'a', { numero: 1, total: null }), hoja(1, 'b', { numero: 2, total: null })], 'texto', cfg);
  assert.equal(sinTotal.error, null);
});

test('validarOrden advierte cuando el orden viene del nombre o de los adjuntos', () => {
  const archivo = L.validarOrden([hoja(0, 'r_1.pdf'), hoja(1, 'r_3.pdf')], 'archivo', {});
  assert.equal(archivo.error, null);
  assert.equal(archivo.advertencias.length, 2);
  assert.match(archivo.advertencias[1], /no son consecutivos/);

  const adjuntos = L.validarOrden([hoja(0, 'a.pdf'), hoja(1, 'b.pdf')], 'adjuntos', {});
  assert.equal(adjuntos.advertencias.length, 1);
});

test('verificarDocumentoEnHojas detecta mezcla de pacientes', () => {
  const cfg = { RECHAZAR_SI_MEZCLA_PACIENTES: true };
  const bien = L.verificarDocumentoEnHojas([hoja(0, 'a', null, 'Doc 1.234.567 Página 1'), hoja(1, 'b', null, 'CC 1234567')], '1234567', cfg);
  assert.deepEqual(bien, { error: null, advertencias: [] });

  const ninguna = L.verificarDocumentoEnHojas([hoja(0, 'a', null, 'sin documento'), hoja(1, 'b', null, 'tampoco')], '1234567', cfg);
  assert.equal(ninguna.error, null);
  assert.equal(ninguna.advertencias.length, 1);

  const mezcla = L.verificarDocumentoEnHojas([hoja(0, 'a', null, 'CC 1234567'), hoja(1, 'b', null, 'CC 7654321')], '1234567', cfg);
  assert.match(mezcla.error, /mezcla de pacientes.*b\./);

  const sinTexto = L.verificarDocumentoEnHojas([hoja(0, 'a'), hoja(1, 'b')], '1234567', cfg);
  assert.deepEqual(sinTexto, { error: null, advertencias: [] });
});

test('construirNombreArchivo aplica formato, mayúsculas y sanitización', () => {
  const datos = { nombre: 'José Muñoz/Peña', documento: '1234567' };
  assert.equal(L.construirNombreArchivo(datos, { FORMATO_NOMBRE_ARCHIVO: '{nombre} - {documento}.pdf', NOMBRE_EN_MAYUSCULAS: true }), 'JOSÉ MUÑOZ PEÑA - 1234567.pdf');
  assert.equal(L.construirNombreArchivo(datos, { FORMATO_NOMBRE_ARCHIVO: '{documento}_{nombre}', NOMBRE_EN_MAYUSCULAS: false, QUITAR_TILDES: true }), '1234567_Jose Munoz Pena.pdf');
  assert.equal(L.construirTituloPdf(datos, { NOMBRE_EN_MAYUSCULAS: true }), 'JOSÉ MUÑOZ PEÑA - 1234567');
  assert.equal(L.sanitizarNombreArchivo('a:b*c?.pdf'), 'a b c.pdf');
  assert.equal(L.sanitizarNombreArchivo(''), 'resultado');
});

test('esPdf y tieneFirmaPdf', () => {
  assert.equal(L.esPdf('hoja.PDF', 'application/octet-stream'), true);
  assert.equal(L.esPdf('hoja.bin', 'application/pdf'), true);
  assert.equal(L.esPdf('foto.jpg', 'image/jpeg'), false);
  assert.equal(L.tieneFirmaPdf([0x25, 0x50, 0x44, 0x46, 0x2d]), true);
  assert.equal(L.tieneFirmaPdf([1, 2, 3, 4, 5]), false);
  assert.equal(L.tieneFirmaPdf([]), false);
});

test('remitenteAutorizado por dominio o lista', () => {
  assert.equal(L.remitenteAutorizado('María <maria@miempresa.com>', [], 'robot@miempresa.com'), true);
  assert.equal(L.remitenteAutorizado('spam@otro.com', [], 'robot@miempresa.com'), false);
  assert.equal(L.remitenteAutorizado('maria@otro.com', ['maria@otro.com'], 'robot@miempresa.com'), true);
  assert.equal(L.remitenteAutorizado('x@otro.com', ['@otro.com'], 'robot@miempresa.com'), true);
  assert.equal(L.remitenteAutorizado('x@miempresa.com', ['@otro.com'], 'robot@miempresa.com'), false);
  assert.equal(L.remitenteAutorizado('sin arroba', [], 'robot@miempresa.com'), false);
});

test('remitenteAutorizado no acepta "mismo dominio" cuando el robot es una cuenta pública', () => {
  assert.equal(L.remitenteAutorizado('x@gmail.com', [], 'robot@gmail.com'), false);
  assert.equal(L.remitenteAutorizado('x@gmail.com', ['x@gmail.com'], 'robot@gmail.com'), true);
  assert.equal(L.esDominioPublico('@Hotmail.com'), true);
  assert.equal(L.dominioDe('Ana <ana@Empresa.com>'), '@empresa.com');
  assert.equal(L.dominioDe('sin arroba'), '');
  assert.equal(L.dominioDe('ana@Empresa.com'), '@empresa.com');
});

test('validarOrden no advierte con una sola hoja', () => {
  assert.deepEqual(L.validarOrden([hoja(0, 'unica.pdf')], 'adjuntos', {}), { error: null, advertencias: [] });
  assert.deepEqual(L.validarOrden([hoja(0, 'r_1.pdf')], 'archivo', {}), { error: null, advertencias: [] });
});
