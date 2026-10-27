/**
 * Logica de recepcion (pura + cache): decide, descifra una vez, cachea.
 *
 * - Solo actua ante `isPgpTransport(content)` (deteccion barata, sin
 *   intentar descifrar todo el canal).
 * - Conserva el original intacto: devuelve el body sin mutar el mensaje.
 * - Cache por messageId+editStamp; `invalidateOnEvent` para MESSAGE_UPDATE.
 * - Errores => indicador discreto, nunca el ciphertext como "verificado".
 */
import { decryptTransportToBody, type OpenPgpPrivateKey } from "./crypto.js";
import { isPgpTransport } from "./transport.js";
import { DecryptCache } from "./cache.js";

export interface IncomingView {
  kind: "plain" | "decrypted" | "error" | "locked";
  body?: string;
  error?: string;
  signed?: boolean;
  signatureValid?: boolean | null;
  fromCache?: boolean;
}

export async function viewIncomingMessage(args: {
  messageId: string;
  content: string;
  editStamp?: string | number | null;
  unlocked: OpenPgpPrivateKey | null;
  verificationArmors: string[];
  cache: DecryptCache;
}): Promise<IncomingView> {
  const { messageId, content, editStamp = null, unlocked, verificationArmors, cache } = args;
  if (!isPgpTransport(content)) return { kind: "plain" };
  const cached = cache.get(messageId, editStamp);
  if (cached?.body !== undefined) {
    return {
      kind: "decrypted",
      body: cached.body,
      signed: cached.signed,
      signatureValid: cached.signatureValid,
      fromCache: true,
    };
  }
  if (cached?.error !== undefined) return { kind: "error", error: cached.error, fromCache: true };
  if (!unlocked) {
    return { kind: "locked", error: "Mensaje PGP no descifrable (clave bloqueada)." };
  }
  try {
    const r = await decryptTransportToBody({
      transportText: content,
      privateKey: unlocked,
      verificationKeysArmored: verificationArmors,
    });
    cache.setOk(
      messageId,
      r.body,
      { signed: r.signed, signatureValid: r.signatureValid },
      editStamp
    );
    return { kind: "decrypted", body: r.body, signed: r.signed, signatureValid: r.signatureValid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de descifrado.";
    // No cachear errores de "clave bloqueada" como permanentes; el resto si (evita reintentos).
    cache.setErr(messageId, msg, editStamp);
    return { kind: "error", error: msg };
  }
}
