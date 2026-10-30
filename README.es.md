# VencordPGP

**Cifrado OpenPGP automático para mensajes directos y grupos de Discord.**

VencordPGP es un *userplugin* de [Vencord](https://vencord.dev) que cifra los
mensajes salientes con OpenPGP antes de que Discord los vea y descifra los
entrantes localmente. Escribir sigue siendo tan simple como teclear y pulsar
Enter.

[English](README.md) | **Español**

> Estado: v1 en desarrollo activo. El núcleo criptográfico está cubierto por
> pruebas; la interfaz dentro del cliente está en español e inglés (sigue el
> idioma de Discord por defecto). Lee las
> [Limitaciones](docs/es/LIMITATIONS.md) y el
> [Modelo de amenazas](docs/es/THREAT_MODEL.md) antes de confiar en él.

## Características

- **MD y grupos MD cifrados** (tipos de canal 1 y 3). Los canales de servidor
  quedan fuera a propósito.
- **Descifrado local y ciphertext original intacto.** Discord almacena el bloque
  cifrado; el plugin muestra el claro en RAM y oculta el cifrado por defecto
  (alternando `ver cifrado` / `ver descifrado`). No se reescribe nada en el
  servidor.
- **Envío fail-closed.** Si falta la clave de un destinatario o el cifrado supera
  el límite de Discord, el envío se cancela y el borrador se conserva. Nunca se
  cae a texto plano en silencio.
- **Firmas opcionales.** Los mensajes salientes se pueden firmar; una firma
  entrante solo se considera verificada si la clave pública del remitente se
  marcó como verificada tras comprobar la huella por otro canal.
- **Confianza manual.** Sin keyservers, sin descubrimiento automático de claves y
  sin peticiones de red. Las claves públicas se vinculan al ID estable de
  Discord del usuario.
- **Clave privada en RAM por defecto.** Opcionalmente se puede guardar cifrada en
  este equipo con una contraseña de almacenamiento (PBKDF2-SHA256 + AES-256-GCM
  en el `DataStore` local de Vencord, nunca en los ajustes sincronizados).
- **Candado por conversación.** Un botón de candado en la barra de chat activa o
  desactiva el cifrado en una conversación y abre la gestión de claves.
- **Mensajes cifrados editables.** El botón de editar normal abre el texto
  descifrado, vuelve a cifrar al guardar y edita el mismo mensaje.

## Requisitos

- Windows 10/11 para el instalador de doble clic (PowerShell 5.1 viene con
  Windows).
- Discord con Vencord ya instalado e inyectado.
- Para compilar desde el código: Node.js 22+, `corepack pnpm` y un checkout de
  Vencord.

## Inicio rápido (instalador de Windows)

1. Descarga `VencordPGP-Installer.zip` desde la página
   **[Releases](../../releases)** del repositorio (o genéralo tú, ver
   [docs/es/INSTALLER.md](docs/es/INSTALLER.md)).
2. Cierra Discord y haz doble clic en `Instalar VencordPGP.cmd` dentro de la
   carpeta descomprimida. El instalador te ofrece cerrar Discord.
3. Verifica los hashes del payload, hace backup del `dist` y del
   `settings.json` actuales, copia el build y activa el plugin.
4. Abre Discord, entra en **Ajustes → Vencord → Plugins → VencordPGP** y carga tu
   clave privada.
5. Intercambia las claves **públicas** con tu contacto por otro canal, asigna
   cada clave al ID de Discord del contacto, compara las huellas y márcalas como
   verificadas.

Para desinstalar, ejecuta `Desinstalar VencordPGP.cmd`. Restaura el backup limpio
más reciente y desactiva el plugin conservando tus claves públicas y opciones.

La interfaz del cliente sigue el idioma de Discord (español/inglés) y se puede
forzar con el ajuste **Language** del plugin. Los mensajes del instalador siguen
el idioma de Windows y aceptan `-Language es|en`. Para la instalación
manual desde el código, ver [docs/es/INSTALL.md](docs/es/INSTALL.md).

## Configuración inicial de claves

Necesitas un par de claves OpenPGP. Si ya tienes uno, úsalo. Si no, el
repositorio incluye un generador para claves de prueba o personales:

```powershell
node scripts/generate-test-keys.mjs "Tu Nombre" "una-passphrase-larga"
```

Escribe `pgp-keys/<nombre>-private.asc`, `-public.asc` y `-revocation.asc`.
El generador exige al menos 12 caracteres. Guarda la privada y el certificado de
revocación; comparte solo la pública.

En el plugin:

1. Pega la clave privada y su passphrase en **PGP Key Manager** y pulsa
   **Desbloquear** (o **Unlock** en inglés; el panel sigue el ajuste **Language**).
2. Pega la clave pública de tu contacto asociada a su ID numérico de Discord
   (clic derecho en el usuario → **Copiar ID**).
3. Compara la huella completa por un canal independiente (voz, en persona, otro
   mensajero). Solo entonces marca la clave como verificada.

El flujo completo, incluida la caja fuerte cifrada opcional, está en
[docs/es/KEYS.md](docs/es/KEYS.md).

## Cómo funciona

Los mensajes salientes se sustituyen por un bloque de transporte versionado:

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----
...
-----END PGP MESSAGE-----
```

El payload cifrado es JSON `{"v":1,"body":"<texto exacto>","sentAt":123}`. El
marcador permite detectar el mensaje sin descifrarlo y deja evolucionar el
protocolo. Los mensajes entrantes solo se descifran en MD/grupos MD, con límites
de descompresión y tamaño, y se cachean en una LRU acotada en memoria.

El plugin **no** parchea el render de Discord con expresiones regulares frágiles.
Muestra el claro mediante un accesorio estándar de Vencord y oculta el nodo del
contenido original; las reacciones y acciones del mensaje quedan en su sitio. El
formato está en [docs/es/TRANSPORT.md](docs/es/TRANSPORT.md) y los límites de
seguridad en [docs/es/THREAT_MODEL.md](docs/es/THREAT_MODEL.md).

## Qué no protege

- Canales de servidor, hilos, canales de voz y anuncios.
- Adjuntos, imágenes, vídeo, embeds y vistas previas de enlaces.
- GIFs y stickers: se envían sin cifrar para que Discord pueda mostrarlos. Si el
  mensaje lleva texto además, el envío se cancela.
- MD 1:1 con bots (para no romper comandos). Un grupo con bot y personas cancela
  el envío en vez de salir en claro.
- Metadatos: quién habla con quién, cuándo, tamaño del mensaje, IDs de canal y
  de mensaje.
- Un endpoint comprometido (malware, extensión maliciosa, DevTools) puede leer el
  claro mientras se muestra.

La lista completa está en [docs/es/LIMITATIONS.md](docs/es/LIMITATIONS.md).

## Estructura del proyecto

```text
src/                         Núcleo Node/TypeScript independiente y testeable
  crypto.ts                  OpenPGP v6: cifrar/descifrar/firmar/verificar
  transport.ts               Marcador [VPGP:v1] + detección de armor
  serializer.ts              Payload versionado + límites anti-DoS
  keyStore.ts                Claves públicas por ID de Discord, confianza manual
  channelPolicy.ts           Política DM/GDM
  cache.ts  session.ts       Caché LRU y sesión de clave privada en RAM
  outgoing.ts  incoming.ts   Plan de envío fail-closed y vista de descifrado
  keyVault.ts                Caja fuerte local cifrada (WebCrypto)
  tests/                     57 pruebas (núcleo + vault)
vencord-plugin/vencordPgp/   Fuente del plugin Vencord (la copia del núcleo no
                             lleva .js en los imports)
scripts/                     Sincronización, payload, generador de claves,
                             escaneo de secretos y test del instalador
installer/                   Instalador de Windows, payload precompilado y licencias
docs/                        Documentación en inglés
docs/es/                     Documentación en español
```

## Desarrollo

```powershell
npm install
npm test            # tsc + 57 pruebas
npm run testTsc     # comprobación de tipos del núcleo
npm run lint        # escaneo de secretos
npm run test:installer  # E2E del instalador en sandbox (Windows)
```

El núcleo Node es ESM (`NodeNext`), así que los imports relativos terminan en
`.js`. La copia en `vencord-plugin/vencordPgp/core/` debe ser idéntica byte a
byte salvo los sufijos `.js`, que el bundler no necesita. Sincronízala con:

```powershell
node scripts/sync-vencord-core.mjs <checkout-vencord>\src\userplugins\vencordPgp\core
```

El flujo completo está en [CONTRIBUTING.md](CONTRIBUTING.md) y la compilación
contra Vencord en [docs/es/INSTALL.md](docs/es/INSTALL.md).

## Documentación

| English | Español |
|---|---|
| [Install](docs/INSTALL.md) | [Instalación](docs/es/INSTALL.md) |
| [Windows installer](docs/INSTALLER.md) | [Instalador de Windows](docs/es/INSTALLER.md) |
| [Key management](docs/KEYS.md) | [Gestión de claves](docs/es/KEYS.md) |
| [Transport format](docs/TRANSPORT.md) | [Formato de transporte](docs/es/TRANSPORT.md) |
| [Limitations](docs/LIMITATIONS.md) | [Limitaciones](docs/es/LIMITATIONS.md) |
| [Threat model](docs/THREAT_MODEL.md) | [Modelo de amenazas](docs/es/THREAT_MODEL.md) |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | [Solución de problemas](docs/es/TROUBLESHOOTING.md) |
| [Security policy](docs/SECURITY.md) | [Política de seguridad](docs/es/SECURITY.md) |

## Licencia

GPL-3.0-or-later. Ver [LICENSE](LICENSE). El payload del instalador contiene
Vencord (GPL-3.0); su licencia y avisos legales están incluidos en `installer/`.
