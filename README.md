# VencordPGP

**Automatic OpenPGP encryption for Discord DMs and group DMs.**

VencordPGP is a [Vencord](https://vencord.dev) userplugin that encrypts outgoing
messages with OpenPGP before Discord ever sees them, and decrypts incoming
messages locally. Writing a message stays as simple as typing and pressing
Enter.

**English** | [Español](README.es.md)

> Status: v1, actively developed. The cryptographic core is covered by tests;
> the in-client UI is available in English and Spanish (it follows Discord's
> language by default). Read
> [Limitations](docs/LIMITATIONS.md) and the [Threat model](docs/THREAT_MODEL.md)
> before relying on it.

## Features

- **Encrypted DMs and group DMs** (channel types 1 and 3). Server channels are
  deliberately left untouched.
- **Local decryption, original ciphertext preserved.** Discord stores the
  encrypted block; the plugin renders the plaintext in RAM and hides the
  ciphertext by default (`view encrypted` / `view decrypted` toggle). Nothing is
  rewritten on the server.
- **Fail-closed sending.** If a recipient key is missing or the ciphertext would
  exceed Discord's limit, the send is cancelled and your draft is kept. It never
  falls back to plaintext silently.
- **Optional signatures.** Outgoing messages can be signed; incoming signatures
  are only treated as verified when the sender's public key was marked as
  verified after an out-of-band fingerprint check.
- **Manual key trust.** No keyservers, no automatic key discovery, no network
  requests. Public keys are bound to the stable Discord user ID.
- **Private key in RAM by default.** Optionally store it encrypted on this
  machine with a storage password (PBKDF2-SHA256 + AES-256-GCM in Vencord's
  local `DataStore`, never in synced settings).
- **Per-conversation lock.** A lock button in the chat bar turns encryption on
  or off for one conversation and opens recipient-key management.
- **Editable encrypted messages.** The normal edit button opens the decrypted
  text, re-encrypts on save, and edits the same message.

## Requirements

- Windows 10/11 for the one-click installer (PowerShell 5.1 is included with
  Windows).
- Discord with Vencord already installed and injected.
- For building from source: Node.js 22+, `corepack pnpm`, and a Vencord
  checkout.

## Quick start (Windows installer)

1. Download `VencordPGP-Installer.zip` from the repository's
   **[Releases](../../releases)** page (or build it, see
   [docs/INSTALLER.md](docs/INSTALLER.md)).
2. Close Discord, then double-click `Instalar VencordPGP.cmd` inside the
   extracted folder. The installer offers to close Discord for you.
3. It verifies the payload hashes, backs up the current Vencord `dist` and
   `settings.json`, copies the build, and enables the plugin.
4. Start Discord, open **Settings → Vencord → Plugins → VencordPGP**, and load
   your private key.
5. Exchange **public** keys with your contact through another channel, assign
   each key to the contact's Discord user ID, compare fingerprints, and mark
   them as verified.

To uninstall, run `Desinstalar VencordPGP.cmd`. It restores the newest clean
backup and disables the plugin while keeping your public keys and options.

The in-client UI follows Discord's language (English/Spanish) and can be forced
with the **Language** setting in the plugin. The installer messages follow the
Windows UI language and accept `-Language en|es`. See
[docs/INSTALL.md](docs/INSTALL.md) for the manual/source installation.

## First-time key setup

You need an OpenPGP key pair. If you already have one, use it. Otherwise the
repository includes a generator for test or personal keys:

```powershell
node scripts/generate-test-keys.mjs "Your Name" "a-long-passphrase"
```

It writes `pgp-keys/<name>-private.asc`, `-public.asc`, and `-revocation.asc`.
The generator requires at least 12 characters. Keep the private key and
revocation certificate safe; share only the public key.

In the plugin:

1. Paste the private key and its passphrase in **PGP Key Manager** and click
   **Unlock** (`Desbloquear` in Spanish; the panel follows the **Language**
   setting).
2. Paste your contact's public key, bound to their numeric Discord user ID
   (right-click a user → **Copy User ID**).
3. Compare the full fingerprint over a separate channel (voice, in person,
   another messenger). Only then mark the key as verified.

See [docs/KEYS.md](docs/KEYS.md) for the full workflow, including the optional
encrypted local vault.

## How it works

Outgoing messages are replaced with a versioned transport block:

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----
...
-----END PGP MESSAGE-----
```

The encrypted payload is JSON `{"v":1,"body":"<exact text>","sentAt":123}`.
The marker makes detection cheap and allows future protocol versions. Incoming
messages are decrypted only in DMs/group DMs, with decompression and size
limits, and cached in a bounded in-memory LRU.

The plugin does **not** patch Discord's renderer with fragile regexes. It
renders the plaintext through a standard Vencord message accessory and hides the
original content node; reactions and message actions stay in their normal place.
See [docs/TRANSPORT.md](docs/TRANSPORT.md) for the format and
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for what this does and does not
protect.

## What is not protected

- Server channels, threads, voice channels, and announcements.
- Attachments, images, video, embeds, and link previews.
- GIFs and stickers: the GIF/sticker is sent unencrypted so Discord can render
  it. If the message also contains text, the send is cancelled.
- 1:1 bot DMs (so bot commands keep working). A group DM with a bot and humans
  cancels the send instead of going out in clear.
- Metadata: who talks to whom, when, message size, channel and message IDs.
- A compromised endpoint (malware, malicious extension, DevTools) can read the
  plaintext while it is displayed.

The full list is in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Project layout

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
  tests/                     57 tests (core + vault)
vencord-plugin/vencordPgp/   Vencord plugin source (the core copy has no .js
                             extensions in imports)
scripts/                     Core sync, payload build, key generator, secret
                             scan, installer sandbox test
installer/                   Windows installer, prebuilt payload, licenses
docs/                        English documentation
docs/es/                     Spanish documentation
```

## Development

```powershell
npm install
npm test            # tsc + 57 tests
npm run testTsc     # type-check the core
npm run lint        # secret scan
npm run test:installer  # PowerShell sandbox E2E (Windows)
```

The Node core is ESM (`NodeNext`), so relative imports end in `.js`. The copy in
`vencord-plugin/vencordPgp/core/` must stay byte-identical except for the `.js`
suffixes, which the bundler does not need. Sync it with:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[docs/INSTALL.md](docs/INSTALL.md) for building against Vencord.

## Documentation

| English | Español |
|---|---|
| [Install](docs/INSTALL.md) | [Instalación](docs/es/INSTALL.md) |
| [Windows installer](docs/INSTALLER.md) | [Instalador de Windows](docs/es/INSTALLER.md) |
| [Key management](docs/KEYS.md) | [Gestión de claves](docs/es/KEYS.md) |
| [Transport format](docs/TRANSPORT.md) | [Formato de transporte](docs/es/TRANSPORT.md) |
| [Limitations](docs/LIMITATIONS.md) | [Limitaciones](docs/es/LIMITATIONS.md) |
| [Threat model](docs/THREAT_MODEL.md) | [Modelo de amenazas](docs/es/THREAT_MODEL.md) |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | [Solución de problemas](docs/es/TROUBLESHOOTING.md) |
| [Security policy](docs/SECURITY.md) | [Política de seguridad](docs/es/SECURITY.md) |

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). The prebuilt installer payload
contains Vencord (GPL-3.0); its license and legal notices are included in
`installer/`.
