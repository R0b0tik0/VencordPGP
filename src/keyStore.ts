/**
 * Gestion de claves por usuario Discord (ID estable como clave primaria).
 *
 * - La clave primaria es el userId de Discord (string numerico). El
 *   `displayName` es solo informativo, NUNCA identificador criptografico.
 * - Soporta varias claves por usuario (rotacion): se cifra para TODAS las
 *   claves validas no revocadas del destinatario.
 * - Verificacion manual: `verified=true` solo tras comprobar la huella por
 *   un canal independiente. Nunca auto-verificar por el nombre. Solo las
 *   claves verificadas se usan como verificationKeys (firmas).
 * - Aviso de huella nueva: la UI compara contra las huellas existentes al
 *   importar. `detectChangedFingerprints()` queda como hardening para un
 *   snapshot persistido frente a settings sync.
 * - Sin red: sin keyserver, sin fetch automatico. Todo es manual y local.
 */
import { PgpError } from "./errors.js";
import { keyInfoOf, prettyFingerprint, type KeyInfo } from "./crypto.js";
import * as openpgp from "openpgp";

export interface AssignedPublicKey {
  armored: string;
  fingerprint: string;
  fingerprintPretty: string;
  userIds: string[];
  displayNameHint: string; // informativo
  verified: boolean;
  addedAt: number;
  lastSeenAt: number;
  expired: boolean;
  revoked: boolean;
  expiresAt: number | null;
}

export interface UserKeyRecord {
  userId: string;
  displayName: string; // informativo
  keys: AssignedPublicKey[];
}

/** Bloque privado: nunca debe aceptarse en el campo de clave publica ni persistirse. */
const PRIVATE_KEY_ARMOR_RE = /-----BEGIN PGP PRIVATE KEY BLOCK-----/i;

/** Almacen en memoria; la persistencia la hace el adaptador Vencord (settings). */
export class KeyStore {
  private users = new Map<string, UserKeyRecord>();
  /** Huellas vistas historicamente por usuario (para detectar cambios). */
  private history = new Map<string, Set<string>>();

  async addPublicKey(userId: string, displayName: string, armored: string): Promise<AssignedPublicKey> {
    const cleanId = validateUserId(userId);
    const cleanArmor = armored.trim();
    // Defensa clave: openpgp.readKey acepta bloques privados. El campo es SOLO
    // para publicas; si el usuario pega un export combinado (o una privada con
    // una cabecera que imita una publica), se rechaza antes de tocar el store.
    if (PRIVATE_KEY_ARMOR_RE.test(cleanArmor)) {
      throw new PgpError("INVALID_PUBLIC_KEY", "El armor contiene una clave PRIVADA. Pega solo la clave publica.");
    }
    if (!cleanArmor.includes("BEGIN PGP PUBLIC KEY")) {
      throw new PgpError("INVALID_PUBLIC_KEY", "No parece una clave publica PGP (falta armor).");
    }
    let key: openpgp.Key;
    try {
      key = await openpgp.readKey({ armoredKey: cleanArmor });
    } catch {
      throw new PgpError("INVALID_PUBLIC_KEY", "Clave publica malformada.");
    }
    if (key.isPrivate()) {
      throw new PgpError("INVALID_PUBLIC_KEY", "Se esperaba una clave publica, no privada.");
    }
    const info: KeyInfo = await keyInfoOf(key);
    if (info.revoked) throw new PgpError("KEY_REVOKED", `Clave revocada: ${info.fingerprintPretty}.`);
    // Guardar SOLO el armor publico normalizado: evita persistir texto extra
    // (comentarios, keyrings concatenados o material privado) en settings/nube.
    const publicArmor = key.armor().trim();
    // Caducada: se permite importar pero se marca (el cifrado la rechazara).
    const entry: AssignedPublicKey = {
      armored: publicArmor,
      fingerprint: info.fingerprint,
      fingerprintPretty: prettyFingerprint(info.fingerprint),
      userIds: info.userIds,
      displayNameHint: displayName,
      verified: false,
      addedAt: Date.now(),
      lastSeenAt: Date.now(),
      expired: info.expired,
      revoked: info.revoked,
      expiresAt: info.expires ? info.expires.getTime() : null,
    };
    const rec = this.users.get(cleanId) ?? { userId: cleanId, displayName, keys: [] };
    rec.displayName = displayName;
    if (!rec.keys.some((k) => k.fingerprint === entry.fingerprint)) {
      rec.keys.push(entry);
    } else {
      // Re-import: actualizar flags sin duplicar ni auto-verificar.
      const existing = rec.keys.find((k) => k.fingerprint === entry.fingerprint)!;
      existing.lastSeenAt = Date.now();
      existing.expired = entry.expired;
      existing.revoked = entry.revoked;
    }
    this.users.set(cleanId, rec);
    if (!this.history.has(cleanId)) this.history.set(cleanId, new Set());
    this.history.get(cleanId)!.add(entry.fingerprint);
    return entry;
  }

