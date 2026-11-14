#!/usr/bin/env node
/**
 * Rebuilds installer/payload (and optionally the release ZIP) from a Vencord
 * release tag, branch tip, or specific commit, with the VencordPGP userplugin.
 *
 * Usage:
 *   node scripts/update-vencord-payload.mjs
 *   node scripts/update-vencord-payload.mjs --version v1.15.17
 *   node scripts/update-vencord-payload.mjs --ref main
 *   node scripts/update-vencord-payload.mjs --ref <full-40-char-sha>
 *   node scripts/update-vencord-payload.mjs --install
 *   node scripts/update-vencord-payload.mjs --no-zip --clean
 *
 * Options:
 *   --version <tag|latest>  Vencord release tag to build (default: latest release tag)
 *   --ref <branch|sha>      Build the tip of a branch or a specific commit instead of a
 *                           release tag (e.g. --ref main to include unreleased fixes)
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

function remoteSha(ref) {
    const output = execFileSync("git", ["ls-remote", vencordRepo, ref], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    const line = output.trim().split(/\r?\n/).find(Boolean);
    return line ? line.split("\t")[0] : null;
}

// Resolves what to build: { kind, name, sha, dirName, fetchRef }.
function resolveTarget() {
    const refArg = argValue("--ref", null);
    const versionArg = argValue("--version", "latest");

    if (refArg) {
        if (args.includes("--version")) {
            throw new Error("Use either --version or --ref, not both.");
        }
        if (/^[0-9a-f]{7,40}$/i.test(refArg)) {
            if (refArg.length !== 40) {
                throw new Error("--ref with a commit requires the full 40-character SHA.");
            }
            const sha = refArg.toLowerCase();
            return { kind: "commit", name: refArg, sha, dirName: `commit-${sha.slice(0, 7)}`, fetchRef: sha };
        }
        const sha = remoteSha(`refs/heads/${refArg}`);
        if (!sha) throw new Error(`Vencord branch not found upstream: ${refArg}`);
        return {
            kind: "branch",
            name: refArg,
            sha,
            dirName: refArg.replace(/[^\w.-]+/g, "-"),
            fetchRef: refArg,
        };
    }

    const tag = versionArg === "latest" ? latestTag() : normalizeTag(versionArg);
    const sha = remoteSha(`refs/tags/${tag}`);
    if (!sha) throw new Error(`Vencord tag not found upstream: ${tag}`);
    return { kind: "tag", name: tag, sha, dirName: tag, fetchRef: tag };
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

function checkoutVencord(target, checkoutBase, checkout, fresh) {
    const headMatches = () => {
        try {
            const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            return head === target.sha;
        } catch {
            return false;
        }
    };

    if (existsSync(checkout) && !fresh && headMatches()) {
        console.log(`\nReusing checkout: ${checkout} (${target.sha.slice(0, 7)})`);
        return;
    }

    if (existsSync(checkout) && !fresh && target.kind !== "tag") {
        console.log(`\nUpdating checkout in place: ${checkout}`);
        try {
            runFile("git", ["-C", checkout, "fetch", "--depth", "1", "origin", target.fetchRef], { cwd: checkoutBase });
            runFile("git", ["-C", checkout, "checkout", "-f", "FETCH_HEAD"], { cwd: checkoutBase });
            if (headMatches()) return;
            console.warn("\nIn-place update did not reach the requested commit; re-cloning.");
        } catch {
            console.warn("\nIn-place update failed; re-cloning.");
        }
    }

    if (existsSync(checkout)) {
        console.log(`\nRemoving old checkout: ${checkout}`);
        rmSync(checkout, { recursive: true, force: true });
    }

    if (target.kind === "tag") {
        runFile("git", ["clone", "--depth", "1", "--branch", target.name, vencordRepo, checkout], { cwd: checkoutBase });
    } else {
        mkdirSync(checkout, { recursive: true });
        runFile("git", ["init"], { cwd: checkout });
        runFile("git", ["remote", "add", "origin", vencordRepo], { cwd: checkout });
        runFile("git", ["fetch", "--depth", "1", "origin", target.fetchRef], { cwd: checkout });
        runFile("git", ["checkout", "-f", "FETCH_HEAD"], { cwd: checkout });
    }

    if (!headMatches()) {
        throw new Error(`Checkout HEAD does not match the requested commit ${target.sha}.`);
    }
}

function main() {
    if (hasFlag("--help") || hasFlag("-h")) {
        printHelp();
        return;
    }

    const target = resolveTarget();
    const checkoutBase = resolve(argValue("--dir", join(tmpdir(), "vencord-pgp-build")));
    const checkout = join(checkoutBase, target.dirName);
    const fresh = hasFlag("--fresh");
    const clean = hasFlag("--clean");
    const noZip = hasFlag("--no-zip");
    const install = hasFlag("--install");

    console.log("VencordPGP payload update");
    console.log(`Vencord: ${target.kind === "tag" ? target.name : `${target.name} @ ${target.sha.slice(0, 7)}`}`);
    console.log(`Checkout: ${checkout}`);
    console.log(`Repo: ${repoRoot}`);

    mkdirSync(checkoutBase, { recursive: true });
    checkoutVencord(target, checkoutBase, checkout, fresh);

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

    const refLabel = target.kind === "tag" ? null : `${target.name} @ ${target.sha.slice(0, 7)}`;
    const payloadArgs = [join(repoRoot, "scripts", "build-installer-payload.mjs"), checkout, repoRoot];
    if (refLabel) payloadArgs.push(refLabel);
    runFile(process.execPath, payloadArgs, { cwd: repoRoot });

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
