#!/usr/bin/env node
/**
 * Rebuilds installer/payload (and optionally the release ZIP) from the latest
 * Vencord release with the VencordPGP userplugin.
 *
 * Usage:
 *   node scripts/update-vencord-payload.mjs
 *   node scripts/update-vencord-payload.mjs --version v1.15.16
 *   node scripts/update-vencord-payload.mjs --install
 *   node scripts/update-vencord-payload.mjs --no-zip --clean
 *
 * Options:
 *   --version <tag|latest>  Vencord tag to build (default: latest release tag)
 *   --dir <path>            checkout directory (default: <temp>/vencord-pgp-build)
 *   --fresh                 delete and clone the checkout even if it exists
 *   --clean                 remove the checkout after a successful build
 *   --no-zip                do not rebuild VencordPGP-Installer.zip
 *   --install               run the Windows installer after building
 *   --help                  show this help
 *
 * The script stops at the first failure. If Vencord changed an API used by the
 * plugin, the type-check fails and the checkout is kept for inspection; update
 * the plugin, then run the script again.
 */
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const vencordRepo = "https://github.com/Vendicated/Vencord.git";

function hasFlag(name) {
    return args.includes(name);
}

function argValue(name, fallback) {
    const index = args.indexOf(name);
    if (index !== -1 && index + 1 < args.length) return args[index + 1];
    const prefix = name + "=";
    const inline = args.find(a => a.startsWith(prefix));
    return inline ? inline.slice(prefix.length) : fallback;
}

function printHelp() {
    const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const start = text.indexOf("/**");
    const end = text.indexOf("*/", start + 3);
    console.log(text.slice(start + 3, end).replace(/^ \* ?/gm, "").trim());
}

function compareTags(a, b) {
    const pa = a.slice(1).split(".").map(Number);
    const pb = b.slice(1).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

function latestTag() {
    const output = execFileSync("git", ["ls-remote", "--tags", "--refs", vencordRepo], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
    });
    const tags = output
        .split(/\r?\n/)
        .map(line => line.split("\t")[1])
        .filter(Boolean)
        .map(ref => ref.replace("refs/tags/", ""))
        .filter(tag => /^v\d+\.\d+\.\d+$/.test(tag));
    if (tags.length === 0) throw new Error("No Vencord release tags found.");
    return tags.sort(compareTags).at(-1);
}

function normalizeTag(input) {
    const tag = input.startsWith("v") ? input : "v" + input;
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
        throw new Error(`Invalid Vencord tag: ${input} (expected vX.Y.Z)`);
    }
    return tag;
}

function runFile(command, commandArgs, options = {}) {
    console.log(`\n> ${command} ${commandArgs.join(" ")}`);
    execFileSync(command, commandArgs, { stdio: "inherit", ...options });
}

function runShell(command, cwd) {
    console.log(`\n> ${command}`);
    execSync(command, { cwd, stdio: "inherit" });
}

function pnpm(commandArgs, cwd) {
    runShell(`corepack pnpm ${commandArgs.join(" ")}`, cwd);
}

function main() {
    if (hasFlag("--help") || hasFlag("-h")) {
        printHelp();
        return;
    }

    const versionArg = argValue("--version", "latest");
    const tag = versionArg === "latest" ? latestTag() : normalizeTag(versionArg);
    const checkoutBase = resolve(argValue("--dir", join(tmpdir(), "vencord-pgp-build")));
    const checkout = join(checkoutBase, tag);
    const fresh = hasFlag("--fresh");
    const clean = hasFlag("--clean");
    const noZip = hasFlag("--no-zip");
    const install = hasFlag("--install");

    console.log("VencordPGP payload update");
    console.log(`Vencord: ${tag}`);
    console.log(`Checkout: ${checkout}`);
    console.log(`Repo: ${repoRoot}`);

    mkdirSync(checkoutBase, { recursive: true });

    let reuse = false;
    if (existsSync(checkout) && !fresh) {
        try {
            const current = execFileSync("git", ["-C", checkout, "describe", "--tags", "--exact-match"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            reuse = current === tag;
        } catch {
            reuse = false;
        }
    }

    if (existsSync(checkout) && !reuse) {
        console.log(`\nRemoving old checkout: ${checkout}`);
        rmSync(checkout, { recursive: true, force: true });
    }

    if (!reuse) {
        runFile("git", ["clone", "--depth", "1", "--branch", tag, vencordRepo, checkout], { cwd: checkoutBase });
    } else {
        console.log(`\nReusing checkout: ${checkout}`);
    }

    const pluginSource = join(repoRoot, "vencord-plugin", "vencordPgp");
    const pluginDest = join(checkout, "src", "userplugins", "vencordPgp");
    if (!existsSync(join(pluginSource, "index.tsx"))) {
        throw new Error(`Plugin source not found: ${pluginSource}`);
    }
    mkdirSync(dirname(pluginDest), { recursive: true });
    rmSync(pluginDest, { recursive: true, force: true });
    cpSync(pluginSource, pluginDest, { recursive: true });
    console.log(`\nPlugin copied to: ${pluginDest}`);

    pnpm(["add", "openpgp@6.3.2"], checkout);
    pnpm(["add", "-D", "@openpgp/web-stream-tools"], checkout);

    const pkg = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
    const typeCheck = pkg.scripts?.["test:ts"] ? "test:ts" : pkg.scripts?.testTsc ? "testTsc" : null;
    if (!typeCheck) {
        throw new Error("No type-check script found in the Vencord checkout (test:ts/testTsc).");
    }
    pnpm([typeCheck], checkout);
    pnpm(["build"], checkout);

    const renderer = readFileSync(join(checkout, "dist", "renderer.js"), "utf8");
    if (!renderer.includes("VencordPGP")) {
        throw new Error("The built renderer does not contain VencordPGP.");
    }

    runFile(process.execPath, [join(repoRoot, "scripts", "build-installer-payload.mjs"), checkout, repoRoot], {
        cwd: repoRoot,
    });

    if (!noZip) {
        if (process.platform !== "win32") {
            console.warn("\nSkipping ZIP: scripts/build-installer-zip.ps1 requires Windows PowerShell.");
        } else {
            runFile("powershell", [
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", join(repoRoot, "scripts", "build-installer-zip.ps1"),
            ], { cwd: repoRoot });
        }
    }

    if (install) {
        if (process.platform !== "win32") {
            throw new Error("--install is only supported on Windows.");
        }
        runFile("powershell", [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", join(repoRoot, "installer", "VencordPGP-Installer.ps1"),
            "-Install",
        ], { cwd: repoRoot });
    }

    if (clean) {
        rmSync(checkout, { recursive: true, force: true });
        console.log(`\nCheckout removed: ${checkout}`);
    } else {
        console.log(`\nCheckout kept for the next run: ${checkout}`);
    }

    console.log("\nDone. Payload and installer ZIP are up to date.");
}

try {
    main();
} catch (error) {
    console.error("\nERROR: " + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
}
