/*
 * Acceso al almacen local de la clave privada cifrada.
 *
 * Usa Vencord DataStore (IndexedDB local). NO usa settings.json, por lo que
 * no se sincroniza con la nube de Vencord. El blob esta cifrado con
 * PBKDF2-SHA256 + AES-256-GCM y la contrasena de almacenamiento nunca se guarda.
 */
import { del, get, set } from "@api/DataStore";

import { PgpError } from "./core/errors";
import { decryptVault, encryptVault, parseVaultBlob, type VaultPayload } from "./core/keyVault";

const VAULT_KEY = "VencordPGP_privateKeyVault";

export async function hasStoredVault(): Promise<boolean> {
    try {
        return (await get(VAULT_KEY)) != null;
    } catch {
        return false;
    }
}

export async function saveToVault(payload: VaultPayload, storagePassword: string): Promise<void> {
    const blob = await encryptVault(payload, storagePassword);
    await set(VAULT_KEY, JSON.stringify(blob));
}

export async function loadFromVault(storagePassword: string): Promise<VaultPayload> {
    const raw = await get<string>(VAULT_KEY);
    if (!raw) throw new PgpError("VAULT_INVALID", "No hay ninguna clave guardada en este equipo.");
    return decryptVault(parseVaultBlob(raw), storagePassword);
}

export async function deleteVault(): Promise<void> {
    await del(VAULT_KEY);
}
