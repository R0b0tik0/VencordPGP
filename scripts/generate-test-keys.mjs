/**
 * Genera un par de claves OpenPGP para pruebas del plugin VencordPGP.
 *
 * Uso:
 *   node scripts/generate-test-keys.mjs "TuNombre" "passphrase-fuerte" [carpeta]
 *
 * - Escribe <slug>-private.asc y <slug>-public.asc en la carpeta indicada
 *   (por defecto ./pgp-keys, ignorada por .gitignore).
 * - NUNCA imprime la clave privada por consola.
 * - Comparte solo la publica con la otra persona; la privada no sale de tu equipo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as openpgp from "openpgp";

const [name, passphrase, outArg] = process.argv.slice(2);
if (!name || !passphrase) {
    console.error('Uso: node scripts/generate-test-keys.mjs "TuNombre" "passphrase-fuerte" [carpeta]');
    process.exit(1);
}
if (passphrase.length < 12) {
    console.error("La passphrase debe tener al menos 12 caracteres.");
    process.exit(1);
}

const outDir = outArg || "pgp-keys";
mkdirSync(outDir, { recursive: true });
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "usuario";

const { privateKey, publicKey, revocationCertificate } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name, email: `${slug}@local.test` }],
    passphrase,
    format: "armored",
});

const privPath = join(outDir, `${slug}-private.asc`);
const pubPath = join(outDir, `${slug}-public.asc`);
const revPath = join(outDir, `${slug}-revocation.asc`);
writeFileSync(privPath, privateKey, "utf8");
writeFileSync(pubPath, publicKey, "utf8");
writeFileSync(revPath, revocationCertificate, "utf8");

const key = await openpgp.readKey({ armoredKey: publicKey });
const fp = key.getFingerprint().toUpperCase();
console.log("Claves generadas:");
console.log("  privada :", privPath, "(NO compartir, NO subir)");
console.log("  publica :", pubPath, "(comparte esta con la otra persona)");
console.log("  revoc.  :", revPath, "(guardala para poder revocar la clave)");
console.log("Huella:", fp.replace(/(.{4})/g, "$1 ").trim());
console.log("\nSiguiente paso: compara esta huella con la otra persona por un canal independiente.");
