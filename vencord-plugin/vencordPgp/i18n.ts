/*
 * i18n del plugin: textos de interfaz en español e inglés.
 *
 * - El idioma se elige con el ajuste `language` (auto | es | en).
 * - "auto" usa el idioma de Discord y cae a inglés si no es español.
 * - Los mensajes de error del core (PgpError) se traducen por CÓDIGO, para no
 *   duplicar textos en `core/` (que debe seguir siendo idéntico a `src/`).
 * - Sin dependencias de Vencord: el idioma de Discord se inyecta con
 *   `configureI18n()` desde index.tsx (que sí puede importar @webpack).
 */
import { PgpError, type PgpErrorCode } from "./core/errors";

export type Language = "es" | "en";
export type LanguageSetting = "auto" | "es" | "en";

const es = {
    "plugin.description": "Cifrado/descifrado PGP automático para MD y grupos. Fail-closed, firmas opcionales, sin keyservers.",

    "settings.language.desc": "Idioma de los textos del plugin (avisos, menús, modales y panel). Auto sigue el idioma de Discord y usa inglés si no es español.",
    "settings.language.auto": "Auto (idioma de Discord)",
    "settings.language.es": "Español",
    "settings.language.en": "English",
    "settings.pgpEnabled.desc": "Activar cifrado/descifrado PGP automático.",
    "settings.autoEncryptDMs.desc": "Cifrar automáticamente los MD cuando haya clave del destinatario. El candado de la barra de chat permite activar/desactivar por conversación.",
    "settings.channelOverrides.desc": "Cifrado PGP por conversación (gestionado por el candado de la barra de chat).",
    "settings.signMessages.desc": "Firmar mensajes salientes (recomendado; permite verificar identidad).",
    "settings.messageLimit.desc": "Límite de longitud del mensaje cifrado. Discord estándar: 2000. Nitro: 4000.",
    "settings.messageLimit.2000": "2000 (estándar)",
    "settings.messageLimit.4000": "4000 (Nitro)",
    "settings.publicKeysByUser.desc": "Almacén de claves públicas por userId (gestionado por PGP Key Manager).",

    "common.operationFailed": "Operación fallida.",
    "common.copyPublicKey": "Clave pública copiada",
    "common.copyFingerprint": "Huella copiada",
    "common.unnamed": "sin nombre",
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.saving": "Guardando...",
    "common.loading": "Cargando...",
    "common.delete": "Eliminar",
    "common.export": "Exportar",
    "common.copyFingerprintButton": "Copiar huella",
    "common.copyOwnPublicKey": "Copiar mi clave pública",
    "common.openManager": "Abrir PGP Key Manager",
    "common.markVerified": "Marcar verificada",
    "common.unmarkVerified": "Desmarcar",
    "common.status.verified": "verificada",
    "common.status.unverified": "NO verificada",
    "common.status.revoked": "REVOCADA",
    "common.status.expired": "CADUCADA",

    "toast.unverifiedRecipients": "PGP: cifrando también para una clave NO verificada de {users}. Verifica la huella antes de confiar.",
    "toast.sendFailed": "PGP: {error} Envío cancelado; tu borrador se conserva.",
    "toast.cryptoFailed": "Fallo criptográfico.",
    "toast.gifWithTextSend": "PGP: un GIF/sticker con texto no se puede cifrar. Envío cancelado; quita el texto o desactiva el cifrado en esta conversación.",
    "toast.gifWithTextEdit": "PGP: un GIF con texto no se puede cifrar. Edición cancelada; quita el texto o desactiva el cifrado en esta conversación.",
    "toast.attachments": "PGP: los adjuntos NO se cifran. Solo el texto de este mensaje está protegido.",
    "toast.botGroupSend": "PGP: este grupo incluye un bot; el mensaje se enviaría SIN cifrar. Envío cancelado. Quita el bot o desactiva el cifrado en esta conversación.",
    "toast.botGroupEdit": "PGP: este grupo incluye un bot; el mensaje se enviaría SIN cifrar. Edición cancelada. Quita el bot o desactiva el cifrado en esta conversación.",
    "toast.notDecryptedEdit": "PGP: este mensaje no está descifrado; no se puede editar.",
    "toast.editorUnavailable": "PGP: el editor de Discord no está disponible.",
    "toast.notDecryptedUseMenu": "PGP: este mensaje no se ha descifrado; usa el menú del mensaje > Editar mensaje PGP.",
    "toast.newKeyKnownUser": "PGP: nueva clave para un usuario conocido; verifica la huella.",
    "toast.globallyDisabled": "PGP: está desactivado globalmente. Actívalo en Ajustes > Vencord > Plugins > VencordPGP.",
    "toast.botNoEncrypt": "PGP: los mensajes con bots no se cifran.",
    "toast.encryptionOffChannel": "PGP: cifrado desactivado en esta conversación.",
    "toast.botGroupCannotEncrypt": "PGP: no se puede cifrar un grupo con bots. Quita el bot o deja el cifrado desactivado.",
    "toast.encryptionOnMissing": "PGP: cifrado activado, pero faltan claves para {users}.",
    "toast.encryptionOn": "PGP: cifrado activado en esta conversación.",
    "toast.noStoredKey": "PGP: no hay ninguna clave privada guardada en este equipo.",
    "toast.keyLocked": "PGP: clave privada bloqueada.",
    "toast.keyUnlocked": "PGP: clave desbloqueada.",
    "toast.keyLoadedUnlocked": "PGP: clave cargada y desbloqueada.",
    "toast.storedKeyDeleted": "PGP: clave guardada eliminada.",
    "toast.privateKeySaved": "PGP: clave privada guardada cifrada en este equipo.",
    "toast.noRecipients": "PGP: esta conversación no tiene destinatarios.",

    "popover.editPgpMessage": "Editar mensaje PGP",

    "panel.warning": "La clave privada permanece <b>solo en memoria</b> por defecto. Opcionalmente puedes guardarla <b>cifrada en este equipo</b> (sección «Clave guardada») para no pegarla en cada inicio. Nunca se escribe en ajustes ni se sincroniza con la nube.",
    "panel.privateKeyHeading": "Clave privada",
    "panel.stateLine": "Estado: <b>{state}</b>.",
    "panel.state.loadedUnlocked": "cargada y desbloqueada",
    "panel.state.loadedLocked": "cargada y bloqueada",
    "panel.state.notLoaded": "sin cargar",
    "panel.stateNote": "La clave no se muestra aquí por seguridad: vive en memoria (o en el almacén cifrado).",
    "panel.replaceKey": "Reemplazar clave privada",
    "panel.passphrasePlaceholder": "Passphrase de la clave (déjala vacía si no tiene)",
    "panel.unlock": "Desbloquear",
    "panel.reunlock": "Re-desbloquear",
    "panel.lockKey": "Bloquear clave",
    "panel.wipe": "Borrar todo",
    "panel.storedHeading": "Clave guardada (cifrada con contraseña)",
    "panel.storedNote": "Guarda tu clave privada cifrada con una contraseña de almacenamiento para no tener que pegarla en cada inicio. Se guarda <b>solo en este equipo</b> (almacén local de Vencord), nunca en ajustes ni en la nube. La contraseña de almacenamiento <b>no se guarda</b>: la introduces al cargarla.",
    "panel.storedExists": "Hay una clave guardada en este equipo.",
    "panel.storagePasswordPlaceholder": "Contraseña de almacenamiento (mín. 8 caracteres)",
    "panel.includePassphrase": "Guardar también la passphrase de la clave (más cómodo; queda protegida por esta contraseña)",
    "panel.saveEncrypted": "Guardar cifrada",
    "panel.loadAndUnlock": "Cargar y desbloquear",
    "panel.deleteStored": "Borrar guardada",
    "panel.publicKeysHeading": "Claves públicas por usuario",
    "panel.publicKeysNoteId": "Usa el <b>ID de Discord</b> (clic derecho → Copiar ID), no el nombre. El nombre es solo informativo. Verifica la huella por un canal independiente antes de marcarla como verificada.",
    "panel.publicKeysNoteShortcut": "Atajo: en un MD, <b>clic derecho</b> en el candado de la barra de chat asigna la clave del destinatario; <b>clic izquierdo</b> activa/desactiva el cifrado en esa conversación.",
    "panel.userIdPlaceholder": "User ID (snowflake, solo dígitos)",
    "panel.nickPlaceholder": "Nombre visible (informativo)",
    "panel.addOrReplace": "Añadir / sustituir",
    "panel.noKeys": "Aún no hay claves públicas asignadas.",
    "panel.msg.vaultNeedsKey": "Carga o pega primero tu clave privada.",
    "panel.msg.saved": "Clave privada guardada cifrada en este equipo (almacén local).",
    "panel.msg.loaded": "Clave cargada y desbloqueada desde el almacén cifrado.",
    "panel.msg.deleted": "Clave guardada eliminada de este equipo.",
    "panel.msg.unlockedFp": "Clave desbloqueada: {fp}",
    "panel.msg.locked": "Clave bloqueada; caché y texto descifrado purgados.",
    "panel.msg.wiped": "Claves y datos temporales borrados.",
    "panel.msg.newKeyWarn": "ADVERTENCIA: nueva clave para {user}. Si no la esperabas, verifica la huella por otro canal antes de marcarla como verificada.",
    "panel.msg.imported": "Clave importada: {fp}",

    "assign.title": "Claves PGP del MD",
    "assign.subtitle": "Asigna la clave pública de cada destinatario. Nunca se comparte tu clave privada.",
    "assign.save": "Guardar clave",
    "assign.recipient": "Destinatario",
    "assign.keyOk": "clave OK",
    "assign.noKey": "sin clave",
    "assign.userLabel": "Usuario:",
    "assign.noPublicKeyWarn": "Sin clave pública para este usuario. Los mensajes cifrados no se podrán enviar hasta que la añadas.",
    "assign.addOrReplaceHeading": "Añadir / sustituir clave pública",
    "assign.footerNote": "Compara la huella por voz o en persona antes de marcarla como verificada. El cifrado no autentica por sí solo al remitente.",
    "assign.newKeyWarn": "ADVERTENCIA: clave nueva para {name}. Verifica la huella ({fp}) por otro canal antes de marcarla como verificada.",
    "assign.saved": "Clave guardada: {fp}",
    "assign.unlockToCopy": "Desbloquea tu clave privada para copiar tu clave pública.",

    "save.title": "Guardar clave privada cifrada",
    "save.subtitle": "Se guarda solo en este equipo, cifrada con una contraseña que eliges. La contraseña no se guarda.",
    "save.confirm": "Guardar cifrada",
    "save.needsKey": "Carga primero tu clave privada en PGP Key Manager.",
    "save.tooShort": "La contraseña de almacenamiento debe tener al menos 8 caracteres.",
    "save.mismatch": "Las contraseñas no coinciden.",
    "save.failed": "No se pudo guardar la clave privada.",
    "save.noKeyWarn": "No hay clave privada cargada. Pega tu clave en PGP Key Manager y vuelve a abrir este menú.",
    "save.passwordPlaceholder": "Contraseña de almacenamiento (mín. 8 caracteres)",
    "save.repeatPlaceholder": "Repite la contraseña",
    "save.includePassphrase": "Guardar también la passphrase de la clave (si está en memoria)",
    "save.note": "Cifrado PBKDF2-SHA256 + AES-256-GCM. Se guarda en el almacén local de Vencord (IndexedDB), nunca en ajustes ni en la nube. Si olvidas la contraseña, podrás volver a pegar tu clave privada.",

    "stored.title": "Clave PGP guardada",
    "stored.subtitle": "Introduce la contraseña de almacenamiento para cargar y desbloquear tu clave privada.",
    "stored.notNow": "Ahora no",
    "stored.load": "Cargar y desbloquear",
    "stored.passwordPlaceholder": "Contraseña de almacenamiento",
    "stored.passphrasePlaceholder": "Passphrase de la clave (si no se guardó)",
    "stored.note": "La contraseña de almacenamiento no se guarda en ningún sitio. Si la olvidas, puedes volver a pegar tu clave privada en el PGP Key Manager.",
    "stored.delete": "Borrar clave guardada",
    "stored.needsPassphrase": "Esta clave necesita su passphrase: escríbela arriba y pulsa de nuevo.",

    "lock.tooltip.globallyOff": "PGP desactivado globalmente. Actívalo en Ajustes > Vencord > Plugins > VencordPGP.",
    "lock.tooltip.botOnly": "Bot ({names}): los mensajes con bots no se cifran.",
    "lock.tooltip.hasBot": "PGP activo, pero la conversación incluye un bot: el envío cifrado se cancela.",
    "lock.tooltip.missing": "PGP activo pero faltan claves para {names}. Clic: desactivar. Clic derecho: menú.",
    "lock.tooltip.on": "PGP cifrado activo ({names}). Clic: desactivar. Clic derecho: menú.",
    "lock.tooltip.off": "PGP desactivado ({names}). Clic: activar. Clic derecho: menú.",
    "lock.menu.recipientKeys": "Clave pública del destinatario...",
    "lock.menu.saveVault": "Guardar mi clave privada cifrada...",
    "lock.menu.loadVault": "Cargar clave privada guardada...",
    "lock.menu.lockKey": "Bloquear clave privada",

    "msg.noSignature": " · sin firma",
    "msg.signedVerified": " · ✓ firmado verificado",
    "msg.badSignature": " · ⚠ FIRMA INVÁLIDA",
    "msg.signedUnverified": " · firmado (sin verificar)",
    "msg.lockedBadge": "🔒 PGP bloqueado · clic para desbloquear",
    "msg.undecryptable": "🔒 Mensaje PGP no descifrable",
    "msg.decrypting": "🔒 Descifrando PGP…",
    "msg.cipherBadge": "🔒 texto cifrado",
    "msg.showPlain": "ver descifrado",
    "msg.showCipher": "ver cifrado",

    "err.NOT_PGP_MESSAGE": "No es un mensaje PGP del plugin.",
    "err.INVALID_TRANSPORT": "Formato de transporte PGP no válido.",
    "err.INVALID_PAYLOAD": "Contenido descifrado no válido.",
    "err.PAYLOAD_TOO_LARGE": "Mensaje descifrado demasiado grande; rechazado por seguridad.",
    "err.CIPHERTEXT_TOO_LARGE": "Mensaje cifrado supera el límite de Discord; envío cancelado.",
    "err.PLAINTEXT_TOO_LARGE": "Mensaje demasiado largo para cifrar dentro del límite de Discord.",
    "err.MISSING_RECIPIENT_KEY": "Falta la clave pública del destinatario; envío cancelado (fail-closed).",
    "err.MISSING_PRIVATE_KEY": "No hay clave privada configurada. Cárgala en PGP Key Manager o guárdala cifrada.",
    "err.PRIVATE_KEY_LOCKED": "Clave privada bloqueada; desbloquéala para continuar.",
    "err.WRONG_PASSPHRASE": "Contraseña de la clave privada incorrecta.",
    "err.DECRYPT_FAILED": "Mensaje PGP no descifrable con tu clave.",
    "err.ENCRYPT_FAILED": "Fallo al cifrar el mensaje; envío cancelado (fail-closed).",
    "err.INVALID_PUBLIC_KEY": "Clave pública inválida o malformada.",
    "err.INVALID_PRIVATE_KEY": "Clave privada inválida o malformada.",
    "err.KEY_EXPIRED": "La clave está caducada.",
    "err.KEY_REVOKED": "La clave está revocada.",
    "err.UNSUPPORTED_CHANNEL": "Canal no soportado: solo MD y grupos MD.",
    "err.INVALID_SIGNATURE": "Firma inválida o no verificada: el remitente NO está autenticado.",
    "err.VERSION_UNSUPPORTED": "Versión del protocolo no soportada.",
    "err.VAULT_WRONG_PASSWORD": "Contraseña de almacenamiento incorrecta.",
    "err.VAULT_INVALID": "Datos de clave guardada inválidos o corruptos.",
    "err.VAULT_UNAVAILABLE": "WebCrypto no disponible: no se puede cifrar la clave privada.",
} as const;

