/**
 * ============================================================
 *  ROBOT DE RESULTADOS - FLUJO PRINCIPAL
 * ============================================================
 *
 * Funciones que se ejecutan desde el editor de Apps Script:
 *
 *   probarConfiguracion   Verifica permisos, pdf-lib, Drive y etiquetas.
 *   instalarDisparador    Programa la revisión automática del buzón.
 *   desinstalarDisparador Detiene la revisión automática.
 *   procesarBuzon         Revisa el buzón una vez (la usa el disparador).
 *
 * Flujo por cada correo no leído con PDF adjuntos:
 *   1. Se marca como leído para que ninguna otra ejecución lo tome.
 *   2. Se valida el remitente y se interpreta el asunto (documento + nombre).
 *   3. Se leen las hojas, se ordenan y se validan.
 *   4. Se unen en un solo PDF con el nombre del paciente y su documento.
 *   5. Se responde el mismo correo con el PDF adjunto y se guarda copia en Drive.
 *   6. Se etiqueta el correo y se anota en la hoja de registro.
 */

/** Punto de entrada del disparador. Revisa el buzón una vez. */
async function procesarBuzon() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(30 * 1000)) {
    console.log('Otra ejecución sigue en curso; se intenta en la próxima.');
    return;
  }
  try {
    var mensajes = buscarMensajesPendientes_();
    if (!mensajes.length) {
      console.log('Sin correos pendientes.');
      return;
    }
    // Reclamar los mensajes antes de procesarlos: si algo falla a mitad de
    // camino, no se vuelven a procesar (queda constancia en el registro).
    mensajes.forEach(function (m) { m.markRead(); });
    for (var i = 0; i < mensajes.length; i++) {
      await procesarMensaje_(mensajes[i]);
    }
  } finally {
    candado.releaseLock();
  }
}

/** Consulta de Gmail que define qué correos se procesan. */
function construirConsulta_() {
  var partes = ['in:inbox', 'is:unread', 'has:attachment', 'filename:pdf'];
  if (CONFIG.DIRECCION_ROBOT) partes.push('to:' + CONFIG.DIRECCION_ROBOT);
  if (CONFIG.BUSCAR_DESDE) partes.push(CONFIG.BUSCAR_DESDE);
  return partes.join(' ');
}

/** Mensajes no leídos con adjuntos, hasta MAX_CORREOS_POR_EJECUCION. */
function buscarMensajesPendientes_() {
  var hilos = GmailApp.search(construirConsulta_(), 0, CONFIG.MAX_CORREOS_POR_EJECUCION);
  var pendientes = [];
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (m) {
      if (m.isUnread() && !m.isInTrash()) pendientes.push(m);
    });
  });
  pendientes.sort(function (a, b) { return a.getDate() - b.getDate(); });
  return pendientes.slice(0, CONFIG.MAX_CORREOS_POR_EJECUCION);
}

