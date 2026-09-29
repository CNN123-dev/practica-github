/**
 * ============================================================
 *  LÓGICA PURA (sin servicios de Google)
 * ============================================================
 *
 * Todo lo que hay aquí se puede probar fuera de Apps Script con
 * `node --test` (ver carpeta test/). No use GmailApp, DriveApp, etc.
 */

// Prefijos que Gmail/Outlook agregan al responder o reenviar.
var PREFIJOS_RESPUESTA_ = /^\s*(?:re|rv|fw|fwd|enc|tr|aw|wg)\s*:\s*/i;

// Palabras de relleno que la gente suele escribir antes del nombre.
var PALABRAS_RELLENO_ = /^\s*(?:resultados?|examen(?:es)?|paciente|laboratorio|lab|informe)\s*[:.\-]?\s+/i;

// Tipos de documento que pueden anteceder al número (CC 123, T.I. 456, etc.).
var TIPO_DOC_ = '(?:c\\.?c\\.?|t\\.?i\\.?|c\\.?e\\.?|r\\.?c\\.?|p\\.?a\\.?|p\\.?t\\.?|ppt|nit|pep|nuip|dni|doc(?:umento)?|id|identificaci[oó]n|c[eé]dula)';
var PREFIJO_TIPO_DOC_ = new RegExp('^' + TIPO_DOC_ + '\\s*[:.]?\\s*(?:n[°ºo]?\\.?\\s*)?', 'i');
var NUMERO_EN_ASUNTO_ = new RegExp('(?:\\b' + TIPO_DOC_ + '\\s*[:.]?\\s*(?:n[°ºo]?\\.?\\s*)?)?(\\d(?:[\\d.,]*\\d)?(?:-\\d)?)', 'gi');

// Separadores entre documento y nombre en el asunto: "|", ";", "/" o un
// guion rodeado de espacios ("123 - Juan"). Un guion sin espacios se deja
// ("Ana-María").
var SEPARADOR_ASUNTO_ = /\s*(?:[|;\/]|\s[-–—]+\s)\s*/;

/**
 * Error causado por el contenido del correo (asunto, adjuntos). Se le
 * explica al remitente. Cualquier otro error se reporta como interno.
 */
class ErrorUsuario extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorUsuario';
  }
}

