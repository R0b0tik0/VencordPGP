#requires -version 5.1
<#
    VencordPGP Installer (Windows)
    - Instala un build de Vencord que incluye el plugin VencordPGP.
    - Hace backup del dist y de settings antes de tocar nada.
    - Verifica SHA-256 del payload.
    - Permite desinstalar restaurando el ultimo backup.
    - Mensajes en espanol e ingles (parametro -Language auto|es|en; auto usa el idioma de Windows).

    Uso normal: doble clic en "Instalar VencordPGP.cmd".
    Opciones:
      -Install / -Uninstall   accion no interactiva
      -Silent                 sin preguntas (requiere -Install o -Uninstall)
      -Force                  continua aunque Discord este abierto (no lo cierra)
      -DryRun                 muestra lo que haria, sin cambios
      -Language <auto|es|en>  idioma de los mensajes (por defecto auto)
      -DiscordRoot <ruta>     forzar carpeta de Discord (testing)
      -VencordRoot <ruta>     forzar carpeta de datos de Vencord (testing)
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Silent,
    [switch]$Force,
    [switch]$DryRun,
    [ValidateSet("auto", "es", "en")]
    [string]$Language = "auto",
    [string]$DiscordRoot,
    [string]$VencordRoot
)

$ErrorActionPreference = "Stop"
$script:Payload = Join-Path $PSScriptRoot "payload"
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:ProcessNames = @("Discord", "DiscordPTB", "DiscordCanary")

