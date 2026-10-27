# Installation

**English** | [Español](es/INSTALL.md)

This page covers both ways to install VencordPGP:

- the one-click Windows installer (recommended for normal users), and
- building the plugin from source against a Vencord checkout (development).

If you only want to use the plugin, start with
[the Windows installer](INSTALLER.md).

## Requirements

| | |
|---|---|
| OS | Windows 10/11 for the installer; the core is cross-platform |
| Discord | Discord Desktop with Vencord installed and injected |
| Vencord | 1.15.x (tested against `Vendicated/Vencord@main`, October 2026) |
| Node.js | 22 or newer (source builds only) |
| pnpm | 11, through `corepack pnpm` (source builds only) |
| OpenPGP | `openpgp@^6.3.2` (installed as a dependency) |

You do **not** need Node.js, git, or pnpm to use the Windows installer. The
payload is already compiled.

## Option A — Windows installer

1. Download `VencordPGP-Installer.zip` from the repository's **Releases** page.
2. Extract the whole ZIP. The `.cmd` files are only launchers; they need the
   `installer/` folder next to them.
3. Close Discord, then double-click `Instalar VencordPGP.cmd`.
4. Follow the prompts. The installer backs up `%APPDATA%\Vencord\dist` and
   `%APPDATA%\Vencord\settings\settings.json`, verifies the payload SHA-256
   manifest, copies the build, and enables `plugins.VencordPGP.enabled`.
5. Start Discord and open **Settings → Vencord → Plugins → VencordPGP**.
6. Configure your keys as described in [Key management](KEYS.md).

Uninstall with `Desinstalar VencordPGP.cmd`. Details, flags, and backup behavior
are in [the installer guide](INSTALLER.md).

## Option B — Build from source

### 1. Clone Vencord and copy the plugin

```powershell
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
New-Item -ItemType Directory -Force src\userplugins | Out-Null
Copy-Item -Recurse <path-to-this-repo>\vencord-plugin\vencordPgp src\userplugins\
```

The plugin must live at `src/userplugins/vencordPgp/`. Vencord loads every
folder under `src/userplugins/` as a userplugin.

### 2. Add the dependencies

```powershell
corepack pnpm add openpgp@^6.3.2
corepack pnpm add -D @openpgp/web-stream-tools
```

`@openpgp/web-stream-tools` is required because Vencord builds with
`skipLibCheck: false`; without it `testTsc` fails on OpenPGP's stream types.

### 3. Build and deploy

```powershell
corepack pnpm testTsc
corepack pnpm build
```

Close Discord, then copy the result into your Vencord installation:

```powershell
Copy-Item dist\* $env:APPDATA\Vencord\dist\ -Recurse -Force
```

Alternatively use `corepack pnpm inject` if you installed Vencord with its
official installer.

### 4. Enable the plugin

Open Discord → **Settings → Vencord → Plugins → VencordPGP** and enable it.
Then configure your keys ([Key management](KEYS.md)).

## Keeping the two core copies in sync

The repository has two copies of the core:

- `src/*.ts` — standalone Node/TypeScript core, built with NodeNext ESM
  (relative imports end in `.js`).
- `vencord-plugin/vencordPgp/core/*.ts` — the same files without the `.js`
  suffix, because Vencord bundles the plugin with esbuild.

After editing `src/*.ts`, copy the core into your Vencord checkout:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

The script strips the `.js` extensions and checks for encoding corruption. It is
the only sync step required: `src/*.ts` already contains the message-limit tweaks
(`maxTransportChars`, `MAX_PLAINTEXT_CHARS=3000`).

## Generating test or personal keys

```powershell
node scripts/generate-test-keys.mjs "Your Name" "a-long-passphrase"
```

It writes:

```text
pgp-keys\<name>-private.asc
pgp-keys\<name>-public.asc
pgp-keys\<name>-revocation.asc
```

The generator requires a passphrase of at least 12 characters.

`pgp-keys/` is gitignored. The passphrase is passed as a command-line argument,
so it can appear in your shell history and process list; for real keys, prefer
generating them with a dedicated tool such as GnuPG or OpenPGP.js directly.

Share only the public key. Compare fingerprints over a separate channel before
marking a key as verified.

## Uninstall

- Disable **VencordPGP** in Plugins, or run `Desinstalar VencordPGP.cmd`.
- **PGP Key Manager → Delete everything** clears public keys and temporary data.
- The private key is not persisted unless you explicitly saved it in the
  encrypted vault; remove that blob with **Delete stored key**.

## Troubleshooting

See [Troubleshooting](TROUBLESHOOTING.md). If Discord starts without the plugin
after a Vencord update, reinstall: Vencord's updater may replace `dist`.
