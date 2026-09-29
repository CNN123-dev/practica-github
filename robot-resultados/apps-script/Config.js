/**
 * ============================================================
 *  ROBOT DE RESULTADOS - CONFIGURACIÓN
 * ============================================================
 *
 * Este es el único archivo que normalmente hay que editar.
 * Después de cambiar algo aquí, ejecute la función
 * `probarConfiguracion` (archivo Main) para verificar que todo
 * quede bien.
 */
var CONFIG = {
  // ---------- Buzón ----------

  // Dirección a la que la persona encargada envía los resultados.
  // Déjela vacía para procesar todo correo no leído con PDF adjuntos
  // que llegue a la cuenta donde corre este script.
  // Ejemplo: 'resultados@miempresa.com'
  DIRECCION_ROBOT: '',

  // Quién puede enviar resultados al robot. Acepta correos completos
  // ('maria@miempresa.com') o dominios ('@miempresa.com').
  // Lista vacía = solo se aceptan correos del mismo dominio que la
  // cuenta donde corre el script. Los demás se ignoran sin responder.
  // Si el robot corre en una cuenta @gmail.com (dominio público) la lista
  // es obligatoria; si no, no se acepta ningún correo.
  REMITENTES_PERMITIDOS: [],

  // Solo se revisan correos recientes para que la búsqueda sea rápida.
  BUSCAR_DESDE: 'newer_than:7d',

  // Cuántos correos procesar como máximo en cada ejecución.
  MAX_CORREOS_POR_EJECUCION: 10,

  // ---------- Archivo resultante ----------

  // Nombre del PDF consolidado. Variables disponibles: {nombre} {documento}
  FORMATO_NOMBRE_ARCHIVO: '{nombre} - {documento}.pdf',

  // Escribir el nombre del paciente en mayúsculas en el nombre del archivo.
  NOMBRE_EN_MAYUSCULAS: true,

  // Quitar tildes y eñes del nombre del archivo (JOSÉ MUÑOZ -> JOSE MUNOZ).
  // Útil si el portal tiene problemas con caracteres especiales.
  QUITAR_TILDES: false,

  // Máximo de hojas (PDF adjuntos) por resultado. Más que esto se rechaza.
  MAX_HOJAS: 30,

  // ---------- Orden y validación de las hojas ----------

  // Leer el texto de cada hoja (usando la conversión de Google Drive)
  // para detectar marcas como "Página 2 de 4" y ordenar por ellas.
  // Requiere habilitar el servicio avanzado "Drive" en el proyecto.
  // Si falla, el robot usa el número en el nombre de archivo y, en
  // último caso, el orden en que vienen adjuntos.
  LEER_TEXTO_HOJAS: true,

  // Si el texto indica "Página N de M" y faltan o sobran hojas,
  // rechazar el resultado y avisar por correo (true) o solo advertir (false).
  RECHAZAR_SI_FALTAN_HOJAS: true,

  // Si el número de documento del asunto aparece en unas hojas pero no en
  // otras, es probable que se mezclaran pacientes. Rechazar (true) o advertir (false).
  RECHAZAR_SI_MEZCLA_PACIENTES: true,

  // ---------- Copia en Drive y registro ----------

  // Guardar una copia de cada PDF consolidado en Drive.
  GUARDAR_COPIA_EN_DRIVE: true,

  // Nombre de la carpeta en el Drive de la cuenta del robot (se crea sola).
  CARPETA_DRIVE: 'Resultados consolidados',

  // Llevar un registro de cada correo procesado en una hoja de cálculo
  // dentro de la carpeta anterior (se crea sola).
  REGISTRO_EN_HOJA: true,
  NOMBRE_HOJA_REGISTRO: 'Registro robot resultados',

  // ---------- Gmail ----------

  // Etiquetas que se aplican a los correos según el resultado.
  ETIQUETA_PROCESADO: 'Resultados/Procesado',
  ETIQUETA_ERROR: 'Resultados/Error',

  // Nombre con el que se firma la respuesta.
  NOMBRE_REMITENTE: 'Robot de resultados',

  // Cada cuántos minutos revisar el buzón. Valores permitidos: 1, 5, 10, 15, 30.
  INTERVALO_MINUTOS: 5,

  // ---------- Avanzado ----------

  // Solo se usa si el archivo pdf-lib.min.js NO está incluido en el
  // proyecto. Entonces la librería se descarga de esta URL (versión fija).
  PDF_LIB_URL: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
};
