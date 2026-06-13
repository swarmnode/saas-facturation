# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]

### Ajouté
- Feat: bundler PostgreSQL portable dans l'installateur (remplace l'EDB one-click)

L'installeur EDB (~300 Mo, 5-10 min) est remplacé par le ZIP binaries-only
EDB (~130 Mo) extrait dans tools/pgsql/, initialisé via initdb et enregistré
comme service Windows FacturProPG (pg_ctl register). Réduit le temps
d'installation de PostgreSQL à ~20 secondes.

- build.ps1 : télécharge/extrait le ZIP binaries-only, supprime symbols/doc/include
- Configure.ps1 : détecte PG système → sinon initdb + pg_ctl register dans {app}\pgdata
- Uninstall.ps1 : arrête et déregistre le service FacturProPG
- FacturPro.iss : bundle tools\pgsql\*, crée {app}\pgdata, met à jour le texte de l'assistant

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: ajouter 5 bulles d'aide contextuelle (TVA, lettrage, achats, exercices)

Couvre des fonctionnalités peu documentées dans l'UI : clôture d'exercice,
lettrage compte 411, cycle de vie facture d'achat, chaînage commande/facture
fournisseur, et structure du formulaire CA3 de déclaration de TVA.
- Feat: déduction d'acompte sur le paiement de facture

- Migration 027 : colonnes acompte_id + montant_acompte_applique sur
  factures, notes sur acomptes
- FactureService.marquerPayee() accepte un acompte_id optionnel ;
  si l'acompte dépasse la facture, crée un acompte reliquat directement
  encaissé (scellé + archivé) avec la note "Reliquat — AC-XXXX"
- Nouveau endpoint GET /api/factures/:id/acomptes-disponibles
- Modal de paiement : sélecteur d'acomptes disponibles + calcul du
  solde en temps réel, affichage du reliquat si acompte > facture
- PDF (genererFacture + genererFactureStream) : lignes "Acompte versé"
  et "Solde à payer" dans le bloc totaux quand acompte appliqué
- WYSIWYG editor.js : même affichage dans la vue document
- Liste acomptes : colonne statut enrichie (→ FAC-XXXX utilisée),
  numéro enrichi (origine reliquat) ; fiche détail : champs Origine et
  Utilisé pour

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: fiche client avec mouvements et KPIs par période

Ajoute GET /api/clients/:id/mouvements qui retourne en une seule requête
SQL les KPIs pour l'année N, N-1 et tout temps (CA net HT, encours TTC,
retard TTC) ainsi que la liste chronologique de tous les documents du
client (devis, factures, acomptes, bons de livraison).

Côté SPA : bouton "Fiche" sur chaque ligne de la liste clients + nom
cliquable ; modale avec sélecteur de période (2026 / 2025 / Tout) qui
switche les KPI cards sans re-fetch, et tableau de documents avec liens
directs vers chaque document.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: ameliorer page articles (recherche, tri, fiche article)

- Barre de recherche instantanee (reference, designation, description)
- Tri par clic d'en-tete sur toutes les colonnes numeriques et texte
- Fiche article : KPIs (devis, factures, qte vendue, CA HT), tableau
  des 20 documents recents avec lien direct
- Migration 028 : article_id (FK nullable) sur devis_lignes et
  factures_lignes pour relier les lignes a leur article source
- DevisService, FactureService : sauvegarde article_id dans les lignes
- editor.js : stocke article_id dans le dataset de la ligne lors
  de la selection autocomplete ; restaure depuis les lignes existantes
- LigneInput : champ article_id? optionnel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: sélection multi-BL pour générer une facture groupée

Ajoute des cases à cocher sur chaque ligne BL, un bouton "Facturer la
sélection (N)" dans la topbar (désactivé jusqu'à 1 sélection), et la
logique de fusion des lignes. Valide que tous les BL appartiennent au
même client avant d'ouvrir l'éditeur facture.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: editeur — sous-champs masques au survol, hauteurs dynamiques, pagination PDF

- Les champs description et n° de serie disparaissent quand ils sont vides
  (ligne compacte) et se revelent au survol ou au focus de la ligne pour
  etre remplis ; jamais reveles en lecture seule
- Sauts de page de l'editeur recalcules en miroir du PDF : base fixe 20pt
  par ligne + hauteur DOM reelle des parties variables (description
  multi-ligne, n° de serie, commentaires) convertie px->pt
- PDF : genererFactureStream et genererBLStream passent en hauteurs
  dynamiques (heightOfString) comme genererFacture/genererDevisStream —
  descriptions completes au lieu d'etre tronquees
- PDF : le n° de serie est desormais imprime (« N° serie : X », 7pt gris)
  sous la description dans les 4 generateurs, hauteur comptee dans rowH

Teste : Playwright (masquage/survol/hauteur/sauts de page) + verification
croisee editeur vs PDF (41 lignes -> 2 pages de contenu des deux cotes)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Feat: editeurs WYSIWYG pour les documents d'achat (commandes et factures fournisseurs)

Aligne les achats sur le modele des ventes — DocEditor gere deux nouveaux
types : 'commande' (bon de commande) et 'facture-achat'.

- Migration 029 : commandes_fournisseurs_lignes et factures_fournisseurs_lignes
  (miroir devis_lignes, ON DELETE CASCADE — pas de verrou cote achats) ;
  montant_tva/montant_ttc/notes sur commandes_fournisseurs
- CommandeFournisseurService : lignes avec totaux calcules comme DevisService,
  compat saisie sans lignes (montant HT seul) ; route GET /:id/apercu
- FacturXService.genererCommandeStream : PDF « BON DE COMMANDE » avec
  destinataire fournisseur, hauteurs dynamiques, totaux, notes (sans CGV
  de vente ni cadre signature)
- FournisseurService : lignes detaillees sur les factures d'achats + nouveau
  mettreAJour (statut recue uniquement) qui regenere les ecritures FEC et
  resynchronise la TVA deductible (anciennes et nouvelles periodes) ;
  fix : syncTvaDeductible ecrasait pas un total retombe a zero
- DocEditor : destinataire fournisseur (annuaire ou nom libre), prix d'achat
  depuis le catalogue article, numero libre pour la facture d'achat, pas de
  boutons PDF sur la facture d'achat (document de reference = celui du
  fournisseur), lecture seule une fois payee, bouton Payer, brouillons
- Listes achats : ouverture des editeurs, modale de paiement partagee,
  chainage commande<->facture conserve via bouton dedie, restauration session

Teste : API (totaux, PDF, regeneration FEC 401 294->360, suppression) +
Playwright (ouverture editeurs, saisie, numerotation CMD, capture verifiee)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Feat: tests E2E autonomes, envoi/facturation commandes fournisseurs, filtres statut

- tests/e2e-utils.ts + global-setup/global-teardown : suite Playwright avec
  utilisateur dedie e2e@facturpro.test (independant du compte admin)
- 4 specs durables : smoke, achats, editeur, filtres (7/7 OK)
- Envoi du bon de commande au fournisseur par email (EmailService.envoyerCommande)
- Facturation d'une commande en un clic, editeur pre-rempli + chainage auto
- Filtre de statut sur acomptes et bons de livraison ; recherche globale
  etendue aux commandes/factures fournisseurs (search.ts)
- Manuel utilisateur a jour (sous-champs au survol, filtres, envoi, facturation)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: recherche globale dans la barre du haut

Le champ de filtre de la topbar declenche desormais une recherche
cross-documents (devis, factures, BL, acomptes, clients, articles,
commandes et factures fournisseurs) via /api/search a partir de 2
caracteres, avec menu deroulant groupe par type et navigation clavier.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: support HTTPS natif optionnel (HTTPS_ENABLED)

Le serveur reste en HTTP par defaut. Si HTTPS_ENABLED=true, bascule sur
https.createServer() avec un certificat fourni (TLS_CERT_PATH/TLS_KEY_PATH)
ou un certificat auto-signe genere et persiste dans storage/tls/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: verification mensuelle de restauration des sauvegardes

Ajoute verifyLastBackup() (BackupScheduler) qui restaure le dernier
dump dans une base temporaire facturation_verify et compte les
factures pour garantir que les sauvegardes sont effectivement
restaurables. Planifie automatiquement le 1er du mois a 3h, declenche
aussi a la demande via POST /api/backup/verifier (super_admin) avec
affichage du resultat dans Parametres > Sauvegarde auto.

Inclut egalement storage/jwt_secret.key dans chaque sauvegarde pour
preserver les sessions JWT apres restauration sur une nouvelle
machine, et accorde CREATEDB au role facturpro dans l'installeur
(requis pour facturation_verify).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: stabiliser la topbar et améliorer les boutons Factures

Topbar — mise en page :
- Boutons sur 2 lignes (flex-wrap) au lieu du défilement horizontal
- Hauteur auto (min-height) pour absorber le retour à la ligne
- Champ de recherche à largeur fixe (flex: 0 0 240px) pour ne jamais changer de taille
- Titre non rétractable (flex: 0 0 auto sur le wrapper)
- white-space: nowrap + flex-shrink: 0 sur .btn pour éviter la compression des libellés

Topbar — stabilité au clic :
- Boutons "Envoyer la sélection" et "Prélèvement SEPA" toujours présents (disabled au lieu de display:none) pour réserver leur place et éviter tout décalage à la sélection
- Compteurs (N) en display:inline-block + min-width fixe : la largeur du bouton ne change pas selon le nombre de chiffres
- #btnSelectSepa (min-width 150px) et #btnRetardFilter (min-width 115px) stabilisés pour leurs deux libellés alternants
- .btn:disabled : style visuel dégradé (opacity .4, pointer-events none)
- select.btn { width: auto } : corrige le select "Tous les statuts" étiré à 100% par la règle globale de formulaire

Bouton Sélect. SEPA :
- Bascule entre "Sélect. SEPA" (coche les clients en prélèvement) et "Désélect. SEPA" (décoche tout)

Bulles d'aide contextuelle (audit) :
- Bulles ajoutées sur Attestation, Avoir, Encaisser, Livré (BL), stats (pipeline, balance âgée, DSO, conversion, marge catalogue, top clients)
- Bulles sur fiches clients (statut RGPD, mode TVA, mode règlement, mandat SEPA)
- Bulles sur Exercices, Fournisseurs (compte de charge), Paramètres (régime TVA, EI, mentions légales)
- Bulle sur le label "Accès complet" dans la gestion des utilisateurs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: corriger les guillemets Unicode dans release.ps1

Remplace les guillemets typographiques (U+201C/201D) et le tiret em
(U+2014) par des caracteres ASCII purs -- requis par PowerShell 5.1.
Ajoute git stash/pull --rebase/pop avant le push pour absorber les
commits CI changelog intercales.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: synchroniser la version installeur avec package.json

- build.ps1 : lit la version depuis package.json et patche
  automatiquement #define AppVersion dans FacturPro.iss avant le build,
  garantissant que l'installeur et le runtime affichent la meme version
- FacturPro.iss : version corrigee 2.18.5 -> 3.2.1 (sync manuelle initiale)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: corriger ecriture BOM dans package.json (release.ps1) + lecture defensive dans update.ts
- Fix: fiche article — reference et ouverture facture dans l'editeur

