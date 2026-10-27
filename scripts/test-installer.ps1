# Test end-to-end del instalador en un sandbox. No toca la instalacion real.
$ErrorActionPreference = "Stop"

$repo = Split-Path $PSScriptRoot -Parent
$installer = Join-Path $repo "installer\VencordPGP-Installer.ps1"
$sandbox = Join-Path $env:LOCALAPPDATA "Temp\opencode\installer-sandbox"
$discordRoot = Join-Path $sandbox "discord"
$vencordRoot = Join-Path $sandbox "vencord"
$appDir = Join-Path $discordRoot "app-1.0.0"
$resDir = Join-Path $appDir "resources"
$asar = Join-Path $resDir "app.asar"
$dist = Join-Path $vencordRoot "dist"
$settingsDir = Join-Path $vencordRoot "settings"
$settingsPath = Join-Path $settingsDir "settings.json"

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT FALLIDO: $Message" }
    Write-Host "  PASS: $Message" -ForegroundColor Green
}

function Run-Installer([string[]]$ExtraArgs) {
    $all = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $installer) + $ExtraArgs
    & powershell @all
    if ($LASTEXITCODE -ne 0) { throw "Instalador devolvio codigo $LASTEXITCODE" }
}

try {
    Remove-Item $sandbox -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $resDir, $dist, $settingsDir | Out-Null

    # Stub de Vencord apuntando al Vencord del sandbox
    $patcherPath = Join-Path $dist "patcher.js"
    $escaped = $patcherPath.Replace('\', '\\')
    $stub = 'require("' + $escaped + '")' + "`n" + 'Vencord'
    Set-Content -Path $asar -Value $stub -Encoding ASCII

    Set-Content -Path (Join-Path $dist "patcher.js") -Value "DUMMY_PATCHER" -Encoding ASCII
    Set-Content -Path (Join-Path $dist "preload.js") -Value "DUMMY_PRELOAD" -Encoding ASCII
    Set-Content -Path (Join-Path $dist "renderer.js") -Value "DUMMY_RENDERER" -Encoding ASCII
    Set-Content -Path (Join-Path $dist "renderer.css") -Value "DUMMY_CSS" -Encoding ASCII
    Set-Content -Path $settingsPath -Value '{"plugins":{"Existing":{"enabled":true},"VencordPGP":{"enabled":false,"autoEncryptDMs":true,"publicKeysByUser":{"123":{"userId":"123","keys":[]}}}},"cloud":{"settingsSync":true}}' -Encoding ASCII

    $common = @(
        "-Force",
        "-DiscordRoot", $discordRoot,
        "-VencordRoot", $vencordRoot
    )

    Write-Host "`n[1] Dry-run (no debe modificar nada)" -ForegroundColor Cyan
    Run-Installer (@("-Install", "-Silent", "-DryRun") + $common)
    Assert ((Get-Content (Join-Path $dist "renderer.js") -Raw).Trim() -eq "DUMMY_RENDERER") "dry-run no toca renderer.js"
    Assert (@(Get-ChildItem $vencordRoot -Directory -Filter "dist.backup-*").Count -eq 0) "dry-run no crea backups"

    Write-Host "`n[2] Instalacion real" -ForegroundColor Cyan
    Run-Installer (@("-Install", "-Silent") + $common)
    $renderer = Get-Content (Join-Path $dist "renderer.js") -Raw
    Assert ($renderer.Contains("VencordPGP")) "renderer instalado contiene VencordPGP"
    Assert (@(Get-ChildItem $vencordRoot -Directory -Filter "dist.backup-*").Count -ge 1) "se creo backup de dist"
    Assert (Test-Path (Join-Path $dist "VencordPGP-VERSION.txt")) "se copio VERSION.txt"
    $json = Get-Content $settingsPath -Raw | ConvertFrom-Json
    Assert ($json.plugins.VencordPGP.enabled -eq $true) "plugin activado en settings"
    Assert ($json.plugins.VencordPGP.autoEncryptDMs -eq $true) "ajustes del plugin preservados al instalar"
    Assert ($json.plugins.VencordPGP.publicKeysByUser."123".userId -eq "123") "claves publicas preservadas al instalar"
    Assert ($json.plugins.Existing.enabled -eq $true) "settings existentes preservados"
    Assert ($json.cloud.settingsSync -eq $true) "cloud settings preservado"
    $settingsBytes = [System.IO.File]::ReadAllBytes($settingsPath)
    Assert (-not ($settingsBytes.Length -ge 3 -and $settingsBytes[0] -eq 0xEF -and $settingsBytes[1] -eq 0xBB -and $settingsBytes[2] -eq 0xBF)) "settings.json sin BOM"

    Write-Host "`n[3] Desinstalacion" -ForegroundColor Cyan
    Run-Installer (@("-Uninstall", "-Silent") + $common)
    Assert ((Get-Content (Join-Path $dist "patcher.js") -Raw).Trim() -eq "DUMMY_PATCHER") "se restauro el dist original"
    Assert ((Get-Content (Join-Path $dist "renderer.js") -Raw).Trim() -eq "DUMMY_RENDERER") "se restauro renderer original"
    Assert (@(Get-ChildItem $vencordRoot -Directory -Filter "dist.pre-uninstall-*").Count -ge 1) "se guardo safety backup antes de restaurar"
    $json2 = Get-Content $settingsPath -Raw | ConvertFrom-Json
    Assert ($json2.plugins.VencordPGP.enabled -eq $false) "plugin desactivado en settings"
    Assert ($json2.plugins.VencordPGP.publicKeysByUser."123".userId -eq "123") "claves publicas preservadas tras desinstalar"
    Assert ($json2.plugins.Existing.enabled -eq $true) "settings existentes siguen intactos tras desinstalar"

    Write-Host "`nTODOS LOS TESTS DEL INSTALADOR PASARON" -ForegroundColor Green
    exit 0
} catch {
    Write-Host "`nFALLO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item $sandbox -Recurse -Force -ErrorAction SilentlyContinue
}
