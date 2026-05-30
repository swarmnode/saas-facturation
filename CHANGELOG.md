# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre total de commits sur `main`).

---

## [2.0.8] — 2026-05-30

### Ajouté

**Éditeur WYSIWYG**
- Nouveau fichier `src/client/js/editor.js` : éditeur A4 inline pour devis, factures, avoirs et BL
- Vue lecture seule pour les documents verrouillés (émis/signés/payés) avec boutons d'action contextuels
- Cadre de signature avec ligne de date intégré, ancré en bas de page (position fixe, indépendante du contenu)
- Totaux toujours positionnés en bas à droite (même logique dans le PDF)
- Auto-sauvegarde des brouillons non enregistrés dans `localStorage` (600 ms après chaque frappe)

**Avoirs**
- Type de document dédié `type_facture = 'avoir'`, numérotation `AV-YYYY-NNNN`
- Lien vers la facture d'origine (`facture_origine_id`, affiché dans l'éditeur et le PDF)
- Entrée « Avoirs » dans la sidebar et vue liste dédiée
- Bouton « Avoir » sur les factures émises et payées (pas sur les avoirs eux-mêmes)
- Migration `003` : colonne `facture_origine_id` sur `factures`

**Stock et traçabilité**
- Champ `quantite_stock` sur `articles` : badge stock visible dans l'éditeur, limitation du champ quantité au max du stock disponible lors de la saisie via l'autocomplete
- Champ `numero_serie` sur les lignes de facture et de BL : saisie inline sous la désignation
- Unité article : sélecteur avec 16 unités courantes (heure, jour, forfait, m², kg…) + option « Autre… » avec saisie libre
- Migration `004` : colonnes `quantite_stock`, `numero_serie`

**Persistence de session**
- Onglets ouverts restaurés automatiquement après rechargement (vue + documents)
- Brouillons non sauvegardés restaurés intégralement (client, lignes, dates, conditions, notes)
- État effacé proprement à la déconnexion ou après enregistrement

**Tableau de bord**
- Liste chronologique unifiée (devis, factures, avoirs, acomptes, BL) avec badges colorés par type
- Tri cliquable sur les colonnes : Type, Client, Montant TTC, Statut, Date (▲/▼)
- Boutons d'action identiques aux rubriques (Émettre, Payer, Signer, Encaisser, Dupliquer, BL, Avoir, 🗑️…)

**Navigation**
- Sidebar collapsible : bouton `‹`/`›` sur le bord, état mémorisé dans `localStorage`
- Barre d'onglets : flèches `‹` `›` (44 px, cible large) apparaissant en cas de débordement + scroll à la molette
- Onglet actif scrollé dans la vue automatiquement à chaque activation

**Suppression sécurisée**
- Devis : supprimable si non signé ET sans facture/acompte/BL lié
- Acomptes : supprimables si non encaissés
- Avoirs : supprimables si non émis
- BL : supprimables si brouillon non clôturé
- Clients : supprimables si aucun document associé
- Boutons poubelle 🗑️ (icône grise, rouge au survol) remplaçant les boutons « Supprimer » rouges

**PDF et impression**
- Totaux ancrés à position fixe en bas de page (y ≈ 700–742 pt selon le type)
- Cadre de signature avec ligne de date sur devis et BL
- Suppression du pied de page légal (était en bas de chaque PDF)
- CSS `@media print` : masquage de l'interface, préservation de la zone signature/totaux
- Devis PDF : signature « Bon pour accord » gauche + totaux droite

**Acomptes**
- Ouverture en vue WYSIWYG A4 lecture seule (depuis le tableau de bord et la liste)
- Restauration des onglets acompte après rechargement

### Modifié

- `FactureService.creer` : numérotation `AVOIR` vs `FACTURE` selon `type_facture`
- `FactureService.lister` : filtre les avoirs hors de la liste factures standard
- `FacturXService` : titre « AVOIR » sur le PDF, référence à la facture d'origine
- `ArticleService` : `creer` et `mettreAJour` gèrent `quantite_stock`
- `BonLivraisonService` : `numero_serie` sur les lignes, date de livraison retirée (saisie manuelle dans le cadre de signature)
- Icônes sidebar agrandies (26 px) et items distribuées sur toute la hauteur via `justify-content: space-evenly`
- Icône « Clients » remplacée par 🧑 (meilleure lisibilité à grande taille)
- TVA dans le sélecteur de lignes : libellé abrégé (« 20 % », « Exo. », « Autoliq. »)
- Échéance facture masquée en lecture seule si non renseignée

### Infrastructure

- Workflow GitHub Actions `build-installer.yml` : build automatique du `.exe` sur push de tag `v*`
- `installer/scripts/Configure.ps1` et `Uninstall.ps1` ajoutés au dépôt (corrigé l'exclusion `.gitignore`)
- Dépendances npm mises à jour (Dependabot PRs #1 et #2)

---

## [1.0.0] — 2026-05-30 (commit `ddd2a19`)

### Ajouté

- Stack initiale : TypeScript / Express / PostgreSQL 17
- Schéma SQL complet avec triggers d'inaltérabilité (loi anti-fraude TVA 2018)
- Authentification JWT, rôles (`admin`, `comptable`, `commercial`, `lecteur`), multi-société
- Modules : devis, factures, acomptes, bons de livraison, avenants, archives, articles, clients
- `NumerotationService` : séquences atomiques `FAC-`, `DEV-`, `AC-`, `BL-`, `AV-`
- `ScelleService` : chaîne SHA-256 (`journal_scellement`, immuable)
- `FacturXService` : PDF PDFKit + XML ZUGFeRD EN 16931 embarqué
- `FecExportService` : export DGFiP au format tabulé
- `BackupScheduler` : sauvegardes planifiées via `pg_dump`
- `EmailService` : Nodemailer avec fallback Ethereal
- Frontend SPA Vanilla JS, interface onglets
- Installeur Windows autonome (Inno Setup 6 + Node.js portable + NSSM)
- README, CLAUDE.md, manuel utilisateur (Markdown + DOCX via pandoc)
- CI GitHub Actions (build TypeScript), issue templates, Dependabot

[2.0.8]: https://github.com/swarmnode/saas-facturation/compare/v1.0.0...v2.0.8
[1.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v1.0.0