- modal.show : textContent -> innerHTML pour rendre le HTML du titre
- docRow facture : showFactureDetail -> DocEditor.openFacture
- Correction backtick imbrique dans le titre de la modale fiche article

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: securite — isolation multi-tenant, signature devis, secret JWT, erreurs, CORS

- Isolation multi-tenant : tous les obtenir() et mutations (PUT, emettre,
  payer, encaisser, delete, chorus-pro, envois email/PDF) verifient
  desormais l'appartenance du document a l'entreprise du JWT (404 sinon)
  sur factures, devis, acomptes, BL et articles
- DevisService.dupliquer copiait vers une entreprise arbitraire
  (SELECT id FROM entreprise LIMIT 1) — utilise l'entreprise du devis source
- Signature devis : le GET public affiche une page de confirmation,
  la signature ne se fait plus qu'en POST (les precharcheurs de liens
  Outlook/antivirus suivaient le GET et signaient a l'insu du client)
- JWT : suppression du defaut 'change_me' — secret aleatoire genere au
  premier demarrage et persiste dans storage/jwt_secret.key (utils/secret.ts)
- errorHandler : les erreurs PostgreSQL/systeme (err.code) renvoient un 500
  generique sans details internes ; les erreurs metier renvoient 400 avec
  leur message ; INALTER/ISCA restent en 403
- CORS desactive par defaut (SPA same-origin), configurable via CORS_ORIGIN
- initDb() refactore : boucle sur un tableau MIGRATIONS au lieu de 28 blocs
- envoyer-email sans email renvoie 400 au lieu d'un succes silencieux
- Fixes annexes : DELETE /api/devis/:id etait casse (syntaxe UNION/LIMIT
  invalide en PG, 500 systematique) ; AcompteService.lister parametre

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Fix: gerer les erreurs du pool PostgreSQL pour eviter un crash du serveur

Un client idle dont la connexion est coupee par l'administrateur PG
emettait une 'error' non geree sur le Pool, ce qui faisait planter
tout le processus Node (observe en prod sur le service FacturPro).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: mettre a jour le manuel utilisateur pour la v3.0.0

Ajoute le chapitre Achats (Fournisseurs, Commandes, Factures d'achats),
la gestion des societes (creation/edition/suppression), la sauvegarde/
restauration par societe et la maintenance de la base de donnees,
avec captures d'ecran a l'appui. Regenere le docx via pandoc.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: mettre a jour le manuel utilisateur pour la nouvelle barre laterale categorisee

La navigation laterale a ete reorganisee en categories repliables (Ventes,
Achats, Comptabilite). Reecriture de la section Navigation laterale et
recapture du screenshot du tableau de bord pour refleter la nouvelle
structure.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: corriger la table des matieres du manuel (titre francais + champ fonctionnel)

Pandoc generait un titre "Table of Contents" en anglais et un champ Word
vide sans entrees ni numeros de page (necessitant une mise a jour manuelle
F9). Ajout de toc-title en francais dans l'entete YAML et activation de
updateFields pour que la table se calcule automatiquement a l'ouverture.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: documenter les routes commentaires et maintenance dans CLAUDE.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: ajouter section fiche client dans le manuel utilisateur

Documente le bouton Fiche, la modale de mouvements client, les KPIs
par période (N / N-1 / Tout) et le tableau de documents cliquables.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: ajouter section catalogue articles (recherche, tri, fiche)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: mettre a jour le manuel pour la demo

- Fiche client (KPIs par periode, tableau des documents) : section restauree
- Deduction d'acompte lors du paiement de facture : flux complet, reliquat
- Acomptes : section enrichie (reliquat, suivi statut, imputation)
- Notifications avant echeance : nouvelle section dans Parametres

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: ajouter sélection multi-BL dans le manuel utilisateur

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md et manuel pour v3.2.6

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: manuel utilisateur — editeurs WYSIWYG des achats (v3.2.8)

- Section Commandes : editeur de bon de commande (fournisseur annuaire ou
  nom libre, lignes detaillees, prix d'achat auto depuis le catalogue,
  apercu PDF), chainage non bloquant via le bouton dedie
- Section Factures d'achats : editeur de saisie (n° fournisseur libre,
  compte de charge, lignes), comptabilite automatique (FEC AC/BQ,
  regeneration a la modification, TVA deductible), lecture seule si payee
- Nouvelles captures 27-commande-editeur et 28-facture-achat-editeur ;
  suppression de 23-commande-fiche (ancienne modale)
- docx regenere via pandoc (28 images embarquees)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: ajouter entree CHANGELOG pour le fix du pool PostgreSQL

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: mettre a jour CLAUDE.md (decoupage frontend et tests E2E)

Documente le decoupage de app.js en components.js/helpTexts.js et les
prerequis (DATABASE_URL, e2e-utils) pour lancer la suite Playwright.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Test: ajouter un test de fumée Playwright (login -> client -> devis -> facture -> émission)

Couvre le parcours métier critique en testant l'API directement : numérotation
FAC/DEV-AAAA-NNNN, verrouillage post-émission (403 sur modification), et intégrité
de la chaîne de scellement SHA-256. Ajoute le script `npm test`.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: bump v3.1.0

- PostgreSQL portable bundle dans l'installateur (~20s au lieu de 5-10 min)
- Bulles d'aide contextuelle sur toutes les vues (tooltips help-icon)
- Topbar : boutons sur 2 lignes, largeur fixe, zero saut de mise en page
- Bouton Sélect. SEPA toggleable (Sélect. / Désélect.)
- Test de fumée Playwright (parcours login -> devis -> facture -> émission)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: remplacer CI release par script local release.ps1

La release (build + zip + tag + upload GitHub) se fait desormais
en local via release.ps1 au lieu d'attendre un runner GitHub Actions.
Usage : .\release.ps1 3.2.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: bump v3.2.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: bump v3.2.1
- Chore: bump v3.2.2
- Chore: bump v3.2.3
- Chore: bump v3.2.5

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: bump v3.2.6
- Chore: gitignore — artefacts runtime (.tmp, Sauvegardes, updates, secret JWT)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
- Chore: bump v3.2.7
- Chore: bump v3.2.8
- Chore: bump v3.2.9
- Chore: bump v3.2.10
- Chore: bump v3.2.11
- Chore: bump v3.2.12


### Refactoring
- Refactor: decouper app.js par domaine et typer les retours de services documents

- Eclate js/app.js (7000+ lignes) en 9 modules par vue (core, bootstrap, dashboard,
  clients, ventes, articles-acomptes, achats, parametres, utilisateurs), charges
  comme scripts classiques partageant le scope global.
- Ajoute src/server/types/documents.ts (Devis, Facture, Acompte, BonLivraison +
  lignes) et type obtenir() dans les 4 services correspondants ; supprime tous
  les casts (x as any) dans devis.ts, factures.ts, acomptes.ts, bons-livraison.ts.


## [3.0.0] — 2026-06-07

### Ajouté
- Feat: ajouter Fournisseurs et Commandes d'achats avec chainage non bloquant

Nouveau groupe Achats enrichi : fiche Fournisseurs (CRUD calque sur Clients,
export/import CSV) et Commandes fournisseurs avec lien optionnel et non
verrouillant vers une facture d'achat (aucune obligation legale de chainage
cote achats, contrairement aux documents emis). "Fournisseurs" est renomme
en "Factures d'achats" pour lever l'ambiguite avec la nouvelle entite.

Generalise aussi les bulles d'aide au survol (data-tooltip directement sur
les elements, sans icone visible) et regroupe la sidebar en categories
repliables (Ventes / Achats / Comptabilite) persistees en localStorage.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: documenter migration 026 et routes Fournisseurs/Commandes d'achats dans CLAUDE.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: bump v2.20.12 pour publier la gestion des fournisseurs et commandes d'achat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: bump v3.0.0 — passage en version majeure

Nouvelle version majeure pour marquer l'ajout du module Achats
(Fournisseurs et Commandes d'achats) comme évolution structurante
de l'application.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.11] — 2026-06-07

### Ajouté
- Feat: permettre au super-admin de supprimer une societe avec sauvegarde imposee

Ajoute DELETE /api/entreprise/:id (super-admin uniquement) qui genere
systematiquement un export complet de la societe sur disque avant toute
suppression, puis supprime les donnees liees dans l'ordre inverse des FK
au sein d'une transaction. Si la societe a deja emis des documents
scelles/archives, les triggers ISCA bloquent l'operation (conformite
loi anti-fraude TVA) et un message clair est renvoye, en rappelant que
la sauvegarde a neanmoins ete creee.

Cote client, ajoute un assistant de confirmation a 3 etapes (avertissement,
acquittement de la sauvegarde automatique, saisie de la raison sociale) pour
eviter toute suppression accidentelle.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: ajouter des outils de maintenance BDD pour le super-admin (VACUUM/ANALYZE/REINDEX)

Ajoute un onglet "Maintenance BDD" dans Parametres (super-admin uniquement)
avec trois operations PostgreSQL documentees directement a cote des boutons :
- VACUUM (avec option "forcer" = VACUUM FULL, plus efficace mais verrouille
  les tables le temps du traitement, confirmation requise)
- ANALYZE (mise a jour des statistiques du planificateur de requetes)
- REINDEX (reconstruction des index, confirmation requise car verrouillant)

Cote backend, nouvelle route /api/maintenance (vacuum/analyze/reindex),
protegee par requireSuperAdmin, executee hors transaction via un client
dedie du pool, et journalisee dans l'audit log.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: scoper le stockage des logos par entreprise_id (multi-tenant)

Tous les logos étaient écrits sous des noms de fichiers fixes
(logo.<ext>, logo_pdf.png) dans storage/logo/ : la dernière société
à uploader écrasait le logo de toutes les autres. Les fichiers sont
désormais nommés logo_<entreprise_id>.<ext> et
logo_pdf_<entreprise_id>.png.

Adapte en conséquence FacturXService (helper resolveLogoAbsPath),
editor.js (helper logoPdfUrl) et SocieteBackupService — dont la
restauration en mode 'remap', qui doit renommer les fichiers et
réécrire entreprise.logo_path selon le nouvel ID attribué.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: mettre à jour CLAUDE.md (migration 025 + double mécanisme de mise à jour léger/lourd)
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: bump v2.20.10 pour tester la mise à jour à distance
- Chore: bump v2.20.11 pour publier la suppression de societe et la maintenance BDD

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.9] — 2026-06-06

### Documentation
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: bump v2.20.9 pour tester auto-update execFileSync

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.8] — 2026-06-06

### Corrigé
- Fix: appliquer le patch en-process via execFileSync + process.exit(0)

Supprime toute dependance a des processus externes (schtasks, spawn).
Node.js extrait lui-meme le zip puis quitte. NSSM redémarre le service
avec les nouveaux fichiers. Les logs sont ecrits directement via fs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: supprimer job installer du CI (trop lent, mange le stockage GitHub)

Seul le job patch zip est conserve. L'installeur complet se fait
manuellement avec installer/build.ps1 + Inno Setup si besoin.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.7] — 2026-06-06

### Documentation
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: bump v2.20.7 pour tester le systeme de maj automatique

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.6] — 2026-06-06

### Corrigé
- Fix: utiliser bash pour gh release create (evite problemes PowerShell 5.1)

