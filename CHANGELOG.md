# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]


## [2.9.1] — 2026-06-02

### Corrigé
- fix(security): corrections code review — conformité fiscale, isolation tenant, injections SQL
- fix(migration017): supprimer le backfill UPDATE bloqué par le trigger d'immutabilité

### Modifications
- chore(installer): version 2.9.1 dans FacturPro.iss
- chore: release 2.9.1


## [2.9.0] — 2026-06-02

### Ajouté
- feat: filtres devis/factures, visibilite commerciaux, sauvegarde gzip
- feat(installer): demander le nom de societe pendant l installation

### Corrigé
- fix(installer): corriger installation service Windows et ouverture du port
- fix(installer): toujours creer une base vierge a l installation
- fix(installer): supprimer la creation en double des raccourcis
- fix(installer): base prod facturpro isolee de la base de dev facturation
- fix(ui): sidebar overflow-x uniquement pour permettre le scroll vers Parametres

### Modifications
- chore: release 2.9.0


## [2.8.224] — 2026-05-31

### Ajouté
- feat: filtres devis/factures, visibilite commerciaux, sauvegarde gzip

### Modifications
- chore: release 2.8.224


## [2.7.218] — 2026-05-31

### Ajouté
- Feat: import/export CSV articles et clients
- Feat: page Statistiques — KPIs, balance agee, evolution CA 12 mois
- Feat: stats completes — montant moyen, pipeline, top clients, delai acceptation
- Feat: stats — DSO, tresorerie, top articles, marge, N/N-1, repartitions
- Feat: page Declaration TVA (CA3)
- Feat: raccourcis clavier, drag&drop, CGV, notifications, relances, audit, attestation
- Feat: sidebar scroll, retard factures, conditions paiement client, fixes UX

### Corrigé
- Fix: label import CSV en casse normale (text-transform:none)
- Fix: POST /api/entreprise sauvegarde cgv_texte et mention_legale
- Fix: attestation ouverte via blob URL avec JWT (window.open sans auth)
- Fix: Ctrl+S intercepte au niveau document (evite dialog Chrome)
- Fix: CSS print complet — masque UI edition, inputs en texte brut
- Fix: impression via PDF apercu (identique au PDF emis) au lieu de window.print()
- Fix: bouton Imprimer delegue au bouton Apercu PDF (meme rendu)

### Modifications
- Ux: raccourcis clavier francais — Ctrl+E (Enregistrer), Ctrl+I (Imprimer)
- Revert: Ctrl+S pour enregistrer (Ctrl+E intercepté par Chrome)
- Ci: add contents:write permission for release asset upload
- Ci: retry + fallback Chocolatey si nssm.cc indisponible
- Chore: release 2.7.218


## [2.6.186] — 2026-05-31

### Ajouté
- Feat: sauts de page multi-documents — PDF et WYSIWYG
- Feat: calcul auto TVA intracommunautaire depuis le SIRET
- Feat: type d'avoir (a valoir / remboursement) + PUT factures
- Feat: plafonnement des avoirs par facture d'origine

### Corrigé
- Fix: saut de page automatique dans le PDF devis
- Fix: sauts de page realistes dans le PDF et le WYSIWYG
- Fix: sauts de page WYSIWYG alignes sur la logique PDF (en points)
- Fix: badge Acquittee a gauche des totaux, meme niveau
- Fix: WYSIWYG facture payee — echeance, conditions, mode reglement
- Fix: masquer date echeance sur le PDF des factures payees
- Fix: factures d'avoir — libelle et echeance
- Fix: avoirs ouverts avec le bon type dans l'editeur
- Fix: cache-busting JS — force rechargement editor.js et app.js
- Fix: sauts de page WYSIWYG BL — mesure DOM reelle
- Fix: saut de page BL WYSIWYG — break apres les lignes si notes debordent
- Fix: avoir remboursement — prelevement_sepa converti en virement_sepa
- Fix: fermer l'onglet du document supprime

### Modifications
- Ux: bouton Imprimer avec libelle texte
- Chore: release 2.6.186


## [2.5.148] — 2026-05-31

### Documentation
- Docs: manuel v2.5 — prix achat/marge articles + installation port


## [2.5.146] — 2026-05-31

### Ajouté
- Feat: prix d'achat HT et calcul de marge sur les articles
- Feat: port d'ecoute configurable dans l'installeur

### Modifications
- Chore: licence AGPL v3 + mise a jour README
- Chore: release 2.5.146


## [2.4.140] — 2026-05-30

