/**
 * Formato de transporte versionado y detectable sin descifrar.
 *
 * Wire format (v1):
 *   [VPGP:v1]\n
 *   -----BEGIN PGP MESSAGE-----\n...\n-----END PGP MESSAGE-----
 *
 * - Primera linea: marcador estable `[VPGP:v1]` (protocolo + version).
 * - Resto: bloque ASCII Armor OpenPGP estandar (una sola linea de version).
 * - Deteccion: `startsWith(marker)` + presencia de armor => no se intenta
 *   descifrar ningun mensaje normal.
 * - Nunca incluye claves privadas, passphrases ni secretos.
 *
 * Limites: Discord permite 2000 caracteres (4000 con Nitro). El cifrado
 * expande el texto (~33% base64 + cabeceras + sobre de sesion por
 * destinatario). v1 NO fragmenta: si el ciphertext supera el limite, el
 * envio se cancela (fail-closed). Ver docs/TRANSPORT.md.
 */
import { PgpError } from "./errors";

export const PROTOCOL_NAME = "VPGP";
export const PROTOCOL_VERSION = 1;
export const MARKER = `[${PROTOCOL_NAME}:v${PROTOCOL_VERSION}]`;
export const ARMOR_BEGIN = "-----BEGIN PGP MESSAGE-----";
export const ARMOR_END = "-----END PGP MESSAGE-----";

/** Limite de seguridad para el armor aceptado (evita DoS en memoria). */
export const MAX_TRANSPORT_CHARS = 8192;
/** Limite de envio Discord sin Nitro. */
export const DISCORD_LIMIT = 2000;
/** Limite Nitro (informativo; v1 usa DISCORD_LIMIT por defecto). */
export const DISCORD_LIMIT_NITRO = 4000;

export function isPgpTransport(content: unknown): boolean {
  if (typeof content !== "string") return false;
  const t = content.trimStart();
  return t.startsWith(MARKER) && t.includes(ARMOR_BEGIN);
}

/** Extrae el bloque armor tras validar marcador y estructura minima. */
export function extractArmor(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith(MARKER)) {
    throw new PgpError("NOT_PGP_MESSAGE", "No es un mensaje VPGP.");
  }
  if (trimmed.length > MAX_TRANSPORT_CHARS) {
    throw new PgpError("INVALID_TRANSPORT", "Transporte demasiado grande.", `${trimmed.length} chars`);
  }
  const rest = trimmed.slice(MARKER.length).trimStart();
  // Permitir un salto de linea opcional entre marcador y armor.
  if (!rest.startsWith(ARMOR_BEGIN) || !rest.includes(ARMOR_END)) {
    throw new PgpError("INVALID_TRANSPORT", "Bloque PGP ausente o truncado.");
  }
  const endIdx = rest.indexOf(ARMOR_END);
  if (endIdx === -1) throw new PgpError("INVALID_TRANSPORT", "Bloque PGP sin cierre.");
  const armor = rest.slice(0, endIdx + ARMOR_END.length).trim();
  // Defensa: el armor no debe contener un segundo marcador (mezcla de mensajes).
  const bodyAfterEnd = rest.slice(endIdx + ARMOR_END.length).trim();
  if (bodyAfterEnd.length > 0) {
    throw new PgpError("INVALID_TRANSPORT", "Contenido trailing tras el bloque PGP.");
  }
  return armor;
}

/** Envuelve armor OpenPGP en el marcador de transporte. */
export function wrapTransport(armored: string): string {
  const armor = armored.trim();
  if (!armor.startsWith(ARMOR_BEGIN) || !armor.includes(ARMOR_END)) {
    throw new PgpError("INVALID_TRANSPORT", "Armor OpenPGP invalido para transporte.");
  }
  const out = `${MARKER}\n${armor}`;
  if (out.length > MAX_TRANSPORT_CHARS) {
    throw new PgpError("CIPHERTEXT_TOO_LARGE", "Cifrado excede el maximo aceptado.");
  }
  return out;
}

/**
 * Distingue "parecido al marcador pero no valido" (falso positivo benigno)
 * de un transporte real. Usado en tests y en UI para no mostrar errores
 * agresivos ante texto normal que mencione el marcador.
 */
export function looksLikeMarkerButInvalid(content: string): boolean {
  if (typeof content !== "string") return false;
  const t = content.trimStart();
  if (!t.includes("VPGP")) return false;
  try {
    extractArmor(content);
    return false; // era valido
  } catch {
    return true;
  }
}
