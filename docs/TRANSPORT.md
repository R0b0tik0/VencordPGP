# VPGP v1 transport format

**English** | [Español](es/TRANSPORT.md)

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----
<OpenPGP ASCII armor, base64>
-----END PGP MESSAGE-----
```

- **Line 1:** stable marker `[VPGP:v1]` = protocol + version. It allows:
  - cheap detection without trying to decrypt every message
    (`startsWith` + armor),
  - avoiding collisions with ordinary text,
  - a future `v2` without ambiguity.
- **Rest:** standard **OpenPGP ASCII armor** (RFC 9580, OpenPGP.js). Outgoing
  messages are not compressed, so the size is predictable.
- Encrypted payload (JSON): `{"v":1,"body":"<exact text>","sentAt":123}`. The
  payload version is independent of the transport marker and is validated after
  decryption.
- Nothing may follow `END PGP MESSAGE`; mixed trailing content is rejected.
- The plaintext is preserved **byte-for-byte** (Markdown, URLs, emoji, line
  breaks), except that it is JSON-encoded inside the payload.

## Detection

```ts
isPgpTransport(c) =
  c.trimStart().startsWith("[VPGP:v1]") &&
  c.includes("-----BEGIN PGP MESSAGE-----");
```

Text that merely looks like a marker (`[VPGP:v1] hello`) is not transport; it is
not decrypted and does not produce a hard error (`looksLikeMarkerButInvalid` is
available for tests and UI).

## Limits

| Limit | Value | Purpose |
|---|---|---|
| Transport length | 8,192 chars | Reject absurd incoming blocks (anti-DoS) |
| Plaintext before encryption | 3,000 chars | Keep the armor within Discord's limit |
| Outgoing ciphertext | 2,000 chars (4,000 with the Nitro option) | Discord message limit; fail closed, never truncate |
| Decrypted body | 5,000 chars | Anti-DoS validation |
| Decompressed OpenPGP data | 24 KB | Reject decompression bombs |
| Decryption cache | 500 entries | Bounded RAM |
| Decrypted text map | 500 entries | Bounded RAM |

v1 does **not** fragment messages. If the armor exceeds the configured limit,
the send is cancelled and the draft is kept.

## Example

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----

wV4D... (encrypted for Bob + Alice, signed by Alice)
-----END PGP MESSAGE-----
```

## Versioning

Change the version (and the payload `v`) when the format changes. Do not reuse
`v1` for a different meaning. The marker lets clients reject unknown versions
explicitly instead of misparsing them.

## What it never contains

- Private keys or passphrases.
- Plaintext metadata beyond what OpenPGP itself puts in the packet headers.
- Attachments or embeds; only the message body is inside the payload.

## Future work (not v1)

Authenticated fragmentation with fragment IDs, ordering, and per-fragment
authentication is possible in a future version. v1 deliberately cancels long
sends instead.
