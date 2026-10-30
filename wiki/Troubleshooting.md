**English** | [Español](Solucion-de-problemas)

## I see `[VPGP:v1] … -----BEGIN PGP MESSAGE-----` instead of text

The message arrived encrypted (that part is working). If you do not see the
plaintext, one of these is true:

1. **Your private key is locked.**
   - Look for a red badge with a lock: `PGP locked · click to unlock` (in
     Spanish, `PGP bloqueado · clic para desbloquear`).
   - Fix it in **Settings → Vencord → Plugins → VencordPGP → PGP Key Manager**:
     paste your private key (**Replace private key**) and its passphrase
     (**leave it empty if your key has none**) → **Unlock**. Or save the key
     encrypted: the storage password is requested **when you send** the next
     encrypted message (not when Discord starts), or when you click **Load and
     unlock**.
   - The private key lives **only in RAM** unless you saved it in the encrypted
     vault. Closing Discord, or disabling/re-enabling the plugin, locks it.

2. **The message was not encrypted for your key.**
   - Look for a red badge: `PGP message could not be decrypted`.
   - Typical causes:
     - You sent it from another client or machine whose configuration did not
       include your own public key.
     - You changed your private key after sending it.
     - It is a group DM and your key was not available when it was sent.
   - A message encrypted to other keys **cannot** be decrypted with yours.

3. **I want to see the original ciphertext.**
   - By default the encrypted block is **hidden** and the decrypted text is
     shown.
   - Click **view encrypted** below the message to reveal it; **view decrypted**
     hides it again.
   - If the message cannot be decrypted, the ciphertext stays visible with a
     badge.

4. **I forgot the storage password.**
   - It cannot be recovered; it is not stored. Paste your private key again in
     the PGP Key Manager and save a new encrypted blob with a new password.

5. **A new message shows `INVALID SIGNATURE` (red badge).**
   - The text **is still shown** (an invalid signature no longer hides it),
     marked in red: the sender is signing with a key different from the one you
     marked as **verified** for them.
   - Fix it: ask the sender for their **current public key**, replace it from the
     lock menu (right-click → paste key), compare the fingerprint over another
     channel, and **mark it as verified**.
   - Typical cause: the sender rotated their key or gave you an old one.

6. **I cannot edit an encrypted message / I get the ciphertext block.**
   - Discord's normal edit button should open the **decrypted text**. If it does
     not, use the message's **⋯** menu → **Edit PGP message**.
   - Saving re-encrypts and edits the **same message** (it is not deleted).
   - If the message is not decrypted (key locked), unlock it first.

## How to read the logs (no secrets)

Discord writes its console log to:

```text
%APPDATA%\discord\logs\renderer_js.log
```

Search for `[VencordPGP]`. Only metadata is logged (message ID, reason), never
plaintext, keys, or passphrases.

## The plugin appears disabled after a restart

- The private key is not persisted by design. The **plugin** stays enabled in
  `settings.json`. If Vencord updates and replaces the build, run
  `Instalar VencordPGP.cmd` again.
- If Discord was open while the plugin was being enabled, the client may have
  overwritten `settings.json`: close Discord, run the installer again, or enable
  the plugin toggle in the UI.

## Attachments, images, and stickers

They are not encrypted; only the text is. The plugin shows a warning when you
send them with encryption on.

## Mentions

They do not notify: the server never sees the plaintext, so it cannot process
`<@id>`. After decryption they appear as text.

## Two people cannot see each other's text

- Check that each person has the other's **public key** assigned to their
  **Discord user ID** (not their name) and verified over an independent channel.
- If a recipient key is missing, the send is cancelled (fail closed); it is not
  sent in clear.
- Bots and server channels are not encrypted.

## The lock icon state looks wrong

- A closed green lock means encryption is on for that conversation.
- A yellow lock with a dot means encryption is on but keys are missing; sends
  are cancelled until you add them.
- An open lock means encryption is off for that conversation.

If the global toggle is off, outgoing messages are not encrypted, but the plugin
may still decrypt incoming messages in v1. See the
[security policy](Security-Policy) for this known limitation.

---

**Related:** [Home](Home) · [Key Management](Key-Management) · [Installation](Installation)
