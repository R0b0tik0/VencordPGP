# Limitaciones conocidas (v1)

[English](../LIMITATIONS.md) | **Español**

Léelo antes de usar VencordPGP con información sensible.

- **Solo MD y grupos MD** (tipos de canal 1 y 3). Los canales de servidor, hilos,
  canales de voz y anuncios no se tocan. El plugin tampoco descifra contenido con
  aspecto PGP en guilds/hilos; no simula protección donde no cifra.
- **La confianza es manual.** Solo las claves marcadas como **verificadas**
  producen el check verde `firmado, verificado`. Las claves no verificadas pueden
  cifrar, pero no autentican al remitente y el envío muestra un aviso. Nunca
  confíes en una clave solo porque se importó o se sincronizó.
- **Render local.** El texto descifrado se coloca donde estaba el contenido
  original (un portal DOM), así que las reacciones, botones y adjuntos quedan
  debajo como en un mensaje normal. El bloque cifrado se oculta por defecto; `ver
  cifrado` revela el bloque original y `ver descifrado` lo vuelve a ocultar.
  Efecto lateral: mientras un mensaje se muestra descifrado, otros plugins
  locales y DevTools pueden leer el claro en la interfaz. El ciphertext del store
  de Discord y del servidor no cambia.
- **Clave privada.** Solo en RAM por defecto. Opcionalmente se puede guardar
  **cifrada** en la caja fuerte local (PBKDF2-SHA256 + AES-256-GCM; la contraseña
  de almacenamiento no se guarda). Nunca se sincroniza con la nube. En v1 la caja
  fuerte también guarda la passphrase de la clave OpenPGP salvo que desmarques esa
  opción. Ver [Gestión de claves](KEYS.md).
- **Menciones y notificaciones.** El ciphertext no contiene `<@id>` en claro, así
  que Discord no notifica a nadie. Los mensajes se envían con
  `allowedMentions` vacío para evitar pings accidentales. Tras descifrar, las
  menciones se ven como texto.
- **Sin embeds ni vistas previas del servidor** para el ciphertext: Discord no
  puede inspeccionarlo. El plugin no fabrica embeds ni descarga URLs.
- **Adjuntos, imágenes, vídeo y voz no se cifran.** Al enviar un adjunto aparece
  un aviso; solo el texto queda protegido. No hay flujo de cifrado de archivos en
  v1.
- **Los GIFs y stickers se envían sin cifrar** (solo el GIF/sticker) para que
  Discord pueda mostrarlos. Si añades texto privado junto a un GIF/sticker, el
  envío/edición **se cancela** (fail-closed): quita el texto o desactiva el
  cifrado en esa conversación.
- **Respuestas y citas:** la vista previa del servidor muestra el ciphertext; el
  cuerpo citado no se reenvía en claro. El `messageReference` es metadato
  visible.
- **Tamaño:** el texto se limita a 3.000 caracteres antes de cifrar y el armor
  resultante debe caber en 2.000 caracteres (4.000 con la opción Nitro). El
  envío se cancela en vez de fragmentarse o salir en claro.
- **Bots:** los MD 1:1 con un bot no se cifran, para que los comandos sigan
  funcionando. En un **grupo con bot y personas**, el envío cifrado **se
  cancela** en vez de salir en claro en silencio. El candado muestra el estado.
- **Los metadatos no están protegidos:** quién habla con quién, cuándo, tamaño
  aproximado e IDs de canal/mensaje. OpenPGP no oculta los metadatos de Discord.
- **Sin forward secrecy.** Un futuro compromiso de una clave privada puede
  descifrar los mensajes cifrados para esa clave que sigan disponibles.
- **Replay:** `sentAt` es informativo, no un mecanismo anti-replay autoritativo.
  Un ciphertext antiguo reenviado hoy se sigue descifrando.
- **Ediciones:** invalidan la caché y se vuelven a cifrar por el mismo camino
  fail-closed.
- **Compatibilidad:** solo los clientes con el plugin y las claves correctas ven
  el claro. El resto ve el bloque `[VPGP:v1]`.
- **Idioma:** la interfaz del cliente y el instalador de Windows admiten español
  e inglés. Ambos usan por defecto el idioma detectado (Discord / Windows) y se
  pueden forzar (ajuste `language`, parámetro `-Language`). Solo esos dos
  idiomas están traducidos; el resto cae a inglés. La documentación está en
  inglés y español.
- **Sin criptografía casera:** solo se usan `openpgp` (RFC 9580) y WebCrypto. No
  hay keyservers ni acceso a red.

Algunos puntos de hardening no criptográfico siguen abiertos. Consulta la
[política de seguridad](SECURITY.md) para la lista actual.

Nada de esto se presenta como “seguridad absoluta”. Lee el
[modelo de amenazas](THREAT_MODEL.md).
