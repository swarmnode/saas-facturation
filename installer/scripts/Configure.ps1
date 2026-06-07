<#
.SYNOPSIS
    Script de configuration post-installation de FacturPro.
    Execute automatiquement par l'installateur Inno Setup (admin requis).
#>
param(
    [string]$InstallDir,
    [string]$PgPass,
    [string]$AdminEmail,
    [string]$AdminPass,
    [string]$CompanyName = "Mon Entreprise",
    [string]$Port = "3001"
)

$ErrorActionPreference = "Stop"
$LogDir  = "$InstallDir\logs"
$LogFile = "$LogDir\install.log"

New-Item -ItemType Directory -Force $LogDir                    | Out-Null
New-Item -ItemType Directory -Force "$InstallDir\storage\logo" | Out-Null
New-Item -ItemType Directory -Force "$InstallDir\storage\pdf"  | Out-Null

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
        "FacturPro - Erreur", 0, 16) | Out-Null
    exit 1
}

Log "=== Demarrage configuration FacturPro ==="
Log "Repertoire d'installation : $InstallDir"

# -- 1. Localiser PostgreSQL (systeme ou portable bundled) -----------------------
Log "Recherche de PostgreSQL..."

$pgBin     = $null
$pgPortable = $false
$pgSvcName = "FacturProPG"
$pgData    = "$InstallDir\pgdata"

# Chercher un PostgreSQL systeme installe
function Find-PgBin {
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.FullName -replace '.*PostgreSQL\\(\d+)\\.*','$1') } -Descending
    if ($candidates) { return $candidates[0].DirectoryName }
    return $null
}

$pgBin = Find-PgBin

if (-not $pgBin) {
    # Utiliser le PostgreSQL portable bundled dans l'installateur
    $pgBinCandidate = "$InstallDir\pgsql\bin"
    if (-not (Test-Path "$pgBinCandidate\postgres.exe")) {
        LogError "PostgreSQL introuvable (ni systeme ni portable). Le fichier de setup semble corrompu - reinstallez FacturPro."
    }
    $pgBin     = $pgBinCandidate
    $pgPortable = $true
    Log "PostgreSQL portable utilise : $pgBin"
} else {
    Log "PostgreSQL systeme trouve : $pgBin"
}

$env:PGPASSWORD = $PgPass
$psql    = Join-Path $pgBin "psql.exe"
$pgCtl   = Join-Path $pgBin "pg_ctl.exe"
$initdb  = Join-Path $pgBin "initdb.exe"

function Exec-Psql($sql) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $out = & $psql -U postgres -h localhost -p 5432 -c $sql 2>&1
    $ErrorActionPreference = $prev
    return $out
}

function Exec-PsqlTuples($sql) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $out = & $psql -U postgres -h localhost -p 5432 -tA -c $sql 2>&1
    $ErrorActionPreference = $prev
    return ($out | Out-String).Trim()
}

