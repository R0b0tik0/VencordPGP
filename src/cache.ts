/**
 * Cache local en memoria de descifrados (nunca persistida, nunca enviada).
 *
 * - Clave: messageId (+ editedTimestamp para invalidar ediciones).
 * - Valor: { body } o { error } — nunca se guarda la privada ni el armor.
 * - LRU acotada (500) anti-DoS memoria.
 * - `lock()`/`clear()` borran todo (al bloquear clave o cerrar sesion).
 * - Anti-race: `getFresh(messageId, editStamp)` evita mostrar contenido
 *   de otro mensaje si una operacion async llega tarde.
 */
export interface CacheEntry {
  body?: string;
  error?: string;
  signed: boolean;
  signatureValid: boolean | null;
  at: number;
  editStamp: string | number | null;
}

const MAX_ENTRIES = 500;

export class DecryptCache {
  private map = new Map<string, CacheEntry>();

  private touch(key: string, entry: CacheEntry): void {
    this.map.delete(key);
    this.map.set(key, entry);
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get(messageId: string, editStamp: string | number | null = null): CacheEntry | undefined {
    const e = this.map.get(messageId);
    if (!e) return undefined;
    if (editStamp !== null && e.editStamp !== null && e.editStamp !== editStamp) return undefined;
    this.touch(messageId, e);
    return e;
  }

  setOk(messageId: string, body: string, meta: Partial<CacheEntry> = {}, editStamp: string | number | null = null): void {
    this.touch(messageId, {
      body,
      signed: meta.signed ?? false,
      signatureValid: meta.signatureValid ?? null,
      at: Date.now(),
      editStamp,
    });
  }

  setErr(messageId: string, error: string, editStamp: string | number | null = null): void {
    this.touch(messageId, { error, signed: false, signatureValid: null, at: Date.now(), editStamp });
  }

  invalidate(messageId: string): void {
    this.map.delete(messageId);
  }

  /** Purga solo errores (p. ej. al desbloquear/cambiar claves) para reintentar. */
  clearErrors(): void {
    for (const [key, entry] of this.map) {
      if (entry.error !== undefined) this.map.delete(key);
    }
  }

  clear(): void {
    this.map.clear();
  }

  lock(): void {
    this.clear(); // alias semantico: bloquear == purgar datos sensibles
  }

  get size(): number {
    return this.map.size;
  }
}
