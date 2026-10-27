/**
 * Politica de canales/destinatarios.
 *
 * Soportado v1: DM (type 1) y GROUP_DM (type 3) — los unicos donde los
 * participantes son enumerables y el cifrado multi-destinatario tiene
 * sentido sin key-distribution de servidor.
 *
 * NO soportado v1: canales de guild/texto/voz/hilos/anuncios. Motivo:
 * sin pertenencia criptografica al canal, cifrar para "todos los miembros"
 * es inviable y simular proteccion seria enganoso. El plugin NUNCA cifra
 * en esos canales y lo indica en UI/docs.
 *
 * Menciones: el contenido cifrado no contiene `<@id>` en claro, luego
 * Discord NO genera notificaciones. Para no provocar pings involuntarios
 * ni fugas de metadatos, el adaptador debe enviar con allowedMentions
 * vacias cuando cifra. Documentado en LIMITATIONS.
 */
import { PgpError } from "./errors.js";

export const DM_TYPE = 1;
export const GROUP_DM_TYPE = 3;

export interface ChannelLike {
  id: string;
  type: number;
  /** IDs de participantes (DM: [otro]; GDM: varios). Sin contar al yo si el cliente lo excluye. */
  recipientIds?: string[];
  name?: string;
}

export function isSupportedChannel(ch: ChannelLike): boolean {
  return ch.type === DM_TYPE || ch.type === GROUP_DM_TYPE;
}

export type ChannelEncryptionOverride = "on" | "off";

/**
 * Resuelve si el cifrado esta activo en una conversacion.
 * - override "on"/"off" manda sobre el ajuste global.
 * - sin override se hereda `autoEncryptDMs`.
 * Puro y testeable; lo usan el candado de la barra de chat y el envio.
 */
export function resolveEncryptionEnabled(
  override: ChannelEncryptionOverride | undefined | null,
  autoEncryptDMs: boolean
): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return !!autoEncryptDMs;
}

export function requireSupportedChannel(ch: ChannelLike): void {
  if (!isSupportedChannel(ch)) {
    throw new PgpError(
      "UNSUPPORTED_CHANNEL",
      `Canal ${ch.id} (type ${ch.type}) no soportado: solo MD (1) y grupos MD (3).`
    );
  }
}

/**
 * Resuelve destinatarios efectivos: recipients del canal menos el yo.
 * Lanza si queda vacio (p. ej. nota personal / canal malformado).
 */
export function resolveRecipients(ch: ChannelLike, selfId: string): string[] {
  requireSupportedChannel(ch);
  const recips = (ch.recipientIds ?? []).map((s) => s.trim()).filter(Boolean);
  const others = [...new Set(recips)].filter((id) => id !== selfId);
  if (others.length === 0) {
    throw new PgpError("MISSING_RECIPIENT_KEY", "Sin destinatarios cifrables en este canal.");
  }
  return others;
}
