// Repara el mojibake introducido por PowerShell (Set-Content) en un archivo UTF-8.
// Uso: node scripts/fix-utf8.mjs <archivo>
// Corrige el caso tipico: "—" (E2 80 94) leido como Windows-1252 -> "â€”".
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
    console.error("Uso: node scripts/fix-utf8.mjs <archivo>");
    process.exit(1);
}
let s = readFileSync(file, "utf8");
const before = /Ã|Â|â€|ðŸ/.test(s);
s = s.replace(/^\uFEFF/, "");
s = s.replace(/\u00E2\u20AC\u201D/g, "\u2014");
s = s.replace(/\u00E2\u20AC\u0153/g, "\u201C");
s = s.replace(/\u00E2\u20AC\u009D/g, "\u201D");
writeFileSync(file, s, "utf8");
console.log(`${file}: mojibake antes=${before}, despues=${/Ã|Â|â€|ðŸ/.test(s)}`);
