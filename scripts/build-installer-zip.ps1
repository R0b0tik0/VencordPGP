#requires -version 5.1
<#
    Builds VencordPGP-Installer.zip from the current tree.

    Usage:
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer-zip.ps1
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer-zip.ps1 -OutFile C:\path\VencordPGP-Installer.zip

    The ZIP is a release artifact and is intentionally gitignored.
#>
[CmdletBinding()]
param(
    [string]$OutFile
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $OutFile) { $OutFile = Join-Path $root "VencordPGP-Installer.zip" }
$OutFile = [System.IO.Path]::GetFullPath($OutFile)

$payloadDir = Join-Path $root "installer\payload"
$required = @(
    "Instalar VencordPGP.cmd",
    "Desinstalar VencordPGP.cmd",
    "installer\VencordPGP-Installer.ps1",
    "installer\README.txt",
    "installer\LEEME.txt",
    "installer\LICENSE-Vencord.txt",
    "installer\payload\manifest.sha256"
)
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) {
        throw ("Missing required file: " + $rel)
    }
}

$payloadFiles = @(Get-ChildItem -LiteralPath $payloadDir -File | Sort-Object Name)
if ($payloadFiles.Count -lt 2) {
    throw "installer\payload is empty. Run scripts\build-installer-payload.mjs first."
}

if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($OutFile, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-ZipEntry {
    param(
        [Parameter(Mandatory = $true)]$Archive,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$EntryName
    )
    $entry = $Archive.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = (Get-Item -LiteralPath $Source).LastWriteTime
    $inStream = [System.IO.File]::OpenRead($Source)
    $outStream = $entry.Open()
    try {
        $inStream.CopyTo($outStream)
    } finally {
        $outStream.Dispose()
        $inStream.Dispose()
    }
}

try {
    $topLevel = @(
        "Instalar VencordPGP.cmd",
        "Desinstalar VencordPGP.cmd",
        "installer\VencordPGP-Installer.ps1",
        "installer\README.txt",
        "installer\LEEME.txt",
        "installer\LICENSE-Vencord.txt"
    )
    foreach ($rel in $topLevel) {
        Add-ZipEntry -Archive $zip -Source (Join-Path $root $rel) -EntryName ($rel -replace "\\", "/")
    }
    foreach ($file in $payloadFiles) {
        Add-ZipEntry -Archive $zip -Source $file.FullName -EntryName ("installer/payload/" + $file.Name)
    }
} finally {
    $zip.Dispose()
}

$sha = [System.Security.Cryptography.SHA256]::Create()
$stream = $null
try {
    $stream = [System.IO.File]::OpenRead($OutFile)
    $hash = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "")
} finally {
    if ($stream) { $stream.Dispose() }
    $sha.Dispose()
}

Write-Host ("ZIP: {0}" -f $OutFile)
Write-Host ("Files: {0}" -f ($topLevel.Count + $payloadFiles.Count))
Write-Host ("SHA256: {0}" -f $hash)
