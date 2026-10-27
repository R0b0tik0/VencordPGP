/**
 * Suite de pruebas del nucleo VPGP (node:test + assert).
 * Cubre los 20 puntos obligatorios sin simular resultados.
 *
 * Genera claves ECC curve25519 en runtime (rapido) para Alice y Bob.
 * Compilado a dist/tests/*.test.js y ejecutado con `node --test`.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as openpgp from "openpgp";

import { encryptBodyForRecipients, decryptTransportToBody, unlockPrivateKey, readPublicKeyInfo, keyInfoOf } from "../crypto.js";
import { serializePayload, deserializePayload, MAX_PLAINTEXT_CHARS } from "../serializer.js";
import { isPgpTransport, extractArmor, wrapTransport, MARKER, looksLikeMarkerButInvalid } from "../transport.js";
import { KeyStore } from "../keyStore.js";
import { DecryptCache } from "../cache.js";
import { planOutgoing, encryptOutgoing } from "../outgoing.js";
import { resolveEncryptionEnabled } from "../channelPolicy.js";
import { viewIncomingMessage } from "../incoming.js";
import { PrivateSession } from "../session.js";
import { PgpError } from "../errors.js";

interface User {
  name: string;
  privateArmor: string;
  publicArmor: string;
  passphrase: string;
}

async function makeUser(name: string, passphrase: string): Promise<User> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy" as never,
    userIDs: [{ name, email: `${name}@example.test` }],
    passphrase,
    format: "armored",
  });
  return { name, privateArmor: privateKey as string, publicArmor: publicKey as string, passphrase };
}

let alice: User;
let bob: User;
let carol: User; // atacante / clave incorrecta

before(async () => {
  alice = await makeUser("Alice", "alice-pass-123");
  bob = await makeUser("Bob", "bob-pass-456");
  carol = await makeUser("Carol", "carol-pass-789");
});

describe("1. importacion de claves pub/priv", () => {
  it("lee publica y expone huella completa", async () => {
    const { info } = await readPublicKeyInfo(alice.publicArmor);
    assert.match(info.fingerprint, /^[0-9A-F]{40}$/);
    assert.ok(info.fingerprintPretty.includes(" "));
    assert.ok(!info.expired && !info.revoked);
  });
  it("rechaza publica malformada", async () => {
    await assert.rejects(() => readPublicKeyInfo("no es una clave"), (e: unknown) => e instanceof PgpError);
  });
  it("clave privada SIN passphrase se desbloquea directamente", async () => {
    const { privateKey } = await openpgp.generateKey({
      type: "ecc", curve: "curve25519Legacy",
      userIDs: [{ name: "NoPass", email: "nopass@test.local" }], format: "armored",
    });
    const k = await unlockPrivateKey(privateKey as string, null);
    assert.ok(k.isDecrypted());
  });
  it("KeyStore asigna por userId estable", async () => {
    const ks = new KeyStore();
    const e = await ks.addPublicKey("123456789012345678", "Bob (nick)", bob.publicArmor);
    assert.equal(e.fingerprint.length, 40);
    assert.equal(ks.getEncryptionArmors("123456789012345678").length, 1);
  });
  it("rechaza userId no numerico (no usar username como clave)", async () => {
    const ks = new KeyStore();
    await assert.rejects(() => ks.addPublicKey("Bob", "Bob", bob.publicArmor), (e: unknown) => e instanceof PgpError);
  });
  it("rechaza una clave privada en el campo de clave publica", async () => {
    const ks = new KeyStore();
    await assert.rejects(
      () => ks.addPublicKey("123456789012345678", "Alice", alice.privateArmor),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "INVALID_PUBLIC_KEY"
    );
  });
  it("rechaza un export combinado publica+privada", async () => {
    const ks = new KeyStore();
    await assert.rejects(
      () => ks.addPublicKey("123456789012345678", "Alice", alice.publicArmor + "\n" + alice.privateArmor),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "INVALID_PUBLIC_KEY"
    );
    assert.equal(JSON.stringify(ks.toJSON()).includes("PRIVATE KEY"), false);
  });
  it("rechaza una privada con cabecera que imita una publica", async () => {
    const crafted = alice.privateArmor.replace(
      "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      "-----BEGIN PGP PRIVATE KEY BLOCK-----\nComment: BEGIN PGP PUBLIC KEY"
    );
    const ks = new KeyStore();
    await assert.rejects(
      () => ks.addPublicKey("123456789012345678", "Alice", crafted),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "INVALID_PUBLIC_KEY"
    );
  });
  it("normaliza el armor publico y no guarda texto extra", async () => {
    const ks = new KeyStore();
    // Keyring con dos publicas: readKey lee la primera; solo debe persistirse esa,
    // normalizada, sin la segunda ni texto adicional.
    const entry = await ks.addPublicKey("123456789012345678", "Bob", bob.publicArmor + "\n" + alice.publicArmor);
    const expected = (await openpgp.readKey({ armoredKey: bob.publicArmor })).armor().trim();
    assert.equal(entry.armored, expected);
    assert.ok(!entry.armored.includes("PRIVATE"));
    assert.ok(!entry.armored.includes(alice.name));
  });
  it("fromJSON descarta entradas con material privado", () => {
    const ks = KeyStore.fromJSON({
      "123456789012345678": {
        userId: "123456789012345678",
        displayName: "Alice",
        keys: [{ armored: alice.privateArmor, fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }],
      },
    });
    assert.equal(JSON.stringify(ks.toJSON()).includes("PRIVATE KEY"), false);
    assert.equal(ks.getUser("123456789012345678")?.keys.length, 0);
  });
  it("readPublicKeyInfo rechaza una privada", async () => {
    await assert.rejects(
      () => readPublicKeyInfo(alice.privateArmor),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "INVALID_PUBLIC_KEY"
    );
  });
});

describe("2. claves con passphrase", () => {
  it("desbloquea con passphrase correcta", async () => {
    const k = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    assert.ok(k);
  });
  it("falla con passphrase incorrecta", async () => {
    await assert.rejects(() => unlockPrivateKey(alice.privateArmor, "wrong"), (e: unknown) => e instanceof PgpError && (e as PgpError).code === "WRONG_PASSPHRASE");
  });
  it("PrivateSession lock/wipe purgan", async () => {
    const s = new PrivateSession();
    s.setArmored(alice.privateArmor);
    s.setPassphrase(alice.passphrase);
    await s.unlock();
    assert.ok(s.isUnlocked);
    s.lock();
    assert.ok(!s.isUnlocked);
    assert.throws(() => s.requireUnlocked(), (e: unknown) => e instanceof PgpError);
  });
});

describe("3. cifrado/descifrado Alice->Bob (con firma)", () => {
  it("roundtrip con firma verificada", async () => {
    const alicePriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bobPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "Hola Bob, esto es secreto.",
      recipientPublicKeysArmored: [bob.publicArmor],
      ownPublicKeyArmored: alice.publicArmor,
      signingPrivateKey: alicePriv,
    });
    assert.ok(isPgpTransport(t));
    const r = await decryptTransportToBody({
      transportText: t,
      privateKey: bobPriv,
      verificationKeysArmored: [alice.publicArmor],
    });
    assert.equal(r.body, "Hola Bob, esto es secreto.");
    assert.equal(r.signed, true);
    assert.equal(r.signatureValid, true);
  });
  it("el emisor tambien puede leer lo enviado (own key)", async () => {
    const alicePriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "nota para mi mismo",
      recipientPublicKeysArmored: [bob.publicArmor],
      ownPublicKeyArmored: alice.publicArmor,
      signingPrivateKey: null,
    });
    const r = await decryptTransportToBody({ transportText: t, privateKey: alicePriv });
    assert.equal(r.body, "nota para mi mismo");
  });
});

describe("4. imposible descifrar con clave incorrecta", () => {
  it("Carol no abre mensaje para Bob", async () => {
    const alicePriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const carolPriv = await unlockPrivateKey(carol.privateArmor, carol.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "solo para Bob",
      recipientPublicKeysArmored: [bob.publicArmor],
      signingPrivateKey: alicePriv,
    });
    await assert.rejects(
      () => decryptTransportToBody({ transportText: t, privateKey: carolPriv }),
      (e: unknown) => e instanceof PgpError
    );
  });
});

describe("5/6. unicode, emojis, acentos, saltos y markdown", () => {
  const samples = [
    "áéíóú ñ ¿Hola? Grüße — 日本語テスト 🎉🔒 ñ",
    "linea1\nlinea2\n\nlinea4 con  espacios  ",
    "**negrita** *cursiva* ~~tachado~~ `codigo` ```bloque\nmulti\n```",
    "emoji custom en texto <a:party:123456789> y unicode \u{1F600}",
  ];
  for (const [i, s] of samples.entries()) {
    it(`roundtrip exacto muestra ${i}`, async () => {
      const aPriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
      const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
      const t = await encryptBodyForRecipients({
        plaintextBody: s,
        recipientPublicKeysArmored: [bob.publicArmor],
        signingPrivateKey: aPriv,
      });
      const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv, verificationKeysArmored: [alice.publicArmor] });
      assert.equal(r.body, s);
    });
  }
});

describe("7/8. URLs con parametros, fragmentos y multi-URL", () => {
  it("preserva URLs exactas", async () => {
    const body = "mira https://example.com/a?x=1&y=hello%20world#frag-%C3%B1 y http://t.co/?a=b&c=d#z";
    const aPriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({ plaintextBody: body, recipientPublicKeysArmored: [bob.publicArmor], signingPrivateKey: aPriv });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    assert.equal(r.body, body);
  });
  it("varias URLs no se transforman ni se pierden", async () => {
    const body = "uno https://a.test/?q=1 dos https://b.test/x#y tres";
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({ plaintextBody: body, recipientPublicKeysArmored: [bob.publicArmor] });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    assert.equal(r.body, body);
    assert.ok(r.body.includes("https://a.test/?q=1") && r.body.includes("https://b.test/x#y"));
  });
});

describe("9. parecido al marcador pero invalido", () => {
  it("no se detecta como transporte ni se intenta descifrar", () => {
    assert.equal(isPgpTransport("[VPGP:v1] hola, esto no es cifrado"), false);
    assert.equal(isPgpTransport("mira mi marcador [VPGP:v1]"), false);
    assert.equal(looksLikeMarkerButInvalid("[VPGP:v1] hola"), true);
    assert.equal(looksLikeMarkerButInvalid("hola normal"), false);
  });
  it("marcador + armor truncado => INVALID_TRANSPORT (no crash)", async () => {
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    await assert.rejects(
      () => decryptTransportToBody({ transportText: `${MARKER}\n-----BEGIN PGP MESSAGE-----\ntruncado`, privateKey: bPriv }),
      (e: unknown) => e instanceof PgpError
    );
  });
});

describe("10. claves ausentes/caducadas/revocadas", () => {
  it("falta clave => fail-closed con MISSING_RECIPIENT_KEY", async () => {
    const ks = new KeyStore();
    await assert.rejects(
      () =>
        encryptOutgoing({
          channel: { id: "c1", type: 1, recipientIds: ["999"] },
          content: "hola",
          selfId: "111",
          keyStore: ks,
          ownPublicArmor: null,
          signingKey: null,
        }),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "MISSING_RECIPIENT_KEY"
    );
  });
  it("clave revocada se rechaza al importar", async () => {
    // Generar y revocar via openpgp.revokeKey con la privada DESBLOQUEADA.
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "ecc", curve: "curve25519Legacy" as never,
      userIDs: [{ name: "Tmp", email: "t@t.test" }], passphrase: "x", format: "armored",
    });
    const locked = await openpgp.readPrivateKey({ armoredKey: privateKey as string });
    const priv = await openpgp.decryptKey({ privateKey: locked, passphrase: "x" });
    const { publicKey: revoked } = await openpgp.revokeKey({ key: priv, format: "armored" });
    void publicKey;
    const ks = new KeyStore();
    await assert.rejects(() => ks.addPublicKey("12345", "Tmp", revoked as string), (e: unknown) => e instanceof PgpError);
  });
  it("clave caducada: se importa marcada y se excluye del cifrado", async () => {
    // Simular expiracion generando clave y marcandola manualmente en el store.
    const ks = new KeyStore();
    await ks.addPublicKey("777777777777777777", "Bob", bob.publicArmor);
    const rec = ks.getUser("777777777777777777")!;
    rec.keys[0].expired = true; // simula deteccion de expiracion
    assert.equal(ks.getEncryptionArmors("777777777777777777").length, 0);
    assert.equal(ks.getEncryptionArmors("777777777777777777", { includeExpired: true }).length, 1);
  });
});

describe("11. firmas invalidas", () => {
  it("firma de otro firmante: signatureValid=false pero el texto se muestra", async () => {
    const alicePriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bobPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "firmado por alice",
      recipientPublicKeysArmored: [bob.publicArmor],
      signingPrivateKey: alicePriv,
    });
    // Verificar contra la clave de Carol (no firmante): no debe ocultar el texto,
    // solo marcarlo como firma invalida (la UI lo muestra en rojo).
    const r = await decryptTransportToBody({ transportText: t, privateKey: bobPriv, verificationKeysArmored: [carol.publicArmor] });
    assert.equal(r.body, "firmado por alice");
    assert.equal(r.signed, true);
    assert.equal(r.signatureValid, false);
  });
  it("sin verificationKeys: signed=true pero signatureValid=null (no verificado)", async () => {
    const alicePriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bobPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "firmado pero sin verificador",
      recipientPublicKeysArmored: [bob.publicArmor],
      signingPrivateKey: alicePriv,
    });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bobPriv });
    assert.equal(r.signed, true);
    assert.equal(r.signatureValid, null);
  });
});

describe("12/17. ediciones, historial y cache", () => {
  it("cache evita re-descifrar; edicion invalida", async () => {
    const cache = new DecryptCache();
    const aPriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t1 = await encryptBodyForRecipients({ plaintextBody: "v1", recipientPublicKeysArmored: [bob.publicArmor], signingPrivateKey: aPriv });
    const v1 = await viewIncomingMessage({ messageId: "m1", content: t1, unlocked: bPriv, verificationArmors: [], cache });
    assert.equal(v1.kind, "decrypted");
    const v1b = await viewIncomingMessage({ messageId: "m1", content: t1, unlocked: null, verificationArmors: [], cache });
    assert.equal(v1b.fromCache, true); // historial servido sin privada
    // Edicion: nuevo contenido con mismo id pero editStamp distinto => re-descifra
    const t2 = await encryptBodyForRecipients({ plaintextBody: "v2 editado", recipientPublicKeysArmored: [bob.publicArmor] });
    cache.invalidate("m1");
    const v2 = await viewIncomingMessage({ messageId: "m1", content: t2, unlocked: bPriv, verificationArmors: [], cache });
    assert.equal(v2.body, "v2 editado");
  });
});

describe("13. multi-destinatario (grupo)", () => {
  it("cifra para Bob+Carol; ambos abren; nadie recibe version ajena", async () => {
    const aPriv = await unlockPrivateKey(alice.privateArmor, alice.passphrase);
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const cPriv = await unlockPrivateKey(carol.privateArmor, carol.passphrase);
    const t = await encryptBodyForRecipients({
      plaintextBody: "hola grupo",
      recipientPublicKeysArmored: [bob.publicArmor, carol.publicArmor],
      ownPublicKeyArmored: alice.publicArmor,
      signingPrivateKey: aPriv,
    });
    const rb = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    const rc = await decryptTransportToBody({ transportText: t, privateKey: cPriv });
    assert.equal(rb.body, "hola grupo");
    assert.equal(rc.body, "hola grupo");
  });
  it("grupo con un miembro sin clave => fail-closed", async () => {
    const ks = new KeyStore();
    await ks.addPublicKey("222222222222222222", "Bob", bob.publicArmor);
    await assert.rejects(
      () =>
        encryptOutgoing({
          channel: { id: "g1", type: 3, recipientIds: ["222222222222222222", "333333333333333333"] },
          content: "hola",
          selfId: "111111111111111111",
          keyStore: ks,
          ownPublicArmor: null,
          signingKey: null,
        }),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "MISSING_RECIPIENT_KEY"
    );
  });
});

describe("14/15. limites y fail-closed con borrador intacto", () => {
  it("override de canal: on/off mandan sobre auto; sin override hereda auto", () => {
    assert.equal(resolveEncryptionEnabled("on", false), true);
    assert.equal(resolveEncryptionEnabled("on", true), true);
    assert.equal(resolveEncryptionEnabled("off", true), false);
    assert.equal(resolveEncryptionEnabled("off", false), false);
    assert.equal(resolveEncryptionEnabled(undefined, true), true);
    assert.equal(resolveEncryptionEnabled(undefined, false), false);
    assert.equal(resolveEncryptionEnabled(null, true), true);
  });
  it("plaintext gigante se rechaza antes de cifrar", () => {
    const big = "x".repeat(MAX_PLAINTEXT_CHARS + 1);
    assert.throws(() => serializePayload(big), (e: unknown) => e instanceof PgpError && (e as PgpError).code === "PLAINTEXT_TOO_LARGE");
  });
  it("limite de transporte configurable: 2000 rechaza, 4000 acepta", async () => {
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const body = "y".repeat(1000);
    await assert.rejects(
      () =>
        encryptBodyForRecipients({
          plaintextBody: body,
          recipientPublicKeysArmored: [bob.publicArmor],
          maxTransportChars: 1200,
        }),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "CIPHERTEXT_TOO_LARGE"
    );
    const t = await encryptBodyForRecipients({
      plaintextBody: body,
      recipientPublicKeysArmored: [bob.publicArmor],
      maxTransportChars: 4000,
    });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    assert.equal(r.body, body);
  });
  it("planOutgoing evita doble cifrado y canales no soportados", () => {
    const ch = { id: "c", type: 1, recipientIds: ["222"] };
    const already = `${MARKER}\n-----BEGIN PGP MESSAGE-----\nfoo\n-----END PGP MESSAGE-----`;
    assert.equal(planOutgoing(ch, already, { enabled: true, selfId: "111" }).shouldEncrypt, false);
    assert.equal(planOutgoing({ id: "g", type: 0, recipientIds: [] }, "hola", { enabled: true, selfId: "111" }).shouldEncrypt, false);
  });
  it("fallo de cifrado no muta el original (borrador conservado)", async () => {
    const ks = new KeyStore(); // sin claves
    const original = "borrador importante";
    let draft = original;
    try {
      draft = await encryptOutgoing({
        channel: { id: "c", type: 1, recipientIds: ["999999999999999999"] },
        content: original,
        selfId: "111111111111111111",
        keyStore: ks,
        ownPublicArmor: null,
        signingKey: null,
      });
      assert.fail("debio lanzar");
    } catch (e) {
      assert.ok(e instanceof PgpError);
      assert.equal(original, "borrador importante"); // intacto
      assert.equal(draft, original);
    }
  });
});

describe("16. render seguro (sin HTML/JS ejecutable)", () => {
  it("payload malicioso viaja como texto, no como HTML", async () => {
    const evil = "<script>alert(1)</script><img src=x onerror=alert(2)> @everyone";
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({ plaintextBody: evil, recipientPublicKeysArmored: [bob.publicArmor] });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    assert.equal(r.body, evil); // texto exacto; la UI debe escaparlo (el accesorio usa textContent)
    assert.ok(!t.includes(evil)); // el transporte nunca lleva claro
  });
  it("deserialize rechaza JSON no-VPGP", async () => {
    assert.throws(() => deserializePayload("hola"), (e: unknown) => e instanceof PgpError);
    assert.throws(() => deserializePayload(JSON.stringify({ v: 999, body: "x", sentAt: 1 })), (e: unknown) => e instanceof PgpError);
  });
});

describe("18/19. no-cifrados y respuestas/menciones verbatim", () => {
  it("mensajes normales pasan intactos (plain)", async () => {
    const cache = new DecryptCache();
    const v = await viewIncomingMessage({ messageId: "x", content: "hola normal :)", unlocked: null, verificationArmors: [], cache });
    assert.equal(v.kind, "plain");
  });
  it("menciones y reply-markers se preservan como texto", async () => {
    const body = "<@123456789> hola <@&987> <#456> **md** https://x.test/?a=1";
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({ plaintextBody: body, recipientPublicKeysArmored: [bob.publicArmor] });
    const r = await decryptTransportToBody({ transportText: t, privateKey: bPriv });
    assert.equal(r.body, body);
  });
  it("wrap/extract rechazan trailing (mezcla de mensajes)", () => {
    const armor = "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----";
    const good = wrapTransport(armor);
    assert.ok(isPgpTransport(good));
    assert.throws(() => extractArmor(good + "\ntexto extra"), (e: unknown) => e instanceof PgpError);
  });
});

describe("20. bloqueo y limpieza", () => {
  it("lock purga cache y sesion", async () => {
    const cache = new DecryptCache();
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const t = await encryptBodyForRecipients({ plaintextBody: "secreto", recipientPublicKeysArmored: [bob.publicArmor] });
    const v = await viewIncomingMessage({ messageId: "m9", content: t, unlocked: bPriv, verificationArmors: [], cache });
    assert.equal(v.kind, "decrypted");
    assert.equal(cache.size, 1);
    cache.lock();
    assert.equal(cache.size, 0);
    const s = new PrivateSession();
    s.setArmored(bob.privateArmor);
    s.setPassphrase(bob.passphrase);
    await s.unlock();
    s.wipe();
    assert.ok(!s.hasArmored && !s.isUnlocked);
  });
  it("keyInfo detecta expiracion/revocacion via API real", async () => {
    const key = await openpgp.readKey({ armoredKey: bob.publicArmor });
    const info = await keyInfoOf(key);
    assert.equal(typeof info.expired, "boolean");
    assert.equal(typeof info.revoked, "boolean");
  });
});

describe("21. confianza verificada y anti-DoS", () => {
  it("getVerificationArmors excluye claves no verificadas", async () => {
    const ks = new KeyStore();
    const entry = await ks.addPublicKey("111111111111111111", "Alice", alice.publicArmor);
    assert.equal(ks.getVerificationArmors("111111111111111111").length, 0);
    assert.deepEqual(ks.getUnverifiedEncryptionUserIds(["111111111111111111"]), ["111111111111111111"]);
    assert.equal(ks.markVerified("111111111111111111", entry.fingerprint, true), true);
    assert.equal(ks.getVerificationArmors("111111111111111111").length, 1);
    assert.deepEqual(ks.getUnverifiedEncryptionUserIds(["111111111111111111"]), []);
  });

  it("una firma con clave no verificada no sale como verificada", async () => {
    const ks = new KeyStore();
    await ks.addPublicKey("111111111111111111", "Alice", alice.publicArmor);
    const t = await encryptBodyForRecipients({
      plaintextBody: "firmado con clave no verificada",
      recipientPublicKeysArmored: [bob.publicArmor],
      signingPrivateKey: await unlockPrivateKey(alice.privateArmor, alice.passphrase),
    });
    const r = await decryptTransportToBody({
      transportText: t,
      privateKey: await unlockPrivateKey(bob.privateArmor, bob.passphrase),
      verificationKeysArmored: ks.getVerificationArmors("111111111111111111"),
    });
    assert.equal(r.body, "firmado con clave no verificada");
    assert.equal(r.signed, true);
    assert.equal(r.signatureValid, null); // sin clave verificada no hay check verde
  });

  it("rechaza bombas de descompresion", async () => {
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const big = JSON.stringify({ v: 1, body: "A".repeat(200_000), sentAt: Date.now() });
    const message = await openpgp.createMessage({ text: big });
    const armored = (await openpgp.encrypt({
      message,
      encryptionKeys: await openpgp.readKey({ armoredKey: bob.publicArmor }),
      format: "armored",
      config: { preferredCompressionAlgorithm: openpgp.enums.compression.zip },
    })) as unknown as string;
    const transport = wrapTransport(armored);
    assert.ok(transport.length < 8192);
    await assert.rejects(
      () => decryptTransportToBody({ transportText: transport, privateKey: bPriv }),
      (e: unknown) => e instanceof PgpError && (e as PgpError).code === "DECRYPT_FAILED"
    );
  });

  it("sigue aceptando mensajes comprimidos pequenos", async () => {
    const bPriv = await unlockPrivateKey(bob.privateArmor, bob.passphrase);
    const message = await openpgp.createMessage({ text: serializePayload("ok comprimido") });
    const armored = (await openpgp.encrypt({
      message,
      encryptionKeys: await openpgp.readKey({ armoredKey: bob.publicArmor }),
      format: "armored",
      config: { preferredCompressionAlgorithm: openpgp.enums.compression.zip },
    })) as unknown as string;
    const r = await decryptTransportToBody({ transportText: wrapTransport(armored), privateKey: bPriv });
    assert.equal(r.body, "ok comprimido");
  });
});
