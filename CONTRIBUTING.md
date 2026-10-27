# Contributing

**English** | [Español](docs/es/CONTRIBUTING.md)

Thanks for considering a contribution. This project handles cryptography and
private messages, so changes are reviewed conservatively.

## Setup

```powershell
git clone <your-fork>
cd cifrador-discord
npm install
npm test
```

Requirements: Node.js 22+ and npm. For plugin builds you also need a Vencord
checkout and `corepack pnpm`; see [docs/INSTALL.md](docs/INSTALL.md).

## Repository layout

- `src/` — standalone core, NodeNext ESM. Relative imports end in `.js`.
- `vencord-plugin/vencordPgp/` — Vencord plugin. Its `core/` folder is a copy of
  `src/` with the `.js` suffixes stripped.
- `scripts/` — sync, payload build, key generator, secret scan, installer test.
- `installer/` — Windows installer and prebuilt payload.
- `docs/` — English documentation; `docs/es/` — Spanish documentation.

### The two core copies

`src/*.ts` and `vencord-plugin/vencordPgp/core/*.ts` must stay identical except
for import extensions. After editing the core:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

Do not edit the plugin's `core/` copy by hand. The sync script is the only step
required; `src/` already contains the message-limit tweaks.

## Tests

```powershell
npm test            # build + 57 tests
npm run testTsc     # type-check
npm run lint        # secret scan
npm run test:installer  # Windows installer E2E (sandbox)
```

- Add tests for behavior changes in `src/tests/`.
- Do not weaken a test to make a change pass.
- The tests generate ephemeral ECC keys; they do not need network access.
- If you change the installer, run `npm run test:installer`.
- If you change the plugin, build it in a Vencord checkout with
  `corepack pnpm testTsc && corepack pnpm build`.

## Code style

- Match the surrounding style: TypeScript, 2 spaces in the core, 4 in the
  plugin, double quotes.
- Keep the core free of Discord imports so it stays testable in Node.
- No custom cryptography, no new network calls, no keyservers.
- Never log plaintext, private keys, passphrases, or decrypted message bodies.
- New behavior that can fail must fail closed and preserve the user's draft.

## Documentation

- **English is the canonical language.** Every user-facing document has an
  English version at `docs/<NAME>.md` and a Spanish mirror at
  `docs/es/<NAME>.md`.
- `README.md` (English) and `README.es.md` (Spanish) must be updated together.
- Add a language switch line at the top of each page:
  `**English** | [Español](es/NAME.md)` or `[English](../NAME.md) | **Español**`.
- Keep commands, flags, limits, and file paths identical in both versions.
- Update the documentation index in both READMEs when adding a page.
- If you change behavior, update the relevant page(s), including
  `LIMITATIONS.md`, `THREAT_MODEL.md`, and `SECURITY.md` when applicable.

## Secrets

Never commit private keys, passphrases, tokens, or real message content.
`npm run lint` scans the tree for OpenPGP private-key blocks and passphrase
literals. Test fixtures must use ephemeral keys generated at runtime.

`pgp-keys/` is gitignored. Do not remove it from `.gitignore`.

## Pull requests

Before opening a PR:

- [ ] `npm test` passes.
- [ ] `npm run testTsc` passes.
- [ ] `npm run lint` passes.
- [ ] The two core copies are in sync.
- [ ] English and Spanish docs are updated.
- [ ] No secrets, local paths, or machine-specific files are included.
- [ ] The PR explains the security impact of the change.

Small, focused PRs are easier to review. If a change affects the transport
format, key storage, trust decisions, or the fail-closed behavior, open an issue
first and describe the threat-model impact.

## Commit messages

Use short imperative subjects, for example:

```text
Fix signature verification for unverified keys
Add Spanish translations for installer docs
```

Reference an issue when one exists. Do not mix refactors and behavior changes in
the same commit if you can avoid it.

## License

By contributing, you agree that your contribution is licensed under
GPL-3.0-or-later, the license of this project.