/** Procesa un correo. Nunca lanza: todo error queda en el registro y en la respuesta. */
async function procesarMensaje_(mensaje) {
  var registro = {
    fecha: new Date(),
    remitente: mensaje.getFrom(),
    asunto: mensaje.getSubject(),
    documento: '',
    nombre: '',
    hojas: 0,
    orden: '',
    estado: '',
    detalle: '',
    archivo: '',
    enlace: '',
  };

  try {
    var correoRobot = Session.getEffectiveUser().getEmail();
    if (!remitenteAutorizado(registro.remitente, CONFIG.REMITENTES_PERMITIDOS, correoRobot)) {
      etiquetar_(mensaje, CONFIG.ETIQUETA_ERROR);
      registro.estado = 'IGNORADO';
      registro.detalle = 'Remitente no autorizado';
      console.warn('Correo ignorado de ' + registro.remitente);
      return;
    }

    var datos = interpretarAsunto(registro.asunto);
    if (!datos.ok) throw new ErrorUsuario(datos.error);
    registro.documento = datos.documento;
    registro.nombre = datos.nombre;

    var hojas = obtenerHojas_(mensaje);
    registro.hojas = hojas.length;

    var textoLeido = CONFIG.LEER_TEXTO_HOJAS ? leerTextos_(hojas) : false;

    var orden = ordenarHojas(hojas);
    registro.orden = orden.metodo;
    var validacion = validarOrden(orden.hojas, orden.metodo, CONFIG);
    if (validacion.error) throw new ErrorUsuario(validacion.error);
    var advertencias = validacion.advertencias.slice();

    if (textoLeido) {
      var chequeo = verificarDocumentoEnHojas(orden.hojas, datos.documento, CONFIG);
      if (chequeo.error) throw new ErrorUsuario(chequeo.error);
      advertencias = advertencias.concat(chequeo.advertencias);
    } else if (CONFIG.LEER_TEXTO_HOJAS) {
      advertencias.push('No fue posible leer el texto de las hojas; no se verificó que todas pertenezcan al mismo paciente.');
    }

    var nombreArchivo = construirNombreArchivo(datos, CONFIG);
    var titulo = construirTituloPdf(datos, CONFIG);
    var bytesPdf = await unirPdfs_(cargarPdfLib_(), orden.hojas.map(function (h) { return h.bytes; }), {
      titulo: titulo,
      asunto: 'Resultado de laboratorio - ' + datos.nombre + ' - ' + datos.documento,
      autor: CONFIG.NOMBRE_REMITENTE,
      nombres: orden.hojas.map(function (h) { return h.nombre; }),
    });
    var blob = Utilities.newBlob(aBytesFirmados_(bytesPdf), 'application/pdf', nombreArchivo);
    registro.archivo = nombreArchivo;

    if (CONFIG.GUARDAR_COPIA_EN_DRIVE) {
      var archivoDrive = obtenerCarpeta_().createFile(blob);
      registro.enlace = archivoDrive.getUrl();
    }

    mensaje.reply(cuerpoExito_(datos, orden, nombreArchivo, advertencias), {
      attachments: [blob],
      name: CONFIG.NOMBRE_REMITENTE,
    });
    etiquetar_(mensaje, CONFIG.ETIQUETA_PROCESADO);
    registro.estado = advertencias.length ? 'OK CON ADVERTENCIAS' : 'OK';
    registro.detalle = advertencias.join(' | ');
    console.log('Procesado: ' + nombreArchivo + ' (' + hojas.length + ' hojas, orden por ' + orden.metodo + ')');
  } catch (e) {
    var esDelUsuario = e instanceof ErrorUsuario;
    var motivo = esDelUsuario ? e.message : 'Error interno: ' + e.message;
    console.error('Error procesando "' + registro.asunto + '": ' + motivo + (e.stack ? '\n' + e.stack : ''));
    registro.estado = 'ERROR';
    registro.detalle = motivo;
    try {
      etiquetar_(mensaje, CONFIG.ETIQUETA_ERROR);
      mensaje.reply(cuerpoError_(motivo, esDelUsuario), { name: CONFIG.NOMBRE_REMITENTE });
    } catch (e2) {
      console.error('No se pudo responder el correo: ' + e2.message);
    }
  } finally {
    registrar_(registro);
  }
}

/** Adjuntos PDF del mensaje como hojas {indice, nombre, bytes, blob, texto, pagina}. */
function obtenerHojas_(mensaje) {
  var adjuntos = mensaje.getAttachments({ includeInlineImages: false, includeAttachments: true });
  var hojas = [];
  adjuntos.forEach(function (adj) {
    if (!esPdf(adj.getName(), adj.getContentType())) return;
    var bytes = adj.getBytes();
    if (!tieneFirmaPdf(bytes)) {
      throw new ErrorUsuario('El archivo "' + adj.getName() + '" no es un PDF válido.');
    }
    hojas.push({ indice: hojas.length, nombre: adj.getName(), bytes: bytes, blob: adj, texto: null, pagina: null });
  });
  if (!hojas.length) throw new ErrorUsuario('El correo no tiene archivos PDF adjuntos.');
  if (hojas.length > CONFIG.MAX_HOJAS) {
    throw new ErrorUsuario('El correo tiene ' + hojas.length + ' PDF adjuntos; el máximo es ' + CONFIG.MAX_HOJAS + '.');
  }
  return hojas;
}

/**
 * Lee el texto de cada hoja y detecta el número de página.
 * Devuelve true solo si se pudo leer el texto de todas las hojas.
 */
function leerTextos_(hojas) {
  var todas = true;
  hojas.forEach(function (h) {
    try {
      h.texto = extraerTextoPdf_(h.blob);
      h.pagina = numeroDePaginaDesdeTexto(h.texto);
    } catch (e) {
      todas = false;
      h.texto = null;
      h.pagina = null;
      console.warn('No se pudo leer el texto de "' + h.nombre + '": ' + e.message);
    }
  });
  return todas;
}

function cuerpoExito_(datos, orden, nombreArchivo, advertencias) {
  var descripcionOrden = {
    texto: 'según la marca "Página N de M" de cada hoja',
    archivo: 'según el número en el nombre de cada archivo',
    adjuntos: 'según el orden de los adjuntos',
  }[orden.metodo];
  var lineas = [
    'Resultado consolidado listo para cargar al portal.',
    '',
    'Paciente:  ' + datos.nombre,
    'Documento: ' + datos.documento,
    'Hojas:     ' + orden.hojas.length + ' (ordenadas ' + descripcionOrden + ')',
    'Archivo:   ' + nombreArchivo,
    '',
    'Orden de las hojas:',
  ];
  orden.hojas.forEach(function (h, i) {
    var marca = h.pagina ? ' (página ' + h.pagina.numero + (h.pagina.total ? ' de ' + h.pagina.total : '') + ')' : '';
    lineas.push('  ' + (i + 1) + '. ' + h.nombre + marca);
  });
  if (advertencias.length) {
    lineas.push('', 'ADVERTENCIAS - revise el PDF antes de subirlo:');
    advertencias.forEach(function (a) { lineas.push('  - ' + a); });
  }
  lineas.push('', '-- ', CONFIG.NOMBRE_REMITENTE + ' (mensaje automático)');
  return lineas.join('\n');
}

