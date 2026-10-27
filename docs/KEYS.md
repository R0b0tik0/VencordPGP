# Key management

**English** | [Español](es/KEYS.md)

## Principles

- **The Discord user ID (snowflake) is the primary key.** It is stable across
  nickname changes. The display name is only a hint.
- **Never auto-import** a public key based on a name someone publishes. Bind it
  manually and verify the fingerprint over an independent channel (in person, a
  call, another verified messenger).
- **Multiple keys per user** are supported for rotation: outgoing messages are
  encrypted to every valid key.
- Adding a new fingerprint for a known contact shows a warning. A persisted
  fingerprint snapshot that protects against settings-sync substitution is still
  on the hardening list (see [Security policy](SECURITY.md)).

## Importing your private key

1. Open **Settings → Vencord → Plugins → VencordPGP → PGP Key Manager**.
2. Paste the armor (`-----BEGIN PGP PRIVATE KEY BLOCK-----...`) into the field.
   If the field is not visible, click **Replace private key**.
3. Enter the key passphrase in the `password` field (session only, not shown).
   If your key has no passphrase, leave it empty.
4. Click **Unlock**. After loading, the key **stops being displayed** in the
   panel (it lives in memory and in the optional encrypted vault); the panel
   shows whether it is loaded and locked or unlocked.

## Optional encrypted vault

The vault avoids pasting the private key on every Discord start. It is optional.

1. In **PGP Key Manager → Stored key (encrypted with a password)**, choose a
   **storage password** (minimum 8 characters) and click **Save encrypted**.
   The key armor is encrypted with PBKDF2-SHA256 (310,000 iterations) and
   AES-256-GCM.
2. The blob is stored **only on this machine**, in Vencord's local
   `DataStore`/IndexedDB. It never goes to `settings.json` or to the cloud. The
   storage password is **not stored**.
3. The password is requested **only when you try to encrypt** (sending in an
   encrypted conversation while the key is locked) or when you click **Load and
   unlock**. It is **not requested when Discord starts**. After unlocking, the
   session stays unlocked until you lock it or close Discord.
4. Shortcut: **right-click the lock button** in the chat bar → **Save my
   encrypted private key...**. No need to open Settings.
5. **Delete stored key** (or **Delete everything**) removes the blob from disk.

**Passphrase inside the vault:** in v1 the save dialog also stores the OpenPGP
key passphrase inside the encrypted blob by default. Uncheck that option if you
prefer to keep the passphrase out of the vault and type it after each restart.
The storage password then becomes the only protection for the key material.

**Limits:** the storage password protects the blob, but malware or a keylogger
can capture it while you type it. If you forget it, paste the private key again
and save a new blob.

## Editing encrypted messages

- Use Discord's **normal edit button**: the editor opens with the **decrypted
  text** (the ciphertext is substituted only in the editor).
- On save, the text is **re-encrypted** and the **same message** is edited. It is
  not deleted or resent, so the ID, replies, and reactions are preserved.
- If the normal button shows the encrypted block, use the message's **⋯** menu →
  **Edit PGP message** (fallback button with a lock icon).
- If the message is not decrypted (key locked), unlock the key first.

## Assigning a public key to a contact

1. Ask for their public key **and full fingerprint** over another channel.
2. Get the user ID: right-click the user → **Copy User ID** (digits only).
3. Paste the public armor and click **Add**.
4. Compare the displayed fingerprint (groups of four) with the one you received
   outside Discord.
5. Only then click **Mark verified**.

### Chat-bar lock shortcut

In DMs and group DMs, a **lock** appears next to the message box:

- **Left click:** enable or disable encryption **for that conversation only**
  (stored as `channelOverrides` in settings; it takes precedence over
  `autoEncryptDMs`).
- **Right click:** open recipient key management to paste a **public key**
  without going to Settings. In group DMs you can choose the recipient.
- States: closed lock = encryption on; open lock = off; yellow lock with a dot =
  on but one or more keys are missing (sending is cancelled until you add them).

From the modal you can copy a key fingerprint, mark a key as verified (only
after checking it out of band), delete it, or copy your own public key to send to
the other person.

## Key states

| State | Behavior |
|---|---|
| Valid | Used for encryption |
| Expired | Imported but not used for encryption |
| Revoked | Rejected on import |
| Not verified | Can encrypt, but does not authenticate; the send shows a warning |
| Malformed | Rejected with an error |

Expired and revoked keys fail closed, with the reason visible.

Revocation and expiry are evaluated when the key is imported. Without keyservers
the plugin cannot refresh a key automatically; re-import the updated key after a
revocation.

## Fingerprints

Format: uppercase hex in groups of four (for example `AB12 CD34 ...`). The panel
has a copy button. Never claim a key is verified without checking the
fingerprint outside Discord.

## Locking and deletion

- **Lock:** purges the unlocked private key, the passphrase, and the decryption
  cache from RAM.
- **Delete everything:** additionally purges in-memory armor, public keys, and
  the stored encrypted blob.
- The private key never goes into logs, error messages, exports, or the network.

## What is stored where

| Data | Location | Synced by Vencord? |
|---|---|---|
| Public keys, display-name hints, verification flags | Vencord settings (`publicKeysByUser`) | Yes, if settings sync is enabled |
| Per-conversation on/off overrides | Vencord settings (`channelOverrides`) | Yes, if settings sync is enabled |
| Encrypted private-key vault | Vencord local `DataStore`/IndexedDB | No |
| Unlocked private key and passphrase | RAM only | No |
| Decrypted message text | RAM only, bounded LRU | No |

Public keys and conversation metadata are not secrets, but they reveal part of
your social graph. Take that into account before enabling Vencord settings sync.
