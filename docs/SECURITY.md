# Security policy

**English** | [Español](es/SECURITY.md)

VencordPGP handles private keys and private messages. Security reports are
welcome, and responsible disclosure is appreciated.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (current) | Yes |
| Older / unversioned builds | No |

Only the latest release and the current `main` branch receive fixes.

## Reporting a vulnerability

**Do not open a public issue for a security bug.**

Use GitHub's **private vulnerability reporting**:

1. Open the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Include:
   - affected version or commit,
   - steps to reproduce,
   - expected vs. actual behavior,
   - impact (confidentiality, integrity, availability, key exposure),
   - any proof of concept, with **test keys only**.

Never include a real private key, passphrase, or private message in a report.
If GitHub private reporting is unavailable, contact the maintainer through the
repository profile and ask for a private channel before sharing details.

You can expect an initial response within a few days. Please allow time for a fix
and a coordinated release before publishing details.

## Scope

In scope:

- `src/` — cryptographic core, transport, serializer, key store, channel policy,
  cache, session, vault.
- `vencord-plugin/vencordPgp/` — Vencord integration, rendering, key UI.
- `installer/` and `scripts/` — installer, payload build, key generator.
- The transport protocol and the encrypted vault format.

Out of scope:

- Vulnerabilities in Discord, Vencord, Electron, or `openpgp` itself. Report them
  upstream (we still want to know if they affect this plugin).
- A compromised endpoint, malware, a malicious browser extension, or a
  keylogger.
- Social engineering and out-of-band key verification mistakes.
- Metadata exposure that is documented in the
  [threat model](THREAT_MODEL.md).
- The absence of forward secrecy (a design property of long-term OpenPGP keys).

## Security design at a glance

- **No custom cryptography.** Only `openpgp` v6 (RFC 9580) and WebCrypto.
- **No network access.** No keyservers, no telemetry, no automatic key
  discovery.
- **Fail closed.** Missing keys, oversized ciphertext, and unsupported
  recipients cancel the send and keep the draft. Never a silent plaintext
  fallback.
- **Private key stays in RAM by default.** Optional persistence only through the
  encrypted local vault (PBKDF2-SHA256 + AES-256-GCM, random salt/IV, storage
  password never persisted). Never in synced settings.
- **Manual trust.** Only keys marked as verified can produce a verified
  signature. Unverified keys may encrypt, but the send warns.
- **Invalid signatures do not hide the message.** The text is shown marked in
  red, and the UI never reports it as verified.
- **Bounded work on untrusted input.** Transport, plaintext, decompression, and
  cache limits; decryption only in DMs/GDMs.
- **The server copy is never rewritten.** Decryption is local and in RAM.

## Known open hardening items

These are known limitations, not undisclosed vulnerabilities. They are listed
here so users can make informed decisions.

| Area | Status |
|---|---|
| **Vault passphrase storage** — the save dialog stores the OpenPGP passphrase inside the vault by default; the minimum storage password is 8 characters and PBKDF2 uses 310,000 iterations. Unchecking the option keeps the passphrase out of the vault. | Open (planned: default off, longer minimum, stronger KDF) |
| **Installer integrity** — the SHA-256 manifest is generated next to the payload and is not signed. It detects corruption, not tampering. The payload is a prebuilt Vencord renderer. | Open (verify release hashes out of band) |
| **Global toggle scope** — `pgpEnabled=false` stops outgoing encryption/decryption of sends, but incoming messages may still be decrypted and displayed by the accessory in v1. | Open |
| **Key revocation/expiry freshness** — state is computed when a key is imported; without keyservers it is not refreshed automatically. Re-import an updated key after a revocation. | Open by design, documented |
| **Syncable metadata** — public keys, display-name hints, verification flags, and per-conversation overrides live in Vencord settings and may be uploaded if settings sync is enabled. No secret material is included. | Documented |
| **Installer robustness** — `settings.json` is written directly, and uninstall swaps `dist` after creating a safety backup. A failure mid-write can leave an inconsistent state; backups make recovery possible. | Open |
| **Test key generator** — writes private keys under `pgp-keys/` and accepts the passphrase as a command-line argument (visible in shell history). Use a dedicated tool for real keys. | Documented |
| **Signature warning cache** — signature metadata is read from a bounded cache; under heavy traffic an old “invalid signature” badge could be evicted. The content is still shown. | Open (low) |

An internal code review was performed in October 2026. The high-severity issues
found then (private material accepted as a public key, the `verified` flag not
enforced for signatures, silent plaintext sends with bots/global toggle, and
unbounded decryption work) were fixed; the core fixes are covered by tests. The
table above lists what remains.

## Hardening recommendations for users

- Verify fingerprints over a channel that Discord cannot influence.
- Keep Vencord, Discord, and the plugin up to date.
- Do not enable Vencord settings sync if you do not want public keys and
  conversation overrides uploaded.
- Prefer a long, unique storage password, and consider unchecking “store
  passphrase” in the vault.
- Lock the key when you leave the machine, and delete stored data if you suspect
  compromise.
- Treat the operating system and the Discord/Vencord installation as part of the
  trusted computing base.

## No warranty

This is free software distributed under GPL-3.0-or-later, without warranty. See
[LICENSE](../LICENSE).
