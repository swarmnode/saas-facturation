<#
.SYNOPSIS
    Desinstalle les services Windows FacturPro (et PostgreSQL portable si present).
    Appele par l'installateur Inno Setup lors de la desinstallation.
#>
param([string]$InstallDir)

$nssm       = "$InstallDir\tools\nssm.exe"
$svcName    = "FacturPro"
$pgSvcName  = "FacturProPG"
$pgCtl      = "$InstallDir\pgsql\bin\pg_ctl.exe"

# Arret et suppression du service FacturPro
if (Test-Path $nssm) {
    & $nssm stop   $svcName 2>$null
    Start-Sleep -Seconds 2
    & $nssm remove $svcName confirm 2>$null
}

# Arret et deregistrement du service PostgreSQL portable (si present)
$pgSvc = Get-Service -Name $pgSvcName -ErrorAction SilentlyContinue
if ($pgSvc) {
    Write-Host "Arret du service PostgreSQL portable..."
    Stop-Service -Name $pgSvcName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (Test-Path $pgCtl) {
        & $pgCtl unregister -N $pgSvcName 2>$null
    } else {
        sc.exe delete $pgSvcName 2>$null | Out-Null
    }
}

# Suppression regle pare-feu
netsh advfirewall firewall delete rule name="FacturPro" 2>$null | Out-Null

# Suppression raccourcis
$commonDesktop   = [System.Environment]::GetFolderPath("CommonDesktopDirectory")
$commonStartMenu = [System.Environment]::GetFolderPath("CommonPrograms")
Remove-Item "$commonDesktop\FacturPro.url"        -ErrorAction SilentlyContinue
Remove-Item "$commonStartMenu\FacturPro" -Recurse -ErrorAction SilentlyContinue

Write-Host "Services FacturPro supprimes."
