/**
 * Logica de envio (pura, sin imports Vencord): decidible y testeable.
 *
 * Fail-closed: cualquier fallo criptografico o falta de claves => lanzar
 * PgpError y NO enviar en claro. El adaptador convierte el throw en
 * `{ cancel: true }` + conserva el borrador (no muta si no hay ciphertext
 * valido) + toast local.
 */
import { resolveRecipients, type ChannelLike } from "./channelPolicy";
import { encryptBodyForRecipients, type OpenPgpPrivateKey } from "./crypto";
import { PgpError } from "./errors";
import { isPgpTransport } from "./transport";
import type { KeyStore } from "./keyStore";

export interface OutgoingPlan {
  /** true si debe cifrarse (canal soportado + auto-encrypt activo). */
  shouldEncrypt: boolean;
  /** Motivo cuando no se cifra (para logs/UI, sin secretos). */
  reason?: string;
  recipients?: string[];
}

/** Determina si un canal/mensaje debe cifrarse. No toca claves. */
export function planOutgoing(
  channel: ChannelLike,
  content: string,
  opts: { enabled: boolean; encryptGuilds?: boolean; selfId: string }
): OutgoingPlan {
  if (!opts.enabled) return { shouldEncrypt: false, reason: "plugin desactivado" };
  if (typeof content !== "string" || content.trim().length === 0) {
    return { shouldEncrypt: false, reason: "vacio" };
  }
  if (isPgpTransport(content)) return { shouldEncrypt: false, reason: "ya es VPGP (evita doble cifrado)" };
  if (channel.type !== 1 && channel.type !== 3) {
    return { shouldEncrypt: false, reason: `canal type ${channel.type} no soportado` };
  }
  try {
    const recipients = resolveRecipients(channel, opts.selfId);
    return { shouldEncrypt: true, recipients };
  } catch (e) {
    return { shouldEncrypt: false, reason: e instanceof PgpError ? e.message : "sin destinatarios" };
  }
}

export interface EncryptOutgoingArgs {
  channel: ChannelLike;
  content: string;
  selfId: string;
  keyStore: KeyStore;
  ownPublicArmor: string | null;
  signingKey: OpenPgpPrivateKey | null;
  maxTransportChars?: number;
}

/**
 * Cifra el contenido. Lanza PgpError si falta alguna clave (fail-closed).
 * El llamador NO debe enviar el original en claro ante throw.
 */
export async function encryptOutgoing(args: EncryptOutgoingArgs): Promise<string> {
  const { channel, content, selfId, keyStore, ownPublicArmor, signingKey, maxTransportChars } = args;
  const recipients = resolveRecipients(channel, selfId);
  const recipientArmors: string[] = [];
  const missing: string[] = [];
  for (const id of recipients) {
    const armors = keyStore.getEncryptionArmors(id);
    if (armors.length === 0) missing.push(id);
    else recipientArmors.push(...armors);
  }
  if (missing.length > 0) {
    throw new PgpError(
      "MISSING_RECIPIENT_KEY",
      `Faltan claves publicas para: ${missing.join(", ")}. Envio cancelado.`,
      missing.join(",")
    );
  }
  return encryptBodyForRecipients({
    plaintextBody: content,
    recipientPublicKeysArmored: recipientArmors,
    ownPublicKeyArmored: ownPublicArmor,
    signingPrivateKey: signingKey,
    maxTransportChars,
  });
}
