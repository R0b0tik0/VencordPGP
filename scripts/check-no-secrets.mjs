import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".";
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "pgp-keys", "coverage"]);
const SKIP_PREFIXES = ["installer/payload/"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".md", ".txt", ".json", ".ps1", ".cmd", ".yml", ".yaml"]);

// Fail only on REAL blocks: header + a long base64 line. This allows
// documentation placeholders such as "-----BEGIN PGP PRIVATE KEY BLOCK-----".
const banned = [
  /BEGIN PGP PRIVATE KEY BLOCK-----\s*\r?\n(?:[^\r\n]*\r?\n)*?\s*[A-Za-z0-9+/=]{64,}/,
  /(?<![\w])passphrase\s*[:=]\s*["'][^"']{4,}["']/i,
];

function normalize(p) {
  return p.split("\\").join("/");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = normalize(join(dir, entry.name)).replace(/^\.\//, "");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(rel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_PREFIXES.some(prefix => rel.startsWith(prefix))) continue;
    if (rel.includes("/tests/") || /\.test\.[cm]?[jt]sx?$/.test(rel)) continue;
    if (!EXTENSIONS.has("." + entry.name.split(".").pop())) continue;
    out.push(rel);
  }
  return out;
}

let bad = 0;
let scanned = 0;
for (const file of walk(ROOT)) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  scanned++;
  for (const re of banned) {
    if (re.test(text)) {
      console.error(`SECRET? ${file} matches ${re}`);
      bad++;
    }
  }
}

if (bad > 0) process.exit(1);
console.log(`check-no-secrets: OK (${scanned} files scanned; no private keys or passphrase literals)`);
