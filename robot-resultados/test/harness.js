/**
 * Entorno simulado de Apps Script para probar el flujo completo en Node.
 * Carga los mismos archivos que se despliegan (incluido pdf-lib.min.js)
 * en un contexto aislado con versiones falsas de GmailApp, DriveApp, etc.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const CARPETA_SCRIPT = path.join(__dirname, '..', 'apps-script');

function crearBlob(bytes, tipo, nombre) {
  let datos = Array.from(bytes);
  let nombreActual = nombre;
  return {
    getBytes: () => datos.slice(),
    getName: () => nombreActual,
    getContentType: () => tipo,
    setName(n) { nombreActual = n; return this; },
  };
}

function iterador(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}

/**
 * opciones:
 *   mensajes: [{id, from, subject, adjuntos:[{nombre, tipo, bytes}], fecha}]
 *   textos: { nombreAdjunto: 'texto extraído' }  (ausente => Drive falla)
 *   driveFalla: true para simular que el servicio Drive no está habilitado
 *   config: sobreescrituras de CONFIG
 *   vendorizarPdfLib: false para probar la descarga por UrlFetchApp
 */
function crearEntorno(opciones = {}) {
  const estado = { respuestas: [], archivosDrive: [], filasRegistro: [], etiquetasCreadas: [], disparadores: [], fetches: [], logs: [] };
  const props = {};
  const etiquetas = {};
  const docsTemporales = {};
  const carpetas = {};

  const mensajes = (opciones.mensajes || []).map((m) => {
    const msj = {
      _leido: false,
      _etiquetas: [],
      getId: () => m.id,
      getFrom: () => m.from,
      getSubject: () => m.subject,
      getDate: () => m.fecha || new Date(),
      isUnread: () => !msj._leido,
      isInTrash: () => false,
      markRead: () => { msj._leido = true; return msj; },
      getAttachments: () => (m.adjuntos || []).map((a) => crearBlob(a.bytes, a.tipo || 'application/pdf', a.nombre)),
      reply: (cuerpo, opts) => { estado.respuestas.push({ id: m.id, cuerpo, opciones: opts || {} }); },
      getThread: () => hilo,
    };
    const hilo = {
      getMessages: () => [msj],
      addLabel: (et) => { msj._etiquetas.push(et.getName()); },
    };
    return msj;
  });

  const crearCarpeta = (nombre) => {
    const id = 'carpeta-' + nombre;
    const archivos = [];
    const carpeta = {
      getId: () => id,
      getName: () => nombre,
      getUrl: () => 'https://drive.example/' + id,
      isTrashed: () => false,
      createFile: (blob) => {
        const archivo = { id: 'archivo-' + estado.archivosDrive.length, nombre: blob.getName(), bytes: blob.getBytes(), getUrl: () => 'https://drive.example/archivo/' + blob.getName(), getId: () => archivo.id };
        estado.archivosDrive.push(archivo);
        archivos.push(archivo);
        return archivo;
      },
      getFilesByName: (n) => iterador(archivos.filter((a) => a.nombre === n)),
    };
    carpetas[id] = carpeta;
    return carpeta;
  };
  const raiz = {
    getFoldersByName: (n) => iterador(Object.values(carpetas).filter((c) => c.getName() === n)),
    createFolder: (n) => crearCarpeta(n),
  };

  const sandbox = {
    console: {
      log: (...a) => estado.logs.push(['log', a.join(' ')]),
      warn: (...a) => estado.logs.push(['warn', a.join(' ')]),
      error: (...a) => estado.logs.push(['error', a.join(' ')]),
    },
    MimeType: { PDF: 'application/pdf', GOOGLE_DOCS: 'application/vnd.google-apps.document' },
    Utilities: {
      newBlob: (bytes, tipo, nombre) => crearBlob(bytes, tipo, nombre),
      getUuid: () => 'uuid-' + Math.random().toString(16).slice(2),
      sleep: () => {},
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => opciones.correoRobot || 'robot@miempresa.com' }) },
    GmailApp: {
      search: (consulta, inicio, max) => {
        estado.ultimaConsulta = consulta;
        return mensajes.map((m) => m.getThread()).slice(inicio, inicio + max);
      },
      getUserLabelByName: (n) => etiquetas[n] || null,
      createLabel: (n) => { estado.etiquetasCreadas.push(n); etiquetas[n] = { getName: () => n }; return etiquetas[n]; },
    },
    DriveApp: {
      getRootFolder: () => raiz,
      getFolderById: (id) => { if (!carpetas[id]) throw new Error('no existe'); return carpetas[id]; },
      getFileById: (id) => ({ moveTo: () => {}, setTrashed: () => { delete docsTemporales[id]; } }),
    },
    DocumentApp: {
      openById: (id) => ({ getBody: () => ({ getText: () => docsTemporales[id] }) }),
    },
    SpreadsheetApp: (() => {
      const libros = {};
      const crear = (nombre) => {
        const id = 'libro-' + nombre;
        const hoja = { appendRow: (fila) => estado.filasRegistro.push(fila), getParent: () => libro };
        const libro = { getId: () => id, getSheets: () => [hoja], getUrl: () => 'https://sheets.example/' + id };
        libros[id] = libro;
        return libro;
      };
      return {
        create: crear,
        openById: (id) => { if (!libros[id]) throw new Error('no existe'); return libros[id]; },
      };
    })(),
    ScriptApp: {
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => estado.disparadores.push({ fn, m }) }) }) }),
      getProjectTriggers: () => estado.disparadores.map((d) => ({ getHandlerFunction: () => d.fn })),
      deleteTrigger: (t) => { estado.disparadores = estado.disparadores.filter((d) => d.fn !== t.getHandlerFunction()); },
    },
    UrlFetchApp: {
      fetch: (url) => {
        estado.fetches.push(url);
        return { getContentText: () => fs.readFileSync(path.join(CARPETA_SCRIPT, 'pdf-lib.min.js'), 'utf8') };
      },
    },
  };

  if (!opciones.driveFalla) {
    sandbox.Drive = {
      Files: {
        create: (recurso, blob) => {
          const texto = (opciones.textos || {})[blob.getName()];
          if (texto === undefined) throw new Error('sin texto simulado para ' + blob.getName());
          const id = 'doc-' + Math.random().toString(16).slice(2);
          docsTemporales[id] = texto;
          return { id };
        },
        remove: (id) => { delete docsTemporales[id]; },
      },
    };
  }

  const ctx = vm.createContext(sandbox);
  const archivos = ['Config.js', 'Logica.js', 'Pdf.js', 'Main.js'];
  if (opciones.vendorizarPdfLib !== false) archivos.unshift('pdf-lib.min.js');
  for (const archivo of archivos) {
    vm.runInContext(fs.readFileSync(path.join(CARPETA_SCRIPT, archivo), 'utf8'), ctx, { filename: archivo });
  }
  Object.assign(ctx.CONFIG, opciones.config || {});

  return { ctx, estado, docsTemporales, mensajes };
}

module.exports = { crearEntorno, crearBlob };
