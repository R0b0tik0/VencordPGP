[English](Home) | **Español**

**Cifrado OpenPGP automático para DMs y DMs grupales de Discord.**

VencordPGP es un userplugin de [Vencord](https://vencord.dev) que cifra los mensajes salientes con OpenPGP antes de que Discord los vea y descifra los entrantes en local. Escribir un mensaje sigue siendo tan simple como teclear y pulsar Enter.

> **Estado:** v1, en desarrollo activo. El núcleo criptográfico está cubierto por tests; la interfaz del cliente está en inglés y español (sigue el idioma de Discord por defecto). Lee [Limitaciones](Limitaciones) y el [Modelo de amenazas](Modelo-de-amenazas) antes de confiar en él.

## Qué hace

| | |
|---|---|
| **Cifra** | DMs y DMs grupales (tipos de canal 1 y 3), con varios destinatarios por mensaje |
| **Firma** | Firmas opcionales; solo las claves verificadas manualmente producen el check verde `firmado, verificado` |
| **Descifra** | En local, en RAM; el criptograma que guarda Discord nunca se reescribe |
| **Confianza** | Solo manual: sin keyservers, sin descubrimiento de claves, sin peticiones de red |
| **Clave privada** | En RAM por defecto, o en una cámara cifrada local (PBKDF2-SHA256 + AES-256-GCM) |
| **Falla** | Cerrado: si falta una clave o el criptograma es demasiado grande, se cancela el envío y se conserva el borrador |

## Inicio rápido

1. Descarga `VencordPGP-Installer.zip` desde la página de [Releases](https://github.com/R0b0tik0/VencordPGP/releases).
2. Cierra Discord y haz doble clic en `Instalar VencordPGP.cmd` dentro de la carpeta extraída.
3. Abre Discord → **Ajustes → Vencord → Plugins → VencordPGP** y carga tu clave privada.
4. Intercambia **claves públicas** con tu contacto por otro canal, asigna cada clave al ID de usuario de Discord del contacto, compara las huellas y márcalas como verificadas.
5. En un DM, pulsa el botón de candado junto a la caja de mensaje para activar el cifrado en esa conversación.

Detalles completos: [Instalación](Instalacion) · [Instalador de Windows](Instalador-de-Windows) · [Gestión de claves](Gestion-de-claves).

## Mapa de documentación

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

## Qué no está protegido

- Canales de servidor, hilos, canales de voz y anuncios.
- Adjuntos, imágenes, vídeo, embeds y vistas previas de enlaces.
- GIFs y stickers: el GIF/sticker se envía sin cifrar para que Discord pueda mostrarlo. Si el mensaje además lleva texto, se cancela el envío.
- DMs 1:1 con bots (para que los comandos de bot sigan funcionando). Un DM grupal con un bot y humanos cancela el envío en lugar de salir en claro.
- Metadatos: quién habla con quién, cuándo, tamaño del mensaje, IDs de canal y de mensaje.
- Un endpoint comprometido (malware, extensión maliciosa, DevTools) puede leer el texto plano mientras se muestra.

La lista completa está en [Limitaciones](Limitaciones); la visión adversarial, en el [Modelo de amenazas](Modelo-de-amenazas).

## Proyecto

- [Repositorio](https://github.com/R0b0tik0/VencordPGP)
- [Releases](https://github.com/R0b0tik0/VencordPGP/releases)
- [Informar de una vulnerabilidad](https://github.com/R0b0tik0/VencordPGP/security/policy) — nunca en un issue público
- Licencia: GPL-3.0-or-later (el payload precompilado del instalador incluye Vencord, también GPL-3.0)

---

**Relacionado:** [Instalación](Instalacion) · [Gestión de claves](Gestion-de-claves) · [Limitaciones](Limitaciones)
