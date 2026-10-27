/**
 * Genera installer/payload a partir de un build de Vencord que contenga el
 * plugin VencordPGP. Incluye solo los archivos necesarios (sin source maps).
 *
 * Uso:
 *   node scripts/build-installer-payload.mjs <vencord-checkout> [repo-root]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const checkout = process.argv[2];
const repoRoot = resolve(process.argv[3] || process.cwd());
if (!checkout) {
    console.error("Uso: node scripts/build-installer-payload.mjs <vencord-checkout> [repo-root]");
    process.exit(1);
}

const dist = join(checkout, "dist");
const out = join(repoRoot, "installer", "payload");
const files = [
    "patcher.js",
    "preload.js",
    "renderer.js",
    "renderer.css",
    "patcher.js.LEGAL.txt",
    "renderer.js.LEGAL.txt",
];

for (const f of files) {
    if (!existsSync(join(dist, f))) {
        console.error(`Falta ${join(dist, f)}. Compila Vencord primero.`);
        process.exit(1);
    }
}

const renderer = readFileSync(join(dist, "renderer.js"), "utf8");
if (!renderer.includes("VencordPGP")) {
    console.error("El renderer no contiene VencordPGP. Copia el plugin a src/userplugins y recompila.");
    process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const manifestLines = [];
for (const f of files) {
    copyFileSync(join(dist, f), join(out, f));
    const hash = createHash("sha256").update(readFileSync(join(out, f))).digest("hex").toUpperCase();
    manifestLines.push(`${hash} *${f}`);
}

let version = "desconocida";
try {
    version = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8")).version;
} catch { /* noop */ }

let commit = "";
try {
    commit = execFileSync("git", ["-C", checkout, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch { /* noop */ }

const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(out, "VERSION.txt"), [
    "VencordPGP installer payload",
    `Vencord: ${version}${commit ? ` (${commit})` : ""}`,
    `Build: ${stamp}`,
    "Plugin: VencordPGP (userplugin vencordPgp)",
    "Incluye: patcher.js, preload.js, renderer.js, renderer.css (+ licencias)",
    "",
].join("\n"), "utf8");
manifestLines.push(`${createHash("sha256").update(readFileSync(join(out, "VERSION.txt"))).digest("hex").toUpperCase()} *VERSION.txt`);
writeFileSync(join(out, "manifest.sha256"), manifestLines.join("\n") + "\n", "utf8");

const total = files.reduce((n, f) => n + readFileSync(join(out, f)).length, 0);
console.log(`Payload generado en ${out}`);
console.log(`Vencord ${version}${commit ? ` (${commit})` : ""} — ${files.length} archivos, ${(total / 1024).toFixed(0)} KiB`);
