#!/usr/bin/env node
// Build the GitHub wiki pages in wiki/ from docs/ and docs/es/.
//
// Usage: node scripts/build-wiki.mjs
//
// Generated pages (one per docs file) are overwritten on every run. Hand-written
// pages (Home, Inicio, _Sidebar, _Footer, Architecture-and-Design,
// Arquitectura-y-diseno, Contributing-and-Development, Contribuir-y-desarrollo)
// are never touched.
//
// The script rewrites the language switch, relative doc links, and links to
// repository files, then appends a "Related" footer and verifies that every
// internal wiki link resolves to a page in wiki/.

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wikiDir = path.join(root, "wiki");
const repoUrl = "https://github.com/R0b0tik0/VencordPGP";

const pages = {
    en: {
        INSTALL: "Installation",
        INSTALLER: "Windows-Installer",
        KEYS: "Key-Management",
        TRANSPORT: "Transport-Format",
        LIMITATIONS: "Limitations",
        THREAT_MODEL: "Threat-Model",
        TROUBLESHOOTING: "Troubleshooting",
        SECURITY: "Security-Policy"
    },
    es: {
        INSTALL: "Instalacion",
        INSTALLER: "Instalador-de-Windows",
        KEYS: "Gestion-de-claves",
        TRANSPORT: "Formato-de-transporte",
        LIMITATIONS: "Limitaciones",
        THREAT_MODEL: "Modelo-de-amenazas",
        TROUBLESHOOTING: "Solucion-de-problemas",
        SECURITY: "Politica-de-seguridad"
    }
};

const related = {
    en: {
        Installation: ["Home", "Windows-Installer", "Key-Management"],
        "Windows-Installer": ["Home", "Installation", "Key-Management"],
        "Key-Management": ["Home", "Installation", "Security-Policy"],
        "Transport-Format": ["Home", "Architecture-and-Design", "Threat-Model"],
        Limitations: ["Home", "Threat-Model", "Security-Policy"],
        "Threat-Model": ["Home", "Limitations", "Security-Policy"],
        Troubleshooting: ["Home", "Key-Management", "Installation"],
        "Security-Policy": ["Home", "Threat-Model", "Limitations"]
    },
    es: {
        Instalacion: ["Inicio", "Instalador-de-Windows", "Gestion-de-claves"],
        "Instalador-de-Windows": ["Inicio", "Instalacion", "Gestion-de-claves"],
        "Gestion-de-claves": ["Inicio", "Instalacion", "Politica-de-seguridad"],
        "Formato-de-transporte": ["Inicio", "Arquitectura-y-diseno", "Modelo-de-amenazas"],
        Limitaciones: ["Inicio", "Modelo-de-amenazas", "Politica-de-seguridad"],
        "Modelo-de-amenazas": ["Inicio", "Limitaciones", "Politica-de-seguridad"],
        "Solucion-de-problemas": ["Inicio", "Gestion-de-claves", "Instalacion"],
        "Politica-de-seguridad": ["Inicio", "Modelo-de-amenazas", "Limitaciones"]
    }
};

function pageFor(name, lang, preferOther) {
    const map = preferOther ? (lang === "en" ? pages.es : pages.en) : pages[lang];
    return map[name] || null;
}

function rewriteLinks(text, lang) {
    const link = (page, anchor) => `${page}${anchor || ""}`;

    return text
        // Repository files and the release page.
        .replace(/\]\((?:\.\.\/)+LICENSE\)/g, `](${repoUrl}/blob/master/LICENSE)`)
        .replace(/\]\((?:\.\.\/)+releases\)/g, `](${repoUrl}/releases)`)
        // README / README.es -> Home / Inicio.
        .replace(/\]\((?:[^\s()]*\/)?README(?:\.es)?\.md(#[^)]*)?\)/g,
            (_, anchor) => `](${link(lang === "es" ? "Inicio" : "Home", anchor)})`)
        // Explicit cross-language links: docs/*.md -> es/NAME.md.
        .replace(/\]\((?:[^\s()]*\/)?es\/([A-Z_]+)\.md(#[^)]*)?\)/g, (match, name, anchor) => {
            const page = pageFor(name, "es");
            return page ? `](${link(page, anchor)})` : match;
        })
        // Same-language links, including ../NAME.md inside docs/es/ (English docs).
        .replace(/\]\(((?:[^\s()]*\/)*)([A-Z_]+)\.md(#[^)]*)?\)/g, (match, prefix, name, anchor) => {
            const crossLanguage = lang === "es" && prefix.includes("..");
            const page = crossLanguage ? pageFor(name, "en") : pageFor(name, lang);
            return page ? `](${link(page, anchor)})` : match;
        });
}

function build(raw, lang, pageName) {
    let text = raw.replace(/\r\n/g, "\n");

    // Drop the H1: GitHub renders the file name as the page title.
    text = text.replace(/^# [^\n]*\n+/, "");

    // Drop the docs language switch; the wiki switch replaces it.
    text = text.replace(/^\*\*English\*\* \| \[Español\]\([^)]*\)\s*\n/m, "");
    text = text.replace(/^\[English\]\([^)]*\) \| \*\*Español\*\*\s*\n/m, "");

    text = rewriteLinks(text, lang).trim();

    const key = Object.keys(pages.en).find(k => pages.en[k] === pageName)
        || Object.keys(pages.es).find(k => pages.es[k] === pageName);
    const switchTo = lang === "en" ? pages.es[key] : pages.en[key];
    const switchLine = lang === "en"
        ? `**English** | [Español](${switchTo})`
        : `[English](${switchTo}) | **Español**`;

    const relatedLabel = lang === "es" ? "**Relacionado:**" : "**Related:**";
    const links = related[lang][pageName]
        .map(page => `[${page.replace(/-/g, " ")}](${page})`)
        .join(" · ");

    return `${switchLine}\n\n${text}\n\n---\n\n${relatedLabel} ${links}\n`;
}

async function main() {
    let count = 0;
    for (const lang of ["en", "es"]) {
        const dir = lang === "en" ? path.join(root, "docs") : path.join(root, "docs", "es");
        const files = (await readdir(dir)).filter(name => name.endsWith(".md"));
        for (const file of files) {
            const name = file.replace(/\.md$/, "");
            const pageName = pages[lang][name];
            if (!pageName) continue;
            const raw = await readFile(path.join(dir, file), "utf8");
            await writeFile(path.join(wikiDir, `${pageName}.md`), build(raw, lang, pageName), "utf8");
            count += 1;
            console.log(`wiki/${pageName}.md  <-  ${path.relative(root, path.join(dir, file))}`);
        }
    }
    console.log(`\n${count} documentation pages generated.`);

    // Verify every internal wiki link resolves to a page file.
    const files = (await readdir(wikiDir)).filter(name => name.endsWith(".md"));
    const known = new Set(files.map(name => name.replace(/\.md$/, "")));
    const broken = [];
    for (const file of files) {
        const text = await readFile(path.join(wikiDir, file), "utf8");
        for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
            const target = match[1];
            if (/^(https?:|mailto:|#)/.test(target)) continue;
            const page = target.replace(/#.*$/, "");
            if (!page || page.startsWith("_")) continue;
            if (!known.has(page)) broken.push(`${file}: ${target}`);
        }
    }
    if (broken.length) {
        console.error("\nBroken wiki links:");
        for (const entry of broken) console.error(`  ${entry}`);
        process.exit(1);
    }
    console.log("All internal wiki links resolve.");
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
