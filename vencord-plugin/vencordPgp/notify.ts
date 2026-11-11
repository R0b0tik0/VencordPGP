/*
 * Avisos (toasts) a prueba de fallos.
 *
 * `showToast` de Vencord se resuelve con un filtro de webpack sobre el bundle de
 * Discord. Cuando Discord cambia ese modulo, el proxy lazy queda en `null` y
 * llamarlo lanza "Function.prototype.apply was called on null, which is null
 * and not a function".
 *
 * Un aviso es cosmetico: NUNCA debe romper un flujo. En `preSend`/`preEdit` es
 * ademas un problema de seguridad, porque Vencord ignora las excepciones de los
 * listeners y dejaria salir el mensaje en claro. Por eso aqui:
 *   1. se intenta el toast normal de Vencord/Discord;
 *   2. si no esta disponible, se pinta un aviso propio en el DOM (se quita solo).
 *
 * `toast()` no lanza nunca.
 */
import { copyToClipboard } from "@utils/clipboard";
import { showToast } from "@webpack/common";

export type ToastVariant = "success" | "critical" | "message" | "warning" | "default";

export interface ToastOptions {
    text: string;
    variant?: ToastVariant;
}

const TOAST_MS = 4500;
const MAX_LOCAL_TOASTS = 3;
const HOST_ID = "vc-pgp-toasts";

/** El modulo de toasts de Discord no resuelve: no reintentar (ni loguear) en cada aviso. */
let nativeToastBroken = false;
const localToasts = new Set<HTMLDivElement>();

function removeLocal(el: HTMLDivElement): void {
    localToasts.delete(el);
    try {
        el.remove();
    } catch { /* noop */ }
}

function localHost(): HTMLElement | null {
    try {
        const existing = document.getElementById(HOST_ID);
        if (existing) return existing;
        const host = document.createElement("div");
        host.id = HOST_ID;
        host.className = "vc-pgp-toasts";
        document.body.append(host);
        return host;
    } catch {
        return null;
    }
}

function showLocalToast(options: ToastOptions): void {
    try {
        const host = localHost();
        if (!host) return;
        while (localToasts.size >= MAX_LOCAL_TOASTS) {
            const oldest = localToasts.values().next().value;
            if (!oldest) break;
            removeLocal(oldest);
        }
        const el = document.createElement("div");
        el.className = "vc-pgp-toast" + (options.variant ? ` vc-pgp-toast-${options.variant}` : "");
        el.setAttribute("role", "status");
        el.textContent = options.text;
        host.append(el);
        localToasts.add(el);
        setTimeout(() => removeLocal(el), TOAST_MS);
    } catch { /* un aviso nunca debe romper nada */ }
}

/** Muestra un aviso. Nunca lanza. */
export function toast(options: ToastOptions): void {
    if (!nativeToastBroken) {
        try {
            (showToast as unknown as (data: ToastOptions) => void)(options);
            return;
        } catch (e) {
            nativeToastBroken = true;
            console.warn(
                "[VencordPGP] El toast de Vencord/Discord no esta disponible con esta version; se usan avisos propios.",
                e
            );
        }
    }
    showLocalToast(options);
}

/** Copia al portapapeles y confirma con un aviso. El aviso nunca lanza. */
export async function copyAndToast(text: string, message: string): Promise<void> {
    await copyToClipboard(text);
    toast({ text: message, variant: "success" });
}
