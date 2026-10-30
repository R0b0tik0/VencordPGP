**English** | [Español](Contribuir-y-desarrollo)

Thanks for considering a contribution. This project handles cryptography and private messages, so changes are reviewed conservatively. Read [Architecture and design](Architecture-and-Design) first if the code is new to you.

## Setup

```powershell
git clone <your-fork>
cd cifrador-discord
npm install
npm test
```

Requirements: Node.js 22+ and npm. For plugin builds you also need a Vencord checkout and `corepack pnpm`; see [Installation](Installation).

## Repository layout

- `src/` — standalone core, NodeNext ESM. Relative imports end in `.js`.
- `vencord-plugin/vencordPgp/` — Vencord plugin. Its `core/` folder is a copy of `src/` with the `.js` suffixes stripped.
- `scripts/` — sync, payload build, key generator, secret scan, installer test, wiki build.
- `installer/` — Windows installer and prebuilt payload.
- `docs/` — English documentation; `docs/es/` — Spanish documentation.
- `wiki/` — GitHub wiki pages (generated from `docs/` plus hand-written index pages).

## The two core copies

`src/*.ts` and `vencord-plugin/vencordPgp/core/*.ts` must stay identical except for import extensions. After editing the core:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

Do not edit the plugin's `core/` copy by hand. The sync script is the only step required; `src/` already contains the message-limit tweaks (`maxTransportChars`, `MAX_PLAINTEXT_CHARS=3000`). The script also checks for encoding corruption.

## Tests

```powershell
npm test                # build + core and vault suites
npm run testTsc         # type-check
npm run lint            # secret scan (not ESLint)
npm run test:installer  # Windows installer E2E (sandbox)
```

- Add tests for behavior changes in `src/tests/`.
- Do not weaken a test to make a change pass.
- The tests generate ephemeral ECC keys; they do not need network access.
- If you change the installer, run `npm run test:installer`.
- If you change the plugin, build it in a Vencord checkout with `corepack pnpm testTsc && corepack pnpm build`.

## Vencord plugin rules

- Install it as a **userplugin**: copy the folder to `<Vencord>\src\userplugins\vencordPgp\`.
- Build and deploy with `corepack pnpm testTsc && corepack pnpm build` (pnpm is pinned via corepack, not global), then copy `dist/*` to `%APPDATA%\Vencord\dist`.
- Never `import ... from "react"`; import `React` and hooks from `@webpack/common`.
- Never name a plugin setting `enabled`; it collides with Vencord's own flag. The global toggle is `pgpEnabled`.
- The Vencord checkout needs `@openpgp/web-stream-tools` as a devDependency because Vencord builds with `skipLibCheck: false`.
- `corepack pnpm lint` may fail in the Vencord checkout on these files (missing upstream GPL header, import order). `testTsc` and `build` are the gates.
- The interface follows Discord's language (`language` setting: `auto|es|en`). Every new UI string goes into both catalogs in `i18n.ts`; `en` is typed against `es`, so a missing key fails type-check.
- `core/` carries no UI text: `PgpError` messages are translated by code in `errorText()`. Do not duplicate those texts in components.
- The Windows installer keeps its own `$script:Messages` table (`es`/`en`) and uses `T "key" @(args)`. Keep both tables in sync.

## Code style

- Match the surrounding style: TypeScript, 2 spaces in the core, 4 in the plugin, double quotes.
- Keep the core free of Discord imports so it stays testable in Node.
- No custom cryptography, no new network calls, no keyservers.
- Never log plaintext, private keys, passphrases, or decrypted message bodies.
- New behavior that can fail must fail closed and preserve the user's draft.

## Documentation

- **English is the canonical language.** Every user-facing document has an English version at `docs/<NAME>.md` and a Spanish mirror at `docs/es/<NAME>.md`.
- `README.md` (English) and `README.es.md` (Spanish) must be updated together.
- Keep commands, flags, limits, and file paths identical in both versions.
- Update the documentation index in both READMEs when adding a page.
- If you change behavior, update the relevant page(s), including `LIMITATIONS.md`, `THREAT_MODEL.md`, and `SECURITY.md` when applicable.
- The wiki mirrors `docs/`; regenerate it with `node scripts/build-wiki.mjs` after doc changes and publish it with `scripts/publish-wiki.ps1`.

## Secrets

Never commit private keys, passphrases, tokens, or real message content. `npm run lint` scans the tree for OpenPGP private-key blocks and passphrase literals. Test fixtures must use ephemeral keys generated at runtime.

`pgp-keys/` is gitignored. Do not remove it from `.gitignore`.

## Pull requests

Before opening a PR:

- [ ] `npm test` passes.
- [ ] `npm run testTsc` passes.
- [ ] `npm run lint` passes.
- [ ] The two core copies are in sync.
- [ ] English and Spanish docs are updated.
- [ ] The wiki is rebuilt if docs changed.
- [ ] No secrets, local paths, or machine-specific files are included.
- [ ] The PR explains the security impact of the change.

Small, focused PRs are easier to review. If a change affects the transport format, key storage, trust decisions, or the fail-closed behavior, open an issue first and describe the threat-model impact.

## Commit messages

Use short imperative subjects, for example:

```text
Fix signature verification for unverified keys
Add Spanish translations for installer docs
```

Reference an issue when one exists. Do not mix refactors and behavior changes in the same commit if you can avoid it.

## License

By contributing, you agree that your contribution is licensed under GPL-3.0-or-later, the license of this project.

---

**Related:** [Architecture and design](Architecture-and-Design) · [Installation](Installation) · [Security policy](Security-Policy)
