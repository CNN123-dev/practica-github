# Robot de resultados

Un robot de **Google Apps Script** que corre dentro de su Google Workspace.
La persona encargada envía por correo las hojas de un resultado (un PDF
por hoja), el robot las une en un solo PDF en el orden correcto, le pone
como nombre y título `NOMBRE DEL PACIENTE - DOCUMENTO.pdf` y se lo devuelve
respondiendo el mismo correo, listo para subir al portal de resultados.

No requiere servidores, ni licencias adicionales, ni servicios externos:
los datos de los pacientes no salen de su cuenta de Google Workspace.

## Cómo se usa (persona encargada)

1. Genere las hojas del resultado como siempre (3 a 5 PDF).
2. Envíe **un correo por paciente** a la cuenta del robot, con:
   - Asunto: `DOCUMENTO - NOMBRE DEL PACIENTE`. Ejemplo: `1234567 - Juan Pérez`.
     También sirven `Juan Pérez - 1234567`, `CC 1234567 | Juan Pérez`
     o `1.234.567 Juan Pérez`.
   - Adjuntos: todas las hojas del resultado en PDF.
3. En menos de 5 minutos recibe la respuesta con el PDF consolidado adjunto,
   por ejemplo `JUAN PÉREZ - 1234567.pdf`. Súbalo al portal.
4. Si algo no cuadra (falta una hoja, el asunto no tiene documento, se
   mezclaron hojas de dos pacientes) el robot responde explicando el
   problema en lugar de generar un PDF malo. Corrija y reenvíe.

El robot también guarda una copia de cada PDF en la carpeta de Drive
`Resultados consolidados` de la cuenta del robot y anota cada correo en la
hoja de cálculo `Registro robot resultados` (fecha, paciente, estado, etc.).

## Cómo funciona por dentro

Para cada correo no leído con PDF adjuntos:

1. Lo marca como leído para que no se procese dos veces.
2. Verifica que el remitente sea de la empresa (o esté en la lista permitida).
   Los demás correos se ignoran sin responder.
3. Saca el documento y el nombre del asunto.
4. Lee el texto de cada hoja (convirtiéndola temporalmente a Google Docs, lo
   que también hace OCR si la hoja es una imagen) y busca marcas como
   `Página 2 de 4`, `Pág. 2/4` u `Hoja 2 de 4`.
5. Ordena las hojas por esa marca. Si no la encuentra, usa el número del
   nombre de archivo (`hoja_2.pdf`) y, en último caso, el orden de los adjuntos,
   avisándolo en la respuesta.
6. Valida: que no falten ni sobren hojas según el "de M", y que el documento
   del asunto aparezca en todas las hojas (si aparece en unas y en otras no,
   rechaza por posible mezcla de pacientes).
7. Une las hojas con [pdf-lib](https://pdf-lib.js.org/) (librería MIT incluida
   en el proyecto), escribe el título en los metadatos del PDF y responde el
   correo con el archivo adjunto.
8. Etiqueta el correo como `Resultados/Procesado` o `Resultados/Error` y lo
   anota en la hoja de registro.

## Instalación

Necesita: una cuenta de Google Workspace donde vivirá el robot y unos 20 minutos.

### 1. Elegir la cuenta del robot

Opciones, de más a menos recomendada:

- Un usuario de Workspace dedicado, por ejemplo `resultados@miempresa.com`.
  El script corre ahí y responde desde esa cuenta.
- Un usuario existente **distinto de quien envía los resultados** (por
  ejemplo el de sistemas) al que se le agrega el
  alias `resultados@miempresa.com` (Consola de administración > Usuarios >
  el usuario > Información del usuario > Correos electrónicos alternativos).
  En ese caso ponga `DIRECCION_ROBOT: 'resultados@miempresa.com'` en la
  configuración para que el robot solo procese lo que llegue a ese alias.

Inicie sesión en el navegador **con la cuenta del robot** para los pasos siguientes.

### 2. Crear el proyecto de Apps Script

**Opción A: copiar y pegar (sin instalar nada)**

1. Entre a <https://script.google.com> y cree un proyecto nuevo. Póngale nombre
   (por ejemplo "Robot de resultados").
2. Cree un archivo por cada uno de estos y pegue su contenido:
   `Config.js`, `Logica.js`, `Pdf.js`, `Main.js` (en el editor quedan como `.gs`).
   El archivo `Código.gs` que viene por defecto se puede borrar o vaciar.
3. `pdf-lib.min.js` es grande (500 KB). Puede pegarlo como un archivo más
   (`pdf-lib.min.gs`) o no incluirlo: si no está, el robot lo descarga en cada
   ejecución desde la URL fija de `CONFIG.PDF_LIB_URL`. Incluirlo es más
   seguro y más rápido.
4. Abra Configuración del proyecto (el engranaje) y marque
   "Mostrar el archivo de manifiesto appsscript.json". Vuelva al editor y
   reemplace el contenido de `appsscript.json` por el de este repositorio.
   Eso habilita el servicio avanzado de Drive y fija la zona horaria.

**Opción B: con clasp (para quien ya usa la terminal)**

```bash
npm install -g @google/clasp
clasp login
cd robot-resultados
clasp create --type standalone --title "Robot de resultados" --rootDir apps-script
clasp push
```

