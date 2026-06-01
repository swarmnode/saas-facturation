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

# -- 1. Localiser / installer PostgreSQL -----------------------------------------
Log "Recherche de PostgreSQL..."

function Find-PgBin {
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.FullName -replace '.*PostgreSQL\\(\d+)\\.*','$1') } -Descending
    if ($candidates) { return $candidates[0].DirectoryName }
    return $null
}

$pgBin = Find-PgBin

if (-not $pgBin) {
    Log "PostgreSQL absent - installation via winget..."
    $result = Start-Process "winget" -ArgumentList "install -e --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements" -Wait -PassThru
    # 0 = succes, -1978335189 (0x8A150021) = deja installe
    if ($result.ExitCode -notin @(0, -1978335189)) {
        LogError "L'installation de PostgreSQL a echoue (code $($result.ExitCode)). Installez-le manuellement depuis https://www.postgresql.org/download/windows/ puis relancez l'installateur."
    }
    Start-Sleep -Seconds 10
    $pgBin = Find-PgBin
    if (-not $pgBin) { LogError "psql.exe introuvable apres installation PostgreSQL. Verifiez l'installation et relancez." }
}

Log "PostgreSQL trouve : $pgBin"

$env:PGPASSWORD = $PgPass
$psql = Join-Path $pgBin "psql.exe"

function Exec-Psql($sql) {
    $out = & $psql -U postgres -h localhost -p 5432 -c $sql 2>&1
    return $out
}

function Exec-PsqlTuples($sql) {
    $out = & $psql -U postgres -h localhost -p 5432 -tA -c $sql 2>&1
    return ($out | Out-String).Trim()
}

# -- 2. Creer le role et la base de donnees (toujours vierge) -------------------
Log "Creation du role et de la base de donnees..."

Exec-Psql "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='facturation') THEN CREATE ROLE facturation WITH LOGIN PASSWORD 'facturation'; END IF; END `$`$;" | Out-Null

# Coupe les connexions actives avant de dropper
Exec-Psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='facturation' AND pid <> pg_backend_pid();" | Out-Null
Exec-Psql "DROP DATABASE IF EXISTS facturation;" | Out-Null
Exec-Psql "CREATE DATABASE facturation OWNER facturation;" | Out-Null
Log "Base 'facturation' creee (vierge)"

# -- 3. Generer .env ------------------------------------------------------------
Log "Generation de la configuration (.env)..."

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
Log ".env cree"

# -- 4. Service Windows (NSSM) --------------------------------------------------
Log "Installation du service Windows..."

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
    "DATABASE_URL=postgresql://facturation:facturation@localhost:5432/facturation",
    "PORT=$Port",
    "JWT_SECRET=$jwtSecret",
    "ADMIN_EMAIL=$AdminEmail",
    "ADMIN_DEFAULT_PASS=$AdminPass",
    "PG_BIN=$pgBin"
)
$out = & $nssm set $svcName AppEnvironmentExtra @envVars 2>&1
Log "nssm set AppEnvironmentExtra : $out"
if ($LASTEXITCODE -ne 0) { LogError "nssm set AppEnvironmentExtra a echoue (code $LASTEXITCODE) : $out" }

# Dependance sur PostgreSQL pour eviter un demarrage avant que la BDD soit prete
$pgSvc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
if ($pgSvc) {
    $out = & $nssm set $svcName DependOnService $pgSvc.Name 2>&1
    Log "nssm DependOnService $($pgSvc.Name) : $out"
}

Log "Service configure - demarrage..."
$out = & $nssm start $svcName 2>&1
Log "nssm start : $out"
Start-Sleep -Seconds 5

$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Log "Service FacturPro demarre avec succes"
} else {
    $status = if ($svc) { $svc.Status } else { "introuvable" }
    Log "AVERTISSEMENT : service en etat '$status'. Consultez $LogDir\app-error.log"
}

# -- 5. Regle pare-feu ----------------------------------------------------------
Log "Configuration du pare-feu (port $Port)..."
netsh advfirewall firewall delete rule name="FacturPro" 2>&1 | Out-Null
$fwOut = netsh advfirewall firewall add rule name="FacturPro" dir=in action=allow protocol=TCP localport=$Port profile=any 2>&1
Log "Pare-feu : $fwOut"

# -- 6. Resume -----------------------------------------------------------------
Log "=== Installation terminee avec succes ==="
Log "URL : http://localhost:$Port"
Log "Compte admin : $AdminEmail"

[System.Windows.Forms.MessageBox]::Show(
    "FacturPro est installe et demarre !`n`nAcces local : http://localhost:$Port`nCompte admin : $AdminEmail`n`nLe service demarrera automatiquement avec Windows.",
    "FacturPro - Installation reussie", 0, 64) | Out-Null