Remplace PowerShell par bash pour les steps gh CLI.
Utilise --notes "" au lieu de --generate-notes (evite echec sur tags orphelins).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


## [2.20.5] — 2026-06-06

### Corrigé
- Fix: separer job patch (leger) et job installer (lourd) dans le workflow CI

Le job patch (tsc + zip) est independant et ne peut pas etre bloque
par le telechargement PostgreSQL ~300Mo. Le job installer complet
peut echouer sans empecher la publication du patch.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: corriger erreurs TypeScript heightOfString (fontSize n'est pas dans TextOptions)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


## [2.20.4] — 2026-06-06

### Corrigé
- Fix: utiliser spawn detache au lieu de schtasks pour le patch leger

Remplace schtasks /create /sc ONCE /st HH:MM:SS par un processus
PowerShell detache (spawn + unref). Le service NSSM tournant en SYSTEM,
le fils herite des droits sans avoir besoin de /ru SYSTEM. Elimine le
probleme de format HH:MM:SS non supporte par certains Windows.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: workflow cree la release GitHub automatiquement avant upload

Ajoute gh release create si la release n'existe pas encore.
Evite les releases orphelines (tag sans release) sur les prochains tags.
Bump v2.20.4 pour exposer le correctif spawn sur une release visible.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


## [2.20.2] — 2026-06-06

### Corrigé
- Fix: EBUSY sur mise à jour - nom de fichier unique avec timestamp dans TEMP

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: structure zip patch - utiliser dist/ entier pour respecter les chemins

Compress-Archive -Path "dist\client" produit des entrees "client\" dans
le zip, pas "dist\client\" - les fichiers s'extrayaient au mauvais endroit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Ci: inclure package.json dans FacturPro-Patch.zip + upload automatique

Sans package.json, la version n'est pas mise à jour après le patch et
le serveur redémarre toujours en détectant la même mise à jour.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Debug: logging patch.ps1 + install_dir dans /check pour diagnostiquer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: v2.20.2 - debug patch update

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.20.0] — 2026-06-06

### Ajouté
- Feat: v2.20.0 - commentaires catalogue, PDF hauteur dynamique, CSV multi-lignes

- migration 025 : table commentaires_predefinis par entreprise
- route GET/POST/DELETE /api/commentaires
- editeur : ligne commentaire en textarea (retours a la ligne) + select modeles + bouton sauvegarde
- PDF devis/facture : libelle, description, commentaires en hauteur dynamique via heightOfString
- PDF : commentaires fond blanc + texte #1A1A1A (coherent editeur)
- parseCSV : parser caractere par caractere - champs multi-lignes et guillemets isoles

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


## [2.19.0] — 2026-06-06

### Ajouté
- Feat: v2.19.0 - lignes commentaires fond blanc couleur texte articles

- styles.css : .e-comment-row fond blanc (#fff) au lieu de jaune (#fffde7)
- styles.css : .e-comment-inp couleur #1a1a1a identique aux .e-cell articles

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: restauration logo - exporter fichier original + copie de secours

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


## [2.18.4] — 2026-06-06

### Ajouté
- Feat: patch léger, logos dans sauvegarde, fix EBUSY mise à jour

- Libellés boutons backup : "Sauvegarder la société" / "Sauvegarder toutes les sociétés"
- SocieteBackupService : logo (storage/logo/logo_pdf.png) embarqué en base64 dans l'export s'il existe, restauré à l'import
- update.ts : supprime le fichier temporaire avant téléchargement (fix EBUSY sur relance)
- Bump 2.18.3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: Configure.ps1 - tiret long Unicode + SERVICE_START_PENDING coupe le script

- Remplace le tiret em dash U+2014 par un tiret ASCII (causait un
  ParserError sur PowerShell 5.1 sans BOM)
- Protege nssm start avec ErrorActionPreference Continue pour eviter
  que SERVICE_START_PENDING stoppe le script avant la regle pare-feu
- Bump 2.18.2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: archiver les patches dans updates/ avec numero de version

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


## [2.18.1] — 2026-06-06

### Ajouté
- Feat: lignes de commentaire dans tous les éditeurs WYSIWYG

Migration 024 ajoute la colonne `type VARCHAR(20) DEFAULT 'ligne'` sur
les 4 tables de lignes. Les lignes de type 'commentaire' sont rendues en
texte pleine largeur (italic, fond jaune pâle) sans colonnes de prix —
aussi bien dans l'éditeur (bouton + Commentaire) que dans les PDFs
(devis, factures, BL, avenants).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: mise à jour en 2 niveaux (patch léger / installeur complet)

- Patch léger (FacturPro-Patch.zip) : stop service → Expand-Archive → restart, ~15 s
- Mise à jour lourde (FacturPro-Setup.exe) : mécanisme Inno Setup via schtasks, ~30 s
- /api/update/check retourne update_type light|heavy|null
- UI affiche badge coloré et countdown adapté au type
- Bump version 2.18.1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: release 2.18.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.17.0] — 2026-06-05

### Ajouté
- Feat: restauration société cross-instance avec remapping d'IDs (v2.17.0)

En mode `?mode=remap`, tous les IDs (PK + FK) sont réattribués au-dessus
du MAX(id) existant dans chaque table cible, éliminant toute collision
multi-tenant lors d'un import d'une autre instance.

- buildIdMap() : calcule old_id→new_id pour chaque table avant insertion
- remapRow()   : applique PK, FK standards et références polymorphiques
                 (journal_scellement.document_id, archive_documents.document_id_original)
- Route POST /api/backup/societe/restaurer?mode=remap|skip
- UI : deux boutons distincts (même instance / cross-instance)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: restauration société — recaler les séquences SERIAL après INSERT

Sans setval(), le prochain INSERT sans id explicite appelait nextval() qui
retournait une valeur déjà occupée par les données restaurées → violation PK.
pg_get_serial_sequence() + MAX(id) sur toute la table (multi-tenant safe).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: build.ps1 -- BITS Transfer + validation taille pour pg17-installer

Invoke-WebRequest echoue silencieusement sur les gros fichiers (300 Mo).
Passage a Start-BitsTransfer (concu pour les gros telechargements Windows).
Ajout d'une verification de taille minimale (200 Mo) : les fichiers
corrompus sont detectes et re-telecharges automatiquement.
Message d'erreur explicite si le telechargement echoue definitivement.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


## [2.16.0] — 2026-06-05

### Ajouté
- Feat: sauvegarde et restauration par société (JSON gzippé, INSERT ON CONFLICT DO NOTHING)

- SocieteBackupService : exporte 22 tables filtrées par entreprise_id en JSON.gz
- GET /api/backup/societe/telecharger (requirePerm settings:r) — accessible aux admins
- POST /api/backup/societe/restaurer (super_admin) — réinsère les données manquantes
- Restauration tolérante aux colonnes inconnues (compatibilité inter-versions)
- UI restructurée : carte société + carte complète séparées
- Permissions backup.ts migrées de router.use vers par-route (évite le blocage du endpoint société)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


## [2.15.0] — 2026-06-05

### Corrigé
- Fix: installeur — PostgreSQL bundlé (suppression winget, EDB silent install)

winget est inaccessible dans le contexte élevé Inno Setup. L'installateur EDB PostgreSQL 17
est désormais téléchargé par build.ps1 et bundlé dans le package ; Configure.ps1 l'exécute
silencieusement (--mode unattended). Quoting PS 5.1 corrigé. Validation guillemets dans wizard.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]


## [2.14.0] — 2026-06-04

### Ajouté
- Feat: notifications avant échéance + correction persistance relances auto

- Migration 022 : ajoute notif_echeance_active/jours sur entreprise et
  notif_echeance_envoyee sur factures (envoi unique garanti)
- RelanceScheduler : nouvelle fonction envoyerNotifsEcheance() qui envoie
  un rappel N jours avant l'échéance (défaut 3j), tourne au même cron
- Route POST /api/entreprise/relances : persiste les 5 champs relance +
  notif et réinitialise le scheduler immédiatement
- Correction : les relances auto n'étaient jamais sauvegardées (la route
  principale ignorait ces champs)
- Frontend : section Paramètres restructurée en deux fieldsets distincts
  (après échéance / avant échéance)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: import factures fournisseurs (FEC compte 401 + CA3 auto)

- Migration 023 : table factures_fournisseurs + FK facture_fournisseur_id
  sur fec_ecritures
- FournisseurService : creer/payer/supprimer avec écritures FEC atomiques
  (journal AC : 401/crédit + 6xx/débit + 44566/débit) et mise à jour
  automatique de tva_deductible par période (CA3 section B)
- Route /api/factures-fournisseurs : CRUD + POST /:id/payer
- FecExportService : filtre multi-tenant étendu aux écritures fournisseurs
  (EXISTS sur factures_fournisseurs en plus de factures)
- Frontend : nouvelle page "Factures fournisseurs" avec liste filtrée,
  formulaire de saisie avec calcul TVA automatique, et workflow paiement

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: sauvegarde PDFs + import CSV fournisseurs + stats fournisseurs + relance courrier

- BackupScheduler : copie storage/pdf/ dans la destination de backup
  (preuve légale Factur-X, rétention 10 ans)
- Route POST /api/factures-fournisseurs/import-csv : import en masse
  depuis CSV (colonnes : date_facture, fournisseur_nom, numero,
  montant_ht, taux_tva, compte_charge, date_echeance...)
- Route GET /api/stats/fournisseurs : KPIs achats (total HT/TVA,
  balance à payer, top 5 fournisseurs, mensuel 12 mois)
- Route GET /api/factures/:id/relance-courrier : lettre de relance PDF
  (PDFKit) imprimable avec en-tête entreprise et adresse client
- Frontend : bouton ✉ Courrier sur les factures en retard, bouton
  ⬆ Import CSV sur la page Fournisseurs, section Achats fournisseurs
  dans Statistiques (KPIs + top 5 + graphe mensuel)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: dates exercices comptables en format JJ/MM/AAAA

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: exercices — proposer l'année suivant le dernier exercice existant

Au lieu de descendre depuis l'année courante-5 (ce qui affichait 2024
alors que 2027 existe déjà), on part du max des exercices existants +1.
La date de début suit également l'année proposée.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: ajouter Fournisseurs dans le menu sidebar

L'entrée nav-item manquait dans index.html — la page était
accessible via le tab strip mais pas depuis la barre latérale.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: colonnes DATE PostgreSQL toujours retournées en string

- database.ts : ajoute types.setTypeParser(1082) pour DATE -> string
  YYYY-MM-DD (évite les objets Date JS qui cassent .slice/.replace)
- FournisseurService : helper toISODate() robuste string|Date pour
  les cas où le parser n'est pas encore actif

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: exempter localhost du rate limiter login

L'utilisateur accédant depuis sa propre machine ne doit pas être
bloqué par le rate limiter (::1 / 127.0.0.1). La protection reste
active pour les connexions réseau extérieures.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: binding #ffCsvInput déplacé dans reload() après injection HTML

L'onchange était bindé avant que el.innerHTML soit défini,
causant 'Cannot set properties of null'.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: pied de page relance courrier en flux (évite la page 2)

Le footer était positionné à y=780 fixe ce qui créait une 2e page
quand le curseur était déjà plus bas. Remplacé par moveDown + text
en flux, toujours sur la même page.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: numéro de facture avec tirets insécables dans la lettre de relance

