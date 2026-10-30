**English** | [Español](Arquitectura-y-diseno)

VencordPGP is split into a testable Node/TypeScript core and a thin Vencord adapter. This page describes the pieces, the path a message takes in each direction, and where data lives. The wire format is specified in [Transport format](Transport-Format).

## Components

| Module | Responsibility |
|---|---|
| `src/transport.ts` | `[VPGP:v1]` marker detection and ASCII-armor checks |
| `src/serializer.ts` | Versioned JSON payload `{ v: 1, body, sentAt }` and anti-DoS limits |
| `src/crypto.ts` | OpenPGP v6 encrypt/decrypt/sign/verify (multi-recipient) |
| `src/keyStore.ts` | Public keys bound to Discord user IDs, manual trust flags |
| `src/channelPolicy.ts` | DM/GDM scope, per-conversation overrides, `autoEncryptDMs` |
| `src/cache.ts` | Bounded LRU for decrypted text and signature metadata |
| `src/session.ts` | Private key and passphrase held in RAM only |
| `src/outgoing.ts` | Fail-closed send plan; never returns a plaintext fallback |
| `src/incoming.ts` | Decryption view: body, signature status, error codes |
| `src/keyVault.ts` | Encrypted local vault (PBKDF2-SHA256 + AES-256-GCM, WebCrypto) |
| `vencord-plugin/vencordPgp/` | `preSend`/`preEdit`, rendering, key UI, i18n, vault storage |

The plugin layer is `index.tsx` (interception and the `startEditMessage` patch), `render.ts` (decrypt into RAM), `PgpAccessory.tsx` (rendering), `PgpPanel.tsx`, `PgpLockButton.tsx`, `AssignKeyModal.tsx`, `SaveVaultModal.tsx`, `StoredKeyModal.tsx`, `vault.ts` (Vencord `DataStore`), `dm.ts`, `state.ts`, `i18n.ts`, and the `core/` copy.

## Sending

1. `preSend` inspects the channel. Only DMs and group DMs (types 1 and 3) are eligible; server channels, threads, and voice channels are left untouched.
2. The global toggle (`pgpEnabled`), the per-conversation override (`channelOverrides`), and `autoEncryptDMs` decide whether encryption applies. The lock button writes the override, which takes precedence.
3. Explicit exceptions: a GIF/sticker **without extra text** is sent in clear so Discord can render it; a GIF/sticker **with text cancels the send**. A 1:1 bot DM stays clear so bot commands work; a group with a bot and humans is cancelled.
4. Every human recipient must have at least one valid, non-expired, non-revoked public key. A missing key cancels the send, keeps the draft, and shows the reason.
5. The body is serialized into the versioned payload (3,000-character plaintext cap).
6. The payload is encrypted to every valid recipient key and optionally signed with the sender's key.
7. The armor is wrapped in the transport block and checked against the outgoing limit (2,000 characters, 4,000 with the Nitro option).
8. The message is sent with empty `allowedMentions`. There is no silent plaintext fallback at any step.

## Receiving

1. `isPgpTransport` performs a cheap marker plus armor check, and only in DMs/GDMs.
2. Oversized transport blocks (over 8,192 characters) are rejected before any cryptographic work.
3. Decryption uses the in-memory session key. The signature is reported as verified only when the sender's key is marked verified and not revoked/expired.
4. An invalid or mismatched signature does **not** hide the message: the body is returned with `signatureValid: false` and the UI marks it red (`vc-pgp-bad-sig`).
5. The JSON payload is validated after decryption; the body is capped at 5,000 characters and decompressed OpenPGP data at 24 KB.
6. Results and errors are cached in a bounded 500-entry LRU. Cached errors are never re-notified, which prevents a render→decrypt→notify loop.
7. `render.ts` decrypts into RAM only. `PgpAccessory.tsx` portals the plaintext into a container right after `#message-content-<id>`, hides the original ciphertext node, and offers `view encrypted` / `view decrypted`.
8. Discord's stored message and the server copy are never rewritten. Edits go through the same fail-closed path and re-encrypt the same message.

## Trust boundary

- The Discord user ID (snowflake) is the primary key; display names are only hints.
- Public keys are imported manually, may be multiple per user (rotation), and are marked verified only after an out-of-band fingerprint comparison.
- Only verified keys are used as verification keys. Unverified keys can still encrypt, but the send warns.
- No keyservers, no automatic discovery, no network requests, no custom cryptography.

## Where data lives

| Data | Location | Synced by Vencord? |
|---|---|---|
| Public keys, display-name hints, verification flags | Vencord settings (`publicKeysByUser`) | Yes, if settings sync is enabled |
| Per-conversation on/off overrides | Vencord settings (`channelOverrides`) | Yes, if settings sync is enabled |
| Encrypted private-key vault | Vencord local `DataStore`/IndexedDB | No |
| Unlocked private key and passphrase | RAM only | No |
| Decrypted message text | RAM only, bounded LRU | No |

## Repository layout

```text
src/                         Standalone, testable Node/TypeScript core
  crypto.ts                  OpenPGP v6 encrypt/decrypt/sign/verify
  transport.ts               [VPGP:v1] marker + armor detection
  serializer.ts              Versioned payload + anti-DoS limits
  keyStore.ts                Public keys by Discord user ID, manual trust
  channelPolicy.ts           DM/GDM policy
  cache.ts  session.ts       LRU cache, in-memory private-key session
  outgoing.ts  incoming.ts   Fail-closed send plan and decrypt view
  keyVault.ts                Encrypted local vault (WebCrypto)
  tests/                     Core + vault test suites
vencord-plugin/vencordPgp/   Vencord plugin source (core copy without .js
                             extensions in imports)
scripts/                     Core sync, payload build, key generator, secret
                             scan, installer sandbox test, wiki build
installer/                   Windows installer, prebuilt payload, licenses
docs/                        English documentation
docs/es/                     Spanish documentation
wiki/                        Generated + hand-written GitHub wiki pages
```

## The two core copies

`src/*.ts` is NodeNext ESM, so relative imports end in `.js`. The copy at `vencord-plugin/vencordPgp/core/*.ts` must stay byte-identical except for those extensions, because Vencord bundles the plugin with esbuild. Sync one way:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

Do not edit the plugin's `core/` copy by hand. See [Contributing and development](Contributing-and-Development).

## Design decisions

- No custom cryptography: only `openpgp` v6 (RFC 9580) and WebCrypto.
- No compression on outgoing messages, so size is predictable.
- No keyservers, telemetry, or automatic key discovery.
- No persistence of decrypted text; the ciphertext is never rewritten in Discord's store.
- Unsupported channels are left alone instead of being partially "protected".
- Fail closed: every failure cancels the send and preserves the draft.

---

**Related:** [Transport format](Transport-Format) · [Key management](Key-Management) · [Threat model](Threat-Model)
