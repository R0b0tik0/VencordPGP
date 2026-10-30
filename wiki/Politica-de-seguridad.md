[English](Security-Policy) | **Español**

VencordPGP maneja claves privadas y mensajes privados. Los reportes de seguridad
son bienvenidos y se agradece la divulgación responsable.

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 1.x (actual) | Sí |
| Builds antiguos o sin versión | No |

Solo el último release y la rama `main` actual reciben correcciones.

## Reportar una vulnerabilidad

**No abras un issue público para un fallo de seguridad.**

Usa el **reporte privado de vulnerabilidades** de GitHub:

1. Abre la pestaña **Security** del repositorio.
2. Pulsa **Report a vulnerability**.
3. Incluye:
   - versión o commit afectado,
   - pasos para reproducirlo,
   - comportamiento esperado y real,
   - impacto (confidencialidad, integridad, disponibilidad, exposición de
     claves),
   - cualquier prueba de concepto, **solo con claves de prueba**.

Nunca incluyas una clave privada real, una passphrase ni un mensaje privado en un
reporte. Si el reporte privado de GitHub no está disponible, contacta con el
mantenedor a través del perfil del repositorio y pide un canal privado antes de
compartir detalles.

Puedes esperar una primera respuesta en unos días. Deja tiempo para corregir y
publicar un release coordinado antes de divulgar los detalles.

## Alcance

Dentro del alcance:

- `src/` — núcleo criptográfico, transporte, serializador, almacén de claves,
  política de canales, caché, sesión y caja fuerte.
- `vencord-plugin/vencordPgp/` — integración con Vencord, render y UI de claves.
- `installer/` y `scripts/` — instalador, generación del payload y generador de
  claves.
- El protocolo de transporte y el formato de la caja fuerte cifrada.

Fuera del alcance:

- Vulnerabilidades en Discord, Vencord, Electron u `openpgp`. Repórtalas upstream
  (aun así nos interesa saber si afectan al plugin).
- Un endpoint comprometido, malware, una extensión maliciosa o un keylogger.
- Ingeniería social y errores en la verificación de claves fuera de banda.
- La exposición de metadatos documentada en el
  [modelo de amenazas](Modelo-de-amenazas).
- La ausencia de forward secrecy (propiedad de diseño de claves OpenPGP de largo
  plazo).

## Diseño de seguridad en resumen

- **Sin criptografía casera.** Solo `openpgp` v6 (RFC 9580) y WebCrypto.
- **Sin acceso a red.** Sin keyservers, sin telemetría, sin descubrimiento
  automático de claves.
- **Fail-closed.** Las claves ausentes, el cifrado demasiado grande y los
  destinatarios no soportados cancelan el envío y conservan el borrador. Nunca
  hay una caída silenciosa a texto plano.
- **La clave privada vive en RAM por defecto.** La persistencia opcional solo
  existe en la caja fuerte local cifrada (PBKDF2-SHA256 + AES-256-GCM, salt/IV
  aleatorios, contraseña de almacenamiento nunca persistida). Nunca en ajustes
  sincronizados.
- **Confianza manual.** Solo las claves marcadas como verificadas pueden producir
  una firma verificada. Las no verificadas pueden cifrar, pero el envío avisa.
- **Las firmas inválidas no ocultan el mensaje.** El texto se muestra marcado en
  rojo y la UI nunca lo presenta como verificado.
- **Trabajo acotado sobre entrada no confiable.** Límites de transporte, texto,
  descompresión y caché; descifrado solo en MD/GDM.
- **La copia del servidor nunca se reescribe.** El descifrado es local y en RAM.

## Puntos de hardening abiertos

Son limitaciones conocidas, no vulnerabilidades sin divulgar. Se listan para que
los usuarios puedan decidir con información.

| Área | Estado |
|---|---|
| **Passphrase en la caja fuerte** — el diálogo de guardado incluye la passphrase OpenPGP dentro del blob por defecto; el mínimo de contraseña de almacenamiento es 8 caracteres y PBKDF2 usa 310.000 iteraciones. Desmarcar la opción mantiene la passphrase fuera. | Abierto (planificado: desactivado por defecto, mínimo mayor, KDF más fuerte) |
| **Integridad del instalador** — el manifiesto SHA-256 se genera junto al payload y no está firmado. Detecta corrupción, no manipulación. El payload es un renderer de Vencord precompilado. | Abierto (verifica los hashes del release fuera de banda) |
| **Alcance del toggle global** — `pgpEnabled=false` detiene el cifrado saliente, pero en v1 los mensajes entrantes aún pueden descifrarse y mostrarse. | Abierto |
| **Frescura de revocación/caducidad** — el estado se calcula al importar la clave; sin keyservers no se refresca automáticamente. Reimporta la clave actualizada tras una revocación. | Abierto por diseño, documentado |
| **Metadatos sincronizables** — claves públicas, nombres sugeridos, marcas de verificación y overrides por conversación viven en ajustes de Vencord y pueden subirse si settings sync está activo. No incluyen material secreto. | Documentado |
| **Robustez del instalador** — `settings.json` se escribe directamente y la desinstalación cambia `dist` después de crear un safety backup. Un fallo a mitad puede dejar un estado inconsistente; los backups permiten recuperarlo. | Abierto |
| **Generador de claves de prueba** — escribe claves privadas en `pgp-keys/` y acepta la passphrase como argumento de línea de comandos (visible en el historial). Usa una herramienta dedicada para claves reales. | Documentado |
| **Caché de avisos de firma** — los metadatos de firma se leen de una caché acotada; con mucho tráfico podría expulsarse un badge antiguo de “firma inválida”. El contenido se sigue mostrando. | Abierto (bajo) |

En octubre de 2026 se hizo una revisión interna del código. Los problemas de
severidad alta encontrados entonces (material privado aceptado como clave
pública, el flag `verified` no aplicado a las firmas, envíos en claro silenciosos
con bots/toggle global y trabajo de descifrado sin cota) se corrigieron; las
correcciones del núcleo están cubiertas por tests. La tabla anterior recoge lo
que queda.

## Recomendaciones de hardening para usuarios

- Verifica las huellas por un canal que Discord no pueda influir.
- Mantén Vencord, Discord y el plugin actualizados.
- No actives settings sync de Vencord si no quieres subir claves públicas y
  overrides de conversaciones.
- Usa una contraseña de almacenamiento larga y única, y considera desmarcar
  “guardar passphrase” en la caja fuerte.
- Bloquea la clave al ausentarte y borra los datos guardados si sospechas un
  compromiso.
- Trata el sistema operativo y la instalación de Discord/Vencord como parte de la
  base de confianza.

## Sin garantía

Este es software libre distribuido bajo GPL-3.0-or-later, sin garantía. Ver
[LICENSE](https://github.com/R0b0tik0/VencordPGP/blob/master/LICENSE).

---

**Relacionado:** [Inicio](Inicio) · [Modelo de amenazas](Modelo-de-amenazas) · [Limitaciones](Limitaciones)
