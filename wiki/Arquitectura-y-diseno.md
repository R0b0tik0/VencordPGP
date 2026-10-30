[English](Architecture-and-Design) | **Español**

VencordPGP se divide en un núcleo Node/TypeScript testeable y un adaptador fino para Vencord. Esta página describe las piezas, el recorrido de un mensaje en cada dirección y dónde vive cada dato. El formato en el cable está especificado en [Formato de transporte](Formato-de-transporte).

## Componentes

| Módulo | Responsabilidad |
|---|---|
| `src/transport.ts` | Detección del marcador `[VPGP:v1]` y comprobación del armor ASCII |
| `src/serializer.ts` | Payload JSON versionado `{ v: 1, body, sentAt }` y límites anti-DoS |
| `src/crypto.ts` | Cifrado, descifrado, firma y verificación con OpenPGP v6 (varios destinatarios) |
| `src/keyStore.ts` | Claves públicas ligadas al ID de usuario de Discord, confianza manual |
| `src/channelPolicy.ts` | Alcance DM/GDM, overrides por conversación, `autoEncryptDMs` |
| `src/cache.ts` | LRU acotada para texto descifrado y metadatos de firma |
| `src/session.ts` | Clave privada y passphrase solo en RAM |
| `src/outgoing.ts` | Plan de envío fail-closed; nunca devuelve un fallback en claro |
| `src/incoming.ts` | Vista de descifrado: cuerpo, estado de firma, códigos de error |
| `src/keyVault.ts` | Cámara cifrada local (PBKDF2-SHA256 + AES-256-GCM, WebCrypto) |
| `vencord-plugin/vencordPgp/` | `preSend`/`preEdit`, render, UI de claves, i18n, almacenamiento de la cámara |

La capa del plugin es `index.tsx` (intercepción y parcheo de `startEditMessage`), `render.ts` (descifrado en RAM), `PgpAccessory.tsx` (render), `PgpPanel.tsx`, `PgpLockButton.tsx`, `AssignKeyModal.tsx`, `SaveVaultModal.tsx`, `StoredKeyModal.tsx`, `vault.ts` (`DataStore` de Vencord), `dm.ts`, `state.ts`, `i18n.ts` y la copia de `core/`.

## Envío

1. `preSend` inspecciona el canal. Solo son elegibles DMs y DMs grupales (tipos 1 y 3); los canales de servidor, hilos y canales de voz no se tocan.
2. El interruptor global (`pgpEnabled`), el override por conversación (`channelOverrides`) y `autoEncryptDMs` deciden si se cifra. El botón de candado escribe el override, que tiene prioridad.
3. Excepciones explícitas: un GIF/sticker **sin texto adicional** se envía en claro para que Discord pueda mostrarlo; un GIF/sticker **con texto cancela el envío**. Un DM 1:1 con bot queda en claro para que funcionen los comandos; un grupo con bot y humanos se cancela.
4. Cada destinatario humano debe tener al menos una clave pública válida, no expirada y no revocada. Si falta una clave, se cancela el envío, se conserva el borrador y se muestra el motivo.
5. El cuerpo se serializa en el payload versionado (límite de 3.000 caracteres de texto plano).
6. El payload se cifra a todas las claves válidas de los destinatarios y, opcionalmente, se firma con la clave del remitente.
7. El armor se envuelve en el bloque de transporte y se comprueba contra el límite de salida (2.000 caracteres, 4.000 con la opción Nitro).
8. El mensaje se envía con `allowedMentions` vacío. En ningún paso hay un fallback silencioso a texto plano.

## Recepción

1. `isPgpTransport` hace una comprobación barata de marcador y armor, y solo en DMs/GDMs.
2. Los bloques de transporte demasiado grandes (más de 8.192 caracteres) se rechazan antes de cualquier trabajo criptográfico.
3. El descifrado usa la clave de sesión en RAM. La firma solo se informa como verificada cuando la clave del remitente está marcada como verificada y no está revocada ni expirada.
4. Una firma inválida o que no coincide **no** oculta el mensaje: el cuerpo se devuelve con `signatureValid: false` y la UI lo marca en rojo (`vc-pgp-bad-sig`).
5. El payload JSON se valida después de descifrar; el cuerpo se limita a 5.000 caracteres y los datos OpenPGP descomprimidos a 24 KB.
6. Los resultados y errores se cachean en una LRU acotada de 500 entradas. Los errores cacheados no se vuelven a notificar, lo que evita un bucle render→descifrar→notificar.
7. `render.ts` descifra solo en RAM. `PgpAccessory.tsx` inserta el texto plano mediante un portal en un contenedor justo después de `#message-content-<id>`, oculta el nodo del criptograma original y ofrece `ver cifrado` / `ver descifrado`.
8. El mensaje almacenado por Discord y la copia del servidor nunca se reescriben. Las ediciones pasan por el mismo camino fail-closed y vuelven a cifrar el mismo mensaje.