PDFKit coupait le numéro aux tirets (FAC-TEST → FAC-\nTEST).
Remplacement par le tiret insécable U+2011 pour éviter la coupure.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: objet lettre relance sur une seule ligne (lineBreak: false, width: 475)

U+2011 non supporté par Helvetica PDFKit. Passage à lineBreak:false
avec largeur pleine page pour que le numéro ne wrppe pas.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: mention légale + CGV sur la même page (plus de page vide intercalée)

drawCGV détecte si le startY dépasse la zone utile de la page et
ajoute une nouvelle page si nécessaire, évitant que la mention légale
se retrouve seule sur sa propre page avant les CGV.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: version manuel utilisateur → v2.13.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Security: helmet + rate limiting sur /api/auth/login

- Helmet : headers HTTP de sécurité (X-Frame-Options, HSTS, XSS
  protection…). CSP désactivé car SPA avec scripts inline.
- express-rate-limit : 10 tentatives / 15 min par IP sur /api/auth/login
  — bloque le bruteforce sur les mots de passe.
- JWT expiresIn '8h' était déjà en place (pas de changement nécessaire).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: release 2.14.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Performance
- Perf: pagination serveur sur toutes les listes (50 docs/page)

- utils/paginate.ts : helper paginateParams + buildPage (COUNT(*) OVER())
- FactureService, DevisService, AcompteService, BonLivraisonService :
  paramètres page/limit optionnels sur lister()
- Routes factures, devis, acomptes, bons-livraison : réponse paginée
  { data, total, page, pages, limit } — ?all=1 retourne tout (dashboard)
- Frontend renderDocList : détecte la réponse paginée, affiche barre de
  navigation (préc./n°/suiv. + compteur "X–Y sur N")
- Dashboard : passe ?all=1 pour conserver les KPIs et la liste complète

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Refactoring
- Refactor: page Paramètres en onglets

Remplace la page monolithique (scroll infini, sections créées avec
.after() dans le désordre) par 8 onglets distincts avec persistance
de l'onglet actif (localStorage) :

  Entreprise / Documents / Email / Automatisations / SEPA
  / Sauvegarde* / Utilisateurs* / Sociétés*  (* = conditionnel)

- Chaque onglet est rendu à la demande (lazy) via une fonction dédiée
- Les forms CGV et mentions légales utilisent désormais la variable
  entreprise en mémoire au lieu de lire #entrepriseForm depuis le DOM
- Correction du bug SEPA : api.put() → api.post() (pas de route PUT)
- Les mises à jour de l'objet entreprise en mémoire évitent les
  incohérences entre onglets sans rechargement

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.13.0] — 2026-06-02

### Documentation
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: release 2.13.0 — changelog propre

Réécrit l'historique CHANGELOG depuis les tags (1.0.0 → 2.13.0) :
sections claires par version, sans commits bruts ni doublons.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.12.0] — 2026-06-02

### Corrigé
- Fix(signature): route publique /api/devis/signer/:token montée avant le middleware JWT

La route était bloquée par app.use('/api', authenticate) car montée
dans le router devis après le middleware global. Déplacée dans index.ts
avant authenticate ; doublon dans routes/devis.ts supprimé.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: manuel utilisateur complet v2.11.0 avec screenshots et exemples

- manuel-utilisateur.md : refonte complete (nouvelles fonctionnalites
  v2.10/v2.11, import/export CSV details, screenshots integres)
- docs/screenshots/ : 20 captures d ecran de l interface reelle
- docs/exemples/ : fichiers CSV d exemple clients et articles
- manuel-utilisateur.docx : genere par pandoc (1,4 Mo avec images)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]
- Docs: screenshots interface FacturPro v2.11.0 (20 captures)

Login, tableau de bord, clients, articles, factures/devis/avoirs,
statistiques KPIs, declaration TVA CA3, exercices comptables,
lettrage, archives, parametres (mentions legales, relances),
editeur WYSIWYG devis et factures, journal d audit, sauvegardes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: release 2.12.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.11.0] — 2026-06-02

### Ajouté
- Feat: priorités 2 et 3 — mentions légales, TVA déductible, relances auto, signature devis, Chorus Pro

## Priorité 2 — Mentions légales obligatoires (art. L441-9/L441-10 CCom)
- migration_019 : factures.numero_commande, escompte_taux, penalites_taux, indemnite_recouvrement,
  chorus_pro_id/statut ; entreprise.penalites_defaut, escompte_defaut, indemnite_defaut
- PDF factures : N° commande dans l'en-tête, mentions escompte + pénalités avant CGV
- XML Factur-X EN 16931 enrichi : BuyerReference, PaymentTerms, AllowanceCharge (escompte),
  TypeCode 381 pour avoirs, adresse vendeur/acheteur complète, notes facture
- WYSIWYG factures : champs N° commande et Escompte (%)
- Paramètres : section "Mentions légales obligatoires" avec valeurs par défaut

## Priorité 2b — TVA déductible CA3
- migration_020 : table tva_deductible (par entreprise et période)
- Route GET/PUT /api/stats/tva-deductible
- CA3 : section B saisissable avec calcul automatique du solde TVA à payer

## Priorité 3a — Relances automatiques
- migration_021 : entreprise.relance_auto_active/jours/heure + factures.derniere_relance/nb_relances
- RelanceScheduler : cron quotidien, filtre factures en retard depuis N jours, email automatique
- Paramètres : section "Relances automatiques" avec activation et configuration

## Priorité 3b — Signature électronique des devis
- migration_021 : devis.signature_token (UUID), signature_ip, signature_date, signature_nom
- Route POST /api/devis/:id/envoyer-lien-signature : email avec lien signable
- Route GET /api/devis/signer/:token (publique) : valide la signature, affiche page de confirmation

## Priorité 1 — Chorus Pro / e-invoicing
- ChorusProService : OAuth2 PISTE, dépôt Factur-X, consultation statut
- Routes POST /api/factures/:id/chorus-pro/deposer et GET /statut
- Bouton "Déposer Chorus Pro" dans les factures (actif si CHORUS_PRO_CLIENT_ID configuré)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: release 2.11.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.10.0] — 2026-06-02

### Ajouté
- Feat(exercices): clôture annuelle obligatoire loi anti-fraude TVA 2018

- migration_018 : table exercices (annee, entreprise_id, statut, hash_cloture)
- ExerciceService : ouvrir(), cloturer() avec hash SHA-256 du FEC, exporterFEC()
- Routes /api/exercices : GET, POST (ouvrir), POST /:annee/cloturer,
  GET /:annee/fec, GET /:annee/pv (PV de clôture PDF)
- FecExportService.exporterCSV() : filtre par entreprise_id + annee optionnelle
- Sidebar : entrée "Exercices" avec vue dédiée (liste, ouvrir, clôturer, télécharger PV)
- Double clôture bloquée côté service
- PV de clôture PDF : date, hash SHA-256, mention conformité art. 88 loi 2015-1785

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat(exercices): date_ouverture et date_cloture paramétrables (exercices non-civils)

- ExerciceService.ouvrir() : date_ouverture optionnelle (défaut 01/01/N)
- ExerciceService.cloturer() : date_cloture optionnelle (défaut 31/12/N)
- Route POST /api/exercices : accepte { annee, date_ouverture }
- Route POST /api/exercices/:annee/cloturer : accepte { date_cloture }
- Frontend : sélecteur de date de début à l'ouverture ; à la clôture, prompt
  pré-rempli avec le dernier jour de l'exercice (calculé depuis date_ouverture
  pour les exercices décalés ex. 01/04/N → 31/03/N+1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: release 2.10.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.9.1] — 2026-06-02

### Ajouté
- Feat: filtres devis/factures, visibilite commerciaux, sauvegarde gzip

- Filtres statut + alertes combinables sur devis et factures
- Colonne Validite avec badge expire sur devis
- Visibilite commerciaux : created_by sur devis (migration 015), voir_tout par user/societe (migration 016)
- Sauvegarde .sql.gz (gzip niveau 6, ~6x compression), restauration .sql/.sql.gz
- Fix express.d.ts : voir_tout dans Request.user

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat(installer): demander le nom de societe pendant l installation

Nouvelle page wizard Votre societe avec validation obligatoire.
CompanyName passe a Configure.ps1, injecte dans .env et NSSM.
createDefaultAdmin lit COMPANY_NAME pour creer la premiere societe
liee au super admin. Corrige le blocage Aucune societe accessible.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix(installer): corriger installation service Windows et ouverture du port

- Scripts .ps1 reecrits en ASCII pur (caracteres accentues causaient un crash
  silencieux de Configure.ps1 sous PowerShell 5.1)
- Find-PgBin : [version]'17' remplace par [int] (System.Version rejette les
  versions sans composant mineur)
- nssm stop/remove remplace par Stop-Service + sc.exe delete (nssm stop
  bloquait si le service etait en boucle de redemarrage)
- AppExit corrige : deux arguments separes au lieu d'une chaine unique
  (causait echec NSSM puis MessageBox invisible qui gelait le script)
- Regle pare-feu : profile=private -> profile=any
- Port par defaut 3000 -> 3001 dans le wizard et Configure.ps1
- Ajout storage\pdf dans [Dirs] et Configure.ps1
- Variables d'environnement injectees via AppEnvironmentExtra NSSM
- Dependance DependOnService postgresql-x64-* ajoutee automatiquement
- Toutes les commandes NSSM loguees dans install.log

fix(email): envoyerEmail utilise entreprise_id pour le bon SMTP multi-tenant

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(installer): toujours creer une base vierge a l installation

DROP DATABASE IF EXISTS + terminate connexions actives avant de recreer,
pour garantir une base propre meme en cas de reinstallation.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(installer): supprimer la creation en double des raccourcis

Les raccourcis etaient crees deux fois : par la section [Icons] d Inno Setup
et par Configure.ps1, resultant en deux icones. Suppression de la creation
manuelle dans Configure.ps1, [Icons] suffit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(installer): base prod facturpro isolee de la base de dev facturation

- Role et base renommes de facturation -> facturpro (evite la collision avec
  la base de dev sur les machines de developpement)
- Exec-Psql/Exec-PsqlTuples : ErrorActionPreference=Continue pendant l appel
  psql pour empecher un crash silencieux si le mdp postgres est incorrect
- Erreur explicite (MessageBox + log) si CREATE DATABASE echoue
- Logs detailles de chaque commande psql pour faciliter le diagnostic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(ui): sidebar overflow-x uniquement pour permettre le scroll vers Parametres

overflow:hidden masquait les items de navigation en bas de sidebar
(Articles, Archives, Lettrage, Parametres) sur les petits ecrans.
Remplace par overflow-x:hidden pour conserver le masquage lateral
lors du collapse tout en permettant le scroll vertical interne.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(security): corrections code review — conformité fiscale, isolation tenant, injections SQL

Race condition sur la chaîne de scellement (pg_advisory_xact_lock), atomicité de
emettre/marquerPayee/signer via withTransaction + propagation txClient aux services,
valid_date FEC corrigé (null → ''), injections SQL paramétrées dans lister/getAvoirsCumul,
isolation multi-tenant sur DELETE clients, archives (migration 017 + requirePerm),
PDF devis/factures protégés par requirePerm + filtre entreprise_id.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix(migration017): supprimer le backfill UPDATE bloqué par le trigger d'immutabilité