function cuerpoError_(motivo, esDelUsuario) {
  var lineas = ['No se pudo generar el PDF consolidado.', '', 'Motivo: ' + motivo, ''];
  if (esDelUsuario) {
    lineas.push('Corrija el problema y envíe el correo de nuevo (un correo por paciente, con el asunto "DOCUMENTO - NOMBRE" y todas las hojas adjuntas en PDF).');
  } else {
    lineas.push('Este es un error del sistema, no del correo enviado. Informe al área de sistemas; el detalle quedó en el registro de ejecuciones.');
  }
  lineas.push('', '-- ', CONFIG.NOMBRE_REMITENTE + ' (mensaje automático)');
  return lineas.join('\n');
}

// ---------- Gmail: etiquetas ----------

function obtenerEtiqueta_(nombre) {
  var etiqueta = GmailApp.getUserLabelByName(nombre);
  if (etiqueta) return etiqueta;
  // Para etiquetas anidadas ("Resultados/Procesado") hay que crear primero la de arriba.
  var partes = nombre.split('/');
  var acumulado = '';
  for (var i = 0; i < partes.length; i++) {
    acumulado += (i ? '/' : '') + partes[i];
    etiqueta = GmailApp.getUserLabelByName(acumulado) || GmailApp.createLabel(acumulado);
  }
  return etiqueta;
}

function etiquetar_(mensaje, nombreEtiqueta) {
  if (!nombreEtiqueta) return;
  try {
    mensaje.getThread().addLabel(obtenerEtiqueta_(nombreEtiqueta));
  } catch (e) {
    console.warn('No se pudo aplicar la etiqueta ' + nombreEtiqueta + ': ' + e.message);
  }
}

// ---------- Drive: carpeta y registro ----------

function obtenerCarpeta_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_ID');
  if (id) {
    try {
      var carpeta = DriveApp.getFolderById(id);
      if (!carpeta.isTrashed()) return carpeta;
    } catch (e) {
      // La carpeta fue borrada: se crea otra.
    }
  }
  var raiz = DriveApp.getRootFolder();
  var existentes = raiz.getFoldersByName(CONFIG.CARPETA_DRIVE);
  var nueva = existentes.hasNext() ? existentes.next() : raiz.createFolder(CONFIG.CARPETA_DRIVE);
  props.setProperty('CARPETA_ID', nueva.getId());
  return nueva;
}

var ENCABEZADO_REGISTRO_ = ['Fecha', 'Remitente', 'Asunto', 'Documento', 'Paciente', 'Hojas', 'Orden', 'Estado', 'Detalle', 'Archivo', 'Copia en Drive'];

function obtenerHojaRegistro_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('REGISTRO_ID');
  var libro = null;
  if (id) {
    try {
      libro = SpreadsheetApp.openById(id);
    } catch (e) {
      libro = null;
    }
  }
  if (!libro) {
    var carpeta = obtenerCarpeta_();
    var existentes = carpeta.getFilesByName(CONFIG.NOMBRE_HOJA_REGISTRO);
    if (existentes.hasNext()) {
      libro = SpreadsheetApp.openById(existentes.next().getId());
    } else {
      libro = SpreadsheetApp.create(CONFIG.NOMBRE_HOJA_REGISTRO);
      DriveApp.getFileById(libro.getId()).moveTo(carpeta);
      libro.getSheets()[0].appendRow(ENCABEZADO_REGISTRO_);
    }
    props.setProperty('REGISTRO_ID', libro.getId());
  }
  return libro.getSheets()[0];
}

function registrar_(registro) {
  var fila = [
    registro.fecha, registro.remitente, registro.asunto, registro.documento, registro.nombre,
    registro.hojas, registro.orden, registro.estado, registro.detalle, registro.archivo, registro.enlace,
  ];
  console.log(JSON.stringify(fila));
  if (!CONFIG.REGISTRO_EN_HOJA) return;
  try {
    obtenerHojaRegistro_().appendRow(fila);
  } catch (e) {
    console.error('No se pudo escribir en la hoja de registro: ' + e.message);
  }
}

// ---------- Disparador ----------

