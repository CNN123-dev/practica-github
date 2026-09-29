/**
 * Prueba de extremo a extremo del flujo de Gmail con un entorno simulado.
 * Usa el mismo pdf-lib.min.js que se despliega para crear las hojas de
 * prueba (cada una con un ancho distinto, para verificar el orden final).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { crearEntorno } = require('./harness.js');
const PDFLib = require(path.join('..', 'apps-script', 'pdf-lib.min.js'));

async function hojaPrueba(numero, texto) {
  const doc = await PDFLib.PDFDocument.create();
  const fuente = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const pagina = doc.addPage([300 + numero, 400]);
  pagina.drawText(texto, { x: 20, y: 200, size: 12, font: fuente });
  const u8 = await doc.save();
  // Apps Script entrega los bytes con signo (-128..127).
  return Array.from(u8, (b) => (b > 127 ? b - 256 : b));
}

async function anchosDelPdf(bytesConSigno) {
  const u8 = new Uint8Array(bytesConSigno.map((b) => (b < 0 ? b + 256 : b)));
  const doc = await PDFLib.PDFDocument.load(u8);
  return { anchos: doc.getPages().map((p) => Math.round(p.getWidth())), titulo: doc.getTitle(), paginas: doc.getPageCount() };
}

async function mensajePaciente(overrides = {}) {
  const adjuntos = [];
  const textos = {};
  for (const n of overrides.orden || [3, 1, 2]) {
    const texto = `Laboratorio Clínico   Paciente: JUAN PEREZ   CC 1.234.567   Página ${n} de 3`;
    adjuntos.push({ nombre: `hoja_${n}.pdf`, bytes: await hojaPrueba(n, texto) });
    textos[`hoja_${n}.pdf`] = overrides.textos ? overrides.textos[n] : texto;
  }
  return {
    mensaje: { id: 'm1', from: 'María <maria@miempresa.com>', subject: overrides.subject || '1234567 - Juan Pérez', adjuntos, ...overrides.mensaje },
    textos,
  };
}

test('flujo completo: ordena por texto, une, responde, guarda y registra', async () => {
  const { mensaje, textos } = await mensajePaciente();
  const { ctx, estado, mensajes, docsTemporales } = crearEntorno({ mensajes: [mensaje], textos });

  await ctx.procesarBuzon();

  assert.equal(estado.respuestas.length, 1);
  const r = estado.respuestas[0];
  assert.match(r.cuerpo, /Resultado consolidado listo/);
  assert.match(r.cuerpo, /Paciente:  Juan Pérez/);
  assert.match(r.cuerpo, /Hojas:     3 \(ordenadas según la marca/);
  assert.doesNotMatch(r.cuerpo, /ADVERTENCIAS/);
  assert.equal(r.opciones.name, 'Robot de resultados');
  assert.equal(r.opciones.attachments.length, 1);

  const adjunto = r.opciones.attachments[0];
  assert.equal(adjunto.getName(), 'JUAN PÉREZ - 1234567.pdf');
  const info = await anchosDelPdf(adjunto.getBytes());
  assert.equal(info.paginas, 3);
  assert.deepEqual(info.anchos, [301, 302, 303]);
  assert.equal(info.titulo, 'JUAN PÉREZ - 1234567');

  assert.equal(mensajes[0]._leido, true);
  assert.deepEqual(mensajes[0]._etiquetas, ['Resultados/Procesado']);
  assert.deepEqual(estado.etiquetasCreadas, ['Resultados', 'Resultados/Procesado']);

  assert.equal(estado.archivosDrive.length, 1);
  assert.equal(estado.archivosDrive[0].nombre, 'JUAN PÉREZ - 1234567.pdf');

  assert.equal(estado.filasRegistro.length, 2, 'encabezado + una fila');
  const fila = estado.filasRegistro[1];
  assert.equal(fila[3], '1234567');
  assert.equal(fila[7], 'OK');
  assert.equal(fila[9], 'JUAN PÉREZ - 1234567.pdf');

  assert.deepEqual(Object.keys(docsTemporales), [], 'los documentos temporales de Drive se eliminan');
  assert.equal(estado.ultimaConsulta, 'in:inbox is:unread has:attachment filename:pdf newer_than:7d');
});

test('sin servicio Drive: ordena por nombre de archivo y advierte', async () => {
  const { mensaje } = await mensajePaciente();
  const { ctx, estado } = crearEntorno({ mensajes: [mensaje], driveFalla: true });

  await ctx.procesarBuzon();

  const r = estado.respuestas[0];
  assert.match(r.cuerpo, /ordenadas según el número en el nombre/);
  assert.match(r.cuerpo, /ADVERTENCIAS/);
  assert.match(r.cuerpo, /No fue posible leer el texto/);
  const info = await anchosDelPdf(r.opciones.attachments[0].getBytes());
  assert.deepEqual(info.anchos, [301, 302, 303]);
  assert.equal(estado.filasRegistro[1][7], 'OK CON ADVERTENCIAS');
});

test('falta una hoja: responde con error y etiqueta Error', async () => {
  const { mensaje, textos } = await mensajePaciente({ orden: [1, 3] });
  const { ctx, estado, mensajes } = crearEntorno({ mensajes: [mensaje], textos });

  await ctx.procesarBuzon();

  const r = estado.respuestas[0];
  assert.match(r.cuerpo, /No se pudo generar/);
  assert.match(r.cuerpo, /faltan las hojas 2 de 3/);
  assert.equal(r.opciones.attachments, undefined);
  assert.deepEqual(mensajes[0]._etiquetas, ['Resultados/Error']);
  assert.equal(estado.archivosDrive.length, 0);
  assert.equal(estado.filasRegistro[1][7], 'ERROR');
});

test('mezcla de pacientes: una hoja con otro documento se rechaza', async () => {
  const { mensaje, textos } = await mensajePaciente({
    textos: { 1: 'CC 1234567 Página 1 de 3', 2: 'CC 9999999 Página 2 de 3', 3: 'CC 1234567 Página 3 de 3' },
  });
  const { ctx, estado } = crearEntorno({ mensajes: [mensaje], textos });

  await ctx.procesarBuzon();

  assert.match(estado.respuestas[0].cuerpo, /Posible mezcla de pacientes.*hoja_2\.pdf/);
});

test('asunto sin documento: error explicando el formato', async () => {
  const { mensaje, textos } = await mensajePaciente({ subject: 'Resultados de hoy' });
  const { ctx, estado } = crearEntorno({ mensajes: [mensaje], textos });

  await ctx.procesarBuzon();

  assert.match(estado.respuestas[0].cuerpo, /no contiene el número de documento/);
  assert.match(estado.respuestas[0].cuerpo, /DOCUMENTO - NOMBRE/);
});

test('remitente no autorizado: se ignora sin responder', async () => {
  const { mensaje, textos } = await mensajePaciente({ mensaje: { from: 'alguien@otro.com' } });
  const { ctx, estado, mensajes } = crearEntorno({ mensajes: [mensaje], textos });

  await ctx.procesarBuzon();

  assert.equal(estado.respuestas.length, 0);
  assert.equal(mensajes[0]._leido, true);
  assert.deepEqual(mensajes[0]._etiquetas, ['Resultados/Error']);
  assert.equal(estado.filasRegistro[1][7], 'IGNORADO');
});

test('adjuntos que no son PDF se ignoran; un PDF falso se rechaza', async () => {
  const { mensaje, textos } = await mensajePaciente();
  mensaje.adjuntos.push({ nombre: 'firma.png', tipo: 'image/png', bytes: [1, 2, 3, 4, 5, 6] });
  const { ctx, estado } = crearEntorno({ mensajes: [mensaje], textos });
  await ctx.procesarBuzon();
  assert.match(estado.respuestas[0].cuerpo, /Hojas:     3/);

  const falso = await mensajePaciente();
  falso.mensaje.adjuntos.push({ nombre: 'raro.pdf', bytes: [1, 2, 3, 4, 5, 6] });
  const e2 = crearEntorno({ mensajes: [falso.mensaje], textos: falso.textos });
  await e2.ctx.procesarBuzon();
  assert.match(e2.estado.respuestas[0].cuerpo, /"raro.pdf" no es un PDF válido/);
});

test('varios correos en una ejecución se procesan por separado', async () => {
  const a = await mensajePaciente();
  const b = await mensajePaciente({ subject: '7654321 - Ana Ruiz', mensaje: { id: 'm2' } });
  const { ctx, estado } = crearEntorno({ mensajes: [a.mensaje, b.mensaje], textos: a.textos });

  await ctx.procesarBuzon();

  assert.equal(estado.respuestas.length, 2);
  const nombres = estado.respuestas.map((r) => r.opciones.attachments[0].getName()).sort();
  assert.deepEqual(nombres, ['ANA RUIZ - 7654321.pdf', 'JUAN PÉREZ - 1234567.pdf']);
  assert.match(estado.respuestas.find((r) => r.id === 'm2').cuerpo, /no aparece en el texto de ninguna hoja/);
});

test('sin pdf-lib.min.js en el proyecto se descarga de la URL configurada', async () => {
  const { mensaje, textos } = await mensajePaciente();
  const { ctx, estado } = crearEntorno({ mensajes: [mensaje], textos, vendorizarPdfLib: false });

  await ctx.procesarBuzon();

  assert.deepEqual(estado.fetches, [ctx.CONFIG.PDF_LIB_URL]);
  const info = await anchosDelPdf(estado.respuestas[0].opciones.attachments[0].getBytes());
  assert.deepEqual(info.anchos, [301, 302, 303]);
});

test('configuración y disparador', async () => {
  const { ctx, estado } = crearEntorno({ textos: { 'prueba-robot.pdf': 'Documento 999999 - Página 1 de 2' } });

  ctx.instalarDisparador();
  assert.deepEqual(estado.disparadores, [{ fn: 'procesarBuzon', m: 5 }]);
  ctx.instalarDisparador();
  assert.equal(estado.disparadores.length, 1, 'no se duplica');

  const resumen = await ctx.probarConfiguracion();
  assert.doesNotMatch(resumen, /ERROR/);
  assert.match(resumen, /pdf-lib funciona \(2 páginas unidas/);
  assert.match(resumen, /Lectura de texto con Drive funciona/);
  assert.match(resumen, /Disparador instalado/);

  ctx.desinstalarDisparador();
  assert.equal(estado.disparadores.length, 0);

  ctx.CONFIG.INTERVALO_MINUTOS = 7;
  assert.throws(() => ctx.instalarDisparador(), /INTERVALO_MINUTOS/);
});
