# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]

### Ajouté
- Feat: boutons Émettre + Envoyer dans l'éditeur WYSIWYG pour les factures brouillon


### Corrigé
- Fix: bouton Enregistrer commence en '✓ Enregistré' pour les docs existants


### Documentation
- Docs: update CHANGELOG.md [skip ci]


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


[2.1.81]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.1.81
[2.0.9]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.9
[2.0.8]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.8
[1.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v1.0.0

