# AGENTS.md — vencord-pgp

OpenPGP encryption plugin for Vencord, plus a standalone core and a Windows installer.
Git repository with GitHub Actions CI (Node 22/24: build, tests, type-check, secret scan).
There is no signed release pipeline yet.

## Layout / source of truth
- `src/*.ts` — standalone Node/TS core (crypto, transport, serializer, keyStore, channelPolicy, cache, session, outgoing, incoming, keyVault). Tested here.
- `src/tests/core.test.ts` + `src/tests/vault.test.ts` — the test suites (`node --test dist/tests/*.test.js`).
- `vencord-plugin/vencordPgp/` — the actual Vencord plugin (`index.tsx`, `render.ts`, `PgpAccessory.tsx`, `PgpPanel.tsx`, `PgpLockButton.tsx`, `AssignKeyModal.tsx`, `SaveVaultModal.tsx`, `StoredKeyModal.tsx`, `vault.ts`, `dm.ts`, `icons.tsx`, `state.ts`, `core/`). NOT type-checked by this repo's `tsconfig.json` (`include: ["src/**/*"]`).
- `installer/` — Windows installer + `payload/` (prebuilt Vencord renderer) and manifest.
- `scripts/` — sync, payload generation, key generator, secret scan, installer sandbox test.

## Commands
- `npm run build` — `tsc` (NodeNext) → `dist/`.
- `npm test` — build then `node --test dist/tests/*.test.js` (~1.2s; generates ephemeral ECC keys, no network).
- Single test: `npm run build && node --test --test-name-pattern="roundtrip" dist/tests/core.test.js`
- `npm run testTsc` — `tsc --noEmit`.
- `npm run lint` — NOT ESLint. Runs `scripts/check-no-secrets.mjs` and fails on real private-key blocks / passphrase literals across the tree (skips `node_modules`, `dist`, `pgp-keys`, `installer/payload`, tests).
- `npm run test:installer` — PowerShell sandbox E2E for the installer; does not touch the real Discord/Vencord install.

## Two copies of the core (critical)
- `src/*.ts` is NodeNext ESM: relative imports MUST end in `.js`.
- `vencord-plugin/vencordPgp/core/*.ts` must stay byte-identical to `src/*.ts` **except** the `.js` is stripped (Vencord builds with a bundler).
- Sync one way: `node scripts/sync-vencord-core.mjs <core-dir>`. That is enough — `src` already contains the limit tweaks.

## Vencord plugin quirks
- Install as a **userplugin**: copy the folder to `<Vencord>/src/userplugins/vencordPgp/`. Build/deploy with `corepack pnpm testTsc && corepack pnpm build` (pnpm is pinned via corepack, not global) then copy `dist/*` to `%APPDATA%\Vencord\dist`.
- Never `import ... from "react"` — Vencord bans it; import `React`/hooks from `@webpack/common`.
- Never name a plugin setting `enabled` — it collides with Vencord's own `plugins.<name>.enabled` flag. The global toggle is `pgpEnabled`.
- The Vencord checkout needs `@openpgp/web-stream-tools` (devDependency) because Vencord sets `skipLibCheck: false`, or `testTsc` fails on openpgp types.
- `corepack pnpm lint` in the Vencord checkout may fail on these files (no upstream GPL header / import order); rely on `testTsc` + `build` as the gates.
- Incoming display: the ciphertext is NOT rewritten in the store. `render.ts` only decrypts into RAM; `PgpAccessory.tsx` renders the plaintext via `ReactDOM.createPortal` into a container inserted right after `#message-content-<id>` (so reactions/actions stay below like a normal message), hiding the original content; `ver cifrado` / `ver descifrado` toggles. No `updateMessage`/`MessageUpdaterAPI` involved. Keep the hidden-ciphertext default.
- Decryption loop hazard: `decryptMessage` must NOT call `notifyState()` for results already in `decryptCache` (it returns early). Notifying on a cached error causes render→decrypt→notify→… and freezes/crashes the client. On unlock/key changes call `resetDecryptionCache()` to retry.
- Invalid signatures must NOT throw/abort: `decryptTransportToBody` returns the body with `signatureValid: false` and the UI marks it red (`vc-pgp-bad-sig`); a mismatched/outdated public key must not hide the message.
- Encrypted private key vault: `vault.ts` stores a PBKDF2-SHA256 + AES-256-GCM blob in Vencord `DataStore` (IndexedDB, local), never in settings/cloud. `core/keyVault.ts` is the tested crypto (WebCrypto); the storage password is never persisted. `StoredKeyModal.tsx` prompts on demand (when sending while locked), NOT at startup.
- `openpgp` v6: use curve `"curve25519Legacy"`; the TS types reject `"curve25519"`.
- Per-conversation encryption is `settings.channelOverrides` (`"on" | "off"`, CUSTOM, public metadata) + `resolveEncryptionEnabled(override, autoEncryptDMs)` in `core/channelPolicy`. The `chatBarButton` lock (`PgpLockButton.tsx`) toggles it (left click); right click opens a native `ContextMenuApi` menu with assign-recipient-key, **save my private key vault** (`SaveVaultModal.tsx`), load/block key, and open manager. Keep these paths in sync with `preSend`/`preEdit`.
- GIF/sticker messages intentionally bypass encryption (`GIF_URL_RE` + `props.hasStickers` in `preSend`): Discord needs the original URL/sticker to render it. Only the GIF/sticker itself is sent in clear; **if there is extra text, the send/edit is cancelled** (fail-closed). Keep it that way unless there is an explicit UX decision.
- Editing encrypted messages: `startEditMessage` (from `findByPropsLazy("deleteMessage","startEditMessage")`) is monkey-patched in `start()` to substitute the decrypted body when the edit box would get ciphertext; restored in `stop()`. `preEdit` cancels (toast) if the content is still PGP. Fallback: `messagePopoverButton` "Editar mensaje PGP" calls the same action with the plaintext. The save path is a real edit, not delete+resend.

