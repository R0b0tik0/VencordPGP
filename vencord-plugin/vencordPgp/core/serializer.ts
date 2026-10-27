/**
 * Serializacion versionada del contenido a cifrar.
 *
 * Principio: cifrar un objeto estructurado (JSON) con esquema y version,
 * NO texto libre ambiguo. Esto permite evolucionar (firmas, replies) sin
 * romper compatibilidad y validar tras descifrar.
 *
 * v1: { v: 1, body: string, sentAt: number }
 * - `body`: contenido original EXACTO del mensaje (Markdown, URLs, emojis,
 *   saltos de linea). No se transforma: el cliente Discord lo renderiza
 *   igual que un mensaje normal tras descifrar.
 * - `sentAt`: epoch ms del emisor (informativo; NO usar como anti-replay
 *   autoritativo; documentado en THREAT_MODEL).
 *
 * Reglas:
 * - Preservacion byte-exacta (salvo normalizacion \r\n -> \n? NO: se
 *   preserva verbatim para no alterar firmas; el test lo verifica).
 * - Validacion estricta tras descifrar + limite de tamano anti-DoS.
 * - Sin HTML arbitrario: el render lo hace Discord; nosotros devolvemos
 *   texto plano. Sanitizado de render = responsabilidad del accesorio UI.
 */
import { PgpError } from "./errors";

export const PAYLOAD_VERSION = 1;
/** Maximo cuerpo aceptado tras descifrar (anti-DoS memoria/render). */
export const MAX_BODY_CHARS = 5000;
/** Maximo cuerpo a cifrar (para no superar limite Discord tras armor). */
export const MAX_PLAINTEXT_CHARS = 3000;

export interface PgpPayload {
  v: 1;
  body: string;
  sentAt: number;
}

export function serializePayload(body: string, sentAt: number = Date.now()): string {
  if (typeof body !== "string") throw new PgpError("INVALID_PAYLOAD", "Cuerpo no textual.");
  if (body.length === 0) throw new PgpError("INVALID_PAYLOAD", "Mensaje vacio no se cifra.");
  if (body.length > MAX_PLAINTEXT_CHARS) {
    throw new PgpError(
      "PLAINTEXT_TOO_LARGE",
      `Mensaje de ${body.length} caracteres supera el maximo cifrable (${MAX_PLAINTEXT_CHARS}). Acortalo o envialo en claro fuera del modo cifrado.`,
      `${body.length} > ${MAX_PLAINTEXT_CHARS}`
    );
  }
  const payload: PgpPayload = { v: PAYLOAD_VERSION, body, sentAt };
  return JSON.stringify(payload);
}

export function deserializePayload(json: string): PgpPayload {
  if (typeof json !== "string" || json.length === 0) {
    throw new PgpError("INVALID_PAYLOAD", "Descifrado vacio.");
  }
  if (json.length > MAX_BODY_CHARS + 256) {
    throw new PgpError("PAYLOAD_TOO_LARGE", "Payload descifrado demasiado grande.");
  }
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new PgpError("INVALID_PAYLOAD", "JSON descifrado invalido (posible mensaje no-VPGP).");
  }
  if (typeof obj !== "object" || obj === null) throw new PgpError("INVALID_PAYLOAD", "Payload no objeto.");
  const rec = obj as Record<string, unknown>;
  if (rec.v !== PAYLOAD_VERSION) {
    throw new PgpError("VERSION_UNSUPPORTED", `Version de payload no soportada: ${String(rec.v)}`);
  }
  if (typeof rec.body !== "string") throw new PgpError("INVALID_PAYLOAD", "Campo body ausente.");
  if ((rec.body as string).length > MAX_BODY_CHARS) {
    throw new PgpError("PAYLOAD_TOO_LARGE", "Cuerpo descifrado excede el limite.");
  }
  if (typeof rec.sentAt !== "number" || !Number.isFinite(rec.sentAt)) {
    throw new PgpError("INVALID_PAYLOAD", "Campo sentAt invalido.");
  }
  return { v: 1, body: rec.body as string, sentAt: rec.sentAt as number };
}
