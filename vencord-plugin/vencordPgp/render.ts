/*
 * Descifrado local y cache.
 *
 * NO se modifica la copia del mensaje en el store (el ciphertext original
 * permanece intacto, fiel al servidor). El texto claro se muestra en el
 * accesorio de mensaje (PgpAccessory) como contenido principal, y el bloque
 * cifrado se oculta por DOM salvo que el usuario pulse "ver cifrado".
 *
 * Cache en RAM por messageId; se invalida en ediciones/borrado y se purga al
 * bloquear la clave. Nunca se persiste ni se envia.
 */
import type { Message } from "@vencord/discord-types";
import { ChannelStore } from "@webpack/common";

import { isSupportedChannel } from "./core/channelPolicy";
import { viewIncomingMessage } from "./core/incoming";
import { isPgpTransport } from "./core/transport";
import { decryptCache, keyStore, notifyState, session } from "./state";

interface DecryptedRecord {
    channelId: string;
    ciphertext: string;
    body: string;
}

const decrypted = new Map<string, DecryptedRecord>();
const inFlight = new Set<string>();
/** Cota del mapa de claros: misma idea que DecryptCache (anti-DoS de memoria). */
const MAX_DECRYPTED = 500;

function setDecrypted(messageId: string, record: DecryptedRecord): void {
    decrypted.delete(messageId);
    decrypted.set(messageId, record);
    while (decrypted.size > MAX_DECRYPTED) {
        const oldest = decrypted.keys().next().value;
        if (oldest === undefined) break;
        decrypted.delete(oldest);
    }
}

export function isLocallyDecrypted(messageId: string): boolean {
    return decrypted.has(messageId);
}

export function getLocalPlaintext(messageId: string): string | undefined {
    return decrypted.get(messageId)?.body;
}

let notifyScheduled = false;
/** Agrupa notificaciones de varios descifrados en el mismo tick. */
function notifySoon(): void {
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(() => {
        notifyScheduled = false;
        notifyState();
    });
}

/**
 * Descifra (si procede) y guarda el texto en cache. Idempotente y protegido
 * contra carreras. No lanza: los errores quedan en la cache para el indicador.
 */
export async function decryptMessage(message: Message): Promise<void> {
    try {
        if (!message?.id || typeof message.content !== "string") return;
        if (inFlight.has(message.id)) return;

        // Solo DM/GDM: el plugin no soporta guilds/hilos y no debe procesar
        // ciphertext arbitrario de canales donde no cifra (anti-DoS).
        const channel = ChannelStore.getChannel(message.channel_id);
        if (!channel || !isSupportedChannel({ id: channel.id, type: channel.type })) return;

        const existing = decrypted.get(message.id);
        if (existing) {
            if (existing.ciphertext === message.content) return; // mismo ciphertext
            // El servidor cambio el contenido (edicion/otro cliente): re-evaluar.
            decrypted.delete(message.id);
            decryptCache.invalidate(message.id);
        }

        if (!isPgpTransport(message.content)) return;
        const unlocked = session.getUnlockedOrNull();
        if (!unlocked) return; // el accesorio indicara "bloqueado"

        // Si ya hay resultado en cache (claro o error), no re-descifrar ni
        // volver a notificar: evita el bucle error -> render -> error.
        const editStamp = message.editedTimestamp?.getTime() ?? null;
        const cached = decryptCache.get(message.id, editStamp);
        if (cached && (cached.body !== undefined || cached.error !== undefined)) return;

        inFlight.add(message.id);
        try {
            const view = await viewIncomingMessage({
                messageId: message.id,
                content: message.content,
                editStamp,
                unlocked,
                verificationArmors: keyStore.getVerificationArmors(message.author?.id ?? ""),
                cache: decryptCache,
            });
            if (view.kind !== "decrypted" || !view.body) {
                if (view.kind === "error") {
                    // Diagnostico seguro: mensaje de error propio, sin contenido ni claves.
                    console.warn("[VencordPGP] mensaje no descifrable", { messageId: message.id, reason: view.error });
                    if (!view.fromCache) notifySoon();
                }
                return;
            }
            setDecrypted(message.id, {
                channelId: message.channel_id,
                ciphertext: message.content,
                body: view.body,
            });
            notifySoon();
        } finally {
            inFlight.delete(message.id);
        }
    } catch {
        // Nunca romper el render de Discord por un fallo PGP.
    }
}

/** Al editar/borrar un mensaje, evita servir un claro obsoleto. */
export function forgetDecrypted(messageId: string): void {
    decrypted.delete(messageId);
    decryptCache.invalidate(messageId);
}

/** Purga el texto descifrado en RAM (bloqueo/desactivacion). */
export function clearDecrypted(): void {
    decrypted.clear();
}

/**
 * Invalida todo lo descifrado (mapa + cache) para forzar re-descifrado y
 * re-verificacion de firmas tras cambiar claves o desbloquear.
 */
export function resetDecryptionCache(): void {
    decrypted.clear();
    decryptCache.clear();
}
