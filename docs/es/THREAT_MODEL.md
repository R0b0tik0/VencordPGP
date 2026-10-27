# Modelo de amenazas

[English](../THREAT_MODEL.md) | **Español**

## Protege contra

- **Divulgación pasiva del contenido** por parte de Discord o terceros, en
  tránsito o en reposo, mediante cifrado OpenPGP multi-destinatario (RFC 9580).
- **Confusión casual emisor/destinatario**, cuando las firmas están activadas y
  la clave del remitente se ha verificado manualmente. Solo las claves
  verificadas producen el check verde `firmado, verificado`.

## NO protege contra

- **Un endpoint comprometido** (malware, extensión maliciosa, DevTools). El claro
  existe en RAM y en la interfaz renderizada. La caja fuerte local cifrada
  (PBKDF2 + AES-GCM) no detiene a un keylogger que capture la contraseña de
  almacenamiento, ni a un atacante que controle el proceso de Discord.
- **Sustitución de claves sin verificación fuera de banda** (TOFU ciego).
  Mitigación: verificación manual de huellas y aviso cuando aparece una huella
  nueva para un contacto conocido. Un snapshot persistido de huellas frente a
  settings sync sigue en la lista de hardening.
- **Suplantación sin firma verificada.** Cifrar no es autenticar. Sin el check
  verde `firmado, verificado`, el remitente **no** está autenticado. Si la firma
  **no valida**, el mensaje se muestra igualmente, marcado en rojo (`FIRMA
  INVÁLIDA`): no confíes en él y revisa la clave pública del remitente.
- **Replay.** `sentAt` es informativo. Un ciphertext antiguo reenviado hoy se
  sigue descifrando.
- **Manipulación del ciphertext.** OpenPGP la detecta (el descifrado falla, la UI
  muestra un error discreto y nunca muestra “verificado”).
- **GIFs, stickers y adjuntos.** Los GIFs/stickers se envían sin cifrar para que
  Discord los muestre; los adjuntos no se cifran. No son contenido protegido.
- **Borrado o edición en el servidor.** Quien tenga acceso a la cuenta puede
  borrar mensajes. El historial local no es prueba.
- **Metadatos:** grafo social, marcas de tiempo, tamaños. Fuera del alcance.
- **DoS con contenido malformado.** Mitigado con límites: 8.192 caracteres de
  transporte, 5.000 de cuerpo, tope de descompresión de 24 KB, caché de
  descifrado de 500 entradas, mapa de claros de 500 entradas y validación
  estricta tras descifrar. El descifrado solo se intenta en MD/GDM.
- **Inyección en la UI.** Mitigada renderizando texto (React `textContent`, sin
  `innerHTML`/`dangerouslySetInnerHTML`). Discord parsea el Markdown; el plugin no
  inyecta HTML arbitrario.
- **Riesgo de dependencias.** Solo se usan `openpgp` (auditada por Cure53) y
  WebCrypto. Fija versiones y revisa advisories. Sin keyservers ni llamadas de
  red.

## Reglas operativas

- Nunca registres en logs el claro, claves privadas ni passphrases; los errores
  usan códigos, no secretos.
- Fail-closed siempre. Nunca desactives la verificación en silencio.
- Verifica las huellas por un canal independiente antes de marcar una clave como
  verificada.
- Bloquea la clave al ausentarte; borra los datos guardados si sospechas un
  compromiso.
- Trata la cuenta de Discord, la instalación de Vencord y el sistema operativo
  como parte de la base de confianza.

## Decisiones de diseño

- Sin criptografía casera.
- Sin compresión en los mensajes salientes.
- Sin keyservers ni descubrimiento automático de claves.
- Sin persistencia del texto descifrado.
- El ciphertext nunca se reescribe en el store de Discord.
- Los canales no soportados se dejan intactos en vez de “protegerse” a medias.

Ver [Limitaciones](LIMITATIONS.md) para el comportamiento visible y la
[política de seguridad](SECURITY.md) para el hardening abierto y el reporte de
vulnerabilidades.
