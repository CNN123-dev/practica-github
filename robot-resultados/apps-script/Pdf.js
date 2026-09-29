/**
 * ============================================================
 *  UNIÓN DE PDF (pdf-lib)
 * ============================================================
 *
 * pdf-lib es una librería de JavaScript puro (MIT) que permite unir PDF.
 * Se incluye en el proyecto como el archivo `pdf-lib.min.js`. Si ese
 * archivo no está, se descarga una vez por ejecución desde CONFIG.PDF_LIB_URL.
 */

// Apps Script no tiene setTimeout y pdf-lib lo usa al guardar. Con esta
// versión síncrona funciona igual.
if (typeof setTimeout === 'undefined') {
  globalThis.setTimeout = function (fn) { fn(); return 0; };
}

/** Devuelve el objeto PDFLib, cargándolo desde la URL si hace falta. */
function cargarPdfLib_() {
  if (typeof PDFLib !== 'undefined') return PDFLib;
  var codigo = UrlFetchApp.fetch(CONFIG.PDF_LIB_URL).getContentText();
  // El paquete usa `this` o `self` para registrarse como variable global.
  var self = globalThis; // eslint-disable-line no-unused-vars
  eval(codigo);
  if (typeof PDFLib === 'undefined') throw new Error('No se pudo cargar pdf-lib desde ' + CONFIG.PDF_LIB_URL);
  return PDFLib;
}

/** Bytes de Apps Script (-128..127) a Uint8Array. */
function aUint8_(bytes) {
  return new Uint8Array(bytes);
}

/** Uint8Array a bytes de Apps Script (-128..127) para Utilities.newBlob. */
function aBytesFirmados_(u8) {
  var salida = new Array(u8.length);
  for (var i = 0; i < u8.length; i++) salida[i] = u8[i] > 127 ? u8[i] - 256 : u8[i];
  return salida;
}

/**
 * Une varios PDF (cada uno como Uint8Array o array de bytes) en uno solo,
 * en el orden dado. `meta` = {titulo, asunto, autor}. Devuelve Uint8Array.
 */
async function unirPdfs_(lib, listaBytes, meta) {
  meta = meta || {};
  var salida = await lib.PDFDocument.create();
  for (var i = 0; i < listaBytes.length; i++) {
    var origen;
    try {
      origen = await lib.PDFDocument.load(aUint8_(listaBytes[i]), { updateMetadata: false });
    } catch (e) {
      var nombre = (meta.nombres && meta.nombres[i]) || ('adjunto ' + (i + 1));
      var motivo = /encrypt/i.test(String(e.message)) ? 'está protegido con contraseña' : 'no se pudo leer (' + e.message + ')';
      throw new ErrorUsuario('El archivo "' + nombre + '" ' + motivo + '.');
    }
    var paginas = await salida.copyPages(origen, origen.getPageIndices());
    paginas.forEach(function (p) { salida.addPage(p); });
  }
  if (meta.titulo) salida.setTitle(meta.titulo);
  if (meta.asunto) salida.setSubject(meta.asunto);
  if (meta.autor) salida.setAuthor(meta.autor);
  salida.setProducer('Robot de resultados');
  salida.setCreator('Robot de resultados');
  var ahora = new Date();
  salida.setCreationDate(ahora);
  salida.setModificationDate(ahora);
  return await salida.save();
}

/** PDF de una página con un texto, para pruebas. Devuelve Uint8Array. */
async function crearPdfPrueba_(lib, texto) {
  var doc = await lib.PDFDocument.create();
  var fuente = await doc.embedFont(lib.StandardFonts.Helvetica);
  var pagina = doc.addPage([400, 200]);
  pagina.drawText(String(texto), { x: 20, y: 100, size: 14, font: fuente });
  return await doc.save();
}

/**
 * Extrae el texto de un PDF convirtiéndolo temporalmente a Google Docs
 * (esto también hace OCR si el PDF es una imagen). El documento temporal
 * se elimina de inmediato. Requiere el servicio avanzado "Drive" (v3).
 */
function extraerTextoPdf_(blob) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('El servicio avanzado "Drive" no está habilitado en el proyecto.');
  }
  var recurso = { name: 'tmp-robot-resultados-' + Utilities.getUuid(), mimeType: MimeType.GOOGLE_DOCS };
  var creado = Drive.Files.create(recurso, blob, { ocrLanguage: 'es', fields: 'id' });
  try {
    return DocumentApp.openById(creado.id).getBody().getText();
  } finally {
    try {
      Drive.Files.remove(creado.id);
    } catch (e) {
      DriveApp.getFileById(creado.id).setTrashed(true);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { unirPdfs_: unirPdfs_, crearPdfPrueba_: crearPdfPrueba_, aBytesFirmados_: aBytesFirmados_, aUint8_: aUint8_ };
}
