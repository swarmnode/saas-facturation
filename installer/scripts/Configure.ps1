<#
.SYNOPSIS
    Script de configuration post-installation de FacturPro.
    Appelé automatiquement par l'installateur Inno Setup.
    Doit être exécuté en tant qu'administrateur.
#>
param(
    [string]$InstallDir,
    [string]$PgPass,
    [string]$AdminEmail,
    [string]$AdminPass,
    [string]$Port = "3000"
)

$ErrorActionPreference = "Stop"
$LogDir  = "$InstallDir\logs"
$LogFile = "$LogDir\install.log"

New-Item -ItemType Directory -Force $LogDir               | Out-Null
New-Item -ItemType Directory -Force "$InstallDir\storage\logo" | Out-Null

Add-Type -AssemblyName System.Windows.Forms | Out-Null

function Log($msg) {
    $ts   = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "$ts  $msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function LogError($msg) {
    Log "ERREUR : $msg"
    [System.Windows.Forms.MessageBox]::Show(
        "Erreur lors de l'installation :`n$msg`n`nConsultez le journal : $LogFile",
        "FacturPro — Erreur", 0, 16) | Out-Null
    exit 1
}

Log "=== Démarrage configuration FacturPro ==="
Log "Répertoire d'installation : $InstallDir"

# ── 1. Localiser / installer PostgreSQL ─────────────────────────────────────
Log "Recherche de PostgreSQL..."

function Find-PgBin {
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [version]($_.FullName -replace '.*PostgreSQL\\(\d+)\\.*','$1') } -Descending
    if ($candidates) { return $candidates[0].DirectoryName }
    return $null
}

$pgBin = Find-PgBin

if (-not $pgBin) {
    Log "PostgreSQL absent — installation via winget..."
    $result = Start-Process "winget" -ArgumentList "install -e --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements" -Wait -PassThru
    # 0 = succès, -1978335189 (0x8A150021) = déjà installé
    if ($result.ExitCode -notin @(0, -1978335189)) {
        LogError "L'installation de PostgreSQL a échoué (code $($result.ExitCode)).`nInstallez-le manuellement depuis https://www.postgresql.org/download/windows/ puis relancez l'installateur."
    }
    Start-Sleep -Seconds 10
    $pgBin = Find-PgBin
    if (-not $pgBin) { LogError "psql.exe introuvable après installation PostgreSQL. Vérifiez l'installation et relancez." }
}

Log "PostgreSQL trouvé : $pgBin"

$env:PGPASSWORD = $PgPass
$psql = Join-Path $pgBin "psql.exe"

function Exec-Psql($sql) {
    $out = & $psql -U postgres -h localhost -p 5432 -c $sql 2>&1
    return $out
}

function Exec-PsqlTuples($sql) {
    # -t = tuples only, -A = no alignment → retourne juste la valeur, sans entête ni compteur
    $out = & $psql -U postgres -h localhost -p 5432 -tA -c $sql 2>&1
    return ($out | Out-String).Trim()
}

# ── 2. Créer le rôle et la base de données ───────────────────────────────────
Log "Création du rôle et de la base de données..."

# Crée le rôle facturation (ignore s'il existe déjà)
Exec-Psql "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='facturation') THEN CREATE ROLE facturation WITH LOGIN PASSWORD 'facturation'; END IF; END `$`$;" | Out-Null

# Vérifie l'existence de la base (résultat = "1" ou "0")
$dbCount = Exec-PsqlTuples "SELECT COUNT(*) FROM pg_database WHERE datname='facturation'"
if ($dbCount -ne "1") {
    Exec-Psql "CREATE DATABASE facturation OWNER facturation;" | Out-Null
    Log "Base 'facturation' créée"
} else {
    Log "Base 'facturation' déjà existante"
}

# ── 3. Générer .env ──────────────────────────────────────────────────────────
Log "Génération de la configuration (.env)..."

$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$jwtSecret = [Convert]::ToBase64String($bytes) -replace '[/+=]',''

$envContent = @"
DATABASE_URL=postgresql://facturation:facturation@localhost:5432/facturation
PORT=$Port
JWT_SECRET=$jwtSecret
ADMIN_EMAIL=$AdminEmail
ADMIN_DEFAULT_PASS=$AdminPass
PG_BIN=$pgBin
"@

[System.IO.File]::WriteAllText("$InstallDir\.env", $envContent, [System.Text.Encoding]::UTF8)
Log ".env créé"

# ── 4. Service Windows (NSSM) ────────────────────────────────────────────────
Log "Installation du service Windows..."

$nssm    = "$InstallDir\tools\nssm.exe"
$nodeExe = "$InstallDir\node\node.exe"
$appJs   = "$InstallDir\dist\server\index.js"
$svcName = "FacturPro"

# Supprime le service s'il existe déjà
$existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($existing) {
    Log "Service existant détecté — suppression..."
    & $nssm stop   $svcName 2>$null
    Start-Sleep -Seconds 2
    & $nssm remove $svcName confirm 2>$null
    Start-Sleep -Seconds 1
}

& $nssm install $svcName $nodeExe $appJs
& $nssm set $svcName AppDirectory    $InstallDir
& $nssm set $svcName DisplayName     "FacturPro"
& $nssm set $svcName Description     "Serveur de facturation FacturPro"
& $nssm set $svcName Start           SERVICE_AUTO_START
& $nssm set $svcName AppStdout       "$LogDir\app.log"
& $nssm set $svcName AppStderr       "$LogDir\app-error.log"
& $nssm set $svcName AppRotateFiles  1
& $nssm set $svcName AppRotateBytes  10485760
& $nssm set $svcName AppExit         Default Restart
& $nssm set $svcName AppRestartDelay 3000

Log "Service configuré — démarrage..."
& $nssm start $svcName
Start-Sleep -Seconds 5

$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Log "Service FacturPro démarré avec succès"
} else {
    Log "AVERTISSEMENT : le service n'a pas démarré immédiatement. Consultez $LogDir\app-error.log"
}

# ── 5. Règle pare-feu ────────────────────────────────────────────────────────
Log "Configuration du pare-feu (port $Port)..."
netsh advfirewall firewall delete rule name="FacturPro" 2>$null | Out-Null
netsh advfirewall firewall add rule name="FacturPro" dir=in action=allow protocol=TCP localport=$Port profile=private | Out-Null
Log "Regle pare-feu creee"

# ── 6. Raccourcis ────────────────────────────────────────────────────────────
Log "Création des raccourcis..."

$urlContent = @"
[InternetShortcut]
URL=http://localhost:$Port
IconFile=explorer.exe
IconIndex=1
"@

$commonDesktop   = [System.Environment]::GetFolderPath("CommonDesktopDirectory")
$commonStartMenu = [System.Environment]::GetFolderPath("CommonPrograms")

New-Item -ItemType Directory -Force "$commonStartMenu\FacturPro" | Out-Null

$urlContent | Out-File "$commonDesktop\FacturPro.url"                   -Encoding ascii
$urlContent | Out-File "$commonStartMenu\FacturPro\FacturPro.url"       -Encoding ascii

Log "Raccourcis créés"

# ── 7. Résumé ────────────────────────────────────────────────────────────────
Log "=== Installation terminée avec succès ==="
Log "URL : http://localhost:$Port"
Log "Compte admin : $AdminEmail"

[System.Windows.Forms.MessageBox]::Show(
    "FacturPro est installe et demarre !`n`nAcces local : http://localhost:$Port`nCompte admin : $AdminEmail`n`nLe service demarrera automatiquement avec Windows.",
    "FacturPro -- Installation reussie", 0, 64) | Out-Null
