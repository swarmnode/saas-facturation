# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]

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


### Documentation
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


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


[2.5.148]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.5.148
[2.5.146]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.5.146
[2.4.140]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.4.140
[2.3.133]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.3.133
[2.2.129]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.2.129
[2.1.81]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.1.81
[2.0.9]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.9
[2.0.8]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.8
[1.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v1.0.0

