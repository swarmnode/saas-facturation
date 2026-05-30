# Changelog

Toutes les modifications notables sont documentées ici.
Versionnage : `MAJEUR.MINEUR.BUILD` (BUILD = nombre de commits sur `main`).

## [Non publié]

### Ajouté
- Feat: statut devis 'accepte' + bouton ✔ Accepté + BL prioritaire

- Nouveau statut 'accepte' (entre 'envoye' et 'signe', non verrouillé)
- Bouton '✔ Accepté' sur les devis envoyés
- Badge vert 'accepte' dans les listes
- Bouton '🚚 → BL' mis en avant (btn-primary) quand devis accepté
- Route POST /api/devis/:id/accepter
- DevisService.changerStatut étendu au statut 'accepte'

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>


### Corrigé
- Fix: Express v5 catch-all route + Voir/Modifier + bouton imprimer

- Express 5 : 'app.get(*' → 'app.get(/{*path}' (Dependabot upgrade)
- Boutons 'Modifier' → 'Voir/Modifier' (non verrouillé) / 'Voir' (verrouillé)
- Bouton 🖨️ dans tous les éditeurs WYSIWYG (devis, facture, BL, acompte)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- Fix: syntax error in app.js (orphan template literals + Express v5 route)


### Documentation
- Docs: link CHANGELOG in README, mention v2.0.9
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]
- Docs: update CHANGELOG.md [skip ci]


### Modifications
- Ci: auto-generate CHANGELOG.md with git-cliff on each push
- Ci: fix git-cliff install (Debian Buster EOL, use binary)
- Ci: fix git-cliff URL (resolve version dynamically)
- Ci: fix cliff.toml footer template (null version guard)


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


[2.0.9]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.9
[2.0.8]: https://github.com/swarmnode/saas-facturation/releases/tag/v2.0.8
[1.0.0]: https://github.com/swarmnode/saas-facturation/releases/tag/v1.0.0

