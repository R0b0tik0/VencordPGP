[English](Troubleshooting) | **Español**

## Veo `[VPGP:v1] … -----BEGIN PGP MESSAGE-----` en vez del texto

El mensaje llegó cifrado (esa parte funciona). Si no ves el claro, ocurre una de
estas cosas:

1. **Tu clave privada está bloqueada.**
   - Busca un badge rojo: `PGP bloqueado · clic para desbloquear` (en inglés,
     `PGP locked · click to unlock`).
   - Solución: **Ajustes → Vencord → Plugins → VencordPGP → PGP Key Manager**:
     pega tu clave privada (**Reemplazar clave privada**) y su passphrase
     (**déjala vacía si tu clave no tiene**) → **Desbloquear**. O guarda la clave
     cifrada: la contraseña de almacenamiento se pide **al enviar** el siguiente
     mensaje cifrado (no al abrir Discord), o al pulsar **Cargar y desbloquear**.
   - La clave privada vive **solo en RAM** salvo que la guardes en la caja fuerte
     cifrada. Al cerrar Discord, o al desactivar/reactivar el plugin, se bloquea.

2. **El mensaje no se cifró para tu clave.**
   - Busca un badge rojo: `Mensaje PGP no descifrable`.
   - Causas típicas:
     - Lo enviaste desde otro cliente o equipo cuya configuración no incluía tu
       propia clave pública.
     - Cambiaste de clave privada después de enviarlo.
     - Es un grupo MD y tu clave no estaba disponible al enviar.
   - Un mensaje cifrado para otras claves **no se puede** descifrar con la tuya.

3. **Quiero ver el ciphertext original.**
   - Por defecto el bloque cifrado está **oculto** y se muestra el texto
     descifrado.
   - Pulsa **ver cifrado** bajo el mensaje para revelarlo; **ver descifrado** lo
     vuelve a ocultar.
   - Si el mensaje no se puede descifrar, el ciphertext permanece visible con un
     badge.

4. **He olvidado la contraseña de almacenamiento.**
   - No se puede recuperar; no se guarda. Vuelve a pegar tu clave privada en el
     PGP Key Manager y guarda un blob cifrado nuevo con otra contraseña.

5. **Un mensaje nuevo muestra `FIRMA INVÁLIDA` (badge rojo).**
   - El texto **sí se muestra** (una firma inválida ya no lo oculta), marcado en
     rojo: el remitente está firmando con una clave distinta de la que marcaste
     como **verificada** para él.
   - Solución: pide al remitente su **clave pública actual**, sustitúyela desde el
     candado (clic derecho → pegar clave), compara la huella por otro canal y
     **márcala como verificada**.
   - Causa típica: el remitente rotó su clave o te pasó una antigua.

6. **No puedo editar un mensaje cifrado / me sale el bloque cifrado.**
   - El botón de editar normal de Discord debería abrir el **texto descifrado**.
     Si no, usa el menú **⋯** del mensaje → **Editar mensaje PGP**.
   - Al guardar se re-cifra y se edita el **mismo mensaje** (no se borra).
   - Si el mensaje no está descifrado (clave bloqueada), desbloquéala primero.

## Cómo mirar los logs (sin secretos)

Discord guarda la consola en:

```text
%APPDATA%\discord\logs\renderer_js.log
```

Busca `[VencordPGP]`. Solo se registran metadatos (ID de mensaje, motivo), nunca
texto en claro, claves ni passphrases.

## Discord se abre en negro tras una actualización de Discord

- El Vencord precompilado del instalador está fijado a una versión. Una
  actualización de Discord puede cambiar el bundle de webpack/rspack y el build
  antiguo de Vencord ya no puede parchearlo (`Uncaught TypeError: i.A is not a
  constructor` en `%APPDATA%\discord\logs\renderer_js.log`).
- Solución: instala el `VencordPGP-Installer.zip` actual (payload 1.15.16 o
  superior) o recompila contra Vencord 1.15.16+ y vuelve a copiar `dist`.
- Si instalaste Vencord con su instalador oficial, actualiza/reinstala Vencord
  primero y después reinstala el payload del plugin.
- No es un problema de claves de VencordPGP: el plugin carga, pero el renderer se
  rompe antes de que Discord termine de arrancar.

## No salen los avisos, o un modal muestra `Function.prototype.apply was called on null`

- Vencord resuelve el módulo de toasts de Discord con un filtro de webpack. Una
  actualización de Discord puede cambiar ese módulo: el `showToast` de Vencord deja
  de resolverse y al llamarlo lanza `Function.prototype.apply was called on null,
  which is null and not a function`.
- El plugin ya no depende de eso: los avisos pasan a un recuadro propio del plugin
  (abajo a la izquierda, se quita solo, máximo 3 a la vez). Desbloquear una clave
  guardada, cancelar un envío y el resto de flujos siguen funcionando; ningún
  mensaje sale en claro porque falle un aviso.
- Si todavía ves ese texto de error dentro de un modal, el build instalado es
  antiguo: reinstala el payload o vuelve a compilar `dist`.
- Para recuperar el toast nativo de Discord, recompila contra un Vencord más nuevo
  (`npm run update:vencord`) cuando upstream actualice el filtro.

## El plugin aparece desactivado al reiniciar

- La clave privada no se persiste por diseño. El **plugin** sí queda activado en
  `settings.json`. Si Vencord se actualiza y reemplaza el build, vuelve a ejecutar
  `Instalar VencordPGP.cmd`.
- Si Discord estaba abierto mientras se activaba el plugin, el cliente puede
  haber sobrescrito `settings.json`: cierra Discord, vuelve a ejecutar el
  instalador o activa el toggle del plugin en la UI.

## Adjuntos, imágenes y stickers

No se cifran; solo el texto. El plugin muestra un aviso al enviarlos con el
cifrado activo.

## Menciones

No generan notificación: el servidor nunca ve el texto claro, así que no puede
procesar `<@id>`. Tras descifrar se ven como texto.

## Dos personas no se ven el texto

- Comprobad que cada uno tiene la **clave pública** del otro asociada a su **ID
  de Discord** (no al nombre) y verificada por un canal independiente.
- Si falta la clave de un destinatario, el envío se cancela (fail-closed); no se
  envía en claro.
- Los bots y los canales de servidor no se cifran.

## El estado del candado no cuadra

- Candado verde cerrado: cifrado activo en esa conversación.
- Candado amarillo con punto: cifrado activo pero faltan claves; los envíos se
  cancelan hasta añadirlas.
- Candado abierto: cifrado desactivado en esa conversación.

Si el toggle global está apagado, los mensajes salientes no se cifran, pero el
plugin puede seguir descifrando los entrantes en v1. Consulta la
[política de seguridad](Politica-de-seguridad) para esta limitación conocida.

---

**Relacionado:** [Inicio](Inicio) · [Gestion de claves](Gestion-de-claves) · [Instalacion](Instalacion)