archive_documents est immuable (BEFORE UPDATE trigger check_archive_immutable).
Le UPDATE de backfill échouait au démarrage. Suppression du backfill :
les archives existantes ont entreprise_id=NULL et restent visibles uniquement
via super_admin; les nouvelles archives sont créées avec entreprise_id.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: recompile CHANGELOG — historique propre par version (1.0.0 → 2.9.1)

Remplace l'accumulation dans [Non publié] par des sections versionnées
pour chaque tag : 2.8.224, 2.9.0 et 2.9.1 ajoutées ; [Non publié] vidé.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Modifications
- Chore: release 2.8.224

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: mise a jour package-lock.json

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: release 2.9.0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore(installer): version 2.9.0 dans FacturPro.iss

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Chore: release 2.9.1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.7.218] — 2026-05-31

### Ajouté
- Feat: import/export CSV articles et clients

Backend
- src/server/utils/csv.ts : helpers toCSV(), parseCSV(), rowToObj()
  Format : UTF-8 BOM, separateur ;, champs entre guillemets si necessaire
- GET  /api/articles/export : CSV des articles actifs
- POST /api/articles/import : CSV -> insertion bulk (ON CONFLICT DO NOTHING)
- GET  /api/clients/export  : CSV des clients non-anonymises
- POST /api/clients/import  : CSV -> insertion bulk avec rapport d'erreurs

Frontend
- exportCSV(url, name) : fetch + download automatique du fichier
- importCSV(url, input, onSuccess) : upload multipart + rapport dans alert
- Boutons 'Exporter CSV' et 'Importer CSV' dans les vues Articles et Clients

Format CSV articles : Reference;Designation;Description;Unite;Prix_HT;
  Prix_Achat_HT;TVA_Pct;Stock;Actif
Format CSV clients : Type;Raison_sociale;...;Adresse;Code_postal;Ville;...

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: page Statistiques — KPIs, balance agee, evolution CA 12 mois

Backend (src/server/routes/stats.ts)
- GET /api/stats/kpis?periode=mois|trimestre|annee
  CA facture HT/TTC, encaisse, en attente, en retard, taux conversion devis
- GET /api/stats/balance-agee
  Creances emises non payees + synthese par tranche (non echu / 1-30j / 31-60j / 61-90j / 90j+)
- GET /api/stats/evolution
  CA facture HT vs encaisse HT par mois sur 12 mois glissants (avoirs deduits)

Frontend (app.js)
- Rubrique 'Statistiques' dans la barre de navigation (icone graphe)
- renderStats(el) : 5 KPI cards + graphique SVG barres 12 mois + balance agee
- Selecteur de periode (mois / trimestre / annee) sur les KPIs
- Graphique SVG natif (pas de dependance externe)
- Balance agee : resume par tranche code couleur + detail tabele

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: stats completes — montant moyen, pipeline, top clients, delai acceptation

Backend
- /api/stats/kpis : + montant_moyen_ht, delai_moyen_acceptation (180j)
- /api/stats/pipeline : entonnoir brouillons → envoyes → acceptes → factures
- /api/stats/top-clients : top 10 par CA HT sur l'annee, avec part %

Frontend
- 6 KPI cards : CA facture, montant moyen, encaisse, en attente, retard, conversion+delai
- Pipeline commercial : 4 etapes avec montants et fleches
- Top clients : barres horizontales, rouge si concentration >= 30%
- Layout en grille : KPIs + Pipeline/Balance + Graphique/Top + Balance detail

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: stats — DSO, tresorerie, top articles, marge, N/N-1, repartitions

Backend (5 nouvelles routes)
- /api/stats/tresorerie : DSO (jours moyens paiement) + previsions 90j groupees par semaine
- /api/stats/top-articles : top 10 articles par CA HT sur l'annee
- /api/stats/marge : taux de marque catalogue (articles avec prix achat)
- /api/stats/comparaison : CA mensuel N vs N-1 sur 12 mois
- /api/stats/repartitions : repartition CA par mode de reglement + ventilation TVA

Frontend (renderStats)
- svgDonut() : graphique camembert SVG natif pour les repartitions
- svgBarDouble() : graphique barres double couleur (N vs N-1)
- DSO + Previsions tresorerie (groupes En retard / Cette semaine / +)
- Comparaison N vs N-1 en barres doubles
- Top articles avec barres horizontales proportionnelles
- Marge catalogue : tableau taux marque code couleur (rouge<20% / orange<40% / vert)
- Repartition reglement : donut SVG avec legende
- Repartition TVA : tableau base HT + TVA par taux avec total

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: page Declaration TVA (CA3)

Backend
- GET /api/stats/ca3?annee=&mois=|trimestre= :
  TVA collectee par taux (hors avoirs), avoirs a deduire,
  operations franchise 293B, total brut et net, infos entreprise

Frontend
- Rubrique '📑 Declaration TVA' dans la barre de navigation
- renderDeclTVA(el) : formulaire CA3 imprimable
  - Selecteurs : periode (mensuelle/trimestrielle/annuelle), mois, annee
  - Section A : TVA collectee par taux + avoirs + franchise + totaux
  - Section B : TVA deductible (a remplir manuellement)
  - Section C : solde TVA a payer (a calculer apres saisie deductible)
  - Note d'avertissement sur la partie manuelle
  - Bouton Imprimer : CSS @media print masque l'interface
  - En-tete avec raison sociale, SIRET, TVA intracom

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: raccourcis clavier, drag&drop, CGV, notifications, relances, audit, attestation

Vague 1 — UX editeur
- Ctrl+S → sauvegarde, Ctrl+P → impression dans tous les editeurs WYSIWYG
- Drag & drop lignes : poignee ⠿, dragover outline, reordonnancement DOM
  avec recalcul totaux et sauts de page apres drop

Vague 2 — CGV / mentions legales
- migration_012 : cgv_texte + mention_legale sur entreprise
- drawCGV() dans FacturXService : rendu en 6.5pt en bas de chaque PDF
  (devis, facture, BL, acompte) si textes configures
- Section CGV dans Parametres Entreprise

Vague 3 — Notifications in-app
- GET /api/stats/notifications : compte factures en retard + devis expires
- Badges rouges/oranges sur les entrees Factures et Devis dans la sidebar
- Refresh automatique toutes les 5 minutes

Vague 4 — Relances clients
- Bouton '📨 Relancer' sur les factures emises en retard (echéance depassee)
- Modal avec email pre-rempli, objet et corps personnalisables, PDF joint
- POST /api/factures/:id/relancer → EmailService.envoyerEmail()

Vague 5 — Journal d'audit + Attestation
- migration_013 : table audit_log (entreprise, user, action, ressource, ip)
- logAudit() helper appele sur login, emettre, payer facture
- GET /api/audit : 200 dernieres entrees (admin)
- Page '🔍 Journal d audit' dans la sidebar
- GET /api/stats/attestation : document HTML imprimable conformite anti-fraude TVA
- Bouton 'Attestation' dans la topbar Factures

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: sidebar scroll, retard factures, conditions paiement client, fixes UX

