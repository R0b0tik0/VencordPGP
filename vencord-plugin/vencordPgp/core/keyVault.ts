/**
 * Caja fuerte local para la clave privada PGP.
 *
 * Cifra el armor (y opcionalmente su passphrase) con una contrasena de
 * almacenamiento elegida por el usuario, usando WebCrypto:
 *   PBKDF2-SHA256 (310k iteraciones) -> AES-256-GCM
 *
 * - Sin cripto casera: solo SubtleCrypto (Electron/Node 18+).
 * - El blob resultante NO contiene el claro; se guarda en almacenamiento
 *   local (DataStore/IndexedDB), nunca en settings sincronizados.
 * - La contrasena de almacenamiento NO se guarda en ningun sitio.
 * - No sustituye a la proteccion de la propia clave (passphrase OpenPGP):
 *   es una capa adicional de conveniencia. Malware/keylogger puede capturar
 *   la contrasena mientras se escribe. Documentado en THREAT_MODEL.
 */
import { PgpError } from "./errors";

export interface VaultBlob {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;   // base64
  iv: string;     // base64
  cipher: string; // base64 (AES-GCM)
}

export interface VaultPayload {
  armor: string;
  passphrase?: string;
}

export const DEFAULT_ITERATIONS = 310_000;
export const MIN_PASSWORD_LENGTH = 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new PgpError("VAULT_UNAVAILABLE", "WebCrypto (SubtleCrypto) no esta disponible.");
  return c.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** TS 5.7+ tipa Uint8Array<ArrayBufferLike>; WebCrypto espera BufferSource. */
function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", asBuffer(encoder.encode(password)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt: asBuffer(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Cifra el armor (+ passphrase opcional) con la contrasena de almacenamiento. */
export async function encryptVault(
  payload: VaultPayload,
  password: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<VaultBlob> {
  if (!payload?.armor || !payload.armor.includes("BEGIN PGP PRIVATE KEY BLOCK")) {
    throw new PgpError("VAULT_INVALID", "No hay una clave privada PGP valida para guardar.");
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new PgpError("VAULT_INVALID", `La contrasena de almacenamiento debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = encoder.encode(JSON.stringify(payload));
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, asBuffer(data));

  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(new Uint8Array(cipher)),
  };
}

/** Descifra el blob. Lanza VAULT_WRONG_PASSWORD si la contrasena es incorrecta. */
export async function decryptVault(blob: VaultBlob, password: string): Promise<VaultPayload> {
  if (!blob || blob.v !== 1 || blob.kdf !== "PBKDF2-SHA256") {
    throw new PgpError("VAULT_INVALID", "Formato de clave guardada no soportado.");
  }
  if (!password) throw new PgpError("VAULT_WRONG_PASSWORD", "Contrasena de almacenamiento incorrecta.");

  let plaintext: ArrayBuffer;
  try {
    const salt = fromBase64(blob.salt);
    const iv = fromBase64(blob.iv);
    const key = await deriveKey(password, salt, blob.iterations);
    plaintext = await subtle().decrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, asBuffer(fromBase64(blob.cipher)));
  } catch {
    throw new PgpError("VAULT_WRONG_PASSWORD", "Contrasena de almacenamiento incorrecta.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new PgpError("VAULT_INVALID", "Contenido de la clave guardada corrupto.");
  }
  const rec = parsed as Record<string, unknown>;
  if (typeof rec?.armor !== "string" || !rec.armor.includes("BEGIN PGP PRIVATE KEY BLOCK")) {
    throw new PgpError("VAULT_INVALID", "La clave guardada no contiene una clave privada valida.");
  }
  const passphrase = typeof rec.passphrase === "string" && rec.passphrase.length > 0 ? rec.passphrase : undefined;
  return { armor: rec.armor as string, passphrase };
}

export function parseVaultBlob(raw: unknown): VaultBlob {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new PgpError("VAULT_INVALID", "No hay datos de clave guardada.");
  }
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new PgpError("VAULT_INVALID", "Datos de clave guardada corruptos.");
  }
  return obj as VaultBlob;
}