### Ajouté
- Feat: lettrage comptable (compte 411, auto + manuel)

### Corrigé
- Fix: sauvegarde des champs SEPA manquants dans les routes API
- Fix: cache-busting favicon ?v=2

### Modifications
- Chore: release 2.4.140


## [2.3.133] — 2026-05-30

### Ajouté
- Feat: icone FacturPro (SVG + ICO multi-resolution)

### Modifications
- Chore: release 2.3.133


## [2.2.129] — 2026-05-30

### Ajouté
- Feat: boutons Émettre + Envoyer dans l'éditeur WYSIWYG pour les factures brouillon
- Feat: tri sur les en-têtes de colonnes dans toutes les listes de documents
- Feat: BL → Facture WYSIWYG
- Feat: envoi groupé de factures
- Feat: SIRET formaté en xxx xxx xxx xxxxx partout
- Feat: acceptation devis → client passe de 'prospect' à 'client' (RGPD)
- Feat: fiche client — section SEPA (IBAN, BIC, mandat RUM/date/type)
- Feat: génération fichier SEPA pain.008.001.02
- Feat: mode de règlement par défaut client + sélection SEPA automatique

### Corrigé
- Fix: bouton Enregistrer commence en '✓ Enregistré' pour les docs existants
- Fix: totaux PDF alignés sur BOTTOM=744
- Fix: migration 005 adresse2 clients + SQL copiés dans dist à chaque build
- Fix: bouton Émettre déplacé en dernier dans toolbar facture
- Fix: client professionnel sans raison_sociale — fallback sur nom/prénom
- Fix: bouton '→ Facture' visible pour tous les statuts BL
- Fix: client pré-rempli dans l'éditeur même hors clientOptions
- Fix: suppression mention 'Bon pour accord' dans les BL
- Fix: BL livré n'est plus en lecture seule

### Modifications
- Ux: Émettre en blanc (btn-outline) + badge ✓ Émis vert figé après émission
- Ux: bouton unique 'Émettre & Envoyer'
- Chore: release 2.2.129


## [2.1.81] — 2026-05-30

### Ajouté
- Feat: statut devis 'accepte' + bouton ✔ Accepté + BL prioritaire
- Feat: bouton Accepter/Accepté toggle dans toolbar devis WYSIWYG
- Feat: client recherche filtrante dans l'éditeur + Nouveau client en bas
- Feat: composant SearchSelect générique réutilisable
- Feat: devis gratuit coché par défaut à la création
- Feat: adresse2 client + alignement gauche + PDF unifié

### Corrigé
- Fix: Express v5 catch-all route + Voir/Modifier + bouton imprimer
- Fix: restore active tab last + bouton Accepté dans toolbar WYSIWYG
- Fix: conserver l'ordre des onglets au rafraîchissement
- Fix: npm run build copie automatiquement src/client → dist/client
- Fix: cache-busting sur scripts JS/CSS
- Fix: sauvegarde draft forcée au beforeunload
- Fix: champ de recherche client correctement rendu dans l'éditeur
- Fix: autocomplete flottant + badges statuts acompte/BL manquants
- Fix: prix ligne = 1 par défaut, N° doc mis à jour après save
- Fix: N° devis mis à jour après save + id mutable
- Fix: PDF devis — Total TTC aligné sur le bas du cadre signature

### Refactoring
- Refactor: boutons contextuels devis dans toolbar WYSIWYG, listes simplifiées
- Refactor(A): editor.js réécrit — -400 lignes, architecture unifiée
- Refactor(B): app.js — DOC_CONFIGS + renderDocList unifié

### Modifications
- Ux: Accepter reste sur la page, toolbar se met à jour en place
- Ux: bouton Enregistrer reste sur la page, devient vert après save
- Chore: release 2.1.81


## [2.0.9] — 2026-05-30

### Ajouté
- Feat: embed Factur-X XML inside PDF (pdf-lib post-processing)


## [2.0.8] — 2026-05-30

### Ajouté
- Feat: v2.0 — WYSIWYG editor, avoirs, stock, N° série, persistence session

### Dépendances
- Bump the dev-dependencies group with 2 updates
- Bump the production-dependencies group with 4 updates

### Modifications
- Add installer build workflow + installer scripts (fix gitignore)


## [1.0.0] — 2026-05-30

### Modifications
- Initial commit — FacturPro SaaS devis/facturation France


[2.9.1]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.9.1
[2.9.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.9.0
[2.8.224]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.8.224
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
