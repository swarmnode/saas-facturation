# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]


## [2.13.0] — 2026-06-02

### Modifications
- chore: release 2.13.0


## [2.12.0] — 2026-06-02

### Corrigé
- fix(signature): route publique `/api/devis/signer/:token` montée avant le middleware JWT — la route était bloquée par `app.use('/api', authenticate)`

### Documentation
- Manuel utilisateur complet v2.12.0 avec 20 screenshots réels
- Fichiers CSV d'exemple pour l'import clients et articles


## [2.11.0] — 2026-06-02

### Ajouté
- feat: mentions légales obligatoires sur les factures (art. L441-9/L441-10 CCom)
- feat: TVA déductible saisissable dans la déclaration CA3 (section B)
- feat: relances automatiques des factures impayées (scheduler quotidien)
- feat: signature électronique des devis par lien email
- feat: intégration Chorus Pro / Portail Public de Facturation (e-invoicing 2026)
- feat: XML Factur-X EN 16931 enrichi (BuyerReference, PaymentTerms, AllowanceCharge)


## [2.10.0] — 2026-06-02

### Ajouté
- feat(exercices): clôture annuelle obligatoire — loi anti-fraude TVA 2018 (art. 88 loi 2015-1785)
- feat(exercices): date_ouverture et date_cloture paramétrables (exercices non-civils)


## [2.9.1] — 2026-06-02

### Corrigé
- fix(security): conformité fiscale, isolation multi-tenant, injections SQL
- fix(migration017): suppression du backfill UPDATE bloqué par le trigger d'immutabilité


## [2.9.0] — 2026-06-02

### Ajouté
- feat: filtres devis/factures, visibilité commerciaux, sauvegarde gzip
- feat(installer): demander le nom de société pendant l'installation

### Corrigé
- fix(installer): corriger installation service Windows et ouverture du port
- fix(installer): toujours créer une base vierge à l'installation
- fix(installer): supprimer la création en double des raccourcis
- fix(installer): base prod facturpro isolée de la base de dev facturation
- fix(ui): sidebar overflow-x uniquement pour permettre le scroll vers Paramètres


## [2.8.224] — 2026-05-31

### Ajouté
- feat: filtres statut + alertes, visibilité commerciaux, sauvegarde .sql.gz


## [2.7.218] — 2026-05-31

### Ajouté
- feat: import/export CSV articles et clients
- feat: page Statistiques — KPIs, balance âgée, évolution CA 12 mois
- feat: stats complètes — montant moyen, pipeline, top clients, délai acceptation
- feat: stats — DSO, trésorerie, top articles, marge, N/N-1, répartitions
- feat: page Déclaration TVA (CA3)
- feat: raccourcis clavier, drag&drop, CGV, notifications, relances, audit, attestation
- feat: sidebar scroll, retard factures, conditions paiement client, fixes UX

### Corrigé
- fix: label import CSV en casse normale
- fix: POST /api/entreprise sauvegarde cgv_texte et mention_legale
- fix: attestation ouverte via blob URL avec JWT
- fix: Ctrl+S intercepté au niveau document
- fix: CSS print complet — masque UI édition
- fix: impression via PDF aperçu (identique au PDF émis)

### Modifications
- chore: release 2.7.218


## [2.6.186] — 2026-05-31

### Ajouté
- feat: sauts de page multi-documents — PDF et WYSIWYG
- feat: calcul auto TVA intracommunautaire depuis le SIRET
- feat: type d'avoir (à valoir / remboursement) + PUT factures
- feat: plafonnement des avoirs par facture d'origine

### Corrigé
- fix: sauts de page PDF et WYSIWYG alignés
- fix: badge Acquittée à gauche des totaux
- fix: WYSIWYG facture payée — échéance, conditions, mode règlement
- fix: factures d'avoir — libellé et échéance
- fix: avoir remboursement — prélèvement_sepa converti en virement_sepa
- fix: fermer l'onglet du document supprimé


## [2.5.148] — 2026-05-31

### Documentation
- docs: manuel v2.5 — prix achat/marge articles + installation port


## [2.5.146] — 2026-05-31

### Ajouté
- feat: prix d'achat HT et calcul de marge sur les articles
- feat: port d'écoute configurable dans l'installeur

### Modifications
- chore: licence AGPL v3 + mise à jour README


## [2.4.140] — 2026-05-30

### Ajouté
- feat: lettrage comptable (compte 411, auto + manuel)

### Corrigé
- fix: sauvegarde des champs SEPA manquants dans les routes API


## [2.3.133] — 2026-05-30

### Ajouté
- feat: icône FacturPro (SVG + ICO multi-résolution)


## [2.2.129] — 2026-05-30

### Ajouté
- feat: boutons Émettre + Envoyer dans l'éditeur WYSIWYG
- feat: tri sur les en-têtes de colonnes dans toutes les listes
- feat: BL → Facture WYSIWYG
- feat: envoi groupé de factures
- feat: fiche client — section SEPA (IBAN, BIC, mandat RUM/date/type)
- feat: génération fichier SEPA pain.008.001.02
- feat: mode de règlement par défaut client + sélection SEPA automatique

### Corrigé
- fix: migration 005 adresse2 clients + SQL copiés dans dist à chaque build
- fix: client professionnel sans raison_sociale — fallback sur nom/prénom


## [2.1.81] — 2026-05-30

### Ajouté
- feat: statut devis 'accepte' + bouton ✔ Accepté + BL prioritaire
- feat: client recherche filtrante dans l'éditeur + Nouveau client en bas
- feat: adresse2 client + alignement gauche + PDF unifié

### Corrigé
- feat: Express v5 catch-all route + Voir/Modifier + bouton imprimer
- fix: conserver l'ordre des onglets au rafraîchissement
- fix: sauvegarde draft forcée au beforeunload

### Refactoring
- refactor: editor.js réécrit — -400 lignes, architecture unifiée
- refactor: app.js — DOC_CONFIGS + renderDocList unifié


## [2.0.9] — 2026-05-30

### Ajouté
- feat: embed Factur-X XML dans le PDF (pdf-lib post-processing)


## [2.0.8] — 2026-05-30

### Ajouté
- feat: v2.0 — éditeur WYSIWYG, avoirs, stock, N° série, persistance session


## [1.0.0] — 2026-05-30

### Modifications
- Initial commit — FacturPro SaaS devis/facturation France


[2.13.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.13.0
[2.12.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.12.0
[2.11.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.11.0
[2.10.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.10.0
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
