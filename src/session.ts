/**
 * Sesion de clave privada: SOLO memoria.
 *
 * - `armored` persistido SOLO si el usuario activa `rememberPrivateKey`
 *   (opcional, con advertencia). Por defecto la privada vive solo en RAM.
 * - `unlocked` (objeto openpgp descifrado) jamas se serializa ni se loguea.
 * - `lock()` purga `unlocked` + passphrase + cache de descifrados.
 * - `wipe()` purga ademas el armor en memoria.
 */
import { unlockPrivateKey, type OpenPgpPrivateKey } from "./crypto.js";
import { PgpError } from "./errors.js";

export class PrivateSession {
  private armored: string | null = null;
  private unlocked: OpenPgpPrivateKey | null = null;
  private passphrase: string | null = null;

  /** Carga armor (pegado por el usuario). No desbloquea hasta setPassphrase+unlock. */
  setArmored(armored: string | null): void {
    const t = (armored ?? "").trim();
    this.armored = t.length > 0 ? t : null;
    this.unlocked = null; // cambio de material => re-desbloqueo obligatorio
  }

  get hasArmored(): boolean {
    return this.armored !== null;
  }

  get isUnlocked(): boolean {
    return this.unlocked !== null;
  }

  setPassphrase(pw: string | null): void {
    this.passphrase = pw && pw.length > 0 ? pw : null;
  }

  /** Passphrase de la clave en RAM (para guardarla en el vault si el usuario quiere). */
  getPassphrase(): string | null {
    return this.passphrase;
  }

  clearPassphrase(): void {
    this.passphrase = null;
  }

  async unlock(): Promise<void> {
    if (!this.armored) throw new PgpError("MISSING_PRIVATE_KEY", "Sin clave privada cargada.");
    this.unlocked = await unlockPrivateKey(this.armored, this.passphrase);
  }

  requireUnlocked(): OpenPgpPrivateKey {
    if (!this.unlocked) throw new PgpError("PRIVATE_KEY_LOCKED", "Clave privada bloqueada.");
    return this.unlocked;
  }

  getUnlockedOrNull(): OpenPgpPrivateKey | null {
    return this.unlocked;
  }

  /** Bloqueo: purga material descifrado y passphrase (mantiene armor). */
  lock(): void {
    this.unlocked = null;
    this.passphrase = null;
  }

  /** Borrado total de la sesion (incluye armor en memoria). */
  wipe(): void {
    this.armored = null;
    this.unlocked = null;
    this.passphrase = null;
  }
}
