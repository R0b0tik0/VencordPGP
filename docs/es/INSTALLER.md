# Instalador de Windows

[English](../INSTALLER.md) | **Español**

`Instalar VencordPGP.cmd` es un **lanzador fino**: comprueba que existan
`installer/VencordPGP-Installer.ps1` y `installer/payload/manifest.sha256`, y
ejecuta el instalador de PowerShell. Distribuye siempre el **ZIP completo**
(`VencordPGP-Installer.zip`), no solo el `.cmd`.

El instalador despliega un build precompilado de Vencord que incluye VencordPGP.
Antes de tocar nada hace backup de la instalación actual, comprueba el payload
contra su manifiesto SHA-256, copia los archivos y activa el plugin en
`settings.json`.

`Desinstalar VencordPGP.cmd` restaura el backup limpio más reciente (sin
VencordPGP), guarda un safety backup del `dist` actual y **desactiva** el plugin
conservando tus claves públicas y opciones.

> Cierra Discord antes de instalar o desinstalar. El flujo interactivo te ofrece
> cerrarlo. Si usas `-Force` con Discord abierto, el cliente puede sobrescribir
> el cambio de `settings.json`; en ese caso activa el plugin manualmente tras
> reiniciar.

No requiere Node.js, git ni compilar nada: el payload ya está compilado.

## Flujo del usuario

1. Detecta Discord (`%LOCALAPPDATA%\Discord*`, o
   `%LOCALAPPDATA%\Programs\Discord*`) y Vencord (el stub de `app.asar` o
   `%APPDATA%\Vencord`).
2. Si Discord está abierto, ofrece cerrarlo (o continúa con `-Force`).
3. Verifica `installer/payload/manifest.sha256`.
4. Crea `dist.backup-<fecha>` y `settings.backup-<fecha>.json`.
5. Copia `patcher.js`, `preload.js`, `renderer.js`, `renderer.css` y los avisos
   `.LEGAL.txt`.
6. Comprueba que `renderer.js` contiene `VencordPGP`.
7. Activa `plugins.VencordPGP.enabled = true` preservando el resto de ajustes.
8. Muestra los pasos de configuración de claves.

Como máximo pregunta tres cosas: cerrar Discord, confirmar la instalación y abrir
Discord al terminar.

## Opciones (scripts / CI)

```powershell
.\installer\VencordPGP-Installer.ps1 -Install -Silent -Force
.\installer\VencordPGP-Installer.ps1 -Uninstall -Silent
.\installer\VencordPGP-Installer.ps1 -Install -Silent -DryRun -Force
.\installer\VencordPGP-Installer.ps1 -Install -Silent -Language en
.\installer\VencordPGP-Installer.ps1 -Install -DiscordRoot <ruta> -VencordRoot <ruta>
```

| Opción | Significado |
|---|---|
| `-Install` / `-Uninstall` | Acción no interactiva |
| `-Silent` | Sin preguntas (requiere `-Install` o `-Uninstall`) |
| `-Force` | Continúa aunque Discord esté abierto; no lo cierra |
| `-DryRun` | Muestra lo que haría sin escribir nada |
| `-Language auto\|es\|en` | Idioma de los mensajes (`auto` = idioma de Windows; si no es español usa inglés) |
| `-DiscordRoot` / `-VencordRoot` | Fuerza la detección (tests/sandbox) |

## Backups

Se crean en `%APPDATA%\Vencord`:

```text
dist.backup-<fecha>\                  build anterior de Vencord
dist.pre-uninstall-<fecha>\           safety backup hecho al desinstalar
settings\settings.backup-<fecha>.json ajustes anteriores
```

Reversión manual: cierra Discord, borra `dist`, renombra el backup a `dist` y
restaura el JSON de ajustes si hace falta.

## Regenerar el payload

El payload es un build completo de Vencord con el plugin, no un parche
incremental. Regéneralo después de cambiar el plugin:

```powershell
node scripts/build-installer-payload.mjs <checkout-vencord> .
```

El script copia solo los archivos necesarios (sin source maps), escribe
`VERSION.txt` y `manifest.sha256`, y aborta si `renderer.js` no contiene
`VencordPGP`. No edites a mano los archivos de `installer/payload/`.

## Pruebas

```powershell
npm run test:installer
```

`scripts/test-installer.ps1` crea un sandbox con carpetas falsas de
Discord/Vencord y comprueba: que el dry-run no cambia nada; que la instalación
crea backups, copia el payload, activa el plugin y escribe UTF-8 sin BOM; y que
la desinstalación restaura un build limpio, crea un safety backup y conserva los
ajustes y las claves públicas. Nunca toca la instalación real de
Discord/Vencord.

## Artefactos de release

Crea `VencordPGP-Installer.zip` con:

```text
Instalar VencordPGP.cmd
Desinstalar VencordPGP.cmd
installer\VencordPGP-Installer.ps1
installer\README.txt
installer\LEEME.txt
installer\LICENSE-Vencord.txt
installer\payload\*
```

El ZIP es un artefacto de build y no se versiona en git. Adjúntalo a un release
de GitHub y publica su SHA-256 en las notas del release para que los usuarios
puedan comprobar la descarga por un canal independiente.

## Límites de seguridad

- El payload es un **build completo de Vencord**, no un parche pequeño. Una
  actualización de Vencord puede sobrescribir `dist`; reinstala después.
- Los backups permiten revertir. La desinstalación busca el backup más reciente
  que **no** contenga VencordPGP.
- No se descarga nada: el instalador es offline.
- El manifiesto SHA-256 detecta **corrupción, no manipulación maliciosa**: no
  está firmado. Cualquiera que pueda modificar el ZIP puede modificar también el
  manifiesto. Descarga el ZIP de una fuente de confianza y verifica su hash fuera
  de banda.
- La clave privada vive en RAM por defecto; opcionalmente puede guardarse cifrada
  en la caja fuerte local, nunca en los ajustes sincronizados. Ver
  [Gestión de claves](KEYS.md).
- Windows puede pedir confirmación al ejecutar un `.cmd`. Es un script de texto;
  puedes abrirlo con Notepad para revisarlo.
- Los mensajes del instalador siguen el idioma de Windows (español o inglés) y se
  pueden forzar con `-Language es|en`; los lanzadores `.cmd` pasan los parámetros.
- Vencord es GPL-3.0. El payload se compiló desde Vencord 1.15.11 (commit
  `32c9063`) más el código de este plugin. Ambos son públicos; la licencia y los
  avisos legales de Vencord están incluidos en `installer/`.
