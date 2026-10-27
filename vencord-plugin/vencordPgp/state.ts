/*
 * Vencord PGP — estado de sesión (todo en RAM salvo claves públicas).
 * La clave privada NUNCA se guarda en settings (evita settings sync remoto).
 */
import { DecryptCache } from "./core/cache";
import { KeyStore } from "./core/keyStore";
import { PrivateSession } from "./core/session";

export const session = new PrivateSession();
export const keyStore = new KeyStore();
export const decryptCache = new DecryptCache();

/** Clave pública propia derivada al desbloquear (para poder leer lo enviado). */
let ownPublicArmor: string | null = null;
export function setOwnPublicArmor(v: string | null) { ownPublicArmor = v; }
export function getOwnPublicArmor(): string | null { return ownPublicArmor; }

/** Borrador de la privada: solo RAM, para no perderla al cambiar de pestaña. */
let privateArmorDraft = "";
export function getPrivateArmorDraft(): string { return privateArmorDraft; }
export function setPrivateArmorDraft(v: string): void {
    privateArmorDraft = v;
    session.setArmored(v);
}

/** Persistencia de SOLO claves públicas, inyectada desde index.tsx. */
let publicKeysSaver: (() => void) | null = null;
export function setPublicKeysSaver(fn: () => void) { publicKeysSaver = fn; }
export function persistPublicKeys(): void { publicKeysSaver?.(); }

/* Notificación de cambios para re-render de accesorios/panel. */
let version = 0;
const listeners = new Set<() => void>();
export function notifyState(): void {
    version++;
    for (const l of listeners) {
        try { l(); } catch { /* noop */ }
    }
}
export function subscribeState(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function getStateVersion(): number { return version; }