(`clasp create` escribe `.clasp.json`; hay un `.clasp.json.example` de referencia.)

### 3. Configurar

Edite `Config.js`. Los valores por defecto funcionan; los que más se cambian:

| Opción | Para qué |
| --- | --- |
| `DIRECCION_ROBOT` | Procesar solo correos dirigidos a esa dirección o alias. |
| `REMITENTES_PERMITIDOS` | Quién puede usar el robot. Vacío = cualquier correo del mismo dominio de la empresa (obligatoria si el robot es una cuenta @gmail.com). |
| `FORMATO_NOMBRE_ARCHIVO` | Nombre del PDF. Por defecto `{nombre} - {documento}.pdf`. |
| `NOMBRE_EN_MAYUSCULAS`, `QUITAR_TILDES` | Cómo escribir el nombre en el archivo. |
| `LEER_TEXTO_HOJAS` | Leer el texto de las hojas para ordenar y validar. Requiere el servicio Drive. |
| `RECHAZAR_SI_FALTAN_HOJAS`, `RECHAZAR_SI_MEZCLA_PACIENTES` | Rechazar (true) o solo advertir (false). |
| `GUARDAR_COPIA_EN_DRIVE`, `REGISTRO_EN_HOJA` | Copia en Drive y hoja de registro. |
| `INTERVALO_MINUTOS` | Cada cuánto revisar el buzón (1, 5, 10, 15 o 30). |

### 4. Probar y activar

1. En el editor, seleccione la función `probarConfiguracion` y pulse Ejecutar.
   La primera vez Google pide autorizar el acceso a Gmail, Drive, Documentos y
   Hojas de cálculo de la cuenta del robot; acéptelo. (Si aparece "Google no ha
   verificado esta aplicación", pulse "Configuración avanzada" > "Ir a ... (no seguro)":
   es normal en scripts propios.)
2. Revise el registro de ejecución. Todas las líneas deben empezar por `OK`.
   Si la lectura de texto falla, en el menú izquierdo pulse el `+` junto a
   "Servicios", elija "Drive API" (versión v3) y agréguela. Vuelva a probar.
3. Ejecute `instalarDisparador`. Desde ese momento el robot revisa el buzón
   cada 5 minutos.
4. Haga una prueba real: envíe un correo con 2 o 3 hojas y el asunto
   `999999 - Paciente De Prueba`. Debe llegar la respuesta con el PDF.

Para detenerlo, ejecute `desinstalarDisparador`.

## Cuando algo falla

- **La respuesta dice que no pudo leer el texto de las hojas.** El servicio
  Drive no está habilitado o la conversión falló. El PDF se genera igual,
  ordenado por el nombre de archivo; ejecute `probarConfiguracion` para ver el detalle.
- **No llega respuesta.** Revise en el editor "Ejecuciones" (icono de reloj)
  para ver los errores, y en Gmail las etiquetas `Resultados/Error`. Verifique
  que el remitente sea del dominio permitido: los correos de fuera se ignoran
  a propósito.
- **Ordena mal las hojas.** Envíe una hoja de ejemplo a sistemas para ajustar la
  detección en `numeroDePaginaDesdeTexto` (archivo `Logica.js`). Mientras tanto,
  nombre los archivos `1.pdf`, `2.pdf`, ... antes de adjuntarlos.
- **Cuotas.** Apps Script permite unos 1.500 correos al día y 6 horas de
  ejecución diarias en Workspace; con 10 resultados al día se usa una fracción
  mínima.

## Privacidad

- Todo se procesa en la cuenta de Google Workspace del robot. No hay
  servidores externos ni terceros.
- Para leer el texto de una hoja se crea un Google Docs temporal que se
  elimina de inmediato (no queda en la papelera).
- La copia en Drive y la hoja de registro contienen datos de pacientes: limite
  quién tiene acceso a la cuenta del robot, y desactívelas en `Config.js` si
  no las necesita.
- Si incluye `pdf-lib.min.js` en el proyecto, el robot no descarga código de
  internet en ningún momento.

## Desarrollo y pruebas

La lógica se prueba sin Google, con Node.js 18 o superior:

```bash
cd robot-resultados
npm test
```

Las pruebas usan el mismo `pdf-lib.min.js` que se despliega y un entorno
simulado de Gmail y Drive (`test/harness.js`) que recorre el flujo completo:
orden por texto, orden por nombre de archivo, hoja faltante, mezcla de
pacientes, asunto inválido, remitente no autorizado, varios correos por
ejecución y descarga de pdf-lib cuando no está incluida.

Estructura:

```
apps-script/
  appsscript.json   Manifiesto: zona horaria y servicio avanzado Drive.
  Config.js         Configuración (lo único que normalmente se edita).
  Logica.js         Lógica pura: asunto, orden, validaciones, nombres.
  Pdf.js            Unión de PDF con pdf-lib y lectura de texto vía Drive.
  Main.js           Flujo de Gmail, Drive, registro y disparador.
  pdf-lib.min.js    pdf-lib 1.17.1 (MIT) con una línea inicial para Apps Script.
test/               Pruebas con node:test.
```
