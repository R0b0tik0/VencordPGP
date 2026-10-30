<#
.SYNOPSIS
    Publish the local wiki/ pages to the GitHub wiki repository.

.DESCRIPTION
    Copies every wiki/*.md page into a temporary clone of
    https://github.com/R0b0tik0/VencordPGP.wiki.git, deletes pages that no
    longer exist locally, commits the result and pushes it.

    One-time manual step: GitHub does not create the <repo>.wiki.git repository
    until the wiki is enabled and the first page exists. In the repository:
    Settings -> Features -> enable "Wikis", then open the Wiki tab and create
    the Home page once. After that this script works.

.PARAMETER Message
    Commit message for the wiki commit. Default: "Update wiki from repository docs".

.PARAMETER Remote
    Wiki git remote. Default: https://github.com/R0b0tik0/VencordPGP.wiki.git

.PARAMETER Source
    Directory containing the wiki pages. Default: <repo>/wiki

.PARAMETER DryRun
    Clone, stage and show what would be committed, but do not commit or push.

.PARAMETER KeepTemp
    Keep the temporary clone (useful to inspect the result).

.EXAMPLE
    .\scripts\publish-wiki.ps1 -DryRun

.EXAMPLE
    .\scripts\publish-wiki.ps1 -Message "Update wiki: key management"

.NOTES
    Requires git and credentials for the repository (Git Credential Manager or
    a token). The script never reads or stores credentials itself.
#>
[CmdletBinding()]
param(
    [string]$Message = "Update wiki from repository docs",
    [string]$Remote = "https://github.com/R0b0tik0/VencordPGP.wiki.git",
    [string]$Source,
    [switch]$DryRun,
    [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"

# Native commands write progress and errors to stderr, which PowerShell 5.1 can
# turn into terminating errors under ErrorActionPreference=Stop. Run git with a
# local Continue preference and rely on $LASTEXITCODE instead.
function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$Quiet
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & git @Arguments 2>&1
        $code = $LASTEXITCODE
        $lines = @($output | ForEach-Object { "$_" })
        if (-not $Quiet) {
            foreach ($line in $lines) { Write-Host $line }
        }
        return [pscustomobject]@{ Code = $code; Lines = $lines }
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

if (-not $Source) {
    $Source = Join-Path (Split-Path -Parent $PSScriptRoot) "wiki"
}

$tempDir = $null
$cloneCreated = $false

try {
    if (-not (Test-Path -LiteralPath (Join-Path $Source "Home.md"))) {
        throw "No Home.md found in '$Source'. Run 'npm run wiki:build' first."
    }

    $env:GIT_TERMINAL_PROMPT = "0"
    Write-Host "Checking wiki remote: $Remote"
    $probe = Invoke-Git -Arguments @("ls-remote", $Remote) -Quiet
    if ($probe.Code -ne 0) {
        throw @"
The wiki repository is not reachable: $Remote

If the wiki has never been enabled:
  1. Open https://github.com/R0b0tik0/VencordPGP/settings
  2. Features -> enable "Wikis"
  3. Open the Wiki tab and create the Home page once
Then run this script again.

If the wiki exists, check your git credentials for the repository.
"@
    }

    $tempDir = Join-Path $env:TEMP ("vencordpgp-wiki-" + [guid]::NewGuid().ToString("N"))
    Write-Host "Cloning into $tempDir"
    $clone = Invoke-Git -Arguments @("clone", "--depth", "1", $Remote, $tempDir) -Quiet
    if ($clone.Code -ne 0) {
        throw "git clone failed: $($clone.Lines -join ' ')"
    }
    $cloneCreated = $true

    # Delete pages that no longer exist locally.
    Get-ChildItem -LiteralPath $tempDir -Filter *.md -File | ForEach-Object {
        $local = Join-Path $Source $_.Name
        if (-not (Test-Path -LiteralPath $local)) {
            Write-Host "  delete $($_.Name)"
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }

    # Copy the local pages over the clone.
    $pages = @(Get-ChildItem -LiteralPath $Source -Filter *.md -File)
    foreach ($page in $pages) {
        Copy-Item -LiteralPath $page.FullName -Destination (Join-Path $tempDir $page.Name) -Force
    }
    Write-Host "Copied $($pages.Count) pages."

    $add = Invoke-Git -Arguments @("-C", $tempDir, "add", "-A") -Quiet
    if ($add.Code -ne 0) {
        throw "git add failed: $($add.Lines -join ' ')"
    }

    $statusResult = Invoke-Git -Arguments @("-C", $tempDir, "status", "--porcelain") -Quiet
    $status = @($statusResult.Lines | Where-Object { $_ -ne "" })
    if ($status.Count -eq 0) {
        Write-Host "No wiki changes to publish."
        exit 0
    }

    $added = @($status | Where-Object { $_ -match '^(\?\?|A )' }).Count
    $modified = @($status | Where-Object { $_ -match '^( M|M )' }).Count
    $deleted = @($status | Where-Object { $_ -match '^( D|D )' }).Count

    Write-Host ""
    Write-Host "Changes: $added added, $modified modified, $deleted deleted"
    foreach ($line in $status) { Write-Host $line }

    if ($DryRun) {
        Write-Host ""
        Write-Host "Dry run: would commit with message '$Message' and push to $Remote"
        exit 0
    }

    $commit = Invoke-Git -Arguments @(
        "-C", $tempDir,
        "-c", "user.name=VencordPGP Wiki",
        "-c", "user.email=wiki@localhost",
        "commit", "-m", $Message
    ) -Quiet
    if ($commit.Code -ne 0) {
        throw "git commit failed: $($commit.Lines -join ' ')"
    }

    $hash = (Invoke-Git -Arguments @("-C", $tempDir, "rev-parse", "--short", "HEAD") -Quiet).Lines[0]
    $push = Invoke-Git -Arguments @("-C", $tempDir, "push", "origin", "HEAD")
    if ($push.Code -ne 0) {
        throw "git push failed: $($push.Lines -join ' ')"
    }

    Write-Host ""
    Write-Host "Published commit $hash to $Remote"
    Write-Host "Wiki: https://github.com/R0b0tik0/VencordPGP/wiki"
    exit 0
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Remove-Item Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
    if ($cloneCreated -and -not $KeepTemp -and $tempDir -and (Test-Path -LiteralPath $tempDir)) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
