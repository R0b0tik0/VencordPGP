VencordPGP - Windows installer
==============================

WHAT IT DOES
------------
Installs the VencordPGP plugin (automatic PGP encryption for Discord DMs)
inside your Vencord. Before touching anything it backs up:
  - %APPDATA%\Vencord\dist
  - %APPDATA%\Vencord\settings\settings.json

It verifies the payload integrity with SHA-256 and enables the plugin.
The installer messages and the in-client UI are available in English and
Spanish.
For the Spanish version of this file, see LEEME.txt.


REQUIREMENTS
------------
- Windows 10/11.
- Discord installed.
- Vencord already installed and injected (https://vencord.dev/download).
- PowerShell 5.1 (included with Windows).


HOW TO USE IT
-------------
1. Extract this ZIP.
2. Double-click "Instalar VencordPGP.cmd".
3. If Discord is running, it asks whether to close it (recommended).
4. Confirm the installation (Enter).
5. Done. If you closed Discord, it offers to start it again.

At most 2-3 prompts: close Discord, confirm, open Discord. Nothing else.


LANGUAGE
--------
Installer messages: English and Spanish, auto-detected from Windows.
To force one, pass the switch to the .cmd launcher:
  Instalar VencordPGP.cmd -Language es
  Instalar VencordPGP.cmd -Language en
  Instalar VencordPGP.cmd -Language auto      (default)
The same switch works with "Desinstalar VencordPGP.cmd".

In-client UI: Settings > Vencord > Plugins > VencordPGP > Language.
  Auto (default) follows Discord's language and uses English when Discord is
  not in Spanish. Options: Auto / Spanish / English. It applies immediately.


AFTER INSTALLING
----------------
1. Open Discord > Settings > Vencord > Plugins > VencordPGP.
2. Paste your PGP private key and passphrase, then click "Unlock"
   ("Desbloquear" in Spanish).
   The private key lives in memory only by default: it is not synced and is
   not sent to any server. After closing Discord you have to paste it again.
   You can optionally store it ENCRYPTED on this machine (local vault with a
   password, PBKDF2 + AES-256-GCM) from the lock button menu, "Save my private
   key encrypted...". In v1 the vault also stores the key passphrase by
   default; uncheck that option if you do not want it saved.
3. Add the other person's public key with their Discord ID
   (right-click > Copy User ID). The name is only informative.
4. Compare the fingerprint over an independent channel (voice, in person)
   before marking it as verified.
5. Type in a DM and press Enter: the message is encrypted on send and
   decrypted on receipt.


GENERATING KEYS (optional, if you have the plugin repository)
-------------------------------------------------------------
  node scripts/generate-test-keys.mjs "Your Name" "a-long-passphrase"

Share only the public key. Never share the private one.


UNINSTALL
---------
Double-click "Desinstalar VencordPGP.cmd".
It restores the last Vencord backup that does NOT contain the plugin and
disables the plugin in settings.json (keeping your public keys and options).
It saves a safety backup of the current dist first.

IMPORTANT: close Discord before installing or uninstalling. The installer
offers to close it; if you leave it open, the client can overwrite the
settings.json change and the toggle will not stay enabled.


IMPORTANT LIMITATIONS
---------------------
- DMs (1:1) and group DMs only. Server channels are not touched.
- Attachments, images, videos and stickers are NOT encrypted. Text only.
- GIFs and stickers are sent UNENCRYPTED (only the GIF/sticker) so Discord can
  render them. If you add private text next to them, the send is CANCELLED
  (fail-closed): remove the text or turn encryption off.
- 1:1 DMs with bots are not encrypted (commands). In a group with a bot and
  humans the encrypted send is CANCELLED instead of going out in clear.
- Only keys marked as verified produce "signed, verified"; unverified keys can
  encrypt but the send warns and they do not authenticate.
- Server embeds/link previews do not exist for the ciphertext.
- Mentions do not notify (the server does not see the plaintext).
- Length limit: 2000 encrypted characters (4000 with the Nitro option).
- If a key is missing or encryption fails, the send is cancelled and your
  draft is kept.
- Discord metadata (who, when, size) is not protected.
- This is not "absolute security": malware or a malicious extension can read
  the text while it is decrypted in your client.


WHEN VENCORD UPDATES
--------------------
The official updater can replace the build and remove the plugin.
Run this installer again (it backs up and reinstalls).


INSTALLER INTEGRITY
-------------------
The SHA-256 manifest detects corruption, not tampering: it is not signed.
Download the ZIP from a trusted source and verify its hash out of band when
possible. The private key is never sent over the network; it is only stored,
if you choose so, encrypted in this machine's local store.

BACKUPS
-------
Under %APPDATA%\Vencord:
  dist.backup-<timestamp>             previous backup
  dist.pre-uninstall-<timestamp>      safety backup made while uninstalling
  settings\settings.backup-<timestamp>.json

To roll back manually: close Discord, delete "dist" and rename the backup
to "dist". Restore the settings JSON if needed.


LICENSE
-------
The plugin and this installer are distributed under GPL-3.0-or-later.
Vencord is GPL-3.0. The legal notices of the Vencord build are included.
