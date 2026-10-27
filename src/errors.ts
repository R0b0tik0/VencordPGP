/**
 * Errores tipados del plugin. Nunca incluyen claves privadas ni texto en claro.
 * Solo transportan codigos y metadatos seguros para mostrar al usuario.
 */
export type PgpErrorCode =
  | "NOT_PGP_MESSAGE"
  | "INVALID_TRANSPORT"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "CIPHERTEXT_TOO_LARGE"
  | "PLAINTEXT_TOO_LARGE"
  | "MISSING_RECIPIENT_KEY"
  | "MISSING_PRIVATE_KEY"
  | "PRIVATE_KEY_LOCKED"
  | "WRONG_PASSPHRASE"
  | "DECRYPT_FAILED"
  | "ENCRYPT_FAILED"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_PRIVATE_KEY"
  | "KEY_EXPIRED"
  | "KEY_REVOKED"
  | "UNSUPPORTED_CHANNEL"
  | "INVALID_SIGNATURE"
  | "VERSION_UNSUPPORTED"
  | "VAULT_WRONG_PASSWORD"
  | "VAULT_INVALID"
  | "VAULT_UNAVAILABLE";

export class PgpError extends Error {
  readonly code: PgpErrorCode;
  /** Detalle seguro (sin secretos). */
  readonly detail?: string;

  constructor(code: PgpErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "PgpError";
    this.code = code;
    this.detail = detail;
  }
}

/** Mensajes visibles para el usuario (sin filtrar secretos). */
export const USER_FACING_ERRORS: Record<PgpErrorCode, string> = {
  NOT_PGP_MESSAGE: "No es un mensaje PGP del plugin.",
  INVALID_TRANSPORT: "Formato de transporte PGP no valido.",
  INVALID_PAYLOAD: "Contenido descifrado no valido.",
  PAYLOAD_TOO_LARGE: "Mensaje descifrado demasiado grande; rechazado por seguridad.",
  CIPHERTEXT_TOO_LARGE: "Mensaje cifrado supera el limite de Discord; envio cancelado.",
  PLAINTEXT_TOO_LARGE: "Mensaje demasiado largo para cifrar dentro del limite de Discord.",
  MISSING_RECIPIENT_KEY: "Falta la clave publica del destinatario; envio cancelado (fail-closed).",
  MISSING_PRIVATE_KEY: "No hay clave privada configurada.",
  PRIVATE_KEY_LOCKED: "Clave privada bloqueada; desbloqueala para continuar.",
  WRONG_PASSPHRASE: "Contrasena de la clave privada incorrecta.",
  DECRYPT_FAILED: "Mensaje PGP no descifrable con tu clave.",
  ENCRYPT_FAILED: "Fallo al cifrar el mensaje; envio cancelado (fail-closed).",
  INVALID_PUBLIC_KEY: "Clave publica invalida o malformada.",
  INVALID_PRIVATE_KEY: "Clave privada invalida o malformada.",
  KEY_EXPIRED: "La clave esta caducada.",
  KEY_REVOKED: "La clave esta revocada.",
  UNSUPPORTED_CHANNEL: "Canal no soportado: solo MD y grupos MD.",
  INVALID_SIGNATURE: "Firma invalida o no verificada: el remitente NO esta autenticado.",
  VERSION_UNSUPPORTED: "Version del protocolo no soportada.",
  VAULT_WRONG_PASSWORD: "Contrasena de almacenamiento incorrecta.",
  VAULT_INVALID: "Datos de clave guardada invalidos o corruptos.",
  VAULT_UNAVAILABLE: "WebCrypto no disponible: no se puede cifrar la clave privada.",
};
