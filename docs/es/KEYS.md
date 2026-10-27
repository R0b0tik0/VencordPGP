# Gestión de claves

[English](../KEYS.md) | **Español**

## Principios

- **El ID de usuario de Discord (snowflake) es la clave primaria.** Es estable
  frente a cambios de nick. El nombre visible es solo informativo.
- **Nunca auto-importes** una clave pública por el nombre que alguien publique.
  Vincula la clave manualmente y verifica la huella por un canal independiente
  (en persona, una llamada, otro mensajero verificado).
- **Varias claves por usuario** para rotación: los mensajes salientes se cifran
  para todas las claves válidas.
- Al añadir una huella nueva para un contacto conocido se muestra un aviso. Un
  snapshot persistido de huellas que proteja frente a la sustitución vía settings
  sync sigue en la lista de hardening (ver [Política de seguridad](SECURITY.md)).

## Importar tu clave privada

1. Abre **Ajustes → Vencord → Plugins → VencordPGP → PGP Key Manager**.
2. Pega el armor (`-----BEGIN PGP PRIVATE KEY BLOCK-----...`) en el campo. Si no
   aparece, pulsa **Reemplazar clave privada**.
3. Escribe la passphrase en el campo `password` (solo sesión, no se muestra). Si
   tu clave no tiene passphrase, déjalo vacío.
4. Pulsa **Desbloquear**. Tras cargarla, la clave **deja de mostrarse** en el
   panel (vive en memoria y en la caja fuerte cifrada opcional); el panel indica
   si está cargada y bloqueada o desbloqueada.

## Caja fuerte cifrada opcional

La caja fuerte evita pegar la clave privada en cada inicio de Discord. Es
opcional.

1. En **PGP Key Manager → Clave guardada (cifrada con contraseña)**, elige una
   **contraseña de almacenamiento** (mínimo 8 caracteres) y pulsa **Guardar
   cifrada**. El armor se cifra con PBKDF2-SHA256 (310.000 iteraciones) y
   AES-256-GCM.
2. El blob se guarda **solo en este equipo**, en el `DataStore`/IndexedDB local
   de Vencord. Nunca va a `settings.json` ni a la nube. La contraseña de
   almacenamiento **no se guarda**.
3. La contraseña se pide **solo al intentar cifrar** (al enviar en una
   conversación cifrada con la clave bloqueada) o al pulsar **Cargar y
   desbloquear**. **No se pide al abrir Discord.** Tras desbloquear, la sesión
   queda desbloqueada hasta que bloquees o cierres Discord.
4. Atajo: **clic derecho en el candado** de la barra de chat → **Guardar mi clave
   privada cifrada...**. No hace falta abrir Ajustes.
5. **Borrar clave guardada** (o **Borrar todo**) elimina el blob del disco.

**Passphrase dentro de la caja fuerte:** en v1 el diálogo de guardado también
guarda la passphrase de la clave OpenPGP dentro del blob cifrado por defecto.
Desmarca esa opción si prefieres mantener la passphrase fuera de la caja fuerte y
escribirla tras cada reinicio. En ese caso, la contraseña de almacenamiento pasa
a ser la única protección del material de la clave.

**Límites:** la contraseña de almacenamiento protege el blob, pero malware o un
keylogger pueden capturarla mientras la escribes. Si la olvidas, vuelve a pegar la
clave privada y guarda un blob nuevo.

## Editar mensajes cifrados

- Usa el **botón de editar normal** de Discord: el editor se abre con el **texto
  descifrado** (el ciphertext se sustituye solo en el editor).
- Al guardar, el texto se **vuelve a cifrar** y se edita el **mismo mensaje**. No
  se borra ni se reenvía, así que se conservan el ID, las respuestas y las
  reacciones.
- Si el botón normal mostrara el bloque cifrado, usa el menú **⋯** del mensaje →
  **Editar mensaje PGP** (botón de respaldo con candado).
- Si el mensaje no está descifrado (clave bloqueada), desbloquéala antes.

## Asignar una clave pública a un contacto

1. Pide su clave pública **y su huella completa** por otro canal.
2. Obtén el ID: clic derecho en el usuario → **Copiar ID** (solo dígitos).
3. Pega el armor público y pulsa **Añadir**.
4. Compara la huella mostrada (grupos de cuatro) con la que recibiste fuera de
   Discord.
5. Solo entonces pulsa **Marcar verificada**.

### Atajo: candado en la barra de chat

En MD y grupos MD aparece un **candado** junto al cuadro de mensaje:

- **Clic izquierdo:** activa o desactiva el cifrado **solo en esa conversación**
  (se guarda como `channelOverrides` en ajustes; manda sobre `autoEncryptDMs`).
- **Clic derecho:** abre la gestión de claves del destinatario para pegar su
  **clave pública** sin ir a Ajustes. En grupos MD puedes elegir el destinatario.
- Estados: candado cerrado = cifrado activo; abierto = desactivado; amarillo con
  punto = activo pero faltan claves (el envío se cancela hasta añadirlas).

Desde el modal puedes copiar la huella de una clave, marcarla como verificada
(solo tras comprobarla fuera de banda), eliminarla o copiar tu propia clave
pública para enviársela a la otra persona.

## Estados de las claves

| Estado | Comportamiento |
|---|---|
| Válida | Se usa para cifrar |
| Caducada | Se importa pero no se usa para cifrar |
| Revocada | Se rechaza al importar |
| No verificada | Puede cifrar, pero no autentica; el envío avisa |
| Malformada | Se rechaza con un error |

Las claves caducadas y revocadas fallan cerrado, con el motivo visible.

La revocación y la caducidad se evalúan al importar la clave. Sin keyservers el
plugin no puede refrescar una clave automáticamente; vuelve a importar la clave
actualizada tras una revocación.

## Huellas

Formato: hex en mayúsculas en grupos de cuatro (por ejemplo `AB12 CD34 ...`). El
panel tiene botón de copiar. Nunca afirmes que una clave está verificada sin
comprobar la huella fuera de Discord.

## Bloqueo y borrado

- **Bloquear:** purga de RAM la clave desbloqueada, la passphrase y la caché de
  descifrado.
- **Borrar todo:** además purga el armor en memoria, las claves públicas y el blob
  cifrado guardado.
- La clave privada nunca va a logs, mensajes de error, exportaciones ni a la red.

## Qué se guarda y dónde

| Dato | Ubicación | ¿Lo sincroniza Vencord? |
|---|---|---|
| Claves públicas, nombres sugeridos y marcas de verificación | Ajustes de Vencord (`publicKeysByUser`) | Sí, si settings sync está activo |
| Overrides de cifrado por conversación | Ajustes de Vencord (`channelOverrides`) | Sí, si settings sync está activo |
| Caja fuerte de la clave privada cifrada | `DataStore`/IndexedDB local de Vencord | No |
| Clave privada desbloqueada y passphrase | Solo RAM | No |
| Texto descifrado | Solo RAM, LRU acotada | No |

Las claves públicas y los metadatos de conversaciones no son secretos, pero
revelan parte de tu grafo social. Tenlo en cuenta antes de activar settings sync
de Vencord.
