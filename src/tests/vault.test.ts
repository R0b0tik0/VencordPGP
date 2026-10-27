import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as openpgp from "openpgp";

import { decryptVault, encryptVault, parseVaultBlob, MIN_PASSWORD_LENGTH } from "../keyVault.js";
import { PgpError } from "../errors.js";

async function makeArmor(): Promise<string> {
    const { privateKey } = await openpgp.generateKey({
        type: "ecc",
        curve: "curve25519Legacy" as never,
        userIDs: [{ name: "Vault", email: "vault@test.local" }],
        passphrase: "key-pass-123",
        format: "armored",
    });
    return privateKey as string;
}

describe("keyVault: guardado cifrado de la clave privada", () => {
    it("roundtrip armor + passphrase", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor, passphrase: "key-pass-123" }, "storage-pass-123");
        assert.equal(blob.v, 1);
        assert.equal(blob.kdf, "PBKDF2-SHA256");
        assert.ok(blob.iterations >= 100_000);

        const out = await decryptVault(blob, "storage-pass-123");
        assert.equal(out.armor, armor);
        assert.equal(out.passphrase, "key-pass-123");
    });

    it("el blob no contiene el claro", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor, passphrase: "key-pass-123" }, "storage-pass-123");
        const serialized = JSON.stringify(blob);
        assert.ok(!serialized.includes("BEGIN PGP PRIVATE KEY"));
        assert.ok(!serialized.includes("key-pass-123"));
    });

    it("contrasena incorrecta falla", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor }, "storage-pass-123");
        await assert.rejects(
            () => decryptVault(blob, "otra-contrasena"),
            (e: unknown) => e instanceof PgpError && (e as PgpError).code === "VAULT_WRONG_PASSWORD"
        );
    });

    it("blob manipulado falla", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor }, "storage-pass-123");
        const tampered = { ...blob, cipher: blob.cipher.slice(0, -4) + "AAAA" };
        await assert.rejects(
            () => decryptVault(tampered, "storage-pass-123"),
            (e: unknown) => e instanceof PgpError
        );
    });

    it("exige contrasena de al menos MIN_PASSWORD_LENGTH", async () => {
        const armor = await makeArmor();
        await assert.rejects(
            () => encryptVault({ armor }, "corta"),
            (e: unknown) => e instanceof PgpError && (e as PgpError).code === "VAULT_INVALID"
        );
        assert.ok(MIN_PASSWORD_LENGTH >= 8);
    });

    it("armor invalido se rechaza", async () => {
        await assert.rejects(
            () => encryptVault({ armor: "no es una clave" }, "storage-pass-123"),
            (e: unknown) => e instanceof PgpError && (e as PgpError).code === "VAULT_INVALID"
        );
    });

    it("parseVaultBlob valida el JSON", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor }, "storage-pass-123");
        assert.deepEqual(parseVaultBlob(JSON.stringify(blob)), blob);
        assert.throws(() => parseVaultBlob("{no json"), (e: unknown) => e instanceof PgpError);
    });

    it("contrasena unicode funciona", async () => {
        const armor = await makeArmor();
        const blob = await encryptVault({ armor, passphrase: "clave-ñ-🔒" }, "contraseña-ñ-🔒-larga");
        const out = await decryptVault(blob, "contraseña-ñ-🔒-larga");
        assert.equal(out.passphrase, "clave-ñ-🔒");
    });
});
