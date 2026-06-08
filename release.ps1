<#
.SYNOPSIS
    Publie une nouvelle release de FacturPro depuis la machine locale.
    Build + zip + tag git + release GitHub en une seule commande.

.PARAMETER Version
    Numero de version cible, ex: 3.2.0

.EXAMPLE
    .\release.ps1 3.2.0
#>
param(
    [Parameter(Mandatory)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$GH   = "C:\Program Files\GitHub CLI\gh.exe"
$Root = $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "    OK : $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "    ERREUR : $msg" -ForegroundColor Red; exit 1 }

# -- Validation ----------------------------------------------------------------
if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "Format de version invalide. Exemple : 3.2.0" }
$Tag = "v$Version"

Step "Verification de l'environnement"
if (-not (Test-Path $GH)) { Fail "gh CLI introuvable a $GH" }
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") { Fail "Vous n'etes pas sur la branche main (branche actuelle : $currentBranch)" }
$uncommitted = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
if ($uncommitted) { Fail "Des modifications non commitees existent. Commitez-les avant de publier." }
OK "Environnement OK"

# -- Mise a jour de la version -------------------------------------------------
Step "Mise a jour de package.json -> $Version"
$pkg = Get-Content "$Root\package.json" -Raw
$pkg = $pkg -replace '"version": "[^"]+"', """version"": ""$Version"""
Set-Content "$Root\package.json" $pkg -Encoding utf8
OK "package.json mis a jour"

# -- Build TypeScript ----------------------------------------------------------
Step "Compilation TypeScript (npm run build)"
Set-Location $Root
npm run build
if ($LASTEXITCODE -ne 0) { Fail "npm run build a echoue" }
OK "Build OK"

# -- Patch zip -----------------------------------------------------------------
Step "Creation de FacturPro-Patch.zip"
$ZipPath = "$Root\FacturPro-Patch.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$Root\dist", "$Root\package.json" -DestinationPath $ZipPath -Force
$SizeMo = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
OK "Zip cree ($SizeMo Mo)"

# -- Archive locale ------------------------------------------------------------
$UpdatesDir = "$Root\updates"
New-Item -ItemType Directory -Force $UpdatesDir | Out-Null
Copy-Item $ZipPath "$UpdatesDir\FacturPro-Patch-$Version.zip" -Force
OK "Archive : updates\FacturPro-Patch-$Version.zip"

# -- Commit + tag git ----------------------------------------------------------
Step "Commit et tag git $Tag"
git add package.json
git commit -m "chore: bump $Tag"
if ($LASTEXITCODE -ne 0) { Fail "git commit a echoue" }
git tag $Tag
if ($LASTEXITCODE -ne 0) { Fail "git tag a echoue (tag deja existant ?)" }
OK "Commit et tag crees"

# -- Push (avec rebase pour absorber les commits CI eventuels) -----------------
Step "Push vers origin (main + tag)"
git stash
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) { Fail "git pull --rebase a echoue" }
git stash pop
git push origin main
if ($LASTEXITCODE -ne 0) { Fail "git push main a echoue" }
git push origin $Tag
if ($LASTEXITCODE -ne 0) { Fail "git push tag a echoue" }
OK "Push OK"

# -- Release GitHub ------------------------------------------------------------
Step "Publication de la release GitHub $Tag"
& $GH release create $Tag --title $Tag --notes "Release $Tag - voir CHANGELOG.md pour le detail." --latest
if ($LASTEXITCODE -ne 0) { Fail "gh release create a echoue" }

& $GH release upload $Tag $ZipPath --clobber
if ($LASTEXITCODE -ne 0) { Fail "gh release upload a echoue" }
OK "Release GitHub publiee"

Write-Host ""
Write-Host "Release $Tag publiee avec succes !" -ForegroundColor Green
Write-Host "https://github.com/swarmnode/saas-facturation/releases/tag/$Tag" -ForegroundColor Gray
