; ============================================================
; FacturPro — Script Inno Setup
; Prérequis : avoir exécuté build.ps1 pour préparer payload/ et tools/
; Compilez ce fichier avec Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
; ============================================================

#define AppName    "FacturPro"
#define AppVersion "2.18.5"
#define AppURL     "http://localhost:3000"

[Setup]
AppId={{8A3F2C1D-4B5E-6F7A-8C9D-0E1F2A3B4C5D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=EGCN
AppPublisherURL={#AppURL}
DefaultDirName=C:\FacturPro
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=.
OutputBaseFilename=FacturPro-Setup
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
; WizardResizable removed (obsolete in IS 6.4+)
SetupIconFile=facturpro.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\facturpro.ico
MinVersion=10.0
DisableDirPage=no
DisableProgramGroupPage=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

; ── Pages personnalisées ──────────────────────────────────────────────────────
; Définies dans la section [Code] ci-dessous

[Files]
; Application (dist + node_modules prod)
Source: "payload\dist\*";         DestDir: "{app}\dist";         Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\package.json";   DestDir: "{app}";              Flags: ignoreversion

; Node.js portable
Source: "tools\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs createallsubdirs ignoreversion

; NSSM
Source: "tools\nssm.exe"; DestDir: "{app}\tools"; Flags: ignoreversion

; Installateur PostgreSQL 17 (EDB one-click, exécuté silencieusement par Configure.ps1)
Source: "tools\pg17-installer.exe"; DestDir: "{app}\tools"; Flags: ignoreversion

; Script de configuration (exécuté après l'extraction)
Source: "scripts\Configure.ps1"; DestDir: "{app}"; Flags: ignoreversion

; Script de désinstallation
Source: "scripts\Uninstall.ps1"; DestDir: "{app}"; Flags: ignoreversion

; Icône application
Source: "facturpro.ico"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\storage\logo"
Name: "{app}\storage\pdf"
Name: "{app}\logs"

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\FacturPro.url"; IconFilename: "{app}\facturpro.ico"
Name: "{group}\Désinstaller FacturPro"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\FacturPro.url"; IconFilename: "{app}\facturpro.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Créer une icône sur le bureau"; GroupDescription: "Icônes supplémentaires :"

[Run]
; Premiere installation : configuration complete (PostgreSQL, base, service, .env)
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\Configure.ps1"" -InstallDir ""{app}"" -PgPass ""{code:GetPgPass}"" -AdminEmail ""{code:GetAdminEmail}"" -AdminPass ""{code:GetAdminPass}"" -CompanyName ""{code:GetSociete}"" -Port ""{code:GetPort}"""; \
  StatusMsg: "Configuration de la base de données et du service..."; \
  Check: IsFirstInstall; \
  Flags: runhidden waituntilterminated

; Mise a jour silencieuse : redemarrage du service uniquement
Filename: "{app}\tools\nssm.exe"; \
  Parameters: "start FacturPro"; \
  StatusMsg: "Redemarrage du service FacturPro..."; \
  Check: IsUpgrade; \
  Flags: runhidden

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\Uninstall.ps1"" -InstallDir ""{app}"""; \
  RunOnceId: "UninstallFacturPro"; \
  Flags: runhidden waituntilterminated

[Code]
// ── Variables des pages personnalisées ───────────────────────────────────────
var
  PagePostgres : TInputQueryWizardPage;
  PageAdmin    : TInputQueryWizardPage;
  PageSociete  : TInputQueryWizardPage;
  PageServeur  : TInputQueryWizardPage;

// ── Initialisation des pages ─────────────────────────────────────────────────
procedure InitializeWizard;
begin
  // Page 1 : PostgreSQL
  PagePostgres := CreateInputQueryPage(wpSelectDir,
    'Configuration PostgreSQL',
    'Mot de passe du superutilisateur PostgreSQL',
    'Si PostgreSQL est déjà installé sur ce poste, entrez son mot de passe superutilisateur.' + #13#10 +
    'Sinon, laissez la valeur par défaut — PostgreSQL sera installé automatiquement avec ce mot de passe.');
  PagePostgres.Add('Mot de passe superutilisateur (postgres) :', True);
  PagePostgres.Values[0] := 'postgres';

  // Page 2 : Compte admin FacturPro
  PageAdmin := CreateInputQueryPage(PagePostgres.ID,
    'Compte administrateur FacturPro',
    'Créez le compte administrateur de l''application',
    'Ces identifiants seront utilisés pour la première connexion à FacturPro.');
  PageAdmin.Add('Adresse e-mail :', False);
  PageAdmin.Add('Mot de passe (min. 8 caractères) :', True);
  PageAdmin.Values[0] := '';
  PageAdmin.Values[1] := '';

  // Page 3 : Nom de la societe
  PageSociete := CreateInputQueryPage(PageAdmin.ID,
    'Votre société',
    'Nom de la société à créer',
    'Ce nom sera utilisé pour créer votre premier dossier dans FacturPro.' + #13#10 +
    'Vous pourrez compléter les informations (SIRET, adresse…) dans les paramètres.');
  PageSociete.Add('Nom de la société :', False);
  PageSociete.Values[0] := '';

  // Page 4 : Port d'écoute
  PageServeur := CreateInputQueryPage(PageSociete.ID,
    'Configuration du serveur',
    'Port d''écoute de FacturPro',
    'FacturPro écoute sur ce port. Laissez 3000 sauf si un autre logiciel l''utilise déjà.' + #13#10 +
    'Valeur autorisée : 1024 à 65535.');
  PageServeur.Add('Port TCP :', False);
  PageServeur.Values[0] := '3001';
end;

// ── Validation des saisies ────────────────────────────────────────────────────
function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port : Integer;
begin
  Result := True;

  if CurPageID = PagePostgres.ID then begin
    if Trim(PagePostgres.Values[0]) = '' then begin
      MsgBox('Veuillez entrer le mot de passe PostgreSQL.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Pos('"', PagePostgres.Values[0]) > 0 then begin
      MsgBox('Le mot de passe PostgreSQL ne peut pas contenir de guillemets (").', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PageAdmin.ID then begin
    if Pos('@', PageAdmin.Values[0]) = 0 then begin
      MsgBox('Veuillez entrer une adresse e-mail valide.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Length(PageAdmin.Values[1]) < 8 then begin
      MsgBox('Le mot de passe doit contenir au moins 8 caractères.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Pos('"', PageAdmin.Values[1]) > 0 then begin
      MsgBox('Le mot de passe admin ne peut pas contenir de guillemets (").', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PageSociete.ID then begin
    if Trim(PageSociete.Values[0]) = '' then begin
      MsgBox('Veuillez entrer le nom de la société.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PageServeur.ID then begin
    Port := StrToIntDef(Trim(PageServeur.Values[0]), 0);
    if (Port < 1024) or (Port > 65535) then begin
      MsgBox('Le port doit être un nombre entre 1024 et 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// ── Getters utilisés dans [Run] ───────────────────────────────────────────────
function GetPgPass(Param: String): String;
begin
  Result := PagePostgres.Values[0];
end;

function GetAdminEmail(Param: String): String;
begin
  Result := PageAdmin.Values[0];
end;

function GetAdminPass(Param: String): String;
begin
  Result := PageAdmin.Values[1];
end;

function GetSociete(Param: String): String;
begin
  Result := Trim(PageSociete.Values[0]);
end;

function GetPort(Param: String): String;
begin
  Result := Trim(PageServeur.Values[0]);
  if Result = '' then Result := '3000';
end;

// ── Premiere installation vs mise a jour ─────────────────────────────────────
// IsFirstInstall : .env absent = installation vierge
// IsUpgrade      : .env present = mise a jour silencieuse (ne pas toucher la BDD)
function IsFirstInstall(): Boolean;
begin
  Result := not FileExists(ExpandConstant('{app}\.env'));
end;

function IsUpgrade(): Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\.env'));
end;

// ── Gestion du service et raccourci navigateur ────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  UrlFile    : String;
  Lines      : TArrayOfString;
  Port       : String;
  ResultCode : Integer;
begin
  // Arret du service avant la copie des fichiers (upgrade uniquement)
  // En premiere installation nssm.exe n'existe pas encore -> skip automatique
  if CurStep = ssPreInstall then begin
    if FileExists(ExpandConstant('{app}\tools\nssm.exe')) then
      Exec(ExpandConstant('{app}\tools\nssm.exe'), 'stop FacturPro', '',
           SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  // Raccourci .url cree uniquement en premiere installation (le fichier n'existe pas encore)
  if CurStep = ssPostInstall then begin
    if not FileExists(ExpandConstant('{app}\FacturPro.url')) then begin
      Port    := Trim(PageServeur.Values[0]);
      if Port = '' then Port := '3000';
      UrlFile := ExpandConstant('{app}\FacturPro.url');
      SetArrayLength(Lines, 3);
      Lines[0] := '[InternetShortcut]';
      Lines[1] := 'URL=http://localhost:' + Port;
      Lines[2] := 'IconFile=explorer.exe';
      SaveStringsToFile(UrlFile, Lines, False);
    end;
  end;
end;
