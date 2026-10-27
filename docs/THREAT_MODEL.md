# Threat model

**English** | [Español](es/THREAT_MODEL.md)

## Protects against

- **Passive content disclosure** by Discord or third parties, in transit or at
  rest, through multi-recipient OpenPGP encryption (RFC 9580).
- **Casual sender/recipient confusion**, when signatures are enabled and the
  sender's key has been manually verified. Only verified keys produce the green
  `signed, verified` check.

## Does not protect against

- **A compromised endpoint** (malware, malicious extension, DevTools). The
  plaintext exists in RAM and in the rendered UI. The encrypted local vault
  (PBKDF2 + AES-GCM) does not stop a keylogger that captures the storage
  password, nor an attacker who controls the Discord process.
- **Key substitution without out-of-band verification** (blind TOFU). Mitigation:
  manual fingerprint verification and a warning when a new fingerprint appears
  for a known contact. A persisted fingerprint snapshot across settings sync is
  still on the hardening list.
- **Impersonation without a verified signature.** Encrypting is not
  authenticating. Without a green `signed, verified` check, the sender is **not**
  authenticated. If a signature **does not validate**, the message is still
  shown, marked in red (`INVALID SIGNATURE`): do not trust it; check the sender's
  public key.
- **Replay.** `sentAt` is informative. An old ciphertext replayed today still
  decrypts.
- **Ciphertext tampering.** OpenPGP detects it (decryption fails, the UI shows a
  discreet error, and it never shows “verified”).
- **GIFs, stickers, and attachments.** GIFs/stickers are sent unencrypted so
  Discord can render them; attachments are not encrypted. They are not protected
  content.
- **Server-side deletion or editing.** Someone with access to the account can
  delete messages. Local history is not proof.
- **Metadata:** social graph, timestamps, sizes. Out of scope.
- **Malformed-content DoS.** Mitigated with limits: 8,192 transport characters,
  5,000 body characters, a 24 KB decompression cap, a 500-entry decryption
  cache, a 500-entry plaintext map, and strict post-decryption validation.
  Decryption is attempted only in DMs/GDMs.
- **UI injection.** Mitigated by rendering text (React `textContent`, no
  `innerHTML`/`dangerouslySetInnerHTML`). Discord parses Markdown; the plugin
  does not inject arbitrary HTML.
- **Dependency risk.** Only `openpgp` (audited by Cure53) and WebCrypto are used.
  Pin versions and review advisories. No keyservers, no network calls.

## Operational rules

- Never log plaintext, private keys, or passphrases; errors use codes, not
  secrets.
- Fail closed. Never silently disable verification.
- Verify fingerprints over an independent channel before marking a key as
  verified.
- Lock the key when you leave the machine; delete stored data if you suspect
  compromise.
- Treat the Discord account, the Vencord installation, and the operating system
  as part of the trusted computing base.

## Design decisions

- No custom cryptography.
- No compression on outgoing messages.
- No keyservers and no automatic key discovery.
- No persistence of decrypted text.
- The ciphertext is never rewritten in Discord's store.
- Unsupported channels are left alone instead of being partially “protected”.

See [Limitations](LIMITATIONS.md) for user-facing behavior and the
[security policy](SECURITY.md) for open hardening work and vulnerability
reporting.
