<#
.SYNOPSIS
    Prepare le payload de l'installateur FacturPro.
    A executer depuis le repertoire racine du projet, avant de compiler le .iss avec Inno Setup.
    Necessite : Node.js (pour compiler), acces Internet (telecharge Node.js portable, NSSM, PostgreSQL 17).
#>
param(
    [string]$NodeVersion = "20.19.1",
    [string]$NssmVersion = "2.24",
    [string]$PgVersion   = "17.5-2"    # format EDB : postgresql-{PgVersion}-windows-x64.exe
)

$ErrorActionPreference = "Stop"
$Root      = Split-Path $PSScriptRoot -Parent
$Installer = $PSScriptRoot
$Payload   = "$Installer\payload"
$Tools     = "$Installer\tools"

function Step($n, $msg) { Write-Host "[$n/7] $msg" -ForegroundColor Cyan }
function OK  ($msg)      { Write-Host "  OK : $msg"  -ForegroundColor Green }
function Fail($msg)      { Write-Host "  ERREUR : $msg" -ForegroundColor Red; exit 1 }

Write-Host "======================================"  -ForegroundColor Cyan
Write-Host "  Build FacturPro - package installeur" -ForegroundColor Cyan
Write-Host "======================================"  -ForegroundColor Cyan

# -- 1. Dependances npm ---------------------------------------------------------
Step 1 "npm ci (toutes dependances)"
Set-Location $Root
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install" }
OK "node_modules installes"

# -- 2. Compilation TypeScript --------------------------------------------------
Step 2 "Compilation TypeScript"
Set-Location $Root
npx tsc
if ($LASTEXITCODE -ne 0) { Fail "tsc" }
OK "dist/ genere"

# Copie des fichiers non-TS dans dist/
if (Test-Path "$Root\dist\client") { Remove-Item "$Root\dist\client" -Recurse -Force }
Copy-Item "$Root\src\client" "$Root\dist\client" -Recurse -Force

New-Item -ItemType Directory -Force "$Root\dist\server\db" | Out-Null
Copy-Item "$Root\src\server\db\*.sql" "$Root\dist\server\db\" -Force
OK "Fichiers statiques copies dans dist/"

# -- 3. Payload (app + dependances prod) ----------------------------------------
Step 3 "Preparation du payload (dependances production)"
if (Test-Path $Payload) { Remove-Item $Payload -Recurse -Force }
New-Item -ItemType Directory -Force $Payload | Out-Null

Copy-Item "$Root\dist"              "$Payload\dist"    -Recurse
Copy-Item "$Root\package.json"      "$Payload\"
Copy-Item "$Root\package-lock.json" "$Payload\" -ErrorAction SilentlyContinue

Set-Location $Payload
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { Fail "npm ci --omit=dev" }
Set-Location $Root
OK "Payload pret : $Payload"

# -- 4. Node.js portable --------------------------------------------------------
Step 4 "Node.js portable v$NodeVersion"
$NodeDir = "$Tools\node"
if (Test-Path "$NodeDir\node.exe") {
    OK "Deja present : $NodeDir"
} else {
    $NodeZip = "$Tools\node.zip"
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    Write-Host "  Telechargement $NodeUrl..."
    New-Item -ItemType Directory -Force $Tools | Out-Null
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
    Write-Host "  Extraction..."
    $TmpDir = "$Tools\node-tmp"
    Expand-Archive -Path $NodeZip -DestinationPath $TmpDir -Force
    $Extracted = Get-ChildItem $TmpDir | Select-Object -First 1
    Move-Item $Extracted.FullName $NodeDir
    Remove-Item $TmpDir  -Recurse -Force
    Remove-Item $NodeZip -Force
    OK "Node.js portable : $NodeDir"
}

# -- 5. PostgreSQL installer (bundle) -------------------------------------------
Step 5 "PostgreSQL $PgVersion installer (bundle dans l'installateur)"
$PgInstallerDest = "$Tools\pg17-installer.exe"
if (Test-Path $PgInstallerDest) {
    OK "Deja present : $PgInstallerDest"
} else {
    $PgUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64.exe"
    Write-Host "  Telechargement de PostgreSQL $PgVersion (~300 Mo)..."
    Write-Host "  URL : $PgUrl"
    Invoke-WebRequest -Uri $PgUrl -OutFile $PgInstallerDest -UseBasicParsing
    OK "PostgreSQL installer : $PgInstallerDest"
}

# -- 6. NSSM --------------------------------------------------------------------
Step 6 "NSSM (gestionnaire de service Windows) v$NssmVersion"
$NssmExe = "$Tools\nssm.exe"
if (Test-Path $NssmExe) {
    OK "Deja present : $NssmExe"
} else {
    $NssmZip = "$Tools\nssm.zip"
    $NssmUrl = "https://nssm.cc/release/nssm-$NssmVersion.zip"
    $downloaded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Write-Host "  Telechargement $NssmUrl (essai $attempt/3)..."
            Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
            $downloaded = $true; break
        } catch {
            Write-Host "  Echec : $($_.Exception.Message)"
            if ($attempt -lt 3) { Start-Sleep -Seconds (10 * $attempt) }
        }
    }
    if (-not $downloaded) {
        Write-Host "  nssm.cc indisponible, fallback Chocolatey..."
        choco install nssm -y --no-progress | Out-Null
        $ChocoNssm = Get-Command nssm -ErrorAction SilentlyContinue
        if (-not $ChocoNssm) { throw "NSSM introuvable via nssm.cc et Chocolatey" }
        Copy-Item $ChocoNssm.Source $NssmExe
        OK "NSSM (via Chocolatey) : $NssmExe"; return
    }
    Write-Host "  Extraction..."
    $TmpDir = "$Tools\nssm-tmp"
    Expand-Archive -Path $NssmZip -DestinationPath $TmpDir -Force
    $NssmBin = Get-ChildItem $TmpDir -Recurse -Filter "nssm.exe" |
        Where-Object { $_.DirectoryName -like "*win64*" } | Select-Object -First 1
    if (-not $NssmBin) {
        $NssmBin = Get-ChildItem $TmpDir -Recurse -Filter "nssm.exe" | Select-Object -First 1
    }
    Copy-Item $NssmBin.FullName $NssmExe
    Remove-Item $TmpDir  -Recurse -Force
    Remove-Item $NssmZip -Force
    OK "NSSM : $NssmExe"
}

# -- 7. Resume ------------------------------------------------------------------
Step 7 "Resume"
Write-Host ""
Write-Host "  Payload    : $Payload"         -ForegroundColor White
Write-Host "  Node       : $NodeDir"          -ForegroundColor White
Write-Host "  NSSM       : $NssmExe"          -ForegroundColor White
Write-Host "  PostgreSQL : $PgInstallerDest"  -ForegroundColor White
Write-Host ""
Write-Host "Prochaine etape :" -ForegroundColor Yellow
Write-Host "  Compilez installer/FacturPro.iss avec Inno Setup (ISCC.exe ou IDE Inno Setup)"
Write-Host "  Le fichier FacturPro-Setup.exe sera genere dans installer/"
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Build termine avec succes !"         -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