# auto = idioma de la UI de Windows; cualquier idioma que no sea espanol usa ingles.
$script:Lang = switch ($Language) {
    "es" { "es" }
    "en" { "en" }
    default {
        if ([System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -eq "es") { "es" } else { "en" }
    }
}

$script:Messages = @{
    es = @{
        "header.title"                   = "VencordPGP - Instalador"
        "header.subtitle"                = "Cifrado PGP automatico para Discord"
        "prefix.warn"                    = "AVISO"
        "prefix.error"                   = "ERROR"
        "title.installing"               = "Instalando VencordPGP"
        "title.uninstalling"             = "Desinstalando VencordPGP"
        "step.closingDiscord"            = "Cerrando Discord..."
        "step.discord"                   = "Discord: {0}"
        "step.vencord"                   = "Vencord: {0}"
        "step.copyingDist"               = "[dry-run] Copiaria {0} -> {1}"
        "step.copyingSettings"           = "[dry-run] Copiaria settings.json -> settings.backup-{0}.json"
        "step.creatingDir"               = "[dry-run] Crearia {0}"
        "step.copyingFile"               = "[dry-run] Copiaria {0}"
        "step.verifyRenderer"            = "[dry-run] Verificaria que renderer.js contiene VencordPGP"
        "step.activating"                = "[dry-run] Activaria plugins.VencordPGP.enabled en {0}"
        "step.deactivating"              = "[dry-run] Desactivaria plugins.VencordPGP.enabled en {0}"
        "step.savingDist"                = "[dry-run] Guardaria el dist actual en {0}"
        "step.restoring"                 = "[dry-run] Restauraria {0}"
        "ok.payloadVerified"             = "Payload verificado ({0} archivos)."
        "ok.backupCreated"               = "Backup creado: {0}"
        "ok.buildCopied"                 = "Build copiado y verificado (plugin presente)."
        "ok.pluginEnabled"               = "Plugin activado en settings.json."
        "ok.pluginDisabled"              = "Plugin desactivado en settings.json (ajustes y claves conservados)."
        "ok.installed"                   = "VencordPGP instalado."
        "ok.installDryRun"               = "Simulacion completada. No se modifico ningun archivo."
        "ok.uninstallDryRun"             = "Simulacion completada. No se modifico nada."
        "ok.uninstalled"                 = "Desinstalacion completada. Reinicia Discord si estaba abierto."
        "ok.restored"                    = "Restaurado: {0}"
        "warn.discordOpenInstall"        = "Discord esta abierto. Se actualizaran los archivos; reinicia Discord para aplicar."
        "warn.discordOpenInstallSetting" = "Con Discord abierto, la activacion en settings.json puede ser sobrescrita por el cliente. Si ocurre, activa el plugin en la UI tras reiniciar."
        "warn.discordOpenUninstall"      = "Discord esta abierto. Restaura los archivos y reinicia Discord."
        "warn.discordOpenUninstallSetting" = "Con Discord abierto, el cambio en settings.json puede ser sobrescrito; si ocurre, desactiva el plugin en la UI."
        "warn.closingDiscordInstall"     = "Discord esta abierto. Se cerrara para instalar (puedes perder borradores no enviados)."
        "warn.closingDiscordUninstall"   = "Discord esta abierto. Se cerrara para restaurar (puedes perder borradores)."
        "warn.noDistBackup"              = "No hay backup de dist. Solo quitare el plugin de settings.json."
        "warn.oldestBackup"              = "No hay backup previo sin el plugin; restauro el mas antiguo disponible."
        "warn.vencordNotInjected"        = "Vencord no parece estar inyectado en: {0}"
        "err.payloadMissing"             = "No se encuentra la carpeta payload junto al instalador."
        "err.manifestMissing"            = "Falta manifest.sha256 en el payload."
        "err.manifestLine"               = "Linea de manifiesto invalida: {0}"
        "err.payloadFileMissing"         = "Falta el archivo del payload: {0}"
        "err.hashMismatch"               = "Hash no coincide para {0} (payload corrupto o modificado)."
        "err.manifestIncomplete"         = "Manifiesto incompleto."
        "err.distMissing"                = "No existe la carpeta dist de Vencord: {0}"
        "err.settingsInvalid"            = "settings.json no es JSON valido; no lo modifico."
        "err.discordOpen"                = "Discord esta abierto. Cierralo o usa -Force."
        "err.installCancelledClosed"     = "Instalacion cancelada: cierra Discord y vuelve a ejecutar."
        "err.installCancelledUser"       = "Instalacion cancelada por el usuario."
        "err.uninstallCancelledClosed"   = "Desinstalacion cancelada: cierra Discord y vuelve a ejecutar."
        "err.uninstallCancelledUser"     = "Desinstalacion cancelada por el usuario."
        "err.rendererNoPlugin"           = "El renderer copiado no contiene VencordPGP. Instalacion abortada."
        "err.discordNotFound"            = "No se encontro ninguna instalacion de Discord en este equipo."
        "err.vencordDistMissing"         = "Vencord esta inyectado pero no encuentro su carpeta dist. Usa -VencordRoot <ruta>."
        "confirm.closeDiscord"           = "Cerrar Discord ahora?"
        "confirm.continueInstall"        = "Continuar con la instalacion?"
        "confirm.openDiscord"            = "Abrir Discord ahora?"
        "confirm.openDiscordDownload"    = "Abrir la pagina de descarga de Discord?"
        "confirm.openVencordDownload"    = "Abrir la pagina oficial de Vencord para instalarlo?"
        "confirm.restoreBackup"          = "Restaurar el ultimo backup de Vencord y quitar el plugin?"
        "prompt.yesDefault"              = "[S/n]"
        "prompt.noDefault"               = "[s/N]"
        "info.intro"                     = "Se va a reemplazar el build de Vencord por uno que incluye VencordPGP."
        "info.payload"                   = "Payload: {0}"
        "info.backupNotice"              = "Se hara backup antes de tocar nada."
        "info.unknownVersion"            = "desconocida"
        "info.nextSteps"                 = "Siguientes pasos:"
        "info.nextStep1"                 = "  1. Abre Discord > Ajustes > Vencord > Plugins > VencordPGP."
        "info.nextStep2"                 = "  2. Pega tu clave privada PGP y la passphrase, y pulsa Desbloquear."
        "info.nextStep2b"                = "     (La clave privada vive solo en memoria; no se guarda ni se sincroniza)."
        "info.nextStep3"                 = "  3. Anade la clave publica de la otra persona usando su ID de Discord."
        "info.nextStep4"                 = "  4. Compara la huella por un canal independiente antes de marcarla verificada."
        "info.backupPath"                = "Backup: {0}"
        "info.discordList"               = "Instalaciones de Discord detectadas:"
        "info.chooseDiscord"             = "Elige una [1]"
        "info.pluginOnly"                = "Este instalador solo instala el plugin; necesita Vencord ya instalado."
        "info.modeDryRun"                = "  Modo    : DRY RUN (no se modifica nada)"
        "info.discordLine"               = "  Discord : {0}"
        "info.vencordLine"               = "  Vencord : {0}"
        "info.payloadLine"               = "  Payload : {0}"
        "info.actionPrompt"              = "Escribe I para instalar, D para desinstalar, S para salir [I]"
        "info.nothingToDo"               = "Nada que hacer."
        "info.pressEnter"                = "Pulsa Enter para salir"
    }
    en = @{
        "header.title"                   = "VencordPGP - Installer"
        "header.subtitle"                = "Automatic PGP encryption for Discord"
        "prefix.warn"                    = "WARNING"
        "prefix.error"                   = "ERROR"
        "title.installing"               = "Installing VencordPGP"
        "title.uninstalling"             = "Uninstalling VencordPGP"
        "step.closingDiscord"            = "Closing Discord..."
        "step.discord"                   = "Discord: {0}"
        "step.vencord"                   = "Vencord: {0}"
        "step.copyingDist"               = "[dry-run] Would copy {0} -> {1}"
        "step.copyingSettings"           = "[dry-run] Would copy settings.json -> settings.backup-{0}.json"
        "step.creatingDir"               = "[dry-run] Would create {0}"
        "step.copyingFile"               = "[dry-run] Would copy {0}"
        "step.verifyRenderer"            = "[dry-run] Would check that renderer.js contains VencordPGP"
        "step.activating"                = "[dry-run] Would enable plugins.VencordPGP.enabled in {0}"
        "step.deactivating"              = "[dry-run] Would disable plugins.VencordPGP.enabled in {0}"
        "step.savingDist"                = "[dry-run] Would save the current dist to {0}"
        "step.restoring"                 = "[dry-run] Would restore {0}"
        "ok.payloadVerified"             = "Payload verified ({0} files)."
        "ok.backupCreated"               = "Backup created: {0}"
        "ok.buildCopied"                 = "Build copied and verified (plugin present)."
        "ok.pluginEnabled"               = "Plugin enabled in settings.json."
        "ok.pluginDisabled"              = "Plugin disabled in settings.json (settings and keys preserved)."
        "ok.installed"                   = "VencordPGP installed."
        "ok.installDryRun"               = "Dry run completed. No file was modified."
        "ok.uninstallDryRun"             = "Dry run completed. Nothing was modified."
        "ok.uninstalled"                 = "Uninstall completed. Restart Discord if it was open."
        "ok.restored"                    = "Restored: {0}"
        "warn.discordOpenInstall"        = "Discord is running. Files will be updated; restart Discord to apply."
        "warn.discordOpenInstallSetting" = "With Discord running, the settings.json activation may be overwritten by the client. If that happens, enable the plugin in the UI after restarting."
        "warn.discordOpenUninstall"      = "Discord is running. Restore the files and restart Discord."
        "warn.discordOpenUninstallSetting" = "With Discord running, the settings.json change may be overwritten; if that happens, disable the plugin in the UI."
        "warn.closingDiscordInstall"     = "Discord is running. It will be closed to install (unsent drafts may be lost)."
        "warn.closingDiscordUninstall"   = "Discord is running. It will be closed to restore (drafts may be lost)."
        "warn.noDistBackup"              = "No dist backup found. I will only remove the plugin from settings.json."
        "warn.oldestBackup"              = "No previous backup without the plugin; restoring the oldest available one."
        "warn.vencordNotInjected"        = "Vencord does not appear to be injected in: {0}"
        "err.payloadMissing"             = "The payload folder next to the installer was not found."
        "err.manifestMissing"            = "manifest.sha256 is missing from the payload."
        "err.manifestLine"               = "Invalid manifest line: {0}"
        "err.payloadFileMissing"         = "Payload file missing: {0}"
        "err.hashMismatch"               = "Hash mismatch for {0} (payload corrupt or modified)."
        "err.manifestIncomplete"         = "Manifest incomplete."
        "err.distMissing"                = "Vencord dist folder does not exist: {0}"
        "err.settingsInvalid"            = "settings.json is not valid JSON; I will not modify it."
        "err.discordOpen"                = "Discord is running. Close it or use -Force."
        "err.installCancelledClosed"     = "Installation cancelled: close Discord and run again."
        "err.installCancelledUser"       = "Installation cancelled by the user."
        "err.uninstallCancelledClosed"   = "Uninstall cancelled: close Discord and run again."
        "err.uninstallCancelledUser"     = "Uninstall cancelled by the user."
        "err.rendererNoPlugin"           = "The copied renderer does not contain VencordPGP. Installation aborted."
        "err.discordNotFound"            = "No Discord installation was found on this device."
        "err.vencordDistMissing"         = "Vencord is injected but its dist folder was not found. Use -VencordRoot <path>."
        "confirm.closeDiscord"           = "Close Discord now?"
        "confirm.continueInstall"        = "Continue with the installation?"
        "confirm.openDiscord"            = "Open Discord now?"
        "confirm.openDiscordDownload"    = "Open the Discord download page?"
        "confirm.openVencordDownload"    = "Open the official Vencord page to install it?"
        "confirm.restoreBackup"          = "Restore the latest Vencord backup and remove the plugin?"
        "prompt.yesDefault"              = "[Y/n]"
        "prompt.noDefault"               = "[y/N]"
        "info.intro"                     = "The Vencord build will be replaced by one that includes VencordPGP."
        "info.payload"                   = "Payload: {0}"
        "info.backupNotice"              = "A backup will be made before touching anything."
        "info.unknownVersion"            = "unknown"
        "info.nextSteps"                 = "Next steps:"
        "info.nextStep1"                 = "  1. Open Discord > Settings > Vencord > Plugins > VencordPGP."
        "info.nextStep2"                 = "  2. Paste your PGP private key and passphrase, then press Unlock."
        "info.nextStep2b"                = "     (The private key lives in memory only; it is not saved or synced)."
        "info.nextStep3"                 = "  3. Add the other person's public key using their Discord ID."
        "info.nextStep4"                 = "  4. Compare the fingerprint over an independent channel before marking it verified."
        "info.backupPath"                = "Backup: {0}"
        "info.discordList"               = "Discord installations found:"
        "info.chooseDiscord"             = "Choose one [1]"
        "info.pluginOnly"                = "This installer only installs the plugin; Vencord must already be installed."
        "info.modeDryRun"                = "  Mode    : DRY RUN (nothing is modified)"
        "info.discordLine"               = "  Discord : {0}"
        "info.vencordLine"               = "  Vencord : {0}"
        "info.payloadLine"               = "  Payload : {0}"
        "info.actionPrompt"              = "Type I to install, D to uninstall, S to exit [I]"
        "info.nothingToDo"               = "Nothing to do."
        "info.pressEnter"                = "Press Enter to exit"
    }
}

# Traduce una clave del catalogo. -Format aplica -f con los argumentos dados.
function T {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [object[]]$Format
    )
    $table = $script:Messages[$script:Lang]
    $text = $null
    if ($table.ContainsKey($Key)) { $text = $table[$Key] }
    elseif ($script:Messages["en"].ContainsKey($Key)) { $text = $script:Messages["en"][$Key] }
    else { $text = $Key }
    if ($null -ne $Format) { return ($text -f $Format) }
    return $text
}

