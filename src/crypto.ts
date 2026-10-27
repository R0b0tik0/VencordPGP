/**
 * Nucleo criptografico OpenPGP (openpgp v6).
 *
 * - Sin cripto casera: solo openpgpjs (RFC 9580).
 * - Sin compresion (uncompressed) para evitar expansion impredecible y
 *   problemas con limites de Discord.
 * - Cifrado multi-destinatario nativo de OpenPGP (varias encryptionKeys).
 * - Firma opcional (signingKeys) con el mismo flujo; verificacion
 *   separada y NUNCA silenciosa.
 * - Validacion de claves: malformadas, caducadas, revocadas.
 *
 * API verificada contra docs.openpgpjs.org (v6):
 *   readKey({armoredKey}), readPrivateKey({armoredKey}),
 *   decryptKey({privateKey, passphrase}), createMessage({text}),
 *   encrypt({message, encryptionKeys, signingKeys, format, config}),
 *   readMessage({armoredMessage}), decrypt({message, decryptionKeys,
 *   verificationKeys}), generateKey({type:'ecc', curve, userIDs,
 *   passphrase, format}), key.getFingerprint(), key.getExpirationTime(),
 *   key.isRevoked(), key.getUserIDs(), signatures[i].verified
 */
import * as openpgp from "openpgp";
import { PgpError } from "./errors.js";
import { deserializePayload, serializePayload, MAX_BODY_CHARS } from "./serializer.js";
import { extractArmor, wrapTransport, DISCORD_LIMIT } from "./transport.js";

export type OpenPgpPublicKey = openpgp.Key;
export type OpenPgpPrivateKey = openpgp.PrivateKey;

export interface KeyInfo {
  fingerprint: string; // hex mayusculas sin espacios
  fingerprintPretty: string; // grupos de 4
  userIds: string[];
  expires: Date | null; // null = no expira
  expired: boolean;
  revoked: boolean;
}

export interface DecryptResult {
  body: string;
  sentAt: number;
  /** true solo si hubo firma valida de una verificationKey confiable. */
  signed: boolean;
  signerFingerprint: string | null;
  signatureValid: boolean | null; // null = no habia firma que verificar
}

const NO_COMPRESS = { preferredCompressionAlgorithm: openpgp.enums.compression.uncompressed } as const;
/** Maximo de bytes descomprimidos aceptados al descifrar (anti-bomba).
 *  4 bytes/caracter cubre UTF-8 multibyte; deja margen para JSON y firmas. */
const MAX_DECOMPRESSED_BYTES = MAX_BODY_CHARS * 4 + 4096;
const PRIVATE_KEY_ARMOR = "BEGIN PGP PRIVATE KEY BLOCK";