  removePublicKey(userId: string, fingerprint: string): boolean {
    const rec = this.users.get(userId);
    if (!rec) return false;
    const fp = fingerprint.replace(/\s+/g, "").toUpperCase();
    const before = rec.keys.length;
    rec.keys = rec.keys.filter((k) => k.fingerprint !== fp);
    return rec.keys.length !== before;
  }

  removeUser(userId: string): boolean {
    return this.users.delete(userId);
  }

  getUser(userId: string): UserKeyRecord | undefined {
    return this.users.get(userId);
  }

  listUsers(): UserKeyRecord[] {
    return [...this.users.values()];
  }

  /** Claves validas para cifrar (no revocadas; caducadas se excluyen salvo override). */
  getEncryptionArmors(userId: string, opts: { includeExpired?: boolean } = {}): string[] {
    const rec = this.users.get(userId);
    if (!rec) return [];
    return rec.keys
      .filter((k) => !k.revoked && (opts.includeExpired ? true : !k.expired))
      .map((k) => k.armored);
  }

  markVerified(userId: string, fingerprint: string, verified: boolean): boolean {
    const rec = this.users.get(userId);
    if (!rec) return false;
    const fp = fingerprint.replace(/\s+/g, "").toUpperCase();
    const k = rec.keys.find((x) => x.fingerprint === fp);
    if (!k) return false;
    k.verified = verified;
    return true;
  }

  isVerified(userId: string): boolean {
    const rec = this.users.get(userId);
    return !!rec && rec.keys.some((k) => k.verified && !k.revoked && !k.expired);
  }

  /** Claves verificadas (no revocadas/caducadas) para verificar firmas. */
  getVerificationArmors(userId: string): string[] {
    const rec = this.users.get(userId);
    if (!rec) return [];
    return rec.keys.filter((k) => k.verified && !k.revoked && !k.expired).map((k) => k.armored);
  }

  /**
   * Usuarios con al menos una clave que se usaria para cifrar y NO esta
   * verificada. Sirve para avisar en el envio: una clave inyectada o no
   * comprobada recibiria los mensajes igualmente.
   */
  getUnverifiedEncryptionUserIds(userIds: string[]): string[] {
    const out: string[] = [];
    for (const id of new Set(userIds)) {
      const rec = this.users.get(id);
      if (!rec) continue;
      const usable = rec.keys.filter((k) => !k.revoked && !k.expired);
      if (usable.some((k) => !k.verified)) out.push(id);
    }
    return out;
  }

  /**
   * Detecta si las huellas actuales difieren del snapshot conocido
   * (p. ej. sustitucion de clave). Devuelve aviso o null.
   */
  detectChangedFingerprints(userId: string, currentFingerprints: string[]): string | null {
    const known = this.history.get(userId);
    if (!known || known.size === 0) return null;
    const cur = new Set(currentFingerprints.map((f) => f.replace(/\s+/g, "").toUpperCase()));
    const disappeared = [...known].filter((f) => !cur.has(f));
    const added = [...cur].filter((f) => !known.has(f));
    if (added.length > 0 && disappeared.length > 0) {
      return `ADVERTENCIA: la clave de ${userId} cambio inesperadamente. Verifica la huella por otro canal antes de marcarla como verificada.`;
    }
    return null;
  }

  /** Serializa SOLO claves publicas (nunca privadas) para settings. */
  toJSON(): Record<string, UserKeyRecord> {
    const out: Record<string, UserKeyRecord> = {};
    for (const [k, v] of this.users) out[k] = v;
    return out;
  }

  static fromJSON(data: unknown): KeyStore {
    const ks = new KeyStore();
    if (typeof data !== "object" || data === null) return ks;
    for (const [userId, rec] of Object.entries(data as Record<string, UserKeyRecord>)) {
      try {
        const cleanId = validateUserId(userId);
        if (!rec || !Array.isArray((rec as UserKeyRecord).keys)) continue;
        ks.users.set(cleanId, {
          userId: cleanId,
          displayName: String((rec as UserKeyRecord).displayName ?? ""),
          keys: (rec as UserKeyRecord).keys.filter((k) =>
            typeof k?.armored === "string" &&
            typeof k?.fingerprint === "string" &&
            !PRIVATE_KEY_ARMOR_RE.test(k.armored)
          ),
        });
        ks.history.set(cleanId, new Set(ks.users.get(cleanId)!.keys.map((k) => k.fingerprint)));
      } catch { /* entrada invalida: omitir sin romper el resto */ }
    }
    return ks;
  }

  clear(): void {
    this.users.clear();
    this.history.clear();
  }
}

export function validateUserId(userId: string): string {
  const t = (userId ?? "").trim();
  if (!/^\d{5,25}$/.test(t)) {
    throw new PgpError("INVALID_PAYLOAD", `User ID de Discord invalido: debe ser numerico estable (snowflake). Recibido: "${t.slice(0, 40)}"`);
  }
  return t;
}