function Write-Title([string]$Text) {
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}
function Write-Step([string]$Text) { Write-Host "  -> $Text" }
function Write-Ok([string]$Text) { Write-Host "  OK: $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host ("  " + (T "prefix.warn") + ": $Text") -ForegroundColor Yellow }
function Write-Err([string]$Text) { Write-Host ("  " + (T "prefix.error") + ": $Text") -ForegroundColor Red }

function Confirm-Yes {
    param(
        [Parameter(Mandatory = $true)][string]$Question,
        [bool]$DefaultYes = $true
    )
    if ($Silent) { return $DefaultYes }
    $hint = if ($DefaultYes) { T "prompt.yesDefault" } else { T "prompt.noDefault" }
    $answer = Read-Host "$Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    $normalized = $answer.Trim().ToLowerInvariant()
    if ($script:Lang -eq "es") { return ($normalized -eq "s" -or $normalized -eq "si") }
    return ($normalized -eq "y" -or $normalized -eq "yes")
}

function Get-DiscordCandidates {
    $roots = New-Object System.Collections.Generic.List[string]
    if ($DiscordRoot) {
        $roots.Add($DiscordRoot)
    } else {
        foreach ($name in @("Discord", "DiscordPTB", "DiscordCanary")) {
            $p = Join-Path $env:LOCALAPPDATA $name
            if (Test-Path $p) { $roots.Add($p) }
            $p2 = Join-Path $env:LOCALAPPDATA ("Programs\" + $name)
            if (Test-Path $p2) { $roots.Add($p2) }
        }
    }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($root in $roots) {
        $apps = @(Get-ChildItem $root -Directory -Filter "app-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
        foreach ($app in $apps) {
            $asar = Join-Path $app.FullName "resources\app.asar"
            if (-not (Test-Path $asar)) { continue }
            $exe = $null
            foreach ($candidate in @("Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe")) {
                $p = Join-Path $root $candidate
                if (Test-Path $p) { $exe = $p; break }
            }
            $result.Add([PSCustomObject]@{
                Root   = $root
                AppDir = $app.FullName
                Asar   = $asar
                Exe    = $exe
            })
        }
    }
    return $result
}

function Get-StubInfo([string]$AsarPath) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($AsarPath)
        $text = [System.Text.Encoding]::ASCII.GetString($bytes)
    } catch {
        return $null
    }
    if ($text -notmatch "Vencord") { return $null }

    $patcher = $null
    if ($text -match '([A-Za-z]:\\[^"\r\n]*?Vencord\\dist\\patcher\.js)') {
        $patcher = $matches[1]
    }
    $root = $null
    if ($patcher) {
        $root = Split-Path (Split-Path $patcher -Parent) -Parent
    }
    return [PSCustomObject]@{ Patcher = $patcher; Root = $root }
}

function Get-VencordRoot([object]$Discord, [object]$Stub) {
    if ($VencordRoot) { return $VencordRoot }
    if ($Stub -and $Stub.Root -and (Test-Path $Stub.Root)) { return $Stub.Root }
    $fallback = Join-Path $env:APPDATA "Vencord"
    if (Test-Path $fallback) { return $fallback }
    return $null
}

function Get-RunningDiscord {
    return @(Get-Process -Name $script:ProcessNames -ErrorAction SilentlyContinue)
}

function Close-RunningDiscord {
    $procs = Get-RunningDiscord
    if ($procs.Count -eq 0) { return }
    Write-Step (T "step.closingDiscord")
    foreach ($p in $procs) {
        try { $p.CloseMainWindow() | Out-Null } catch { }
    }
    Start-Sleep -Seconds 3
    $left = Get-RunningDiscord
    if ($left.Count -gt 0) {
        $left | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

function Get-Sha256Hex([string]$Path) {
    # No usar Get-FileHash: es una funcion del modulo Microsoft.PowerShell.Utility.
    # Cuando Windows PowerShell 5.1 se lanza desde pwsh 7 (por ejemplo, en un runner
    # de CI) hereda un PSModulePath con las rutas de PowerShell 7 y esa funcion no
    # se resuelve ("Get-FileHash is not recognized"). .NET no depende de modulos.
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = $null
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        $bytes = $sha.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace("-", "")
    } finally {
        if ($stream) { $stream.Dispose() }
        $sha.Dispose()
    }
}

function Test-Payload {
    $manifestPath = Join-Path $script:Payload "manifest.sha256"
    if (-not (Test-Path $manifestPath)) { throw (T "err.manifestMissing") }
    $count = 0
    foreach ($line in [System.IO.File]::ReadAllLines($manifestPath)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([A-Fa-f0-9]{64}) \*(.+)$') {
            throw (T "err.manifestLine" @($line))
        }
        $expected = $matches[1].ToUpperInvariant()
        $name = $matches[2]
        $file = Join-Path $script:Payload $name
        if (-not (Test-Path $file)) { throw (T "err.payloadFileMissing" @($name)) }
        $actual = Get-Sha256Hex $file
        if ($actual -ne $expected) { throw (T "err.hashMismatch" @($name)) }
        $count++
    }
    if ($count -lt 2) { throw (T "err.manifestIncomplete") }
    Write-Ok (T "ok.payloadVerified" @($count))
}

function Backup-Vencord([string]$Root) {
    $dist = Join-Path $Root "dist"
    if (-not (Test-Path $dist)) { throw (T "err.distMissing" @($dist)) }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = Join-Path $Root ("dist.backup-" + $stamp)
    $settings = Join-Path $Root "settings\settings.json"
    if ($DryRun) {
        Write-Step (T "step.copyingDist" @($dist, $backup))
        if (Test-Path $settings) { Write-Step (T "step.copyingSettings" @($stamp)) }
    } else {
        Copy-Item $dist $backup -Recurse -Force
        if (Test-Path $settings) {
            Copy-Item $settings (Join-Path $Root "settings\settings.backup-$stamp.json") -Force
        }
        Write-Ok (T "ok.backupCreated" @($backup))
    }
    return $stamp
}

function Copy-Payload([string]$Root) {
    $dist = Join-Path $Root "dist"
    if (-not (Test-Path $dist)) {
        if ($DryRun) { Write-Step (T "step.creatingDir" @($dist)) }
        else { New-Item -ItemType Directory -Force -Path $dist | Out-Null }
    }
    $files = @(Get-ChildItem $script:Payload -File | Where-Object {
        $_.Name -ne "manifest.sha256" -and $_.Name -ne "VERSION.txt"
    })
    foreach ($f in $files) {
        if ($DryRun) {
            Write-Step (T "step.copyingFile" @($f.Name))
        } else {
            Copy-Item $f.FullName (Join-Path $dist $f.Name) -Force
        }
    }
    $versionFile = Join-Path $script:Payload "VERSION.txt"
    if ((Test-Path $versionFile) -and -not $DryRun) {
        Copy-Item $versionFile (Join-Path $dist "VencordPGP-VERSION.txt") -Force
    }
    if ($DryRun) {
        Write-Step (T "step.verifyRenderer")
    } else {
        $renderer = Join-Path $dist "renderer.js"
        $text = [System.IO.File]::ReadAllText($renderer)
        if (-not $text.Contains("VencordPGP")) {
            throw (T "err.rendererNoPlugin")
        }
        Write-Ok (T "ok.buildCopied")
    }
}

function Update-PluginSetting([string]$Root, [bool]$Enable) {
    $settingsDir = Join-Path $Root "settings"
    $settingsPath = Join-Path $settingsDir "settings.json"

    if (-not (Test-Path $settingsDir)) {
        if ($DryRun) { Write-Step (T "step.creatingDir" @($settingsDir)) }
        else { New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null }
    }

    if (Test-Path $settingsPath) {
        $raw = [System.IO.File]::ReadAllText($settingsPath)
        if ([string]::IsNullOrWhiteSpace($raw)) {
            $settings = [PSCustomObject]@{}
        } else {
            try { $settings = $raw | ConvertFrom-Json }
            catch { throw (T "err.settingsInvalid") }
        }
    } else {
        $settings = [PSCustomObject]@{}
    }

    if (-not $settings.PSObject.Properties["plugins"]) {
        $settings | Add-Member -NotePropertyName "plugins" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    if ($null -eq $settings.plugins) {
        $settings.plugins = [PSCustomObject]@{}
    }

    if (-not $settings.plugins.PSObject.Properties["VencordPGP"]) {
        $settings.plugins | Add-Member -NotePropertyName "VencordPGP" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    if ($null -eq $settings.plugins.VencordPGP) {
        $settings.plugins.VencordPGP = [PSCustomObject]@{}
    }
    $entry = $settings.plugins.VencordPGP
    if ($entry.PSObject.Properties["enabled"]) {
        $entry.enabled = $Enable
    } else {
        $entry | Add-Member -NotePropertyName "enabled" -NotePropertyValue $Enable -Force
    }
    # Nunca borrar el resto de ajustes del plugin (claves publicas, opciones, etc.).

    if ($DryRun) {
        if ($Enable) { Write-Step (T "step.activating" @($settingsPath)) }
        else { Write-Step (T "step.deactivating" @($settingsPath)) }
        return
    }

    $json = $settings | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($settingsPath, $json, $script:Utf8NoBom)
    if ($Enable) { Write-Ok (T "ok.pluginEnabled") }
    else { Write-Ok (T "ok.pluginDisabled") }
}

function Install-Plugin {
    param([object]$Discord, [string]$Root)

    Write-Title (T "title.installing")
    Write-Step (T "step.discord" @($Discord.Root))
    Write-Step (T "step.vencord" @($Root))

    $running = Get-RunningDiscord
    if ($running.Count -gt 0) {
        if ($Force) {
            Write-Warn (T "warn.discordOpenInstall")
            Write-Warn (T "warn.discordOpenInstallSetting")
        } elseif ($Silent) {
            throw (T "err.discordOpen")
        } else {
            Write-Warn (T "warn.closingDiscordInstall")
            if (-not (Confirm-Yes (T "confirm.closeDiscord") $true)) {
                throw (T "err.installCancelledClosed")
            }
            Close-RunningDiscord
        }
    }

    if (-not $Silent) {
        $version = T "info.unknownVersion"
        $vf = Join-Path $script:Payload "VERSION.txt"
        if (Test-Path $vf) { $version = (Get-Content $vf | Select-Object -First 2) -join " / " }
        Write-Host ""
        Write-Host (T "info.intro")
        Write-Host (T "info.payload" @($version))
        Write-Host (T "info.backupNotice")
        if (-not (Confirm-Yes (T "confirm.continueInstall") $true)) {
            throw (T "err.installCancelledUser")
        }
    }

    Test-Payload
    $stamp = Backup-Vencord $Root
    Copy-Payload $Root
    Update-PluginSetting $Root $true

    if ($DryRun) {
        Write-Host ""
        Write-Ok (T "ok.installDryRun")
        return
    }

    Write-Host ""
    Write-Ok (T "ok.installed")
    Write-Host ""
    Write-Host (T "info.nextSteps") -ForegroundColor Cyan
    Write-Host (T "info.nextStep1")
    Write-Host (T "info.nextStep2")
    Write-Host (T "info.nextStep2b")
    Write-Host (T "info.nextStep3")
    Write-Host (T "info.nextStep4")
    Write-Host ""
    Write-Host (T "info.backupPath" @((Join-Path $Root ("dist.backup-" + $stamp))))

    if (-not $Silent -and -not $Force) {
        if ($Discord.Exe -and (Confirm-Yes (T "confirm.openDiscord") $true)) {
            if (-not $DryRun) { Start-Process $Discord.Exe | Out-Null }
        }
    }
}

function Uninstall-Plugin {
    param([object]$Discord, [string]$Root)

    Write-Title (T "title.uninstalling")
    Write-Step (T "step.vencord" @($Root))

    $running = Get-RunningDiscord
    if ($running.Count -gt 0) {
        if ($Force) {
            Write-Warn (T "warn.discordOpenUninstall")
            Write-Warn (T "warn.discordOpenUninstallSetting")
        } elseif ($Silent) {
            throw (T "err.discordOpen")
        } else {
            Write-Warn (T "warn.closingDiscordUninstall")
            if (-not (Confirm-Yes (T "confirm.closeDiscord") $true)) {
                throw (T "err.uninstallCancelledClosed")
            }
            Close-RunningDiscord
        }
    }

    if (-not $Silent) {
        if (-not (Confirm-Yes (T "confirm.restoreBackup") $false)) {
            throw (T "err.uninstallCancelledUser")
        }
    }

    $backups = @(Get-ChildItem $Root -Directory -Filter "dist.backup-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($backups.Count -eq 0) {
        Write-Warn (T "warn.noDistBackup")
    } else {
        $clean = @($backups | Where-Object {
            $r = Join-Path $_.FullName "renderer.js"
            (Test-Path $r) -and -not ([System.IO.File]::ReadAllText($r).Contains("VencordPGP"))
        })
        $target = $null
        if ($clean.Count -gt 0) {
            $target = $clean[0]
        } else {
            $target = $backups[$backups.Count - 1]
            Write-Warn (T "warn.oldestBackup")
        }

        $safetyStamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $safety = Join-Path $Root ("dist.pre-uninstall-" + $safetyStamp)
        if ($DryRun) {
            Write-Step (T "step.savingDist" @($safety))
            Write-Step (T "step.restoring" @($target.FullName))
        } else {
            $currentDist = Join-Path $Root "dist"
            if (Test-Path $currentDist) { Copy-Item $currentDist $safety -Recurse -Force }
            Remove-Item $currentDist -Recurse -Force
            Copy-Item $target.FullName $currentDist -Recurse -Force
            Write-Ok (T "ok.restored" @($target.Name))
        }
    }

    Update-PluginSetting $Root $false
    if ($DryRun) {
        Write-Host ""
        Write-Ok (T "ok.uninstallDryRun")
        return
    }
    Write-Host ""
    Write-Ok (T "ok.uninstalled")
}

function Format-BoxText([string]$Text) {
    $width = 43
    if ($Text.Length -ge $width) { return $Text.Substring(0, $width) }
    $left = [math]::Floor(($width - $Text.Length) / 2)
    $right = $width - $Text.Length - $left
    return ((" " * $left) + $Text + (" " * $right))
}

function Show-Header {
    Write-Host ""
    Write-Host "  #############################################" -ForegroundColor DarkCyan
    Write-Host ("  #" + (Format-BoxText (T "header.title")) + "#") -ForegroundColor DarkCyan
    Write-Host ("  #" + (Format-BoxText (T "header.subtitle")) + "#") -ForegroundColor DarkCyan
    Write-Host "  #############################################" -ForegroundColor DarkCyan
}

try {
    Show-Header

    if (-not (Test-Path $script:Payload)) {
        throw (T "err.payloadMissing")
    }

    $candidates = @(Get-DiscordCandidates)
    if ($candidates.Count -eq 0) {
        Write-Err (T "err.discordNotFound")
        if (-not $Silent) {
            if (Confirm-Yes (T "confirm.openDiscordDownload") $true) {
                Start-Process "https://discord.com/download" | Out-Null
            }
        }
        exit 2
    }

    $discord = $candidates[0]
    if ($candidates.Count -gt 1 -and -not $Silent) {
        Write-Host ""
        Write-Host (T "info.discordList")
        for ($i = 0; $i -lt $candidates.Count; $i++) {
            Write-Host ("  [{0}] {1}" -f ($i + 1), $candidates[$i].Root)
        }
        $pick = Read-Host (T "info.chooseDiscord")
        if (-not [string]::IsNullOrWhiteSpace($pick)) {
            $idx = 0
            if ([int]::TryParse($pick, [ref]$idx) -and $idx -ge 1 -and $idx -le $candidates.Count) {
                $discord = $candidates[$idx - 1]
            }
        }
    }

    $stub = Get-StubInfo $discord.Asar
    if (-not $stub) {
        Write-Warn (T "warn.vencordNotInjected" @($discord.Root))
        Write-Host ""
        Write-Host (T "info.pluginOnly")
        if (-not $Silent) {
            if (Confirm-Yes (T "confirm.openVencordDownload") $true) {
                Start-Process "https://vencord.dev/download" | Out-Null
            }
            Read-Host (T "info.pressEnter") | Out-Null
        }
        exit 3
    }

    $root = Get-VencordRoot $discord $stub
    if (-not $root -or -not (Test-Path (Join-Path $root "dist\patcher.js"))) {
        throw (T "err.vencordDistMissing")
    }

    Write-Host ""
    Write-Host (T "info.discordLine" @($discord.Root))
    Write-Host (T "info.vencordLine" @($root))
    $vf = Join-Path $script:Payload "VERSION.txt"
    if (Test-Path $vf) {
        Write-Host (T "info.payloadLine" @(((Get-Content $vf | Select-Object -First 2) -join " / ")))
    }
    if ($DryRun) { Write-Host (T "info.modeDryRun") -ForegroundColor Yellow }

    if (-not $Install -and -not $Uninstall) {
        if ($Silent) { $Install = $true }
        else {
            Write-Host ""
            $choice = Read-Host (T "info.actionPrompt")
            if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "I" }
            switch ($choice.Trim().ToLowerInvariant()) {
                "i" { $Install = $true }
                "d" { $Uninstall = $true }
                default { Write-Host (T "info.nothingToDo"); exit 0 }
            }
        }
    }

    if ($Install) {
        Install-Plugin -Discord $discord -Root $root
    } elseif ($Uninstall) {
        Uninstall-Plugin -Discord $discord -Root $root
    }

    if (-not $Silent) {
        Write-Host ""
        Read-Host (T "info.pressEnter") | Out-Null
    }
    exit 0
} catch {
    Write-Err $_.Exception.Message
    if (-not $Silent) { Read-Host (T "info.pressEnter") | Out-Null }
    exit 1
}