function instalarDisparador() {
  var permitidos = [1, 5, 10, 15, 30];
  var minutos = CONFIG.INTERVALO_MINUTOS;
  if (permitidos.indexOf(minutos) < 0) {
    throw new Error('INTERVALO_MINUTOS debe ser uno de: ' + permitidos.join(', '));
  }
  desinstalarDisparador();
  ScriptApp.newTrigger('procesarBuzon').timeBased().everyMinutes(minutos).create();
  console.log('Disparador instalado: procesarBuzon cada ' + minutos + ' minuto(s).');
}

function desinstalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarBuzon') ScriptApp.deleteTrigger(t);
  });
}

// ---------- Prueba de configuración ----------

/**
 * Ejecute esta función una vez después de instalar. Revise el resultado en
 * el registro de ejecución (Ver > Registros / Execution log).
 */
async function probarConfiguracion() {
  var lineas = [];
  var ok = function (texto) { lineas.push('OK    ' + texto); };
  var mal = function (texto) { lineas.push('ERROR ' + texto); };

  var correoRobot = Session.getEffectiveUser().getEmail();
  ok('Cuenta del robot: ' + correoRobot);
  ok('Consulta de Gmail: ' + construirConsulta_());
  if (!CONFIG.REMITENTES_PERMITIDOS.length && esDominioPublico(dominioDe(correoRobot))) {
    mal('REMITENTES_PERMITIDOS está vacío y la cuenta es de un dominio público (' + dominioDe(correoRobot) + '): ningún correo será aceptado. Escriba los remitentes autorizados en Config.js');
  } else {
    ok('Remitentes aceptados: ' + (CONFIG.REMITENTES_PERMITIDOS.length ? CONFIG.REMITENTES_PERMITIDOS.join(', ') : 'todos los de ' + dominioDe(correoRobot)));
  }

  var lib = null;
  var pdfPrueba = null;
  try {
    lib = cargarPdfLib_();
    var a = await crearPdfPrueba_(lib, 'Documento 999999 - Página 1 de 2');
    var b = await crearPdfPrueba_(lib, 'Documento 999999 - Página 2 de 2');
    var unido = await unirPdfs_(lib, [a, b], { titulo: 'Prueba', nombres: ['a.pdf', 'b.pdf'] });
    var doc = await lib.PDFDocument.load(unido);
    pdfPrueba = Utilities.newBlob(aBytesFirmados_(a), 'application/pdf', 'prueba-robot.pdf');
    ok('pdf-lib funciona (' + doc.getPageCount() + ' páginas unidas, título "' + doc.getTitle() + '")');
  } catch (e) {
    mal('pdf-lib: ' + e.message);
  }

  if (CONFIG.LEER_TEXTO_HOJAS) {
    if (!pdfPrueba) {
      mal('Lectura de texto: no se pudo probar porque pdf-lib falló');
    } else {
      try {
        var texto = extraerTextoPdf_(pdfPrueba);
        var pagina = numeroDePaginaDesdeTexto(texto);
        if (pagina && pagina.numero === 1 && pagina.total === 2) ok('Lectura de texto con Drive funciona (detectó "Página 1 de 2")');
        else mal('Lectura de texto: se leyó "' + String(texto).slice(0, 80) + '" pero no se detectó la página');
      } catch (e) {
        mal('Lectura de texto con Drive: ' + e.message + ' (Agregue el servicio "Drive" en Servicios (+) del editor, o ponga LEER_TEXTO_HOJAS en false)');
      }
    }
  } else {
    ok('Lectura de texto desactivada (LEER_TEXTO_HOJAS = false)');
  }

  if (CONFIG.GUARDAR_COPIA_EN_DRIVE || CONFIG.REGISTRO_EN_HOJA) {
    try {
      ok('Carpeta de Drive: ' + obtenerCarpeta_().getUrl());
    } catch (e) {
      mal('Carpeta de Drive: ' + e.message);
    }
  }
  if (CONFIG.REGISTRO_EN_HOJA) {
    try {
      ok('Hoja de registro: ' + obtenerHojaRegistro_().getParent().getUrl());
    } catch (e) {
      mal('Hoja de registro: ' + e.message);
    }
  }
  try {
    obtenerEtiqueta_(CONFIG.ETIQUETA_PROCESADO);
    obtenerEtiqueta_(CONFIG.ETIQUETA_ERROR);
    ok('Etiquetas de Gmail creadas');
  } catch (e) {
    mal('Etiquetas de Gmail: ' + e.message);
  }

  var disparadores = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'procesarBuzon'; });
  if (disparadores.length) ok('Disparador instalado (cada ' + CONFIG.INTERVALO_MINUTOS + ' min)');
  else lineas.push('AVISO Disparador no instalado: ejecute instalarDisparador para activar el robot');

  var resumen = lineas.join('\n');
  console.log(resumen);
  return resumen;
}
