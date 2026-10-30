**English** | [Español](Inicio)

**Automatic OpenPGP encryption for Discord DMs and group DMs.**

VencordPGP is a [Vencord](https://vencord.dev) userplugin that encrypts outgoing messages with OpenPGP before Discord ever sees them, and decrypts incoming messages locally. Writing a message stays as simple as typing and pressing Enter.

> **Status:** v1, actively developed. The cryptographic core is covered by tests; the in-client UI is available in English and Spanish (it follows Discord's language by default). Read [Limitations](Limitations) and the [Threat model](Threat-Model) before relying on it.

## What it does

| | |
|---|---|
| **Encrypts** | DMs and group DMs (channel types 1 and 3), multi-recipient per message |
| **Signs** | Optional signatures; only manually verified keys produce a green `signed, verified` check |
| **Decrypts** | Locally, in RAM; the ciphertext stored by Discord is never rewritten |
| **Trust** | Manual only: no keyservers, no key discovery, no network requests |
| **Private key** | RAM by default, or an encrypted local vault (PBKDF2-SHA256 + AES-256-GCM) |
| **Fails** | Closed: a missing key or oversized ciphertext cancels the send and keeps your draft |

## Quick start

1. Download `VencordPGP-Installer.zip` from the [Releases](https://github.com/R0b0tik0/VencordPGP/releases) page.
2. Close Discord, then double-click `Instalar VencordPGP.cmd` inside the extracted folder.
3. Start Discord → **Settings → Vencord → Plugins → VencordPGP** and load your private key.
4. Exchange **public** keys with your contact through another channel, bind each key to the contact's Discord user ID, compare fingerprints, and mark them as verified.
5. In a DM, click the lock button next to the message box to turn encryption on for that conversation.

Full details: [Installation](Installation) · [Windows installer](Windows-Installer) · [Key management](Key-Management).

## Documentation map

| English | Español |
|---|---|
| [Home](Home) | [Inicio](Inicio) |
| [Installation](Installation) | [Instalación](Instalacion) |
| [Windows installer](Windows-Installer) | [Instalador de Windows](Instalador-de-Windows) |
| [Key management](Key-Management) | [Gestión de claves](Gestion-de-claves) |
| [Transport format](Transport-Format) | [Formato de transporte](Formato-de-transporte) |
| [Architecture and design](Architecture-and-Design) | [Arquitectura y diseño](Arquitectura-y-diseno) |
| [Limitations](Limitations) | [Limitaciones](Limitaciones) |
| [Threat model](Threat-Model) | [Modelo de amenazas](Modelo-de-amenazas) |
| [Troubleshooting](Troubleshooting) | [Solución de problemas](Solucion-de-problemas) |
| [Security policy](Security-Policy) | [Política de seguridad](Politica-de-seguridad) |
| [Contributing and development](Contributing-and-Development) | [Contribuir y desarrollo](Contribuir-y-desarrollo) |

## What is not protected

- Server channels, threads, voice channels, and announcements.
- Attachments, images, video, embeds, and link previews.
- GIFs and stickers: the GIF/sticker is sent unencrypted so Discord can render it. If the message also contains text, the send is cancelled.
- 1:1 bot DMs (so bot commands keep working). A group DM with a bot and humans cancels the send instead of going out in clear.
- Metadata: who talks to whom, when, message size, channel and message IDs.
- A compromised endpoint (malware, malicious extension, DevTools) can read the plaintext while it is displayed.

The full list is in [Limitations](Limitations); the adversarial view is in the [Threat model](Threat-Model).

## Project

- [Repository](https://github.com/R0b0tik0/VencordPGP)
- [Releases](https://github.com/R0b0tik0/VencordPGP/releases)
- [Report a vulnerability](https://github.com/R0b0tik0/VencordPGP/security/policy) — never a public issue
- License: GPL-3.0-or-later (the prebuilt installer payload contains Vencord, also GPL-3.0)

---

**Related:** [Installation](Installation) · [Key management](Key-Management) · [Limitations](Limitations)
