# Known limitations (v1)

**English** | [Español](es/LIMITATIONS.md)

Read this before using VencordPGP with anything sensitive.

- **DMs and group DMs only** (channel types 1 and 3). Server channels, threads,
  voice channels, and announcements are not touched. The plugin also refuses to
  decrypt PGP-looking content in guilds/threads; it does not simulate protection
  where it does not encrypt.
- **Trust is manual.** Only keys marked as **verified** produce a green
  `signed, verified` check. Unverified keys can still be used for encryption, but
  they do not authenticate the sender and the send shows a warning. Never trust a
  key just because it was imported or synced.
- **Local rendering.** The decrypted text is placed where the original content
  was (a DOM portal), so reactions, buttons, and attachments stay below it like a
  normal message. The ciphertext block is hidden by default; `view encrypted`
  reveals the original block and `view decrypted` hides it again. Side effect:
  while a message is displayed decrypted, other local plugins and DevTools can
  read the plaintext from the UI. The ciphertext in Discord's store and on the
  server is unchanged.
- **Private key.** RAM only by default. It can optionally be stored **encrypted**
  in the local vault (PBKDF2-SHA256 + AES-256-GCM; the storage password is not
  saved). It is never synced to the cloud. In v1 the vault also stores the
  OpenPGP key passphrase unless you uncheck that option. See
  [Key management](KEYS.md).
- **Mentions and notifications.** The ciphertext does not contain `<@id>` in
  clear, so Discord does not notify anyone. Messages are sent with empty
  `allowedMentions` to avoid accidental pings. After decryption, mentions appear
  as plain text.
- **No server embeds or link previews** for ciphertext: Discord cannot inspect
  it. The plugin does not fabricate embeds or fetch URLs.
- **Attachments, images, video, and voice are not encrypted.** Sending an
  attachment shows a warning; only the text is protected. There is no file
  encryption flow in v1.
- **GIFs and stickers are sent unencrypted** (only the GIF/sticker) so Discord
  can render them. If you add private text next to a GIF/sticker, the
  send/edit is **cancelled** (fail closed): remove the text or turn encryption
  off for that conversation.
- **Replies and quotes:** the server-side preview shows the ciphertext; the
  quoted body is not re-sent in clear. The `messageReference` is visible
  metadata.
- **Size:** plaintext is capped at 3,000 characters before encryption, and the
  resulting armor must fit in 2,000 characters (4,000 with the Nitro option).
  The send is cancelled rather than fragmented or sent in clear.
- **Bots:** 1:1 DMs with a bot are not encrypted, so bot commands keep working.
  In a **group with a bot and humans**, the encrypted send is **cancelled**
  instead of silently going out in clear. The lock button shows the state.
- **Metadata is not protected:** who talks to whom, when, approximate size, and
  channel/message IDs. OpenPGP does not hide Discord metadata.
- **No forward secrecy.** A future compromise of a private key can decrypt
  messages that were encrypted to that key and are still available.
- **Replay:** `sentAt` is informative, not an authoritative anti-replay
  mechanism. An old ciphertext replayed today still decrypts.
- **Edits** invalidate the cache and re-encrypt through the same fail-closed
  path.
- **Compatibility:** only clients with the plugin and the right keys see the
  plaintext. Everyone else sees the `[VPGP:v1]` block.
- **Language:** the in-client UI and the Windows installer are in Spanish in v1.
  The documentation is available in English and Spanish.
- **No custom cryptography:** only `openpgp` (RFC 9580) and WebCrypto are used.
  There is no keyserver or network access.

Some non-cryptographic hardening items are still open. See the
[security policy](SECURITY.md) for the current list.

None of this is presented as “absolute security”. Read the
[threat model](THREAT_MODEL.md).