# -- 2. Initialiser et demarrer le cluster PostgreSQL portable (premiere install) -
if ($pgPortable) {
    $svcExists = Get-Service -Name $pgSvcName -ErrorAction SilentlyContinue

    if (-not (Test-Path "$pgData\PG_VERSION")) {
        # Cluster vierge : initdb
        Log "Initialisation du cluster PostgreSQL..."
        $pwFile = "$env:TEMP\pgpw_$([System.IO.Path]::GetRandomFileName()).tmp"
        try {
            [System.IO.File]::WriteAllText($pwFile, $PgPass, [System.Text.Encoding]::ASCII)
            $initOut = & $initdb -D $pgData -U postgres -E UTF8 -A md5 --pwfile=$pwFile 2>&1
            Log "initdb : $($initOut -join ' ')"
            if ($LASTEXITCODE -ne 0) { LogError "initdb a echoue (code $LASTEXITCODE). Detail : $($initOut -join ' ')" }
        } finally {
            Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
        }

        # Forcer l'ecoute locale uniquement dans postgresql.conf
        $pgConf = "$pgData\postgresql.conf"
        Add-Content $pgConf "`nlisten_addresses = 'localhost'" -Encoding ASCII
        Add-Content $pgConf "port = 5432"                     -Encoding ASCII
        Log "postgresql.conf configure (localhost:5432)"
    } else {
        Log "Cluster deja initialise : $pgData"
    }

    # Enregistrer / verifier le service Windows
    if (-not $svcExists) {
        Log "Enregistrement du service Windows $pgSvcName..."
        $regOut = & $pgCtl register -N $pgSvcName -D $pgData -o "-p 5432 -h localhost" 2>&1
        Log "pg_ctl register : $($regOut -join ' ')"
        if ($LASTEXITCODE -ne 0) { LogError "pg_ctl register a echoue (code $LASTEXITCODE) : $($regOut -join ' ')" }
        # Demarrage automatique
        Set-Service -Name $pgSvcName -StartupType Automatic
    }

    # Demarrer le service
    $svc = Get-Service -Name $pgSvcName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
        Log "Demarrage du service $pgSvcName..."
        Start-Service -Name $pgSvcName
    }

    # Attendre que le serveur accepte les connexions (max 30 s)
    $waited = 0
    do {
        Start-Sleep -Seconds 2
        $waited += 2
        $ready = & $pgCtl status -D $pgData 2>&1
    } while (($ready -notmatch "server is running") -and ($waited -lt 30))

    if ($waited -ge 30) { LogError "PostgreSQL n'a pas demarre dans les temps. Consultez $pgData\pg_log\." }
    Log "PostgreSQL portable demarre ($waited s)"
} else {
    # PostgreSQL systeme : verifier qu'il est accessible
    $waited = 0
    do {
        Start-Sleep -Seconds 2
        $waited += 2
        $check = & $psql -U postgres -h localhost -p 5432 -c "SELECT 1" 2>&1
    } while (($check -notmatch "1 row") -and ($waited -lt 30))

    if ($waited -ge 30) { LogError "PostgreSQL systeme ($pgBin) inaccessible. Verifiez que le service est demarre." }
    Log "PostgreSQL systeme accessible"
}

# -- 3. Creer le role et la base de donnees (toujours vierge) -------------------
Log "Creation du role et de la base de donnees..."

$r = Exec-Psql "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='facturpro') THEN CREATE ROLE facturpro WITH LOGIN PASSWORD 'facturpro'; END IF; END `$`$;"
Log "psql CREATE ROLE : $r"

$r = Exec-Psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='facturpro' AND pid <> pg_backend_pid();"
Log "psql TERMINATE : $r"

$r = Exec-Psql "DROP DATABASE IF EXISTS facturpro;"
Log "psql DROP DB : $r"

$r = Exec-Psql "CREATE DATABASE facturpro OWNER facturpro;"
Log "psql CREATE DB : $r"
if ($LASTEXITCODE -ne 0) { LogError "Impossible de creer la base de donnees. Verifiez le mot de passe PostgreSQL saisi. Detail : $r" }

Log "Base 'facturpro' creee (vierge)"

# -- 4. Generer .env ------------------------------------------------------------
Log "Generation de la configuration (.env)..."

$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$jwtSecret = [Convert]::ToBase64String($bytes) -replace '[/+=]',''

$pgBinEnv = $pgBin   # chemin absolu vers les binaires PG (portable ou systeme)

$envContent = @"
DATABASE_URL=postgresql://facturpro:facturpro@localhost:5432/facturpro
PORT=$Port
JWT_SECRET=$jwtSecret
ADMIN_EMAIL=$AdminEmail
ADMIN_DEFAULT_PASS=$AdminPass
COMPANY_NAME=$CompanyName
PG_BIN=$pgBinEnv
UPDATE_GITHUB_REPO=swarmnode/saas-facturation
"@

[System.IO.File]::WriteAllText("$InstallDir\.env", $envContent, [System.Text.Encoding]::UTF8)
Log ".env cree"

# -- 5. Service Windows FacturPro (NSSM) ----------------------------------------
Log "Installation du service Windows FacturPro..."

$nssm    = "$InstallDir\tools\nssm.exe"
$nodeExe = "$InstallDir\node\node.exe"
$appJs   = "$InstallDir\dist\server\index.js"
$svcName = "FacturPro"

$existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($existing) {
    Log "Service existant detecte - suppression..."
    Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $scOut = sc.exe delete $svcName 2>&1
    Log "sc delete : $scOut"
    Start-Sleep -Seconds 1
}

function NssmSet($key, $val) {
    $out = & $nssm set $svcName $key $val 2>&1
    Log "nssm set $key : $out"
    if ($LASTEXITCODE -ne 0) { LogError "nssm set $key a echoue (code $LASTEXITCODE) : $out" }
}

$out = & $nssm install $svcName $nodeExe $appJs 2>&1
Log "nssm install : $out"
if ($LASTEXITCODE -ne 0) { LogError "nssm install a echoue (code $LASTEXITCODE) : $out" }

NssmSet AppDirectory    $InstallDir
NssmSet DisplayName     "FacturPro"
NssmSet Description     "Serveur de facturation FacturPro"
NssmSet Start           SERVICE_AUTO_START
NssmSet AppStdout       "$LogDir\app.log"
NssmSet AppStderr       "$LogDir\app-error.log"
NssmSet AppRotateFiles  1
NssmSet AppRotateBytes  10485760
$out = & $nssm set $svcName AppExit Default Restart 2>&1
Log "nssm set AppExit : $out"
if ($LASTEXITCODE -ne 0) { LogError "nssm set AppExit a echoue (code $LASTEXITCODE) : $out" }
NssmSet AppRestartDelay 3000

# Variables d'environnement injectees directement dans le service
$envVars = @(
    "DATABASE_URL=postgresql://facturpro:facturpro@localhost:5432/facturpro",
    "PORT=$Port",
    "JWT_SECRET=$jwtSecret",
    "ADMIN_EMAIL=$AdminEmail",
    "ADMIN_DEFAULT_PASS=$AdminPass",
    "COMPANY_NAME=$CompanyName",
    "PG_BIN=$pgBinEnv",
    "UPDATE_GITHUB_REPO=swarmnode/saas-facturation"
)
$out = & $nssm set $svcName AppEnvironmentExtra @envVars 2>&1
Log "nssm set AppEnvironmentExtra : $out"
if ($LASTEXITCODE -ne 0) { LogError "nssm set AppEnvironmentExtra a echoue (code $LASTEXITCODE) : $out" }

# Dependance sur le service PostgreSQL pour eviter un demarrage trop precoce
$pgSvc = if ($pgPortable) {
    Get-Service -Name $pgSvcName -ErrorAction SilentlyContinue
} else {
    Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
}
if ($pgSvc) {
    $out = & $nssm set $svcName DependOnService $pgSvc.Name 2>&1
    Log "nssm DependOnService $($pgSvc.Name) : $out"
}

Log "Service configure - demarrage..."
$prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
$out = & $nssm start $svcName 2>&1
$ErrorActionPreference = $prev
Log "nssm start : $out"
Start-Sleep -Seconds 5

$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Log "Service FacturPro demarre avec succes"
} else {
    $status = if ($svc) { $svc.Status } else { "introuvable" }
    Log "AVERTISSEMENT : service en etat '$status'. Consultez $LogDir\app-error.log"
}

# -- 6. Regle pare-feu ----------------------------------------------------------
Log "Configuration du pare-feu (port $Port)..."
netsh advfirewall firewall delete rule name="FacturPro" 2>&1 | Out-Null
$fwOut = netsh advfirewall firewall add rule name="FacturPro" dir=in action=allow protocol=TCP localport=$Port profile=any 2>&1
Log "Pare-feu : $fwOut"

# -- 7. Resume -----------------------------------------------------------------
Log "=== Installation terminee avec succes ==="
Log "URL : http://localhost:$Port"
Log "Compte admin : $AdminEmail"

[System.Windows.Forms.MessageBox]::Show(
    "FacturPro est installe et demarre !`n`nAcces local : http://localhost:$Port`nCompte admin : $AdminEmail`n`nLe service demarrera automatiquement avec Windows.",
    "FacturPro - Installation reussie", 0, 64) | Out-Null
