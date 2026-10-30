[English](Installation) | **Español**

Esta página cubre las dos formas de instalar VencordPGP:

- el instalador de Windows de doble clic (recomendado para usuarios normales), y
- compilar el plugin desde el código contra un checkout de Vencord (desarrollo).

Si solo quieres usar el plugin, empieza por el
[instalador de Windows](Instalador-de-Windows).

## Requisitos

| | |
|---|---|
| Sistema | Windows 10/11 para el instalador; el núcleo es multiplataforma |
| Discord | Discord Desktop con Vencord instalado e inyectado |
| Vencord | 1.15.x (probado contra `Vendicated/Vencord@main`, octubre de 2026) |
| Node.js | 22 o superior (solo para compilar desde el código) |
| pnpm | 11, mediante `corepack pnpm` (solo para compilar) |
| OpenPGP | `openpgp@^6.3.2` (se instala como dependencia) |

**No** necesitas Node.js, git ni pnpm para usar el instalador de Windows. El
payload ya está compilado.

## Opción A — Instalador de Windows

1. Descarga `VencordPGP-Installer.zip` desde la página **Releases** del
   repositorio.
2. Descomprime el ZIP completo. Los `.cmd` son solo lanzadores; necesitan la
   carpeta `installer/` al lado.
3. Cierra Discord y haz doble clic en `Instalar VencordPGP.cmd`.
4. Sigue las preguntas. El instalador hace backup de `%APPDATA%\Vencord\dist` y
   de `%APPDATA%\Vencord\settings\settings.json`, verifica el manifiesto SHA-256
   del payload, copia el build y activa `plugins.VencordPGP.enabled`.
5. Abre Discord y entra en **Ajustes → Vencord → Plugins → VencordPGP**.
6. Configura tus claves como se describe en [Gestión de claves](Gestion-de-claves).

Desinstala con `Desinstalar VencordPGP.cmd`. Los detalles, opciones y backups
están en la [guía del instalador](Instalador-de-Windows).

## Opción B — Compilar desde el código

### 1. Clona Vencord y copia el plugin

```powershell
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
New-Item -ItemType Directory -Force src\userplugins | Out-Null
Copy-Item -Recurse <ruta-a-este-repo>\vencord-plugin\vencordPgp src\userplugins\
```

El plugin debe estar en `src/userplugins/vencordPgp/`. Vencord carga cada carpeta
de `src/userplugins/` como un userplugin.

### 2. Añade las dependencias

```powershell
corepack pnpm add openpgp@^6.3.2
corepack pnpm add -D @openpgp/web-stream-tools
```

`@openpgp/web-stream-tools` es necesario porque Vencord compila con
`skipLibCheck: false`; sin él, `testTsc` falla con los tipos de OpenPGP.

### 3. Compila y despliega

```powershell
corepack pnpm testTsc
corepack pnpm build
```

Cierra Discord y copia el resultado a tu instalación de Vencord:

```powershell
Copy-Item dist\* $env:APPDATA\Vencord\dist\ -Recurse -Force
```

También puedes usar `corepack pnpm inject` si instalaste Vencord con su
instalador oficial.

### 4. Activa el plugin

Abre Discord → **Ajustes → Vencord → Plugins → VencordPGP** y actívalo. Después
configura tus claves ([Gestión de claves](Gestion-de-claves)).

## Mantener sincronizadas las dos copias del núcleo

El repositorio tiene dos copias del núcleo:

- `src/*.ts` — núcleo independiente de Node/TypeScript, compilado con NodeNext
  ESM (los imports relativos terminan en `.js`).
- `vencord-plugin/vencordPgp/core/*.ts` — los mismos archivos sin el sufijo
  `.js`, porque Vencord empaqueta el plugin con esbuild.

Después de editar `src/*.ts`, copia el núcleo a tu checkout de Vencord:

```powershell
node scripts/sync-vencord-core.mjs <checkout-vencord>\src\userplugins\vencordPgp\core
```

El script quita las extensiones `.js` y comprueba que no haya corrupción de
codificación. Es el único paso necesario: `src/*.ts` ya contiene los ajustes de
límite (`maxTransportChars`, `MAX_PLAINTEXT_CHARS=3000`).

## Generar claves de prueba o personales

```powershell
node scripts/generate-test-keys.mjs "Tu Nombre" "una-passphrase-larga"
```

Escribe:

```text
pgp-keys\<nombre>-private.asc
pgp-keys\<nombre>-public.asc
pgp-keys\<nombre>-revocation.asc
```

El generador exige una passphrase de al menos 12 caracteres.

`pgp-keys/` está en `.gitignore`. La passphrase se pasa como argumento de línea
de comandos, así que puede quedar en el historial del shell y en la lista de
procesos; para claves reales, es preferible generarlas con una herramienta
dedicada como GnuPG u OpenPGP.js directamente.

Comparte solo la clave pública. Compara las huellas por un canal independiente
antes de marcar una clave como verificada.

## Desinstalación

- Desactiva **VencordPGP** en Plugins, o ejecuta `Desinstalar VencordPGP.cmd`.
- **PGP Key Manager → Borrar todo** elimina las claves públicas y los datos
  temporales.
- La clave privada no se persiste salvo que la guardes explícitamente en la caja
  fuerte cifrada; elimina ese blob con **Borrar clave guardada**.

## Solución de problemas

Ver [Solución de problemas](Solucion-de-problemas). Si Discord arranca sin el plugin
tras una actualización de Vencord, reinstala: el updater de Vencord puede
reemplazar `dist`.

---

**Relacionado:** [Inicio](Inicio) · [Instalador de Windows](Instalador-de-Windows) · [Gestion de claves](Gestion-de-claves)