export function prettyFingerprint(fp: string): string {
  const clean = fp.replace(/\s+/g, "").toUpperCase();
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

export async function readPublicKeyInfo(armored: string): Promise<{ key: OpenPgpPublicKey; info: KeyInfo }> {
  if (armored.includes(PRIVATE_KEY_ARMOR)) {
    throw new PgpError("INVALID_PUBLIC_KEY", "El armor contiene una clave privada; se esperaba una publica.");
  }
  let key: openpgp.Key;
  try {
    key = await openpgp.readKey({ armoredKey: armored.trim() });
  } catch (e) {
    throw new PgpError("INVALID_PUBLIC_KEY", "No se pudo leer la clave publica (malformada).", shortErr(e));
  }
  if (key.isPrivate()) {
    throw new PgpError("INVALID_PUBLIC_KEY", "Se esperaba una clave publica, no privada.");
  }
  const info = await keyInfoOf(key);
  return { key, info };
}

export async function readPrivateKeyObject(armored: string): Promise<OpenPgpPrivateKey> {
  try {
    return await openpgp.readPrivateKey({ armoredKey: armored.trim() });
  } catch (e) {
    throw new PgpError("INVALID_PRIVATE_KEY", "No se pudo leer la clave privada (malformada).", shortErr(e));
  }
}

/** Desbloquea la privada con passphrase (o sin ella si no esta protegida). */
export async function unlockPrivateKey(armored: string, passphrase: string | null): Promise<OpenPgpPrivateKey> {
  const key = await readPrivateKeyObject(armored);
  try {
    if (passphrase == null || passphrase === "") {
      // Clave sin proteger: se puede usar directamente.
      if (!(await isPrivateKeyEncrypted(key))) return key;
      // Marcada como cifrada: puede estar cifrada con passphrase VACIA (S2K
      // sin passphrase). Intentar desbloquear con "" antes de exigir una.
      try {
        return await openpgp.decryptKey({ privateKey: key, passphrase: "" });
      } catch {
        throw new PgpError("PRIVATE_KEY_LOCKED", "La clave privada necesita passphrase.");
      }
    }
    return await openpgp.decryptKey({ privateKey: key, passphrase });
  } catch (e) {
    if (e instanceof PgpError) throw e;
    throw new PgpError("WRONG_PASSPHRASE", "Passphrase incorrecta o clave danada.", shortErr(e));
  }
}

async function isPrivateKeyEncrypted(key: openpgp.PrivateKey): Promise<boolean> {
  try {
    // API publica: key.isDecrypted() existe en v5/v6.
    const k = key as unknown as { isDecrypted?: () => boolean };
    if (typeof k.isDecrypted === "function") return !k.isDecrypted();
  } catch { /* noop */ }
  return true; // conservador
}

export async function keyInfoOf(key: openpgp.Key): Promise<KeyInfo> {
  const fingerprint = (key.getFingerprint() as string).toUpperCase();
  let userIds: string[] = [];
  try {
    userIds = key.getUserIDs();
  } catch { userIds = []; }
  let expires: Date | null = null;
  let expired = false;
  try {
    const exp = await key.getExpirationTime();
    if (exp instanceof Date) {
      expires = exp;
      expired = exp.getTime() <= Date.now();
    } else {
      expires = null; // Infinity
      expired = false;
    }
  } catch { expired = false; }
  let revoked = false;
  try {
    revoked = await key.isRevoked();
  } catch { revoked = false; }
  return {
    fingerprint,
    fingerprintPretty: prettyFingerprint(fingerprint),
    userIds,
    expires,
    expired,
    revoked,
  };
}

export function assertKeyUsable(info: KeyInfo, what: string): void {
  if (info.revoked) throw new PgpError("KEY_REVOKED", `${what}: clave revocada (${info.fingerprintPretty}).`);
  if (info.expired) throw new PgpError("KEY_EXPIRED", `${what}: clave caducada (${info.fingerprintPretty}).`);
}

export interface EncryptParams {
  plaintextBody: string;
  recipientPublicKeysArmored: string[];
  /** Clave publica propia (para poder leer lo enviado desde otro cliente). */
  ownPublicKeyArmored?: string | null;
  /** Privada desbloqueada para firmar (opcional pero recomendado). */
  signingPrivateKey?: OpenPgpPrivateKey | null;
  /** Limite de longitud del transporte (2000 estandar; 4000 Nitro). */
  maxTransportChars?: number;
}

/** Cifra (y opcionalmente firma) el body; devuelve transporte VPGP listo para Discord. */
export async function encryptBodyForRecipients(params: EncryptParams): Promise<string> {
  const { plaintextBody, recipientPublicKeysArmored, ownPublicKeyArmored, signingPrivateKey, maxTransportChars = DISCORD_LIMIT } = params;
  if (recipientPublicKeysArmored.length === 0) {
    throw new PgpError("MISSING_RECIPIENT_KEY", "Sin claves de destinatario.");
  }
  // Deduplicar por armored normalizado.
  const seen = new Set<string>();
  const armoredList: string[] = [];
  for (const a of [...recipientPublicKeysArmored, ...(ownPublicKeyArmored ? [ownPublicKeyArmored] : [])]) {
    const t = a.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    armoredList.push(t);
  }
  let encryptionKeys: openpgp.Key[];
  try {
    encryptionKeys = await Promise.all(armoredList.map(async (a) => openpgp.readKey({ armoredKey: a })));
  } catch (e) {
    throw new PgpError("INVALID_PUBLIC_KEY", "Una clave publica destinataria es invalida.", shortErr(e));
  }
  for (const k of encryptionKeys) {
    const info = await keyInfoOf(k);
    assertKeyUsable(info, "Destinatario");
  }
  let payloadJson: string;
  try {
    payloadJson = serializePayload(plaintextBody);
  } catch (e) {
    if (e instanceof PgpError) throw e;
    throw new PgpError("ENCRYPT_FAILED", "No se pudo serializar el mensaje.");
  }
  let armored: string;
  try {
    const message = await openpgp.createMessage({ text: payloadJson });
    armored = (await openpgp.encrypt({
      message,
      encryptionKeys,
      signingKeys: signingPrivateKey ?? undefined,
      format: "armored",
      config: NO_COMPRESS as unknown as undefined,
    })) as unknown as string;
  } catch (e) {
    throw new PgpError("ENCRYPT_FAILED", "Fallo OpenPGP al cifrar.", shortErr(e));
  }
  const transport = wrapTransport(armored);
  if (transport.length > maxTransportChars) {
    throw new PgpError(
      "CIPHERTEXT_TOO_LARGE",
      `Cifrado (${transport.length} chars) supera el limite configurado (${maxTransportChars}). Acorta el mensaje.`,
      `${transport.length} > ${maxTransportChars}`
    );
  }
  return transport;
}

export interface DecryptParams {
  transportText: string;
  privateKey: OpenPgpPrivateKey; // ya desbloqueada
  /** Claves publicas de remitentes conocidos para verificar firma (opcional). */
  verificationKeysArmored?: string[];
}

/** Descifra transporte VPGP; verifica firma si hay verificationKeys. */
export async function decryptTransportToBody(params: DecryptParams): Promise<DecryptResult> {
  const { transportText, privateKey, verificationKeysArmored } = params;
  const armor = extractArmor(transportText); // lanza NOT_PGP/INVALID_TRANSPORT
  let message: openpgp.Message<string>;
  try {
    message = await openpgp.readMessage({ armoredMessage: armor });
  } catch (e) {
    throw new PgpError("INVALID_TRANSPORT", "Bloque PGP ilegible.", shortErr(e));
  }
  let verificationKeys: openpgp.Key[] | undefined;
  if (verificationKeysArmored && verificationKeysArmored.length > 0) {
    try {
      verificationKeys = await Promise.all(
        verificationKeysArmored.map((a) => openpgp.readKey({ armoredKey: a.trim() }))
      );
    } catch (e) {
      throw new PgpError("INVALID_PUBLIC_KEY", "Clave de verificacion invalida.", shortErr(e));
    }
  }
  let data: string;
  let signatures: Array<{ keyID?: { toHex?: () => string }; verified: Promise<unknown> }> = [];
  try {
    const res = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
      verificationKeys,
      expectSigned: false,
      // Anti-bomba: otros clientes pueden enviar mensajes comprimidos. Sin este
      // limite, openpgp descomprime sin cota antes de validar el payload.
      config: { maxDecompressedMessageSize: MAX_DECOMPRESSED_BYTES },
    });
    data = res.data as string;
    signatures = ((res.signatures ?? []) as unknown) as Array<{ keyID?: { toHex?: () => string }; verified: Promise<unknown> }>;
  } catch (e) {
    throw new PgpError("DECRYPT_FAILED", "No se pudo descifrar con tu clave privada.", shortErr(e));
  }
  const payload = deserializePayload(data); // valida version/tamano
  let signed = false;
  let signerFingerprint: string | null = null;
  let signatureValid: boolean | null = null;
  if (signatures.length > 0 && verificationKeys) {
    // Evaluar primera firma (OpenPGP puede traer varias; v1 firma una vez).
    const sig = signatures[0]!;
    try {
      await sig.verified;
      signed = true;
      signatureValid = true;
      try {
        const hex = sig.keyID?.toHex?.();
        signerFingerprint = (hex ? hex.toUpperCase() : null) as string | null;
      } catch { signerFingerprint = null; }
    } catch {
      // Firma presente pero invalida: NO ocultamos el texto (seria peor UX y
      // un falso "no descifrable"); se devuelve con signatureValid=false para
      // que la UI lo marque en rojo como "FIRMA INVALIDA". No se silencia.
      signed = true;
      signatureValid = false;
    }
  } else if (signatures.length > 0 && !verificationKeys) {
    signed = true; // firmada pero sin claves para verificar
    signatureValid = null;
  }
  return { body: payload.body, sentAt: payload.sentAt, signed, signerFingerprint, signatureValid };
}

function shortErr(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}