- CSS sidebar-nav : overflow-y auto (Parametres n'etait plus visible)
- Liste factures : colonne Retard (jours de depassement), bouton filtre En retard, tri par echeance
- Conditions de paiement par client : migration 014, champ datalist dans la fiche client, pre-remplissage automatique dans l'editeur (conditions_paiement + date_echeance calculee)
- Relance : try/catch + feedback Ethereal si pas de SMTP configure
- imprimerDocEditor expose en global (bouton Imprimer toolbar ne fonctionnait pas)
- imprimerDocEditor : fallback via page.dataset.docId si .e-preview-btn absent
- CLAUDE.md : routes et services manquants documentes (sepa, lettrage, stats, audit, LettreService, migrations 003-013, avoirs)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: label import CSV en casse normale (text-transform:none)
- Fix: POST /api/entreprise sauvegarde cgv_texte et mention_legale
- Fix: attestation ouverte via blob URL avec JWT (window.open sans auth)
- Fix: Ctrl+S intercepte au niveau document (evite dialog Chrome)
- Fix: CSS print complet — masque UI edition, inputs en texte brut
- Fix: impression via PDF apercu (identique au PDF emis) au lieu de window.print()

- imprimerDocEditor(el) : ouvre /api/{type}/{id}/apercu dans un nouvel onglet
  via openPdf() avec authentification JWT — rendu pixel-perfect identique au PDF
- Bouton Imprimer et Ctrl+I utilisent desormais cette fonction
- Fallback window.print() si le document n'est pas encore sauvegarde
- page.dataset.docId mis a jour a la creation et apres le premier save

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: bouton Imprimer delegue au bouton Apercu PDF (meme rendu)


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: changelog v2.6.186 [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Ux: raccourcis clavier francais — Ctrl+E (Enregistrer), Ctrl+I (Imprimer)
- Revert: Ctrl+S pour enregistrer (Ctrl+E intercepté par Chrome)
- Chore: release 2.7.218

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Ci: add contents:write permission for release asset upload
- Ci: retry + fallback Chocolatey si nssm.cc indisponible


## [2.6.186] — 2026-05-31

### Ajouté
- Feat: sauts de page multi-documents — PDF et WYSIWYG

PDF (FacturXService)
- genererFacture (statique) : PAGE_SAFE_BOT=642, CONT_TOP=60, ROW_H=20+12
  descriptions rendues en 7pt, addPage si depassement
- genererFactureStream (apercu) : meme logique
- genererBLStream : PAGE_SAFE_BOT=690 (sigY=695), ROW_H=20, addPage si depassement

WYSIWYG (editor.js)
- refreshPageBreaks(el, type) : type-aware
  - devis/facture/avoir : PAGE_SAFE_BOT=642pt
  - bl : PAGE_SAFE_BOT=690pt
- page.dataset.docType stocke le type pour les handlers delete/add
- Tous les appels (chargement, ajout, suppression) passent le type

Verifications
- DEV-2026-0042 (22 lignes devis) : 2 pages PDF
- FAC-2026-0015 (22 lignes facture) : 2 pages PDF

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: calcul auto TVA intracommunautaire depuis le SIRET

Fonction tvaFromSiret(siret) :
  cle = (12 + 3 * (SIREN mod 97)) mod 97
  resultat = 'FR' + cle(2 chiffres) + SIREN

Declencheur : blur sur le champ SIRET, uniquement si TVA Intracom vide
Feedback visuel : fond vert 1,5s apres auto-remplissage

Applique dans :
- showClientForm() : formulaire complet Clients
- openQuickClientCreate() : formulaire rapide depuis l'editeur WYSIWYG
  (champ TVA Intracom ajoute au formulaire rapide)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: type d'avoir (a valoir / remboursement) + PUT factures

Migration 011 : colonne type_avoir TEXT DEFAULT 'valoir' sur factures

Backend
- FactureInput : champ type_avoir
- FactureService.creer() : insere type_avoir
- FactureService.mettreAJour() : nouvelle methode (edit brouillons)
- Route PUT /api/factures/:id : appelle mettreAJour()

WYSIWYG (editor.js)
- buildDocHTML avoir : select 'Type d avoir' (a valoir / remboursement)
  - Mode de reglement affiche uniquement si remboursement, masque sinon
  - Toggle onchange via closest('.a4-page')
- saveDoc avoir : type_avoir + mode_paiement conditionnel

PDF (FacturXService)
- genererFacture + genererFactureStream : mention 'Remboursement au client'
  affichee sous 'Avoir sur facture' si type_avoir === remboursement

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: plafonnement des avoirs par facture d'origine

Backend
- FactureService.getAvoirsCumul(origineId, excludeId?) :
  somme TTC des avoirs emis/payees sur une facture
- FactureService.emettre() : validation avant emission d'un avoir —
  bloque si montant > solde disponible avec message explicite
- Route GET /api/factures/:id/avoirs-cumul :
  { facture_ttc, avoirs_ttc, avoirs_nb, avoirs_numeros, disponible_ttc }

Frontend (WYSIWYG)
- Avoir editor : bandeau sous les totaux — facture origine / avoirs emis /
  disponible (vert si solde positif, rouge si epuise)
- Facture editor : badge dans la toolbar si des avoirs existent —
  total avoirs / solde disponible, numeros en tooltip

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: saut de page automatique dans le PDF devis

- PAGE_SAFE_BOT = 642pt (laisse 150pt pour sig + totaux)
- Avant chaque ligne : si y + hauteur_ligne > PAGE_SAFE_BOT → addPage()
  et redessin de l'entête tableau sur la nouvelle page (CONT_TOP = 60)
- Après la boucle : si y dépasse encore la zone footer → addPage()
- Description de ligne rendue en 7pt sous la désignation (+12pt par ligne)
- Hauteur de ligne variable : 20pt sans description, 32pt avec
- Signature + totaux toujours à bottomY=660 sur la dernière page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: sauts de page realistes dans le PDF et le WYSIWYG

PDF (FacturXService)
- Saut de page auto avant chaque ligne qui deborderait (PAGE_SAFE_BOT=642pt)
- En-tete tableau reimprime sur chaque nouvelle page (CONT_TOP=60pt)
- Description de ligne rendue en 7pt gris sous la designation (+12pt/ligne)
- Nouvelle page automatique si curseur depasse la zone footer apres la boucle
- DEV-2026-0042 (22 lignes) : 2 pages verifiees

WYSIWYG (editor.js + styles.css)
- refreshPageBreaks(el) : mesure les positions reelles avec getBoundingClientRect,
  insere des separateurs .e-page-break tous les 1122px (A4 a 96dpi)
- Appelee apres chargement initial, ajout de ligne, suppression de ligne
- CSS : ligne pointillee grise + label 'Page N' pour chaque coupure

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: sauts de page WYSIWYG alignes sur la logique PDF (en points)

Remplace la mesure CSS par une simulation identique a FacturXService :
- PAGE_SAFE_BOT=642pt, CONT_TOP=60pt, ROW_H=20pt, ROW_H_DESC=32pt
- startY = sepY+100 (250pt sans logo, 285pt avec)
- Meme algorithme que la boucle forEach du PDF : si y+rowH > PAGE_SAFE_BOT
  → insere le separateur, repart a y=CONT_TOP sur la page suivante
- data-desc='1' sur les tr avec description pour capter le bon rowH
- Le saut de page WYSIWYG correspond desormais exactement au saut PDF

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: badge Acquittee a gauche des totaux, meme niveau

Avant : badge pleine largeur positionne a BOTTOM-60 ou dynamiquement,
debordant sur le separateur (BOTTOM-44) et les totaux.

Apres : zone gauche x=50→320 / y=BOTTOM-44→BOTTOM (44pt de haut),
aligne exactement sur la bande des totaux (droite x=340→545).
- Fond vert clair (#E8F5E9), bordure fine (#A5D6A7)
- Ligne 1 : 'ACQUITTEE' en gras (10pt)
- Ligne 2 : date + mode de paiement (8pt)
- Mention TVA speciale deplacee de BOTTOM-44 a BOTTOM-60
  pour liberer le slot occupe par le badge

Applique dans genererFacture (PDF emis) et genererFactureStream (apercu).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: WYSIWYG facture payee — echeance, conditions, mode reglement

1. Date echeance : masquee quand statut=payee (condition !isPaid ajoutee)
   Remplacee par 'Payee le DD/MM/YYYY' en vert dans les metaFields gauche

2. Conditions de paiement : masquees dans le footer quand facture payee
   Seules les Notes restent visibles (informations toujours utiles)

3. Mode de reglement : MODES_PAIEMENT[] centralise avec valeurs explicites
   identiques a payerFacture() dans app.js (virement/carte/cheque…)
   Quand payee : affiche un label texte vert a la place du select
   Evite le mismatch 'carte' vs 'carte_bancaire' qui causait le
   remplacement par le mode par defaut du client (prelevement_sepa)

4. fmt.modePaiement : labels complets pour tous les codes (virement_sepa,
   prelevement_sepa, carte, etc.) dans les listes et le dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: masquer date echeance sur le PDF des factures payees

genererFacture (PDF emis) et genererFactureStream (apercu) :
condition ajoutee : facture.date_echeance && facture.statut !== 'payee'
Une facture acquittee n'a plus d'echeance pertinente a afficher.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: factures d'avoir — libelle et echeance

PDF (genererFacture + genererFactureStream)
- Titre : 'AVOIR' → 'FACTURE D\'AVOIR'
- Stream : ajout detection isAvoirFS + affichage 'Avoir sur facture N°'
- Echeance : masquee sur les avoirs (condition && !isAvoir ajoutee)

WYSIWYG (editor.js)
- DOC_LABELS.avoir : 'AVOIR' → 'FACTURE D\'AVOIR'
- L'echeance etait deja masquee via la condition !isAvoir existante

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: avoirs ouverts avec le bon type dans l'editeur

Cause : DOC_CONFIG avoirs utilisait DocEditor.openFacture(id)
-> l'avoir s'ouvrait avec type='facture', isAvoir=false
-> label 'FACTURE' au lieu de 'FACTURE D\'AVOIR', echeance visible

Correctif :
- editor.js : openAvoirById(id) -> open('avoir', id) dans l'API publique
- app.js : rowOpen et bouton Voir/Modifier utilisent openAvoirById()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: cache-busting JS — force rechargement editor.js et app.js
- Fix: sauts de page WYSIWYG BL — mesure DOM reelle

Les lignes BL affichent la description dans un div visible (~50px/ligne)
alors que le calcul PDF utilisait 20pt fixe -> pas de saut pour 20 lignes.

refreshPageBreaks(el, type) :
- BL : mesure getBoundingClientRect() des lignes DOM
  PAGE_PX=1122 / FOOTER_PX=160 -> break a 962px depuis le haut de page
- devis/facture/avoir : inchange (calcul PDF en points, deja calibre)

makeBLRow : data-desc='1' si la ligne a une description (coherence)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: saut de page BL WYSIWYG — break apres les lignes si notes debordent

Retour au calcul PDF en points pour les BL (PAGE_SAFE_BOT=690pt, ROW_H=20pt).
Apres la boucle lignes : si y + NOTES_MARGIN(50pt) > PAGE_SAFE_BOT,
la section notes+signature deborde -> break insere apres la derniere ligne.

Pour BL-2026-0015 (20 lignes) :
  y = 272 + 20x20 = 672pt, 672+50=722 > 690 -> break apres ligne 20
Correspond au PDF : lignes sur page 1, notes+signature sur page 2.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: avoir remboursement — prelevement_sepa converti en virement_sepa

Un remboursement ne peut pas transiter par prelevement SEPA (sens inverse).
Correction automatique prelevement_sepa -> virement_sepa :
- WYSIWYG : onchange type_avoir, si mode = prelevement_sepa, bascule sur virement_sepa
- FactureService.creer() : correction a la creation
- FactureService.mettreAJour() : correction a la sauvegarde

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: fermer l'onglet du document supprime

tabMgr.closeTabByDocId(id) : cherche le tab doc avec docId===id et le ferme.
Appele avant openViewTab() dans toutes les fonctions de suppression :
deleteDevis, deleteAvoir, deleteAcompte, supprimerBL, deleteClient, deleteArticle

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: manuel v2.6 — avoirs, factures payees, sauts de page, TVA auto

- Avoirs : type d'avoir (a valoir/remboursement), plafonnement cumulatif,
  suppression brouillons, conversion prelevement->virement SEPA
- Factures payees : badge acquittee a gauche des totaux, masquage
  echeance/conditions dans le WYSIWYG
- Editeur : bouton Imprimer avec libelle, indicateurs de saut de page,
  fermeture automatique d'onglet a la suppression
- Clients : calcul auto TVA intracommunautaire depuis le SIRET

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Modifications
- Ux: bouton Imprimer avec libelle texte (🖨️ Imprimer)


## [2.5.148] — 2026-05-31

### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: manuel v2.5 — prix achat/marge articles + installation port

- Catalogue articles : champ prix achat HT, tableau indicateurs de marge
  (marge brute, taux de marque, taux de marge), note confidentialite
- Nouvelle section Installation Windows : 3 pages de l'assistant,
  configuration du port TCP, service, desinstallation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.5.146] — 2026-05-31

### Ajouté
- Feat: prix d'achat HT et calcul de marge sur les articles

- migration_010 : colonne prix_achat_ht FLOAT8 sur articles
- ArticleService : prix_achat_ht dans creer() et mettreAJour()
- Liste articles : colonnes Prix achat HT + Marge (brute + taux de marque)
  en vert si positive, rouge si negative
- Formulaire article : champ Prix achat HT + widget marge en temps reel
  (marge brute, taux de marque, taux de marge) mis a jour a chaque frappe

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: port d'ecoute configurable dans l'installeur

- Nouvelle page 'Configuration du serveur' dans l'assistant Inno Setup
- Valeur par defaut : 3000, validation 1024-65535
- Port transmis a Configure.ps1 via -Port
- Configure.ps1 : PORT dans .env, regle pare-feu, raccourcis et
  message de fin utilisent le port saisi

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Chore: licence AGPL v3 + mise a jour README

- LICENSE : texte officiel GNU AGPL v3.0
- README  : badge licence, version courante v2.4.140, fonctionnalites a jour

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.4.140] — 2026-05-30

### Ajouté
- Feat: lettrage comptable (compte 411, auto + manuel)

Backend
- LettreService : generation lettres A→Z→AA…, lettrerPaiement,
  lettrerAvoir, lettrer (manuel avec controle equilibre), delettrer
- FecExportService.enregistrerPaiement : ecritures journal BQ
  (debit 512/530/5112 + credit 411) a chaque paiement
- FactureService.marquerPayee : enregistrerPaiement + lettrerPaiement
- FactureService.emettre : lettrerAvoir automatique quand avoir
  lie a une facture d'origine

Route /api/lettrage
- GET /          : ecritures 411 avec statut lettrage par entreprise
- POST /lettrer  : lettrage manuel (validation debit = credit a 0.01 pres)
- DELETE /:let   : delettrage

Frontend
- Sidebar : entree 'Lettrage' (icone balance)
- renderLettrage : vue par client, non-lettrees vs lettrees groupees,
  boutons 'Lettrer selection' / 'Tout lettrer' / 'Delettrer par lettre'
- Solde non-lettré en rouge (impayé) ou vert (soldé)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: sauvegarde des champs SEPA manquants dans les routes API

- PUT /api/clients/:id : ajout iban, bic, titulaire_compte, mandat_rum,
  mandat_date, mandat_type, mode_reglement_defaut, adresse2
- POST /api/entreprise : ajout iban, bic, ics

Ces champs etaient inseres en DB (migrations 005-008) et affiches
dans les formulaires frontend, mais le backend ne les persistait pas.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: cache-busting favicon ?v=2


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: lettrage dans le manuel utilisateur

- Section dédiée : concept, automatique, page UI, manuel, impact FEC
- Factures : paiement déclenche écritures BQ + lettrage auto
- Avoirs : émission sur facture origine déclenche lettrage auto

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


## [2.3.133] — 2026-05-30

### Ajouté
- Feat: icone FacturPro (SVG + ICO multi-resolution)

- facturpro.svg : document blanc + lettre F + badge euro vert
- facturpro.ico : 7 resolutions (16 a 256px) via sharp
- index.html : favicon <link rel="icon">
- FacturPro.iss : SetupIconFile, UninstallDisplayIcon, raccourcis bureau/menu

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: mise à jour manuel utilisateur v2.0-v2.2

Couvre toutes les fonctionnalités ajoutées depuis v2.0 :
- Interface WYSIWYG (éditeur A4, onglets persistants, tableau de bord)
- Avoirs (création, émission, règles comptables)
- Flux devis : accepté → BL → facture, passage prospect→client
- Prélèvements SEPA (pain.008.001.02, prérequis ICS, workflow)
- Clients : adresse2, mode règlement par défaut, section SEPA
- Entreprise : coordonnées bancaires SEPA (IBAN/BIC/ICS)
- Articles : stock et numéro de série
- Envoi groupé de factures, création facture depuis BL
- Factur-X EN 16931 explicité en section conformité

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Docs: update CHANGELOG.md [skip ci]


## [2.2.129] — 2026-05-30

### Ajouté
- Feat: boutons Émettre + Envoyer dans l'éditeur WYSIWYG pour les factures brouillon
- Feat: tri sur les en-têtes de colonnes dans toutes les listes de documents

- renderDocList : tri cliquable via DOC_CONFIGS.sortKeys
- _listSort[type] : état de tri persisté par type pendant la session
- Indicateurs ▲/▼ sur la colonne active
- CSS : .list-th hover sur primary-light
- sortKeys ajoutés : devis, factures, avoirs, acomptes, BL
- Feat: BL → Facture WYSIWYG — bouton '🧾 → Facture' pour tous les BL émis/livrés

- DOC_CONFIGS BL : bouton '🧾 → Facture' pour statut emis ou livre (pas seulement les liés)
- factureFromBL(blId) : charge le BL, ouvre l'éditeur facture pré-rempli (client + lignes sans prix)
- DocEditor.openFacture(id, prefill) : accepte maintenant un prefill pour les lignes
- Feat: bouton '🧾 → Facture' dans l'éditeur WYSIWYG des BL (émis et livré)
- Feat: envoi groupé de factures

- Cases à cocher sur les factures émises/payées
- Bouton 'Envoyer la sélection (N)' apparaît dans la topbar
- Modal récapitulative avec choix du mode (SMTP/MAPI/mailto)
- Route POST /api/factures/:id/envoyer (récupère l'email du client auto)
- Barre de progression + résumé envois ok/erreur
- Feat: SIRET formaté en xxx xxx xxx xxxxx partout (éditeur, PDF x5, listes)
- Feat: acceptation devis → client passe de 'prospect' à 'client' (RGPD)
- Feat: fiche client — section SEPA (IBAN, BIC, mandat RUM/date/type)

- Migration 006 : colonnes iban, bic, titulaire_compte, mandat_rum, mandat_date, mandat_type
- Formulaire client : section <details> 'Mandat SEPA' collapsible
- Sauvegarde automatique via FormData (PUT/POST déjà en place)
- Feat: génération fichier SEPA pain.008.001.02

- Migration 007 : iban, bic, ics sur entreprise
- Route POST /api/sepa/generer → XML pain.008.001.02 téléchargeable
- Paramètres → section '🏦 Prélèvement SEPA' (ICS, IBAN, BIC société)
- Liste factures → bouton '🏦 Prélèvement SEPA' sur sélection cochée
- Modal : date d'exécution + séquence FRST/RCUR/FNAL/OOFF
- Vérifications : ICS requis, clients avec IBAN/BIC/RUM/date mandat
- Feat: mode de règlement par défaut client + sélection SEPA automatique

- Migration 008 : mode_reglement_defaut TEXT sur clients
- Fiche client : dropdown mode règlement (virement, virement_sepa, prelevement_sepa★, chèque…)
- Éditeur facture : mode_paiement pré-rempli à la sélection du client
- Liste factures : bouton '🏦 Sélect. SEPA' filtre les clients prelevement_sepa
- API /api/factures : inclut mode_reglement_defaut dans le listing
- Workflow : client → mode_reglement_defaut → facture auto-remplie → SEPA groupé


### Corrigé
- Fix: bouton Enregistrer commence en '✓ Enregistré' pour les docs existants
- Fix: totaux PDF alignés sur BOTTOM=744 pour facture, aperçu facture et acompte

- genererFacture : BOTTOM=744, lineBreak:false, HT→TVA→TTC de haut en bas
- genererFactureStream : même alignement (aperçu live)
- genererAcompteStream : même alignement, mention Encaissé repositionnée
- feat: bouton Émettre + Envoyer dans l'éditeur WYSIWYG pour les factures brouillon
- Fix: migration 005 adresse2 clients + SQL copiés dans dist à chaque build

- migration_005_client_adresse2.sql : ADD COLUMN IF NOT EXISTS adresse2
- database.ts : MIGRATION5_PATH enregistré
- package.json : npm run build copie aussi src/server/db/*.sql → dist/server/db/
- Fix: bouton Émettre déplacé en dernier (droite) dans toolbar facture
- Fix: ordre logique toolbar facture — Émettre avant Envoyer
- Fix: client professionnel sans raison_sociale — fallback sur nom/prénom

Affecte l'éditeur et les 6 générateurs PDF (facture, aperçu, devis, BL, acompte, XML)
- Fix: bouton '→ Facture' visible pour tous les statuts BL (y compris brouillon)
- Fix: client pré-rempli dans l'éditeur même hors clientOptions (fetch direct /api/clients/:id)
- Fix: suppression mention 'Bon pour accord' dans les BL (éditeur + PDF)
- Fix: BL livré n'est plus en lecture seule (pas d'obligation légale d'inaltérabilité)
- Fix: bloc client 240px aligné à gauche du logo (margin-left:auto + align-items:flex-start)


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Ux: Émettre en blanc (btn-outline) + badge ✓ Émis vert figé après émission
- Ux: bouton unique 'Émettre & Envoyer' — émet puis ouvre la modal d'envoi
- Ux: liste factures — Émettre & Envoyer fusionnés + badge ✓ Émis vert

- Brouillon : bouton 'Émettre & Envoyer' (outline) → émet puis ouvre modal envoi
- Émise/Payée : badge '✓ Émis' vert figé + '✉ Envoyer' séparé
- Cohérent avec l'éditeur WYSIWYG
- S'applique aussi au tableau de bord (via DOC_CONFIGS)


## [2.1.81] — 2026-05-30

### Ajouté
- Feat: statut devis 'accepte' + bouton ✔ Accepté + BL prioritaire

- Nouveau statut 'accepte' (entre 'envoye' et 'signe', non verrouillé)
- Bouton '✔ Accepté' sur les devis envoyés
- Badge vert 'accepte' dans les listes
- Bouton '🚚 → BL' mis en avant (btn-primary) quand devis accepté
- Route POST /api/devis/:id/accepter
- DevisService.changerStatut étendu au statut 'accepte'

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Feat: bouton Accepter/Accepté toggle dans toolbar devis WYSIWYG

- Toujours visible : 'Accepter' (outline blanc) → clic → statut 'accepte'
- Après acceptation : '✓ Accepté' (vert, non cliquable) + '🚚 → BL' (prioritaire)
- Signé : '✓ Accepté' (vert figé) + Avenant · Facturer · BL
- Feat: client recherche filtrante dans l'éditeur + Nouveau client en bas

- Remplace le <select> client par un champ de recherche filtrant
- Dropdown avec les clients correspondants + '+ Nouveau client' en gras
- Fonctionne dans devis, factures, avoirs et BL
- Feat: composant SearchSelect générique réutilisable

- src/client/js/components.js : SearchSelect(container, opts)
  Items filtrables, option 'Créer', alignement gauche/droite,
  valeur initiale, callback onSelect/onCreate, API setValue/getValue
- Remplace initClientSearch dans l'éditeur
- CSS .ss-* propre et isolé
- Chargé avant app.js dans index.html
- Feat: devis gratuit coché par défaut à la création
- Feat: adresse2 client + alignement gauche + PDF unifié

- Formulaire client : champ 'Complément d'adresse' (adresse2)
- renderClientPreview : adresse2 sur sa propre ligne, vide = supprimé
- e-client-preview : text-align:left (lignes alignées à gauche)
- PDF : helper drawClientBlock() → adresse2 dans les 5 générateurs PDF
  (facture, avoir, acompte, devis, BL)


### Corrigé
- Fix: Express v5 catch-all route + Voir/Modifier + bouton imprimer

- Express 5 : 'app.get(*' → 'app.get(/{*path}' (Dependabot upgrade)
- Boutons 'Modifier' → 'Voir/Modifier' (non verrouillé) / 'Voir' (verrouillé)
- Bouton 🖨️ dans tous les éditeurs WYSIWYG (devis, facture, BL, acompte)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: syntax error in app.js (orphan template literals + Express v5 route)
- Fix: restore active tab last + bouton Accepté dans toolbar WYSIWYG

- Session restore : tab actif ouvert en dernier pour garder le focus
- Bouton '✔ Accepté' dans la toolbar de l'éditeur pour devis envoyés

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: conserver l'ordre des onglets au rafraîchissement (activateByKey)
- Fix: npm run build copie automatiquement src/client → dist/client
- Fix: cache-busting sur scripts JS/CSS
- Fix: sauvegarde draft forcée au beforeunload (rafraîchissement immédiat)
- Fix: champ de recherche client correctement rendu dans l'éditeur
- Fix: </div> parasite dans e-client-block cassait le layout A4
- Fix: autocomplete flottant + badges statuts acompte/BL manquants

- Autocomplete article : fermeture sur clic extérieur et visibilitychange
- Badges CSS ajoutés : en_attente, encaisse, emis, livre
- fmt.badge() : labels lisibles (En attente, Encaissé, Émis, Livré…)
- Fix: prix ligne = 1 par défaut, N° doc mis à jour après save, calcul immédiat

- makeLigneRow : prix unitaire ?? 1 (au lieu de vide) pour les nouvelles lignes
- Calcul immédiat (calcLigne + calcTotaux) à l'ajout d'une ligne
- saveDoc : met à jour e-doc-numero et titre onglet après enregistrement
- Badges manquants corrigés, autocomplete flottant corrigé
- Fix: alignement à droite des colonnes numériques dans l'éditeur (Qté, PU, Remise, TVA, Total HT)
- Fix: N° devis mis à jour après save + id mutable (évite création dupliquée)

- id mutable via page.dataset.docId : le 2ème save fait un PUT, pas un POST
- N° et titre onglet mis à jour après enregistrement
- Total HT lignes en gras sur une ligne
- Fix: Total HT sur une ligne (NBSP + colonne 14%)
- Fix: alignement droite colonnes numériques + calcul auto après autocomplete article

- En-têtes Qté/PU/Remise/TVA en nowrap (plus de coupure sur 2 lignes)
- inputs numériques text-align:right dans leurs cellules
- Autocomplete article : dispatchEvent input sur puInput et tvaSelect → calcul immédiat du Total HT
- Fix: text-align:right inline sur inputs numériques + cache-busting v2
- Fix: calcul Total HT — calcLigne appelé à l'init et sur article-selected

- calcLigne(row) appelé pour chaque ligne au chargement (évite 0,00 € initial)
- article-selected déclenche calcLigne + calcTotaux directement
- vertical-align:top sur e-td-total (montant aligné en haut)
- Fix: N° devis persisté après rechargement — promoteTab met à jour le docId

Après le premier save d'un nouveau document :
- el.dataset.docKey passe de 'new-devis-...' au vrai ID
- tabMgr.promoteTab() met à jour le tab dans le store → saveTabState persiste le bon ID
- Au rechargement, DocEditor.openDevis(realId) est appelé → document chargé avec son N°
- Draft localStorage nettoyé (clearDraft dans saveDoc)
- Fix: Total TTC aligné en bas du cadre signature (justify-content: flex-end)
- Fix: suppression ligne séparatrice et pied légal (société/SIRET)
- Fix: PDF devis — Total TTC aligné sur le bas du cadre signature

- DEVIS_TOTAL_BOTTOM = sigTop + sigBoxH (bas exact du cadre)
- Totaux dessinés de bas en haut : TTC en bas, TVA+HT au-dessus
- Séparateur horizontal à 44pt au-dessus du TTC
- Même logique que pour les factures (BOTTOM fixe)
- Fix: PDF devis 1 page — bottomY=660, lineBreak:false, TTC en bas du cadre sig


### Documentation
- Docs: link CHANGELOG in README, mention v2.0.9
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Ci: auto-generate CHANGELOG.md with git-cliff on each push
- Ci: fix git-cliff install (Debian Buster EOL, use binary)
- Ci: fix git-cliff URL (resolve version dynamically)
- Ci: fix cliff.toml footer template (null version guard)
- Ux: Accepter reste sur la page, toolbar se met à jour en place
- Ux: bouton Enregistrer reste sur la page, devient vert après save

- saveDoc retourne true/false sans fermer l'onglet
- Bouton 'Enregistrer' → '✓ Enregistré' (vert, figé) après succès
- Toute modification remet le bouton en 'Enregistrer' (rouge primaire)
- Nouveau document : titre de l'onglet mis à jour avec le numéro créé


### Refactoring
- Refactor: boutons contextuels devis dans toolbar WYSIWYG, listes simplifiées

Listes (dashboard, devis, détail) : Voir/Modifier · PDF · Envoyer · 🗑️ uniquement
Éditeur WYSIWYG :
  - brouillon/envoyé (edit) : ✔ Accepté · Signer · ✉ Envoyer
  - accepté (edit) : 🚚 → BL · 🧾 Facturer · Signer
  - signé (lecture) : 📝 Avenant · 🧾 Facturer · 🚚 BL

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Refactor(A): editor.js réécrit — -400 lignes, architecture unifiée

- ROUTES/LIST_VIEWS/DOC_LABELS : lookup tables remplaçant les ternaires
- buildLogoHTML() : helper partagé (était dupliqué 3x)
- buildCompanyHeader() : bloc société partagé (était dupliqué 3x)
- buildDocHTML() : template unique pour devis/facture/avoir/BL
  (remplace buildHTML + buildBLHTML)
- initDoc() : init unifiée pour tous les types
  (remplace initEditor + wiring openBL inline)
- saveDoc() : sauvegarde unifiée pour tous les types
  (remplace saveDoc devis/facture + save BL inline)
- open() : entrée unique pour tous les types sauf acompte
  (remplace open + openBL)
- 1076 → 676 lignes (-37%)
- Refactor(B): app.js — DOC_CONFIGS + renderDocList unifié

- btn.{outline,success,primary,warning,trash} : helpers partagés
- DOC_CONFIGS[type] : config déclarative par type (api, topbar, colonnes, actions)
- renderDocList(type, el) : remplace renderDevis/Factures/Avoirs/Acomptes/BL
- renderDashRows : utilise DOC_CONFIGS.actions au lieu de 60 lignes inline
- Suppression de 7 fonctions obsolètes : renderDevis, tableDevis,
  renderFactures, tableFactures, renderBonsLivraison, renderAvoirs, renderAcomptes
- -192 lignes supprimées, 0 duplication boutons entre listes et dashboard


## [2.0.9] — 2026-05-30

### Ajouté
- Feat: embed Factur-X XML inside PDF (pdf-lib post-processing)

- Install pdf-lib 1.17.1
- embedFacturXML() : attache factur-x.xml dans le PDF avec AFRelationship=Alternative
- Métadonnées XMP PDF/A-3b + profil MINIMUM Factur-X
- Entrée /AF dans le catalogue PDF
- PDFs existants migrés (FAC-2026-0001 à 0007)
- Suppression du fichier _facturx.xml séparé

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Documentation
- Docs: add CHANGELOG.md for v1.0.0 and v2.0.8


## [2.0.8] — 2026-05-30

### Ajouté
- Feat: v2.0 — WYSIWYG editor, avoirs, stock, N° série, persistence session

- Editeur WYSIWYG A4 pour devis, factures, avoirs et BL (editor.js)
- Avoirs : numerotation AV-, lien facture_origine, vue dédiée sidebar
- Stock articles (quantite_stock) + N° de série sur lignes facture/BL
- Unité article : select avec unités courantes + champ libre
- Suppression sécurisée : devis, acomptes, avoirs, BL, clients (contrôle de chaînage)
- Persistance session : onglets + brouillons non sauvegardés (localStorage + auto-save)
- Tableau de bord : liste chronologique unifiée triable (type/client/montant/statut/date)
- Sidebar collapsible avec bouton toggle persisté
- Navigation onglets : flèches gauche/droite + scroll molette
- Impression et PDF : totaux et signature ancrés en bas de page
- Migrations 003 (avoir) et 004 (stock/série)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Dépendances
- Bump the dev-dependencies group with 2 updates

Bumps the dev-dependencies group with 2 updates: [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/HEAD/types/node) and [typescript](https://github.com/microsoft/TypeScript).


Updates `@types/node` from 20.19.41 to 25.9.1
- [Release notes](https://github.com/DefinitelyTyped/DefinitelyTyped/releases)
- [Commits](https://github.com/DefinitelyTyped/DefinitelyTyped/commits/HEAD/types/node)

Updates `typescript` from 5.9.3 to 6.0.3
- [Release notes](https://github.com/microsoft/TypeScript/releases)
- [Commits](https://github.com/microsoft/TypeScript/compare/v5.9.3...v6.0.3)

---
updated-dependencies:
- dependency-name: "@types/node"
  dependency-version: 25.9.1
  dependency-type: direct:development
  update-type: version-update:semver-major
  dependency-group: dev-dependencies
- dependency-name: typescript
  dependency-version: 6.0.3
  dependency-type: direct:development
  update-type: version-update:semver-major
  dependency-group: dev-dependencies
...

Signed-off-by: dependabot[bot] <support@github.com>
- Merge pull request #1 from swarmnode/dependabot/npm_and_yarn/dev-dependencies-6cf85894ce
- Bump the production-dependencies group with 4 updates

Bumps the production-dependencies group with 4 updates: [dotenv](https://github.com/motdotla/dotenv), [express](https://github.com/expressjs/express), [nodemailer](https://github.com/nodemailer/nodemailer) and [pdfkit](https://github.com/foliojs/pdfkit).


Updates `dotenv` from 16.6.1 to 17.4.2
- [Changelog](https://github.com/motdotla/dotenv/blob/master/CHANGELOG.md)
- [Commits](https://github.com/motdotla/dotenv/compare/v16.6.1...v17.4.2)

Updates `express` from 4.22.2 to 5.2.1
- [Release notes](https://github.com/expressjs/express/releases)
- [Changelog](https://github.com/expressjs/express/blob/master/History.md)
- [Commits](https://github.com/expressjs/express/compare/v4.22.2...v5.2.1)

Updates `nodemailer` from 8.0.8 to 8.0.10
- [Release notes](https://github.com/nodemailer/nodemailer/releases)
- [Changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md)
- [Commits](https://github.com/nodemailer/nodemailer/compare/v8.0.8...v8.0.10)

Updates `pdfkit` from 0.15.2 to 0.18.0
- [Release notes](https://github.com/foliojs/pdfkit/releases)
- [Changelog](https://github.com/foliojs/pdfkit/blob/master/CHANGELOG.md)
- [Commits](https://github.com/foliojs/pdfkit/compare/v0.15.2...v0.18.0)

---
updated-dependencies:
- dependency-name: dotenv
  dependency-version: 17.4.2
  dependency-type: direct:production
  update-type: version-update:semver-major
  dependency-group: production-dependencies
- dependency-name: express
  dependency-version: 5.2.1
  dependency-type: direct:production
  update-type: version-update:semver-major
  dependency-group: production-dependencies
- dependency-name: nodemailer
  dependency-version: 8.0.10
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: production-dependencies
- dependency-name: pdfkit
  dependency-version: 0.18.0
  dependency-type: direct:production
  update-type: version-update:semver-minor
  dependency-group: production-dependencies
...

Signed-off-by: dependabot[bot] <support@github.com>
- Merge pull request #2 from swarmnode/dependabot/npm_and_yarn/production-dependencies-ff7444bb64


### Modifications
- Add installer build workflow + installer scripts (fix gitignore)


## [1.0.0] — 2026-05-30

### Dépendances
- Add README, CI workflow, issue templates, dependabot


### Modifications
- Initial commit — FacturPro SaaS devis/facturation France


[3.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v3.0.0
[2.20.11]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.11
[2.20.9]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.9
[2.20.8]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.8
[2.20.7]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.7
[2.20.6]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.6
[2.20.5]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.5
[2.20.4]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.4
[2.20.2]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.2
[2.20.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.20.0
[2.19.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.19.0
[2.18.4]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.18.4
[2.18.1]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.18.1
[2.17.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.17.0
[2.16.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.16.0
[2.15.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.15.0
[2.14.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.14.0
[2.13.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.13.0
[2.12.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.12.0
[2.11.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.11.0
[2.10.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.10.0
[2.9.1]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.9.1
[2.7.218]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.7.218
[2.6.186]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.6.186
[2.5.148]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.5.148
[2.5.146]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.5.146
[2.4.140]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.4.140
[2.3.133]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.3.133
[2.2.129]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.2.129
[2.1.81]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.1.81
[2.0.9]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.9
[2.0.8]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.8
[1.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v1.0.0

