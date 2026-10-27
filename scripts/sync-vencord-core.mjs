// Copia los ficheros nucleo del proyecto standalone al plugin de Vencord,
// quitando las extensiones .js de los imports relativos (resolucion bundler).
// Se ejecuta con: node scripts/sync-vencord-core.mjs <destino>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const dstDir = process.argv[2];
if (!dstDir) {
    console.error("Uso: node scripts/sync-vencord-core.mjs <carpeta-core-destino>");
    process.exit(1);
}

const files = [
    "errors.ts", "transport.ts", "serializer.ts", "crypto.ts", "keyStore.ts",
    "channelPolicy.ts", "cache.ts", "session.ts", "outgoing.ts", "incoming.ts",
    "keyVault.ts",
];

let bad = 0;
for (const f of files) {
    let s = readFileSync(join(srcDir, f), "utf8");
    s = s.replace(/(from\s+"\.{1,2}\/[^"]+)\.js"/g, '$1"');
    writeFileSync(join(dstDir, f), s, "utf8");
    if (/Ã|Â|â€|ðŸ/.test(s)) {
        bad++;
        console.error(`MOJIBAKE detectado en ${f}`);
    }
}
console.log(bad === 0 ? `OK: ${files.length} ficheros sincronizados sin mojibake.` : `FALLO: ${bad} ficheros con mojibake.`);
process.exit(bad === 0 ? 0 : 1);