## Security invariants (do not break)
- The private key armor stays in RAM by default (`session.ts`). Optional persistence is ONLY via the encrypted vault (`vault.ts` → Vencord `DataStore`/IndexedDB, AES-256-GCM + PBKDF2; storage password never stored). Never put it in Vencord settings — settings sync uploads to the Vencord cloud. Only public keys live in settings (`publicKeysByUser`).
- Outgoing is fail-closed: missing key or oversized ciphertext ⇒ cancel the send and keep the draft. Never send plaintext in an encrypted conversation. Exceptions are explicit: a GIF/sticker **without extra text**, and 1:1 bot DMs (bot commands); a group with a bot + humans cancels instead of sending clear.
- Signature trust is manual: only keys marked `verified` (and not revoked/expired) are used as `verificationKeys` and can produce `✓ firmado verificado`. Unverified keys may still encrypt, but the send must show a visible warning. Do not silently auto-trust imported or synced keys.
- Incoming decryption is scoped to DM/GDM (`ChannelStore` + `isSupportedChannel`) and uses `maxDecompressedMessageSize`; keep the `decrypted` map bounded.
- Transport is versioned: marker `[VPGP:v1]` + ASCII armor; payload is JSON `{ v: 1, body, sentAt }`. Change the version, don't repurpose the format.
- No custom crypto and no network/keyservers — only the `openpgp` dependency.
- `scripts/generate-test-keys.mjs` writes real private keys to `pgp-keys/` (gitignored). Never commit them or paste them into docs.

## Windows / encoding gotchas
- Shell is PowerShell 5.1. `Set-Content -Encoding UTF8` corrupts UTF-8-without-BOM and can add a BOM. Prefer the editor tools; if you rewrite via PowerShell, verify with `node scripts/fix-utf8.mjs <file>`.
- Installer writes `settings.json` as UTF-8 **without BOM** (a BOM breaks Vencord's JSON parse).
- A running Discord client overwrites `settings.json` from memory. The installer's normal flow closes Discord first; `-Force` copies files but the setting only sticks after a restart.

## Installer
- Entrypoints: `Instalar VencordPGP.cmd` / `Desinstalar VencordPGP.cmd` → `installer/VencordPGP-Installer.ps1` (`-Install/-Uninstall/-Silent/-Force/-DryRun/-DiscordRoot/-VencordRoot`).
- `installer/payload/` is a prebuilt Vencord 1.15.11 renderer + `manifest.sha256`. Never hand-edit it; regenerate with `node scripts/build-installer-payload.mjs <vencord-checkout> .` (aborts if the renderer lacks `VencordPGP`).
- Uninstall restores the newest backup whose renderer has no `VencordPGP`, then sets `plugins.VencordPGP.enabled=false` while keeping public keys/options.

## Docs map
- English is canonical: `README.md` + `docs/*.md`; Spanish mirrors: `README.es.md` + `docs/es/*.md`. Update both in the same change.
- Behavior/limits: `docs/LIMITATIONS.md`, `docs/THREAT_MODEL.md`, `docs/TRANSPORT.md`, `docs/TROUBLESHOOTING.md`.
- Ops: `docs/INSTALL.md` (installer + source build), `docs/INSTALLER.md` (installer internals/options), `docs/KEYS.md`.
- Security: `docs/SECURITY.md` (reporting + open hardening items). `CONTRIBUTING.md` (workflow, two-copy rule, docs policy).
- In-client UI strings and the Windows installer messages are Spanish in v1; the documentation is bilingual.

## Repo hygiene
- `.gitignore` excludes `dist/`, `node_modules/`, `pgp-keys/`, local backups, and `*.zip`; attach `VencordPGP-Installer.zip` to a GitHub Release, do not commit it.
- `installer/payload/` is the exception: it is a committed, prebuilt artifact required by the offline installer.
- No machine-specific paths, real keys, or personal data in tracked files.
