**English** | [Español](Instalador-de-Windows)

`Instalar VencordPGP.cmd` is a thin launcher: it checks that
`installer/VencordPGP-Installer.ps1` and `installer/payload/manifest.sha256`
exist, then runs the PowerShell installer. Always distribute the **whole ZIP**
(`VencordPGP-Installer.zip`), not just the `.cmd` file.

The installer deploys a prebuilt Vencord build that includes VencordPGP. It
backs up the current installation, checks the payload against its SHA-256
manifest, copies the files, and enables the plugin in `settings.json`.

`Desinstalar VencordPGP.cmd` restores the newest clean backup (one without
VencordPGP), keeps a safety backup of the current `dist`, and **disables** the
plugin while keeping your public keys and options.

> Close Discord before installing or uninstalling. The interactive flow offers
> to close it. If you use `-Force` while Discord is running, the client can
> overwrite the `settings.json` change; enable the plugin manually after a
> restart in that case.

No Node.js, git, or build step is required: the payload is already compiled.

## User flow

1. Detect Discord (`%LOCALAPPDATA%\Discord*`, or `%LOCALAPPDATA%\Programs\Discord*`)
   and Vencord (the `app.asar` stub or `%APPDATA%\Vencord`).
2. If Discord is running, offer to close it (or continue with `-Force`).
3. Verify `installer/payload/manifest.sha256`.
4. Create `dist.backup-<timestamp>` and `settings.backup-<timestamp>.json`.
5. Copy `patcher.js`, `preload.js`, `renderer.js`, `renderer.css`, and the
   `.LEGAL.txt` notices.
6. Check that `renderer.js` contains `VencordPGP`.
7. Set `plugins.VencordPGP.enabled = true` while preserving every other setting.
8. Print the key-configuration steps.

At most it asks three things: close Discord, confirm the installation, and open
Discord afterwards.

## Options (scripts / CI)

```powershell
.\installer\VencordPGP-Installer.ps1 -Install -Silent -Force
.\installer\VencordPGP-Installer.ps1 -Uninstall -Silent
.\installer\VencordPGP-Installer.ps1 -Install -Silent -DryRun -Force
.\installer\VencordPGP-Installer.ps1 -Install -Silent -Language en
.\installer\VencordPGP-Installer.ps1 -Install -DiscordRoot <path> -VencordRoot <path>
```

| Flag | Meaning |
|---|---|
| `-Install` / `-Uninstall` | Non-interactive action |
| `-Silent` | No questions (requires `-Install` or `-Uninstall`) |
| `-Force` | Continue even if Discord is running; does not close it |
| `-DryRun` | Show what would happen without writing anything |
| `-Language auto\|es\|en` | Message language (`auto` = Windows UI language; anything but Spanish uses English) |
| `-DiscordRoot` / `-VencordRoot` | Override detection (tests/sandbox) |

## Backups

Created under `%APPDATA%\Vencord`:

```text
dist.backup-<timestamp>\                  previous Vencord build
dist.pre-uninstall-<timestamp>\           safety backup made while uninstalling
settings\settings.backup-<timestamp>.json previous settings
```

Manual rollback: close Discord, delete `dist`, rename the backup to `dist`, and
restore the settings JSON if needed.

## Rebuilding the payload

The payload is a complete Vencord build with the plugin, not an incremental
patch. Regenerate it after changing the plugin:

```powershell
node scripts/build-installer-payload.mjs <vencord-checkout> .
```

The script copies only the required files (no source maps), writes `VERSION.txt`
and `manifest.sha256`, and aborts if `renderer.js` does not contain
`VencordPGP`. Do not hand-edit files in `installer/payload/`.

## Testing

```powershell
npm run test:installer
```

`scripts/test-installer.ps1` creates a sandbox with fake Discord/Vencord folders
and checks: dry-run makes no changes; installation creates backups, copies the
payload, enables the plugin, and writes UTF-8 without BOM; uninstallation
restores a clean build, makes a safety backup, and preserves settings and public
keys. It never touches the real Discord/Vencord installation.

## Release artifacts

Create `VencordPGP-Installer.zip` with:

```text
Instalar VencordPGP.cmd
Desinstalar VencordPGP.cmd
installer\VencordPGP-Installer.ps1
installer\README.txt
installer\LEEME.txt
installer\LICENSE-Vencord.txt
installer\payload\*
```

The ZIP is a build artifact and is not committed to git. Attach it to a GitHub
Release and publish its SHA-256 in the release notes so users can check the
download out of band.

## Security limits

- The payload is a **complete Vencord build**, not a small patch. A Vencord
  update can overwrite `dist`; reinstall afterwards.
- Backups make rollback possible. Uninstall looks for the newest backup that
  does **not** contain VencordPGP.
- Nothing is downloaded: the installer is offline.
- The SHA-256 manifest detects **corruption, not malicious tampering**: it is
  not signed. Anyone who can modify the ZIP can also modify the manifest.
  Download the ZIP from a trusted source and verify its hash out of band.
- The private key lives in RAM by default; it can optionally be stored encrypted
  in the local vault, never in synced settings. See [Key management](Key-Management).
- Windows may ask for confirmation when running a `.cmd`. It is a text script;
  you can open it in Notepad to review it.
- Installer messages follow the Windows UI language (Spanish or English) and can
  be forced with `-Language es|en`; the `.cmd` launchers pass flags through.
- Vencord is GPL-3.0. The payload was built from Vencord 1.15.11 (commit
  `32c9063`) plus this plugin's source. Both are publicly available; the Vencord
  license and legal notices are included in `installer/`.

---

**Related:** [Home](Home) · [Installation](Installation) · [Key Management](Key-Management)