/** Quita "Re:", "Fwd:" y espacios repetidos del asunto. */
function limpiarAsunto(asunto) {
  var s = String(asunto || '');
  while (PREFIJOS_RESPUESTA_.test(s)) s = s.replace(PREFIJOS_RESPUESTA_, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Convierte un texto tipo "C.C. 1.234.567" en "1234567". Devuelve ''
 * si el texto no parece un número de documento.
 */
function normalizarDocumento(token) {
  var t = String(token || '').trim().replace(PREFIJO_TIPO_DOC_, '');
  var compacto = t.replace(/[\s.,\-]/g, '');
  if (/^\d{5,15}$/.test(compacto)) return compacto;
  if (/^[A-Za-z]{1,3}\d{4,15}$/.test(compacto)) return compacto.toUpperCase();
  if (/^\d{4,15}[A-Za-z]{1,2}$/.test(compacto)) return compacto.toUpperCase();
  return '';
}

/** Limpia el nombre del paciente: separadores sueltos, relleno, espacios. */
function limpiarNombre(nombre) {
  var n = String(nombre || '')
    .replace(/^[\s\-–—|;\/:,.]+|[\s\-–—|;\/:,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  n = n.replace(PALABRAS_RELLENO_, '').trim();
  return n;
}

/**
 * Extrae documento y nombre del asunto. Formatos aceptados:
 *   "123456 - Juan Pérez", "Juan Pérez - 123456", "CC 123456 | Juan Pérez",
 *   "123456 Juan Pérez", "Resultados 1.234.567 Juan Pérez".
 * Devuelve {ok:true, documento, nombre} o {ok:false, error}.
 */
function interpretarAsunto(asunto) {
  var s = limpiarAsunto(asunto);
  var formato = 'Use el formato: DOCUMENTO - NOMBRE DEL PACIENTE (ejemplo: 123456 - Juan Pérez).';
  if (!s) return { ok: false, error: 'El asunto del correo está vacío. ' + formato };

  var partes = s.split(SEPARADOR_ASUNTO_).map(function (p) { return p.trim(); }).filter(Boolean);
  var documento = '';
  var restantes = [];

  for (var i = 0; i < partes.length; i++) {
    var d = !documento ? normalizarDocumento(partes[i]) : '';
    if (d) documento = d; else restantes.push(partes[i]);
  }

  if (!documento) {
    // No hubo un token que fuera solo el documento: buscar el número más
    // largo dentro del asunto ("Resultados 123456 Juan Pérez").
    var mejor = null;
    var m;
    NUMERO_EN_ASUNTO_.lastIndex = 0;
    while ((m = NUMERO_EN_ASUNTO_.exec(s)) !== null) {
      var d2 = normalizarDocumento(m[1]);
      if (d2 && (!mejor || d2.length > mejor.documento.length)) {
        mejor = { documento: d2, texto: m[0] };
      }
    }
    if (mejor) {
      documento = mejor.documento;
      restantes = [s.replace(mejor.texto, ' ')];
    }
  }

  if (!documento) {
    return { ok: false, error: 'El asunto no contiene el número de documento del paciente. ' + formato };
  }

  var nombre = limpiarNombre(restantes.join(' '));
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/.test(nombre)) {
    return { ok: false, error: 'El asunto no contiene el nombre del paciente. ' + formato };
  }

  return { ok: true, documento: documento, nombre: nombre };
}

/**
 * Busca en el texto de una hoja una marca de paginación como
 * "Página 2 de 4", "Pág. 2/4", "Hoja 2 de 4", "Page 2 of 4" o "Hoja 2".
 * Devuelve {numero, total} (total puede ser null) o null.
 */
function numeroDePaginaDesdeTexto(texto) {
  var t = String(texto || '').replace(/\s+/g, ' ');
  if (!t) return null;
  var palabra = '(?:p[aá]g(?:ina)?\\.?|hoja|page)\\s*(?:n[°ºo]?\\.?\\s*)?:?\\s*';

  var m = t.match(new RegExp('\\b' + palabra + '(\\d{1,3})\\s*(?:de|of|\\/)\\s*(\\d{1,3})\\b', 'i'));
  if (m) return { numero: parseInt(m[1], 10), total: parseInt(m[2], 10) };

  m = t.match(new RegExp('\\b' + palabra + '(\\d{1,3})\\b', 'i'));
  if (m) return { numero: parseInt(m[1], 10), total: null };

  // "2 de 4" sin la palabra "página": solo se acepta si aparece una única vez.
  var sueltos = t.match(/\b(\d{1,3})\s*(?:de|of)\s*(\d{1,3})\b/gi);
  if (sueltos && sueltos.length === 1) {
    m = sueltos[0].match(/(\d{1,3})\s*(?:de|of)\s*(\d{1,3})/i);
    return { numero: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }
  return null;
}

/** Último número que aparece en el nombre de archivo ("hoja_2.pdf" -> 2). */
function numeroDesdeNombreArchivo(nombre) {
  var base = String(nombre || '').replace(/\.[^.]+$/, '');
  var nums = base.match(/\d+/g);
  if (!nums) return null;
  return parseInt(nums[nums.length - 1], 10);
}

/**
 * Ordena las hojas. Cada hoja es {indice, nombre, pagina|null, ...}.
 * Prioridad: marca en el texto > número en el nombre de archivo > orden
 * de los adjuntos. Devuelve {metodo: 'texto'|'archivo'|'adjuntos', hojas}.
 */
function ordenarHojas(hojas) {
  var copia = hojas.slice();
  if (!copia.length) return { metodo: 'adjuntos', hojas: copia };

  var porTexto = copia.every(function (h) { return h.pagina && h.pagina.numero > 0; });
  if (porTexto) {
    copia.sort(function (a, b) { return (a.pagina.numero - b.pagina.numero) || (a.indice - b.indice); });
    return { metodo: 'texto', hojas: copia };
  }

  var nums = copia.map(function (h) { return numeroDesdeNombreArchivo(h.nombre); });
  var todos = nums.every(function (n) { return n !== null; });
  var distintos = new Set(nums).size === nums.length;
  if (todos && distintos) {
    copia.sort(function (a, b) {
      return numeroDesdeNombreArchivo(a.nombre) - numeroDesdeNombreArchivo(b.nombre);
    });
    return { metodo: 'archivo', hojas: copia };
  }

  copia.sort(function (a, b) { return a.indice - b.indice; });
  return { metodo: 'adjuntos', hojas: copia };
}

/**
 * Revisa que el orden tenga sentido. Devuelve {error: string|null, advertencias: []}.
 * `opciones` es CONFIG (usa RECHAZAR_SI_FALTAN_HOJAS).
 */
function validarOrden(hojas, metodo, opciones) {
  var advertencias = [];
  var n = hojas.length;

  if (metodo === 'texto') {
    var numeros = hojas.map(function (h) { return h.pagina.numero; });
    var totales = hojas.map(function (h) { return h.pagina.total; }).filter(function (t) { return t; });
    var problemas = [];

    var totalesDistintos = Array.from(new Set(totales));
    if (totalesDistintos.length > 1) {
      problemas.push('las hojas indican totales distintos (' + totalesDistintos.join(', ') + ')');
    }
    var esperado = totalesDistintos.length ? Math.max.apply(null, totalesDistintos) : Math.max.apply(null, numeros);

    var vistos = {};
    var repetidas = [];
    numeros.forEach(function (k) {
      if (vistos[k]) repetidas.push(k);
      vistos[k] = true;
    });
    if (repetidas.length) problemas.push('hojas repetidas: ' + Array.from(new Set(repetidas)).join(', '));

    var faltantes = [];
    for (var k = 1; k <= esperado; k++) if (!vistos[k]) faltantes.push(k);
    if (faltantes.length) problemas.push('faltan las hojas ' + faltantes.join(', ') + ' de ' + esperado);

    var sobran = numeros.filter(function (k) { return k > esperado; });
    if (sobran.length) problemas.push('hay hojas numeradas por encima del total (' + sobran.join(', ') + ')');

    if (problemas.length) {
      var msg = 'Las hojas no están completas o están repetidas: ' + problemas.join('; ') +
        '. Se recibieron ' + n + ' hoja(s).';
      if (opciones && opciones.RECHAZAR_SI_FALTAN_HOJAS) return { error: msg, advertencias: advertencias };
      advertencias.push(msg);
    }
  } else if (n === 1) {
    // Una sola hoja: no hay orden que determinar.
  } else if (metodo === 'archivo') {
    var nums = hojas.map(function (h) { return numeroDesdeNombreArchivo(h.nombre); });
    var consecutivos = nums.every(function (v, i) { return i === 0 || v === nums[i - 1] + 1; });
    advertencias.push('El orden se tomó del número en el nombre de cada archivo (no se encontró "Página N de M" en el texto).');
    if (!consecutivos) {
      advertencias.push('Los números de los archivos no son consecutivos (' + nums.join(', ') + '). Verifique que no falte ninguna hoja.');
    }
  } else {
    advertencias.push('No se pudo determinar el orden de las hojas por su contenido ni por el nombre de archivo; se usó el orden en que venían adjuntas. Revise el PDF antes de subirlo.');
  }

  return { error: null, advertencias: advertencias };
}

/** true si el texto de la hoja contiene el número de documento (ignorando puntos y espacios). */
function textoContieneDocumento(texto, documento) {
  var t = String(texto || '').replace(/[\s.,\-]/g, '').toUpperCase();
  var d = String(documento || '').replace(/[\s.,\-]/g, '').toUpperCase();
  return !!d && t.indexOf(d) >= 0;
}

/**
 * Compara el documento del asunto con el texto de cada hoja.
 * Devuelve {error: string|null, advertencias: []}.
 */
function verificarDocumentoEnHojas(hojas, documento, opciones) {
  var conTexto = hojas.filter(function (h) { return typeof h.texto === 'string' && h.texto.trim(); });
  if (!conTexto.length) return { error: null, advertencias: [] };

  var sin = conTexto.filter(function (h) { return !textoContieneDocumento(h.texto, documento); });
  if (!sin.length) return { error: null, advertencias: [] };

  if (sin.length === conTexto.length) {
    return {
      error: null,
      advertencias: ['El documento ' + documento + ' del asunto no aparece en el texto de ninguna hoja. Verifique que el asunto corresponda al paciente.'],
    };
  }

  var nombres = sin.map(function (h) { return h.nombre; }).join(', ');
  var msg = 'Posible mezcla de pacientes: el documento ' + documento + ' aparece en unas hojas pero no en estas: ' + nombres + '.';
  if (opciones && opciones.RECHAZAR_SI_MEZCLA_PACIENTES) return { error: msg, advertencias: [] };
  return { error: null, advertencias: [msg] };
}

/** Quita tildes y diéresis (y convierte Ñ en N). */
function quitarTildes(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Elimina caracteres no válidos en nombres de archivo. */
function sanitizarNombreArchivo(nombre) {
  var limpio = String(nombre || '')
    .replace(/[\\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  var ext = '';
  var m = limpio.match(/\.pdf$/i);
  if (m) { ext = '.pdf'; limpio = limpio.slice(0, -4).trim(); }
  if (limpio.length > 150) limpio = limpio.slice(0, 150).trim();
  return (limpio || 'resultado') + ext;
}

/** Construye el nombre del archivo final según CONFIG. */
function construirNombreArchivo(datos, opciones) {
  var nombre = datos.nombre;
  if (opciones.NOMBRE_EN_MAYUSCULAS) nombre = nombre.toUpperCase();
  if (opciones.QUITAR_TILDES) nombre = quitarTildes(nombre);
  var plantilla = opciones.FORMATO_NOMBRE_ARCHIVO || '{nombre} - {documento}.pdf';
  var archivo = plantilla.split('{nombre}').join(nombre).split('{documento}').join(datos.documento);
  if (!/\.pdf$/i.test(archivo)) archivo += '.pdf';
  return sanitizarNombreArchivo(archivo);
}

/** Título que se escribe en los metadatos del PDF. */
function construirTituloPdf(datos, opciones) {
  return construirNombreArchivo(datos, opciones).replace(/\.pdf$/i, '');
}

/** true si el adjunto parece un PDF por tipo o extensión. */
function esPdf(nombre, tipoContenido) {
  return /pdf$/i.test(String(tipoContenido || '')) || /\.pdf$/i.test(String(nombre || ''));
}

/** true si los primeros bytes son la firma "%PDF". */
function tieneFirmaPdf(bytes) {
  if (!bytes || bytes.length < 5) return false;
  var cabecera = '';
  for (var i = 0; i < 5; i++) cabecera += String.fromCharCode(bytes[i] & 0xff);
  return cabecera.indexOf('%PDF') === 0;
}

// Dominios de correo personal: no sirven como "dominio de la empresa".
var DOMINIOS_PUBLICOS_ = ['@gmail.com', '@googlemail.com', '@hotmail.com', '@outlook.com', '@live.com', '@yahoo.com', '@icloud.com'];

/** Parte "@dominio" de un correo, en minúsculas ('' si no tiene). */
function dominioDe(correo) {
  var c = extraerCorreo(correo);
  var i = c.indexOf('@');
  return i < 0 ? '' : c.slice(i);
}

/** true si el dominio es de un proveedor de correo personal. */
function esDominioPublico(dominio) {
  return DOMINIOS_PUBLICOS_.indexOf(String(dominio || '').toLowerCase()) >= 0;
}

/** Extrae la dirección de un "Nombre <correo@dominio>". */
function extraerCorreo(remitente) {
  var s = String(remitente || '');
  var m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

/**
 * true si el remitente está autorizado. `permitidos` es la lista de CONFIG
 * y `correoRobot` la cuenta donde corre el script.
 */
function remitenteAutorizado(remitente, permitidos, correoRobot) {
  var correo = extraerCorreo(remitente);
  if (!correo || correo.indexOf('@') < 0) return false;
  var dominio = correo.slice(correo.indexOf('@'));
  var lista = (permitidos || []).map(function (p) { return String(p).trim().toLowerCase(); }).filter(Boolean);
  if (!lista.length) {
    var dominioRobot = dominioDe(correoRobot);
    // Si el robot vive en gmail.com u otro dominio público, "mismo dominio"
    // significaría cualquiera; en ese caso hay que llenar REMITENTES_PERMITIDOS.
    if (!dominioRobot || esDominioPublico(dominioRobot)) return false;
    return dominio === dominioRobot;
  }
  return lista.some(function (p) { return p.charAt(0) === '@' ? dominio === p : correo === p; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ErrorUsuario: ErrorUsuario,
    limpiarAsunto: limpiarAsunto,
    normalizarDocumento: normalizarDocumento,
    limpiarNombre: limpiarNombre,
    interpretarAsunto: interpretarAsunto,
    numeroDePaginaDesdeTexto: numeroDePaginaDesdeTexto,
    numeroDesdeNombreArchivo: numeroDesdeNombreArchivo,
    ordenarHojas: ordenarHojas,
    validarOrden: validarOrden,
    textoContieneDocumento: textoContieneDocumento,
    verificarDocumentoEnHojas: verificarDocumentoEnHojas,
    quitarTildes: quitarTildes,
    sanitizarNombreArchivo: sanitizarNombreArchivo,
    construirNombreArchivo: construirNombreArchivo,
    construirTituloPdf: construirTituloPdf,
    esPdf: esPdf,
    tieneFirmaPdf: tieneFirmaPdf,
    extraerCorreo: extraerCorreo,
    dominioDe: dominioDe,
    esDominioPublico: esDominioPublico,
    remitenteAutorizado: remitenteAutorizado,
  };
}
