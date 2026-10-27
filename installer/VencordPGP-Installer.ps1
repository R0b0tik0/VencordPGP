#requires -version 5.1
<#
    VencordPGP Installer (Windows)
    - Instala un build de Vencord que incluye el plugin VencordPGP.
    - Hace backup del dist y de settings antes de tocar nada.
    - Verifica SHA-256 del payload.
    - Permite desinstalar restaurando el ultimo backup.

    Uso normal: doble clic en "Instalar VencordPGP.cmd".
    Opciones:
      -Install / -Uninstall   accion no interactiva
      -Silent                 sin preguntas (requiere -Install o -Uninstall)
      -Force                  continua aunque Discord este abierto (no lo cierra)
      -DryRun                 muestra lo que haria, sin cambios
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
    [string]$DiscordRoot,
    [string]$VencordRoot
)

$ErrorActionPreference = "Stop"
$script:Payload = Join-Path $PSScriptRoot "payload"
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:ProcessNames = @("Discord", "DiscordPTB", "DiscordCanary")

function Write-Title([string]$Text) {
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}
function Write-Step([string]$Text) { Write-Host "  -> $Text" }
function Write-Ok([string]$Text) { Write-Host "  OK: $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "  AVISO: $Text" -ForegroundColor Yellow }
function Write-Err([string]$Text) { Write-Host "  ERROR: $Text" -ForegroundColor Red }

function Confirm-Yes([string]$Question, [string]$Default = "S") {
    if ($Silent) { return ($Default -eq "S") }
    $answer = Read-Host "$Question [S/n]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return ($Default -eq "S") }
    return ($answer.Trim().ToLowerInvariant() -eq "s")
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
    Write-Step "Cerrando Discord..."
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

function Test-Payload {
    $manifestPath = Join-Path $script:Payload "manifest.sha256"
    if (-not (Test-Path $manifestPath)) { throw "Falta manifest.sha256 en el payload." }
    $count = 0
    foreach ($line in [System.IO.File]::ReadAllLines($manifestPath)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([A-Fa-f0-9]{64}) \*(.+)$') {
            throw "Linea de manifiesto invalida: $line"
        }
        $expected = $matches[1].ToUpperInvariant()
        $name = $matches[2]
        $file = Join-Path $script:Payload $name
        if (-not (Test-Path $file)) { throw "Falta el archivo del payload: $name" }
        $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($actual -ne $expected) { throw "Hash no coincide para $name (payload corrupto o modificado)." }
        $count++
    }
    if ($count -lt 2) { throw "Manifiesto incompleto." }
    Write-Ok "Payload verificado ($count archivos)."
}

function Backup-Vencord([string]$Root) {
    $dist = Join-Path $Root "dist"
    if (-not (Test-Path $dist)) { throw "No existe la carpeta dist de Vencord: $dist" }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = Join-Path $Root ("dist.backup-" + $stamp)
    $settings = Join-Path $Root "settings\settings.json"
    if ($DryRun) {
        Write-Step "[dry-run] Copiaria $dist -> $backup"
        if (Test-Path $settings) { Write-Step "[dry-run] Copiaria settings.json -> settings.backup-$stamp.json" }
    } else {
        Copy-Item $dist $backup -Recurse -Force
        if (Test-Path $settings) {
            Copy-Item $settings (Join-Path $Root "settings\settings.backup-$stamp.json") -Force
        }
        Write-Ok "Backup creado: $backup"
    }
    return $stamp
}

function Copy-Payload([string]$Root) {
    $dist = Join-Path $Root "dist"
    if (-not (Test-Path $dist)) {
        if ($DryRun) { Write-Step "[dry-run] Crearia $dist" }
        else { New-Item -ItemType Directory -Force -Path $dist | Out-Null }
    }
    $files = @(Get-ChildItem $script:Payload -File | Where-Object {
        $_.Name -ne "manifest.sha256" -and $_.Name -ne "VERSION.txt"
    })
    foreach ($f in $files) {
        if ($DryRun) {
            Write-Step "[dry-run] Copiaria $($f.Name)"
        } else {
            Copy-Item $f.FullName (Join-Path $dist $f.Name) -Force
        }
    }
    $versionFile = Join-Path $script:Payload "VERSION.txt"
    if ((Test-Path $versionFile) -and -not $DryRun) {
        Copy-Item $versionFile (Join-Path $dist "VencordPGP-VERSION.txt") -Force
    }
    if ($DryRun) {
        Write-Step "[dry-run] Verificaria que renderer.js contiene VencordPGP"
    } else {
        $renderer = Join-Path $dist "renderer.js"
        $text = [System.IO.File]::ReadAllText($renderer)
        if (-not $text.Contains("VencordPGP")) {
            throw "El renderer copiado no contiene VencordPGP. Instalacion abortada."
        }
        Write-Ok "Build copiado y verificado (plugin presente)."
    }
}

function Update-PluginSetting([string]$Root, [bool]$Enable) {
    $settingsDir = Join-Path $Root "settings"
    $settingsPath = Join-Path $settingsDir "settings.json"

    if (-not (Test-Path $settingsDir)) {
        if ($DryRun) { Write-Step "[dry-run] Crearia $settingsDir" }
        else { New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null }
    }

    if (Test-Path $settingsPath) {
        $raw = [System.IO.File]::ReadAllText($settingsPath)
        if ([string]::IsNullOrWhiteSpace($raw)) {
            $settings = [PSCustomObject]@{}
        } else {
            try { $settings = $raw | ConvertFrom-Json }
            catch { throw "settings.json no es JSON valido; no lo modifico." }
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
        Write-Step ("[dry-run] " + $(if ($Enable) { "Activaria" } else { "Desactivaria" }) + " plugins.VencordPGP.enabled en $settingsPath")
        return
    }

    $json = $settings | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($settingsPath, $json, $script:Utf8NoBom)
    if ($Enable) { Write-Ok "Plugin activado en settings.json." }
    else { Write-Ok "Plugin desactivado en settings.json (ajustes y claves conservados)." }
}

function Install-Plugin {
    param([object]$Discord, [string]$Root)

    Write-Title "Instalando VencordPGP"
    Write-Step "Discord: $($Discord.Root)"
    Write-Step "Vencord: $Root"

    $running = Get-RunningDiscord
    if ($running.Count -gt 0) {
        if ($Force) {
            Write-Warn "Discord esta abierto. Se actualizaran los archivos; reinicia Discord para aplicar."
            Write-Warn "Con Discord abierto, la activacion en settings.json puede ser sobrescrita por el cliente. Si ocurre, activa el plugin en la UI tras reiniciar."
        } elseif ($Silent) {
            throw "Discord esta abierto. Cierralo o usa -Force."
        } else {
            Write-Warn "Discord esta abierto. Se cerrara para instalar (puedes perder borradores no enviados)."
            if (-not (Confirm-Yes "Cerrar Discord ahora?" "S")) {
                throw "Instalacion cancelada: cierra Discord y vuelve a ejecutar."
            }
            Close-RunningDiscord
        }
    }

    if (-not $Silent) {
        $version = "desconocida"
        $vf = Join-Path $script:Payload "VERSION.txt"
        if (Test-Path $vf) { $version = (Get-Content $vf | Select-Object -First 2) -join " / " }
        Write-Host ""
        Write-Host "Se va a reemplazar el build de Vencord por uno que incluye VencordPGP."
        Write-Host "Payload: $version"
        Write-Host "Se hara backup antes de tocar nada."
        if (-not (Confirm-Yes "Continuar con la instalacion?" "S")) {
            throw "Instalacion cancelada por el usuario."
        }
    }

    Test-Payload
    $stamp = Backup-Vencord $Root
    Copy-Payload $Root
    Update-PluginSetting $Root $true

    if ($DryRun) {
        Write-Host ""
        Write-Ok "Simulacion completada. No se modifico ningun archivo."
        return
    }

    Write-Host ""
    Write-Ok "VencordPGP instalado."
    Write-Host ""
    Write-Host "Siguientes pasos:" -ForegroundColor Cyan
    Write-Host "  1. Abre Discord > Ajustes > Vencord > Plugins > VencordPGP."
    Write-Host "  2. Pega tu clave privada PGP y la passphrase, y pulsa Desbloquear."
    Write-Host "     (La clave privada vive solo en memoria; no se guarda ni se sincroniza)."
    Write-Host "  3. Anade la clave publica de la otra persona usando su ID de Discord."
    Write-Host "  4. Compara la huella por un canal independiente antes de marcarla verificada."
    Write-Host ""
    Write-Host "Backup: $(Join-Path $Root ("dist.backup-" + $stamp))"

    if (-not $Silent -and -not $Force) {
        if ($Discord.Exe -and (Confirm-Yes "Abrir Discord ahora?" "S")) {
            if (-not $DryRun) { Start-Process $Discord.Exe | Out-Null }
        }
    }
}

function Uninstall-Plugin {
    param([object]$Discord, [string]$Root)

    Write-Title "Desinstalando VencordPGP"
    Write-Step "Vencord: $Root"

    $running = Get-RunningDiscord
    if ($running.Count -gt 0) {
        if ($Force) {
            Write-Warn "Discord esta abierto. Restaura los archivos y reinicia Discord."
            Write-Warn "Con Discord abierto, el cambio en settings.json puede ser sobrescrito; si ocurre, desactiva el plugin en la UI."
        } elseif ($Silent) {
            throw "Discord esta abierto. Cierralo o usa -Force."
        } else {
            Write-Warn "Discord esta abierto. Se cerrara para restaurar (puedes perder borradores)."
            if (-not (Confirm-Yes "Cerrar Discord ahora?" "S")) {
                throw "Desinstalacion cancelada: cierra Discord y vuelve a ejecutar."
            }
            Close-RunningDiscord
        }
    }

    if (-not $Silent) {
        if (-not (Confirm-Yes "Restaurar el ultimo backup de Vencord y quitar el plugin?" "N")) {
            throw "Desinstalacion cancelada por el usuario."
        }
    }

    $backups = @(Get-ChildItem $Root -Directory -Filter "dist.backup-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($backups.Count -eq 0) {
        Write-Warn "No hay backup de dist. Solo quitare el plugin de settings.json."
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
            Write-Warn "No hay backup previo sin el plugin; restauro el mas antiguo disponible."
        }

        $safetyStamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $safety = Join-Path $Root ("dist.pre-uninstall-" + $safetyStamp)
        if ($DryRun) {
            Write-Step "[dry-run] Guardaria el dist actual en $safety"
            Write-Step "[dry-run] Restauraria $($target.FullName)"
        } else {
            $currentDist = Join-Path $Root "dist"
            if (Test-Path $currentDist) { Copy-Item $currentDist $safety -Recurse -Force }
            Remove-Item $currentDist -Recurse -Force
            Copy-Item $target.FullName $currentDist -Recurse -Force
            Write-Ok "Restaurado: $($target.Name)"
        }
    }

    Update-PluginSetting $Root $false
    if ($DryRun) {
        Write-Host ""
        Write-Ok "Simulacion completada. No se modifico nada."
        return
    }
    Write-Host ""
    Write-Ok "Desinstalacion completada. Reinicia Discord si estaba abierto."
}

function Show-Header {
    Write-Host ""
    Write-Host "  #############################################" -ForegroundColor DarkCyan
    Write-Host "  #        VencordPGP - Instalador           #" -ForegroundColor DarkCyan
    Write-Host "  #   Cifrado PGP automatico para Discord    #" -ForegroundColor DarkCyan
    Write-Host "  #############################################" -ForegroundColor DarkCyan
}

try {
    Show-Header

    if (-not (Test-Path $script:Payload)) {
        throw "No se encuentra la carpeta payload junto al instalador."
    }

    $candidates = @(Get-DiscordCandidates)
    if ($candidates.Count -eq 0) {
        Write-Err "No se encontro ninguna instalacion de Discord en este equipo."
        if (-not $Silent) {
            if (Confirm-Yes "Abrir la pagina de descarga de Discord?" "S") {
                Start-Process "https://discord.com/download" | Out-Null
            }
        }
        exit 2
    }

    $discord = $candidates[0]
    if ($candidates.Count -gt 1 -and -not $Silent) {
        Write-Host ""
        Write-Host "Instalaciones de Discord detectadas:"
        for ($i = 0; $i -lt $candidates.Count; $i++) {
            Write-Host ("  [{0}] {1}" -f ($i + 1), $candidates[$i].Root)
        }
        $pick = Read-Host "Elige una [1]"
        if (-not [string]::IsNullOrWhiteSpace($pick)) {
            $idx = 0
            if ([int]::TryParse($pick, [ref]$idx) -and $idx -ge 1 -and $idx -le $candidates.Count) {
                $discord = $candidates[$idx - 1]
            }
        }
    }

    $stub = Get-StubInfo $discord.Asar
    if (-not $stub) {
        Write-Warn "Vencord no parece estar inyectado en: $($discord.Root)"
        Write-Host ""
        Write-Host "Este instalador solo instala el plugin; necesita Vencord ya instalado."
        if (-not $Silent) {
            if (Confirm-Yes "Abrir la pagina oficial de Vencord para instalarlo?" "S") {
                Start-Process "https://vencord.dev/download" | Out-Null
            }
            Read-Host "Pulsa Enter para salir" | Out-Null
        }
        exit 3
    }

    $root = Get-VencordRoot $discord $stub
    if (-not $root -or -not (Test-Path (Join-Path $root "dist\patcher.js"))) {
        throw "Vencord esta inyectado pero no encuentro su carpeta dist. Usa -VencordRoot <ruta>."
    }

    Write-Host ""
    Write-Host "  Discord : $($discord.Root)"
    Write-Host "  Vencord : $root"
    $vf = Join-Path $script:Payload "VERSION.txt"
    if (Test-Path $vf) {
        Write-Host "  Payload : $((Get-Content $vf | Select-Object -First 2) -join ' / ')"
    }
    if ($DryRun) { Write-Host "  Modo    : DRY RUN (no se modifica nada)" -ForegroundColor Yellow }

    if (-not $Install -and -not $Uninstall) {
        if ($Silent) { $Install = $true }
        else {
            Write-Host ""
            $choice = Read-Host "Escribe I para instalar, D para desinstalar, S para salir [I]"
            if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "I" }
            switch ($choice.Trim().ToLowerInvariant()) {
                "i" { $Install = $true }
                "d" { $Uninstall = $true }
                default { Write-Host "Nada que hacer."; exit 0 }
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
        Read-Host "Pulsa Enter para salir" | Out-Null
    }
    exit 0
} catch {
    Write-Err $_.Exception.Message
    if (-not $Silent) { Read-Host "Pulsa Enter para salir" | Out-Null }
    exit 1
}
