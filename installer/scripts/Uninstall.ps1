<#
.SYNOPSIS
    Désinstalle le service Windows FacturPro.
    Appelé par l'installateur Inno Setup lors de la désinstallation.
#>
param([string]$InstallDir)

$nssm    = "$InstallDir\tools\nssm.exe"
$svcName = "FacturPro"

# Arrêt et suppression du service
if (Test-Path $nssm) {
    & $nssm stop   $svcName 2>$null
    Start-Sleep -Seconds 2
    & $nssm remove $svcName confirm 2>$null
}

# Suppression règle pare-feu
netsh advfirewall firewall delete rule name="FacturPro" 2>$null | Out-Null

# Suppression raccourcis
$commonDesktop   = [System.Environment]::GetFolderPath("CommonDesktopDirectory")
$commonStartMenu = [System.Environment]::GetFolderPath("CommonPrograms")
Remove-Item "$commonDesktop\FacturPro.url"          -ErrorAction SilentlyContinue
Remove-Item "$commonStartMenu\FacturPro" -Recurse   -ErrorAction SilentlyContinue

Write-Host "Service FacturPro supprimé."