## Frontera de confianza

- El ID de usuario de Discord (snowflake) es la clave primaria; el nombre visible es solo una pista.
- Las claves públicas se importan manualmente, puede haber varias por usuario (rotación) y solo se marcan como verificadas tras comparar la huella por un canal independiente.
- Solo las claves verificadas se usan como claves de verificación. Las no verificadas pueden cifrar, pero el envío avisa.
- Sin keyservers, sin descubrimiento automático, sin peticiones de red y sin criptografía propia.

## Dónde vive cada dato

| Dato | Ubicación | ¿Lo sincroniza Vencord? |
|---|---|---|
| Claves públicas, pistas de nombre visible, marcas de verificación | Ajustes de Vencord (`publicKeysByUser`) | Sí, si la sincronización de ajustes está activada |
| Overrides de cifrado por conversación | Ajustes de Vencord (`channelOverrides`) | Sí, si la sincronización de ajustes está activada |
| Cámara cifrada de la clave privada | `DataStore`/IndexedDB local de Vencord | No |
| Clave privada desbloqueada y passphrase | Solo RAM | No |
| Texto de mensajes descifrado | Solo RAM, LRU acotada | No |

## Estructura del repositorio

```text
src/                         Núcleo Node/TypeScript independiente y testeable
  crypto.ts                  Cifrado, descifrado, firma y verificación OpenPGP v6
  transport.ts               Marcador [VPGP:v1] + detección de armor
  serializer.ts              Payload versionado + límites anti-DoS
  keyStore.ts                Claves públicas por ID de Discord, confianza manual
  channelPolicy.ts           Política DM/GDM
  cache.ts  session.ts       Caché LRU, sesión de clave privada en RAM
  outgoing.ts  incoming.ts   Plan de envío fail-closed y vista de descifrado
  keyVault.ts                Cámara cifrada local (WebCrypto)
  tests/                     Suites del núcleo y de la cámara
vencord-plugin/vencordPgp/   Código del plugin de Vencord (copia del núcleo sin
                             extensiones .js en los imports)
scripts/                     Sincronización del núcleo, payload, generador de
                             claves, escaneo de secretos, test del instalador,
                             generación de la wiki
installer/                   Instalador de Windows, payload precompilado, licencias
docs/                        Documentación en inglés
docs/es/                     Documentación en español
wiki/                        Páginas de la wiki de GitHub (generadas y manuales)
```

## Las dos copias del núcleo

`src/*.ts` es ESM NodeNext, así que los imports relativos terminan en `.js`. La copia en `vencord-plugin/vencordPgp/core/*.ts` debe seguir siendo byte-idéntica salvo por esas extensiones, porque Vencord empaqueta el plugin con esbuild. Sincroniza en un solo sentido:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

No edites a mano la copia `core/` del plugin. Consulta [Contribuir y desarrollo](Contribuir-y-desarrollo).

## Decisiones de diseño

- Sin criptografía propia: solo `openpgp` v6 (RFC 9580) y WebCrypto.
- Sin compresión en los mensajes salientes, para que el tamaño sea predecible.
- Sin keyservers, telemetría ni descubrimiento automático de claves.
- Sin persistencia del texto descifrado; el criptograma nunca se reescribe en el store de Discord.
- Los canales no soportados se dejan intactos en lugar de "protegerse" a medias.
- Fail-closed: cualquier fallo cancela el envío y conserva el borrador.

---

**Relacionado:** [Formato de transporte](Formato-de-transporte) · [Gestión de claves](Gestion-de-claves) · [Modelo de amenazas](Modelo-de-amenazas)