export type TranslationKey = keyof typeof es;

const en: Record<TranslationKey, string> = {
    "plugin.description": "Automatic PGP encryption/decryption for DMs and group DMs. Fail-closed, optional signatures, no keyservers.",

    "settings.language.desc": "Language of the plugin text (toasts, menus, modals and panel). Auto follows Discord's language and falls back to English when it is not Spanish.",
    "settings.language.auto": "Auto (Discord language)",
    "settings.language.es": "Spanish",
    "settings.language.en": "English",
    "settings.pgpEnabled.desc": "Enable automatic PGP encryption/decryption.",
    "settings.autoEncryptDMs.desc": "Automatically encrypt DMs when the recipient's key is available. The chat bar lock toggles this per conversation.",
    "settings.channelOverrides.desc": "Per-conversation PGP encryption (managed by the chat bar lock).",
    "settings.signMessages.desc": "Sign outgoing messages (recommended; allows identity verification).",
    "settings.messageLimit.desc": "Length limit for the encrypted message. Discord standard: 2000. Nitro: 4000.",
    "settings.messageLimit.2000": "2000 (standard)",
    "settings.messageLimit.4000": "4000 (Nitro)",
    "settings.publicKeysByUser.desc": "Public key store per userId (managed by the PGP Key Manager).",

    "common.operationFailed": "Operation failed.",
    "common.copyPublicKey": "Public key copied",
    "common.copyFingerprint": "Fingerprint copied",
    "common.unnamed": "unnamed",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.saving": "Saving...",
    "common.loading": "Loading...",
    "common.delete": "Delete",
    "common.export": "Export",
    "common.copyFingerprintButton": "Copy fingerprint",
    "common.copyOwnPublicKey": "Copy my public key",
    "common.openManager": "Open PGP Key Manager",
    "common.markVerified": "Mark verified",
    "common.unmarkVerified": "Unmark",
    "common.status.verified": "verified",
    "common.status.unverified": "NOT verified",
    "common.status.revoked": "REVOKED",
    "common.status.expired": "EXPIRED",

    "toast.unverifiedRecipients": "PGP: also encrypting to an UNVERIFIED key for {users}. Verify the fingerprint before trusting it.",
    "toast.sendFailed": "PGP: {error} Send cancelled; your draft is preserved.",
    "toast.cryptoFailed": "Cryptographic failure.",
    "toast.gifWithTextSend": "PGP: a GIF/sticker with text cannot be encrypted. Send cancelled; remove the text or turn encryption off in this conversation.",
    "toast.gifWithTextEdit": "PGP: a GIF with text cannot be encrypted. Edit cancelled; remove the text or turn encryption off in this conversation.",
    "toast.attachments": "PGP: attachments are NOT encrypted. Only the text of this message is protected.",
    "toast.botGroupSend": "PGP: this group includes a bot; the message would be sent UNENCRYPTED. Send cancelled. Remove the bot or turn encryption off in this conversation.",
    "toast.botGroupEdit": "PGP: this group includes a bot; the message would be sent UNENCRYPTED. Edit cancelled. Remove the bot or turn encryption off in this conversation.",
    "toast.notDecryptedEdit": "PGP: this message is not decrypted; it cannot be edited.",
    "toast.editorUnavailable": "PGP: the Discord editor is not available.",
    "toast.notDecryptedUseMenu": "PGP: this message has not been decrypted; use the message menu > Edit PGP message.",
    "toast.newKeyKnownUser": "PGP: new key for a known user; verify the fingerprint.",
    "toast.globallyDisabled": "PGP: it is globally disabled. Enable it in Settings > Vencord > Plugins > VencordPGP.",
    "toast.botNoEncrypt": "PGP: messages with bots are not encrypted.",
    "toast.encryptionOffChannel": "PGP: encryption disabled in this conversation.",
    "toast.botGroupCannotEncrypt": "PGP: a group with bots cannot be encrypted. Remove the bot or leave encryption off.",
    "toast.encryptionOnMissing": "PGP: encryption enabled, but keys are missing for {users}.",
    "toast.encryptionOn": "PGP: encryption enabled in this conversation.",
    "toast.noStoredKey": "PGP: there is no saved private key on this device.",
    "toast.keyLocked": "PGP: private key locked.",
    "toast.keyUnlocked": "PGP: key unlocked.",
    "toast.keyLoadedUnlocked": "PGP: key loaded and unlocked.",
    "toast.storedKeyDeleted": "PGP: saved key deleted.",
    "toast.privateKeySaved": "PGP: private key saved encrypted on this device.",
    "toast.noRecipients": "PGP: this conversation has no recipients.",

    "popover.editPgpMessage": "Edit PGP message",

    "panel.warning": "The private key stays <b>in memory only</b> by default. You can optionally save it <b>encrypted on this device</b> (\"Saved key\" section) so you do not have to paste it on every start. It is never written to settings and never synced to the cloud.",
    "panel.privateKeyHeading": "Private key",
    "panel.stateLine": "Status: <b>{state}</b>.",
    "panel.state.loadedUnlocked": "loaded and unlocked",
    "panel.state.loadedLocked": "loaded and locked",
    "panel.state.notLoaded": "not loaded",
    "panel.stateNote": "The key is not shown here for security: it lives in memory (or in the encrypted vault).",
    "panel.replaceKey": "Replace private key",
    "panel.passphrasePlaceholder": "Key passphrase (leave empty if none)",
    "panel.unlock": "Unlock",
    "panel.reunlock": "Unlock again",
    "panel.lockKey": "Lock key",
    "panel.wipe": "Erase everything",
    "panel.storedHeading": "Saved key (password-encrypted)",
    "panel.storedNote": "Save your private key encrypted with a storage password so you do not have to paste it on every start. It is stored <b>on this device only</b> (Vencord local store), never in settings or in the cloud. The storage password is <b>not saved</b>: you enter it when loading.",
    "panel.storedExists": "There is a saved key on this device.",
    "panel.storagePasswordPlaceholder": "Storage password (min. 8 characters)",
    "panel.includePassphrase": "Also save the key passphrase (more convenient; protected by this password)",
    "panel.saveEncrypted": "Save encrypted",
    "panel.loadAndUnlock": "Load and unlock",
    "panel.deleteStored": "Delete saved",
    "panel.publicKeysHeading": "Public keys per user",
    "panel.publicKeysNoteId": "Use the <b>Discord ID</b> (right click → Copy ID), not the name. The name is informational only. Verify the fingerprint over an independent channel before marking it verified.",
    "panel.publicKeysNoteShortcut": "Shortcut: in a DM, <b>right click</b> the chat bar lock to assign the recipient's key; <b>left click</b> turns encryption on/off in that conversation.",
    "panel.userIdPlaceholder": "User ID (snowflake, digits only)",
    "panel.nickPlaceholder": "Display name (informational)",
    "panel.addOrReplace": "Add / replace",
    "panel.noKeys": "No public keys assigned yet.",
    "panel.msg.vaultNeedsKey": "Load or paste your private key first.",
    "panel.msg.saved": "Private key saved encrypted on this device (local store).",
    "panel.msg.loaded": "Key loaded and unlocked from the encrypted vault.",
    "panel.msg.deleted": "Saved key deleted from this device.",
    "panel.msg.unlockedFp": "Key unlocked: {fp}",
    "panel.msg.locked": "Key locked; cache and decrypted text purged.",
    "panel.msg.wiped": "Keys and temporary data erased.",
    "panel.msg.newKeyWarn": "WARNING: new key for {user}. If you did not expect it, verify the fingerprint over another channel before marking it verified.",
    "panel.msg.imported": "Key imported: {fp}",

    "assign.title": "PGP keys for this DM",
    "assign.subtitle": "Assign each recipient's public key. Your private key is never shared.",
    "assign.save": "Save key",
    "assign.recipient": "Recipient",
    "assign.keyOk": "key OK",
    "assign.noKey": "no key",
    "assign.userLabel": "User:",
    "assign.noPublicKeyWarn": "No public key for this user. Encrypted messages cannot be sent until you add one.",
    "assign.addOrReplaceHeading": "Add / replace public key",
    "assign.footerNote": "Compare the fingerprint by voice or in person before marking it verified. Encryption alone does not authenticate the sender.",
    "assign.newKeyWarn": "WARNING: new key for {name}. Verify the fingerprint ({fp}) over another channel before marking it verified.",
    "assign.saved": "Key saved: {fp}",
    "assign.unlockToCopy": "Unlock your private key to copy your public key.",

    "save.title": "Save encrypted private key",
    "save.subtitle": "Stored on this device only, encrypted with a password you choose. The password is not saved.",
    "save.confirm": "Save encrypted",
    "save.needsKey": "Load your private key in the PGP Key Manager first.",
    "save.tooShort": "The storage password must be at least 8 characters long.",
    "save.mismatch": "The passwords do not match.",
    "save.failed": "Could not save the private key.",
    "save.noKeyWarn": "No private key loaded. Paste your key in the PGP Key Manager and open this menu again.",
    "save.passwordPlaceholder": "Storage password (min. 8 characters)",
    "save.repeatPlaceholder": "Repeat the password",
    "save.includePassphrase": "Also save the key passphrase (if it is in memory)",
    "save.note": "PBKDF2-SHA256 + AES-256-GCM. Stored in Vencord's local store (IndexedDB), never in settings or in the cloud. If you forget the password, you can paste your private key again.",

    "stored.title": "Saved PGP key",
    "stored.subtitle": "Enter the storage password to load and unlock your private key.",
    "stored.notNow": "Not now",
    "stored.load": "Load and unlock",
    "stored.passwordPlaceholder": "Storage password",
    "stored.passphrasePlaceholder": "Key passphrase (if it was not saved)",
    "stored.note": "The storage password is not stored anywhere. If you forget it, you can paste your private key again in the PGP Key Manager.",
    "stored.delete": "Delete saved key",
    "stored.needsPassphrase": "This key needs its passphrase: type it above and press again.",

    "lock.tooltip.globallyOff": "PGP is globally disabled. Enable it in Settings > Vencord > Plugins > VencordPGP.",
    "lock.tooltip.botOnly": "Bot ({names}): messages with bots are not encrypted.",
    "lock.tooltip.hasBot": "PGP is on, but this conversation includes a bot: encrypted sending is cancelled.",
    "lock.tooltip.missing": "PGP is on but keys are missing for {names}. Click: disable. Right click: menu.",
    "lock.tooltip.on": "PGP encryption on ({names}). Click: disable. Right click: menu.",
    "lock.tooltip.off": "PGP off ({names}). Click: enable. Right click: menu.",
    "lock.menu.recipientKeys": "Recipient's public key...",
    "lock.menu.saveVault": "Save my private key encrypted...",
    "lock.menu.loadVault": "Load saved private key...",
    "lock.menu.lockKey": "Lock private key",

    "msg.noSignature": " · unsigned",
    "msg.signedVerified": " · ✓ verified signature",
    "msg.badSignature": " · ⚠ INVALID SIGNATURE",
    "msg.signedUnverified": " · signed (unverified)",
    "msg.lockedBadge": "🔒 PGP locked · click to unlock",
    "msg.undecryptable": "🔒 PGP message cannot be decrypted",
    "msg.decrypting": "🔒 Decrypting PGP…",
    "msg.cipherBadge": "🔒 encrypted text",
    "msg.showPlain": "show decrypted",
    "msg.showCipher": "show encrypted",

    "err.NOT_PGP_MESSAGE": "Not a plugin PGP message.",
    "err.INVALID_TRANSPORT": "Invalid PGP transport format.",
    "err.INVALID_PAYLOAD": "Invalid decrypted content.",
    "err.PAYLOAD_TOO_LARGE": "Decrypted message too large; rejected for safety.",
    "err.CIPHERTEXT_TOO_LARGE": "Encrypted message exceeds the Discord limit; send cancelled.",
    "err.PLAINTEXT_TOO_LARGE": "Message too long to encrypt within the Discord limit.",
    "err.MISSING_RECIPIENT_KEY": "The recipient's public key is missing; send cancelled (fail-closed).",
    "err.MISSING_PRIVATE_KEY": "No private key configured. Load it in the PGP Key Manager or save it encrypted.",
    "err.PRIVATE_KEY_LOCKED": "Private key locked; unlock it to continue.",
    "err.WRONG_PASSPHRASE": "Wrong private key passphrase.",
    "err.DECRYPT_FAILED": "PGP message cannot be decrypted with your key.",
    "err.ENCRYPT_FAILED": "Failed to encrypt the message; send cancelled (fail-closed).",
    "err.INVALID_PUBLIC_KEY": "Invalid or malformed public key.",
    "err.INVALID_PRIVATE_KEY": "Invalid or malformed private key.",
    "err.KEY_EXPIRED": "The key has expired.",
    "err.KEY_REVOKED": "The key has been revoked.",
    "err.UNSUPPORTED_CHANNEL": "Unsupported channel: DMs and group DMs only.",
    "err.INVALID_SIGNATURE": "Invalid or unverified signature: the sender is NOT authenticated.",
    "err.VERSION_UNSUPPORTED": "Unsupported protocol version.",
    "err.VAULT_WRONG_PASSWORD": "Wrong storage password.",
    "err.VAULT_INVALID": "Saved key data is invalid or corrupt.",
    "err.VAULT_UNAVAILABLE": "WebCrypto is not available: the private key cannot be encrypted.",
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { es, en };

/** Normaliza un locale tipo "es-ES", "en-US", "pt-BR"... a un idioma soportado. */
export function normalizeLanguage(locale: string | null | undefined): Language {
    const tag = (locale ?? "").trim().toLowerCase();
    return tag.startsWith("es") ? "es" : "en";
}

let getSetting: () => LanguageSetting = () => "auto";
let getDiscordLocale: () => string = () => (
    typeof navigator !== "undefined" ? navigator.language : "en"
);

/** Inyecta la fuente del ajuste y del locale de Discord (llamado desde index.tsx). */
export function configureI18n(options: {
    getSetting?: () => LanguageSetting;
    getDiscordLocale?: () => string;
}): void {
    if (options.getSetting) getSetting = options.getSetting;
    if (options.getDiscordLocale) getDiscordLocale = options.getDiscordLocale;
}

export function currentLanguage(): Language {
    let setting: LanguageSetting = "auto";
    try {
        setting = getSetting() ?? "auto";
    } catch { /* ajustes aun no inicializados */ }
    if (setting === "es" || setting === "en") return setting;
    try {
        return normalizeLanguage(getDiscordLocale());
    } catch {
        return "en";
    }
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
}

/** Traduce una clave del catálogo. Si faltase, devuelve la clave (nunca rompe el render). */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    const dict = dictionaries[currentLanguage()] ?? en;
    const text = dict[key] ?? es[key];
    return interpolate(text ?? key, vars);
}

/** Texto localizado de un código de error del core. */
export function errorTextByCode(code: PgpErrorCode): string {
    return t(`err.${code}` as TranslationKey);
}

/** Mensaje legible para cualquier error: los PgpError se traducen por código. */
export function errorText(e: unknown): string {
    if (e instanceof PgpError) return errorTextByCode(e.code);
    if (e instanceof Error && e.message) return e.message;
    return t("common.operationFailed");
}
