# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run dev      # ts-node + nodemon hot-reload, http://localhost:3000
npm run build    # tsc -> dist/
npm start        # node dist/server/index.js (prod)
```

DB default: `postgresql://facturation:facturation@localhost:5432/facturation` (override with `DATABASE_URL` in `.env`).

Admin default on first start: `admin@localhost` / `Admin1234!` (override with `ADMIN_EMAIL` / `ADMIN_DEFAULT_PASS`). Set `COMPANY_NAME` to pre-fill the default company name created alongside the admin account. Set `UPDATE_GITHUB_REPO=owner/repo` to enable in-app update checks (`GET /api/update/check`) and one-click updates (`POST /api/update/apply`, super_admin only).

`npm run build` also copies `src/client/` → `dist/client/` and all `*.sql` from `src/server/db/` → `dist/server/db/`. When adding a new migration or client asset, the build step is required before `npm start` picks it up.

### Installer (Inno Setup)
```powershell
.\installer\build.ps1   # compiles TS, builds prod payload, downloads portable Node + NSSM
# Then compile installer\FacturPro.iss with Inno Setup 6+ -> FacturPro-Setup.exe
```

## Architecture

**Entry point**: `src/server/index.ts` — Express app. All routes are under `/api/*` and protected by the `authenticate` JWT middleware, except `/api/auth`. Uses `helmet` (CSP disabled — SPA has inline scripts) and `express-rate-limit` on `/api/auth/login` (10 req / 15 min window, bypassed for loopback addresses). CORS is **disabled by default** (same-origin SPA); set `CORS_ORIGIN` (comma-separated list) in `.env` to allow cross-origin callers.

**JWT secret**: if `JWT_SECRET` is not set in `.env`, a random secret is generated at first startup and persisted to `storage/jwt_secret.key` (`src/server/utils/secret.ts`). There is no hardcoded fallback — never reintroduce one.

**HTTPS**: disabled by default (plain HTTP via `app.listen`). Set `HTTPS_ENABLED=true` to switch to `https.createServer()` (`src/server/utils/tls.ts`, `getHttpsOptions()`). Certificate resolution order: `TLS_CERT_PATH`/`TLS_KEY_PATH` env vars (bring your own cert) → `storage/tls/cert.pem`/`key.pem` if already generated → otherwise a self-signed 10-year cert is generated via `selfsigned` (SAN: `localhost`, `os.hostname()`, `127.0.0.1`, `::1`) and persisted to `storage/tls/`. Self-signed certs trigger a browser warning on first access — expected for LAN deployments without a real CA.

**Database layer**: `src/server/db/database.ts`
- Exports `query()`, `getPool()`, and `withTransaction<T>(fn)` (use for multi-step atomic operations).
- `initDb()` runs `schema.sql` then each migration in order; called once at startup before the server listens.
- PostgreSQL timestamps are parsed to ISO strings via `types.setTypeParser`.
- `getPool()` attaches a `pool.on('error', ...)` handler — required so an idle client dropped by the PG server (e.g. admin-killed connection) doesn't crash the whole Node process with an unhandled error.

**Adding a migration**: create `src/server/db/migration_NNN_name.sql` (must be idempotent: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) **and** register it explicitly in `initDb()` in `database.ts`. Migrations currently present: 001–008, 010–030 (009 is intentionally absent — do not reuse that number). Notable schema additions by migration:
- 004: `articles.stock` (nullable = unmanaged) + `numero_serie` on devis/facture line items
- 005: `clients.adresse2` (complement d'adresse)
- 006/007: SEPA fields on `clients` (`iban`, `bic`, `mandat_rum`, `mandat_date`, `mandat_type`) and on `entreprise`
- 008: `clients.mode_reglement_defaut`
- 010: `articles.prix_achat_ht` (nullable, used for margin calculation)
- 011: `factures.type_avoir` — `'valoir'` (default) or `'remboursement'`
- 012: `entreprise.cgv_texte` and `entreprise.mention_legale`
- 013: creates `audit_log` table
- 014: `clients.conditions_paiement`
- 015: `devis.created_by` (FK → `utilisateurs`)
- 016: `user_entreprises.voir_tout` (commercial visibility flag)
- 017: `archive_documents.entreprise_id` (multi-tenant isolation; existing NULL rows remain visible to super_admin only)
- 018: creates `exercices` table (fiscal year management, loi anti-fraude TVA)
- 019: legal notice fields on `factures` (`numero_commande`, `escompte_taux`, `penalites_taux`, `indemnite_recouvrement`, `chorus_pro_id`, `chorus_pro_statut`) and matching defaults on `entreprise`
- 020: creates `tva_deductible` table (section B of CA3 VAT return, keyed by `(entreprise_id, periode)`)
- 021: auto-dunning fields on `entreprise` (`relance_auto_active`, `relance_auto_jours`, `relance_auto_heure`); tracking fields on `factures` (`derniere_relance`, `nb_relances`); e-signature fields on `devis` (`signature_token`, `signature_ip`, `signature_date`, `signature_nom`)
- 022: pre-due notification fields on `entreprise` (`notif_echeance_active`, `notif_echeance_jours`); `factures.notif_echeance_envoyee` (timestamp, prevents double-sending)
- 023: creates `factures_fournisseurs` table (supplier invoices); adds `facture_fournisseur_id` FK on `fec_ecritures`
- 024: `type` column on `devis_lignes` / `factures_lignes` / `avenants_lignes` / `bons_livraison_lignes` to support comment-only lines
- 025: creates `commentaires_predefinis` table (per-company catalogue of reusable comment texts; served via `GET/POST/DELETE /api/commentaires`)
- 026: creates `fournisseurs` (supplier directory, CRUD mirrors `clients` incl. CSV export/import) and `commandes_fournisseurs` (purchase orders, numbered `CMD-YYYY-NNNN`); adds `factures_fournisseurs.fournisseur_id` (nullable FK). Purchase-side chaining (commande ↔ facture d'achat ↔ fournisseur) is **intentionally non-blocking**: no legal obligation to chain on the purchase side (unlike emitted documents), so all FKs are nullable and freely editable — do not add locking/sealing here
- 027: `factures.acompte_id` (FK → `acomptes`) + `factures.montant_acompte_applique` — links a facture to the deposit (acompte) applied against it; `acomptes.notes` (free text, e.g. "Reliquat — AC-2025-0001")
- 028: `article_id` (FK → `articles`) on `devis_lignes` / `factures_lignes` — links line items back to their source article catalogue entry
- 029: creates `commandes_fournisseurs_lignes` and `factures_fournisseurs_lignes` (mirror of `devis_lignes`, `ON DELETE CASCADE` — purchase side has no locking); adds `montant_tva`, `montant_ttc`, `notes` to `commandes_fournisseurs`. Enables the WYSIWYG editor for purchase documents
- 030: `backup_config.derniere_verif_date/ok/nb_factures/erreur` — tracks the result of the last restore-verification run (see `BackupScheduler.verifyLastBackup`)

**Type augmentation**: `src/server/types/express.d.ts` extends `Express.Request` with `user?: AuthUser`. Import `AuthUser` from `middleware/auth` when you need the type elsewhere.

**Document entity types**: `src/server/types/documents.ts` defines `Devis`, `Facture`, `Acompte`, `BonLivraison` (+ their `*Ligne` line-item interfaces) matching the columns returned by each service's `obtenir()`. These are used as the return type of `DevisService.obtenir`, `FactureService.obtenir`, `AcompteService.obtenir`, `BonLivraisonService.obtenir` — other methods (`changerStatut`, `mettreAJour`, `emettre`, etc.) inherit the type via inference since they internally `return this.obtenir(id)`. Routes in `devis.ts`, `factures.ts`, `acomptes.ts`, `bons-livraison.ts` consume these types directly (no `as any`). Note: `Facture` intentionally has **no `objet` field** — `factures.objet` is not a real DB column (a pre-existing latent bug in `FactureService.mettreAJour`, left as-is).

**Auth middleware**: `src/server/middleware/auth.ts`
- `authenticate` — validates Bearer JWT, attaches `req.user` (`AuthUser`: `id`, `email`, `entreprise_id`, `role`, `is_super_admin`, `voir_tout`).
- `requirePerm('resource:r|w')` — guards routes; `is_super_admin` bypasses all permission checks.
- `canDo(role, is_super_admin, perm)` — exported helper for programmatic permission checks outside middleware.
- Roles: `admin`, `comptable`, `commercial`, `lecteur`. Permission matrix is in `ROLE_PERMS` in that file. **`js/core.js` contains a duplicate of `ROLE_PERMS` for client-side UI gating — keep both in sync when changing permissions.**
- `voir_tout` is only meaningful for the `commercial` role (always `true` for other roles). When `false`, list endpoints filter documents to only those where `created_by = req.user.id`. The flag lives in `user_entreprises.voir_tout` and is embedded in the JWT at login. **Changing `voir_tout` in the DB takes effect only after the user re-authenticates** (the old JWT still carries the old value).

**Multi-tenant**: every business entity (`clients`, `articles`, `devis`, `factures`, `acomptes`, `bons_livraison`) carries an `entreprise_id`. Routes scope queries to `req.user.entreprise_id`. A user can belong to multiple companies via `user_entreprises`.

**Services** (`src/server/services/`):
- `NumerotationService` — atomic `INSERT … ON CONFLICT DO UPDATE` on `sequence_numerotation`; produces `FAC-YYYY-NNNN`, `DEV-YYYY-NNNN`, etc. Never call raw `INSERT` for numbering.
- `ScelleService` — chained SHA-256 in `journal_scellement`; must be called after emitting a fiscal document. The table is immutable (UPDATE/DELETE blocked by DB triggers).
- `FacturXService` — two-step PDF pipeline: (1) PDFKit renders the visual PDF; (2) `pdf-lib` post-processes it to attach `factur-x.xml` (EN 16931) with `AFRelationship.Alternative`, injects an `/AF` entry in the PDF catalog, and adds XMP metadata declaring PDF/A-3b + Factur-X MINIMUM profile. Generates devis, factures, acomptes, bons-livraison as streams (`generer*Stream`) or to disk (`genererFacture`). Logo color is extracted at runtime with `sharp`.
- `FecExportService` — writes accounting entries to `fec_ecritures` when a facture is emitted; exports them as tab-separated text (DGFiP FEC format). **Do not alter column names or order.**
- `LettreService` — lettrage (account matching) of `fec_ecritures` compte 411 lines. `getNextLettre()` uses `sequence_numerotation` with type `LETTRAGE`; `lettrerPaiement()` is called automatically when marking a facture `payee`.
- `BackupScheduler` — `node-cron` job calling `pg_dump.exe` (path from `PG_BIN` env var) and copying `storage/pdf/` to a `pdfs_<date>/` subfolder and `storage/jwt_secret.key` to `secrets_<date>/` inside the backup destination (so the JWT secret survives a restore onto a new machine). Config stored in `backup_config` table; reloaded via `loadAndSchedule()`. A second monthly cron (`verifyLastBackup`, 1st of month at 03:00) restores the most recent dump into a temporary `facturation_verify` database via `psql`, counts rows in `factures`, then drops it; the result is persisted to `backup_config.derniere_verif_*` and can be triggered on demand via `POST /api/backup/verifier` (super_admin). Requires the app's DB role to have `CREATEDB` (granted by the installer via `ALTER ROLE facturpro CREATEDB`); on existing installs without it, the verification returns a clear error telling the super_admin to run `ALTER ROLE <user> CREATEDB;` as a PostgreSQL superuser.
- `EmailService` — Nodemailer; uses SMTP config from `entreprise` table if present, otherwise falls back to Ethereal test account auto-created at runtime.
- `ArchiveService` — stores immutable JSON snapshots of documents in `archive_documents` (SHA-256 hash, 10-year retention). `archiver()` is idempotent (`ON CONFLICT DO NOTHING` on `type_document + document_id_original`). Must be called when a document reaches a terminal status.
- `AvenantService` — creates amendments to signed devis. An avenant can only be created when the parent `devis.statut = 'signe'`; it allocates its own number via `NumerotationService` and seals via `ScelleService`.
- `ExerciceService` — fiscal year lifecycle (`ouvrir`, `cloturer`). Closing an exercice hashes all `fec_ecritures` for that year and persists the hash in `exercices.hash_cloture`. A closed exercice cannot be re-opened.
- `ChorusProService` — submits Factur-X PDFs to the Chorus Pro public procurement portal via PISTE OAuth2. Requires `CHORUS_PRO_CLIENT_ID`, `CHORUS_PRO_CLIENT_SECRET`, and `CHORUS_PRO_LOGIN` env vars. Persists the CPP document ID on `factures.chorus_pro_id`. Only acts on factures with `statut = 'emise'` and an existing PDF.
- `FournisseurService` — supplier invoice lifecycle (`creer`, `mettreAJour`, `payer`, `supprimer`, `lister`, `obtenir` incl. `lignes`). `creer` accepts either detailed `lignes` (totals computed like sales documents, header `taux_tva` becomes the effective rate) or flat totals (CSV import); it atomically writes 3 FEC entries (journal `AC`: compte 401/crédit, `6xx`/débit, `44566`/débit) and upserts `tva_deductible` for the invoice's month. `mettreAJour` (only while `statut='recue'`) replaces header+lignes, **deletes and rewrites the FEC entries**, and resyncs `tva_deductible` for both old and new period. Paying writes 2 FEC entries (journal `BQ`). Deletion reverses FEC entries and recalculates `tva_deductible` (only allowed on `recue` invoices).
- `CommandeFournisseurService` — purchase orders with line items (`commandes_fournisseurs_lignes`, totals computed like `DevisService`). `creer`/`mettreAJour` accept `lignes` or a flat `montant_ht` (legacy/no-lines mode); `fournisseur_nom` resolves from `fournisseur_id` or stays free text. No locking/sealing ever (purchase side).
- `RelanceScheduler` — `node-cron` job running two functions daily at the configured hour: `envoyerRelancesAuto()` sends dunning emails for overdue factures (controlled by `relance_auto_active/jours`); `envoyerNotifsEcheance()` sends a reminder N days *before* the due date (controlled by `notif_echeance_active/jours`, default 3 days). The pre-due notification is sent at most once per facture (`notif_echeance_envoyee` timestamp guards against duplicates).
- `SocieteBackupService` — per-company export/restore (`exporterSociete`, `restaurerSociete`). Produces a gzip JSON blob (`format: 'societe-v1'`) containing all tables in FK order. Restore supports two modes: `'skip'` (INSERT ON CONFLICT DO NOTHING, for same-instance recovery) and `'remap'` (allocates new consecutive IDs above MAX(id) and cascades FK remapping — use for cross-instance import). Polymorphic FK columns on `journal_scellement.document_id` and `archive_documents.document_id_original` are handled explicitly. After restore, all SERIAL sequences are reset to MAX(id).

**Additional routes** not listed above:
- `sepa` — generates SEPA direct debit XML (pain.008) for a batch of factures. POST `/api/sepa/generer` with `{ facture_ids, date_execution, sequence }`.
- `lettrage` — GET `/api/lettrage` lists compte-411 FEC entries; POST `/api/lettrage/lettrer` for manual matching.
- `stats` — GET `/api/stats/kpis?periode=mois|trimestre|annee` returns financial KPIs (CA, factures emises/payees, impayés, etc.); GET `/api/stats/fournisseurs` returns supplier totals (HT, à payer, en retard, top 5 fournisseurs).
- `audit` — GET `/api/audit` reads `audit_log`. The exported `logAudit()` helper is used by other routes to record sensitive actions.
- `exercices` — GET `/api/exercices` lists fiscal years; POST `/api/exercices` opens one; POST `/api/exercices/:annee/cloturer` closes it (hashes FEC entries, returns a bilan PDF).
- `chorus-pro` (on `factures` router) — POST `/api/factures/:id/chorus-pro` deposits the facture on Chorus Pro; GET `/api/factures/:id/chorus-pro/statut` refreshes its status.
- `factures-fournisseurs` — GET `/api/factures-fournisseurs[?statut=recue|payee]` lists supplier invoices (UI label: "Factures d'achats", renamed to avoid ambiguity with the `fournisseurs` directory); POST `/` creates (flat totals or `lignes`); PUT `/:id` updates while `recue` (regenerates FEC); POST `/:id/payer` marks paid; DELETE `/:id` removes (only `recue`); POST `/import-csv` imports a CSV file (multipart `csv` field) — parses FEC-style rows from compte 401.
- `fournisseurs` — supplier directory, CRUD mirroring `clients` (`requirePerm('factures:r'|'factures:w')`); GET `/export` and POST `/import` for CSV (same `toCSV`/`parseCSV` utilities as clients).
- `commandes-fournisseurs` — purchase orders (delegates to `CommandeFournisseurService`); numbered via `NumerotationService` with the `COMMANDE` type (prefix `CMD`); GET `/:id/apercu` streams the purchase-order PDF (`FacturXService.genererCommandeStream` — no CGV, no signature box); optional `fournisseur_id` and `facture_fournisseur_id` links are nullable and freely editable in both directions (non-blocking chaining, see migration 026).
- `update` (`src/server/routes/update.ts`) — GET `/api/update/check` (`settings:r` permission) compares `package.json` version against the latest GitHub release and reports an `update_type` of `light` or `heavy` depending on which asset is attached; POST `/api/update/apply` (`is_super_admin` only) applies it. Requires `UPDATE_GITHUB_REPO=owner/repo` in `.env`. Two update paths, chosen by `getUpdateAsset()` (light preferred when both are present):
  - **Light** (`FacturPro-Patch.zip` asset): downloaded to `os.tmpdir()`, expanded **in-process** over `INSTALL_DIR` via `execFileSync('powershell.exe', ['Expand-Archive', ...])`, then `process.exit(0)` — NSSM detects the dead process and restarts the service. `schtasks` and detached `spawn` were tried first and failed silently on this server; `execFileSync` + `process.exit(0)` is the only approach that works reliably. The zip is archived to `updates/FacturPro-Patch-<version>.zip` and progress is logged to `logs/patch-apply.log`.
  - **Heavy** (`FacturPro-Setup.exe` asset, fallback): downloaded to `os.tmpdir()`, then scheduled via Windows `schtasks /create /sc ONCE /ru SYSTEM` to run `/VERYSILENT /NORESTART` 30 seconds later (lets the HTTP response return first); archived to `updates/FacturPro-Setup-<version>.exe`, logged to `logs/update-install.log`.
- `commentaires` — CRUD on `commentaires_predefinis` (per-company catalogue of reusable comment texts for document line items, see migration 025).
- `maintenance` (`is_super_admin` only) — POST `/api/maintenance/vacuum` (`{ full?: boolean }`, runs `VACUUM` or `VACUUM (FULL)` outside a transaction via a dedicated pool client), `/analyze` (`ANALYZE`), `/reindex` (`REINDEX DATABASE`); each logs to `audit_log` via `logAudit()`.
- `search` — GET `/api/search?q=` powers the topbar global search (triggers from 2 chars). Splits `q` into whitespace tokens (AND-matched, each token ILIKE'd across the relevant columns) and runs parallel queries across devis, factures, bons-livraison, acomptes, clients, articles, commandes-fournisseurs and factures-fournisseurs, scoped to `entreprise_id`. Returns a flat array of `{ type, label, sub, id }` grouped client-side by `type` for the dropdown.

**FEC multi-tenant filter**: `FecExportService.exporterCSV()` filters by `entreprise_id` via EXISTS subqueries on both `factures` and `factures_fournisseurs` — entries without either FK are excluded.

**Email endpoints on factures** (`src/server/routes/factures.ts`):
- `POST /:id/envoyer` — auto-sends to the client's email from DB.
- `POST /:id/envoyer-email` — sends to an explicitly provided `email_client` body field.
- `POST /:id/relancer` — dunning email with a custom subject/body and PDF attachment.
- `GET /:id/eml` — returns a pre-composed RFC 822 `.eml` file for download.
- `POST /:id/mapi` — Windows-only: spawns `powershell.exe` to invoke `MAPISendMail`, opening the user's local mail client. Uses temp files in `os.tmpdir()` and cleans them up automatically.
- `GET /:id/relance-courrier` — generates a printable dunning letter PDF (PDFKit, streamed inline) with the full formal letter layout (objet, coordonnées, corps récapitulatif, pied de page).

**Public routes (no JWT)**: `/api/auth` and `/api/devis/signer/:token` (e-signature endpoint, mounted **before** the global `authenticate` middleware). The `GET` only renders a confirmation page with a "Signer ce devis" button; the actual signature (stamping `statut='signe'`, `signature_ip`, `signature_nom`) happens on `POST` to the same URL. **Never sign on GET** — link prefetchers (Outlook SafeLinks, antivirus) follow GET links and would auto-sign the devis.

**Frontend**: `src/client/` — plain HTML/CSS/JS SPA served as static files by Express. All API calls use `fetch` with a `Bearer` token stored in `localStorage`. The catch-all `app.get('*')` route returns `index.html` for client-side routing. `js/editor.js` exports a `DocEditor` IIFE that is the shared WYSIWYG editor for all document types — sales (devis, facture, avoir, bon de livraison, acompte) **and purchases** (`commande` = bon de commande, `facture-achat` = supplier invoice); it handles line rendering, totals calculation, comment-type lines, and save/lock logic. Purchase types: destinataire is a `fournisseur` (SearchSelect over the directory, free-text name allowed → `fournisseur_id` stays null), article autocomplete fills `prix_achat_ht` instead of the sale price, `facture-achat` has **no PDF buttons** (the reference document is the supplier's own invoice), its `numero` is free text (`name=numero_achat`), and it becomes read-only once `statut='payee'`. Line sub-fields (description, n° de série) carry the `e-sub-field` class and are hidden when empty (`e-sub-empty`), revealed on row hover/focus. Page-break indicators (`refreshPageBreaks`) mirror the PDF: fixed 20pt base per row (editor input padding does not exist in the PDF) **plus the real DOM height of variable parts** (description, n° série, comment textarea) converted px→pt (595pt / page width), against the same thresholds as the PDF (642pt devis/facture, 690pt BL) — all four PDF generators in `FacturXService` use dynamic per-line heights (`heightOfString` for designation, description, and n° série); keep both sides consistent when changing row layout. The rest of the SPA is split into per-domain modules loaded as classic (non-module) `<script>` tags sharing a single global scope — order matters only for `components.js` and `helpTexts.js` (loaded first: reusable UI components like `SearchSelect`, and the tooltip-text dictionary, with no dependencies of their own), `core.js` (shared utils, `DOC_CONFIGS`, `tabMgr`, modals, sidebar/nav, `renderView`/`navigate`, login/auth — loaded after those two), and `bootstrap.js` (`initApp()` plus global search — **must load last**, after `editor.js`, since it calls into every other module). The domain modules (`dashboard.js`, `clients.js`, `ventes.js`, `articles-acomptes.js`, `achats.js`, `parametres.js`, `utilisateurs.js`) can load in any order between those two groups.

**PDF storage**: `storage/pdf/` — served at `/storage`. Logo is read from `storage/logo/logo_pdf.png` (preferred) or the path in `entreprise.logo_path`.

**File uploads**: Logo is uploaded via `multer` at `POST /api/entreprise/logo` — stored to `storage/logo/logo_pdf.png`.

**Error responses**: All errors go through `src/server/middleware/errorHandler.ts`. Messages containing `INALTÉR` or `ISCA` (immutability/sealing violations from DB triggers) return HTTP 403 with the message. Errors carrying a `code` property (PostgreSQL `23505`-style codes, Node `ENOENT`-style codes) return a generic 500 — internal details are only logged server-side. Plain `Error`s thrown by services (French business messages meant for the user) return 400 with the message. Response body is always `{ error: string }`.

**Multi-tenant scoping convention**: service `obtenir(id, entreprise_id?)` methods accept an optional tenant filter — routes **must always pass `req.user!.entreprise_id`**; the parameter is only omitted by system jobs (schedulers) and internal service calls that already verified ownership. Mutation routes (PUT, emettre, payer, DELETE…) pre-check ownership with a tenant-scoped `obtenir()` (404 if not owned) before calling the mutation.

**Shared utilities** (`src/server/utils/`):
- `csv.ts` — `toCSV(headers, rows)` produces UTF-8 BOM `;`-separated CSV (Excel FR compatible); `parseCSV(text)` auto-detects `;`/`,` separator; `rowToObj(headers, row)` zips a header array and a row into a plain object. Used by FEC export and CSV import routes.
- `paginate.ts` — `paginateParams(q)` reads `?page=&limit=&all=1` from query string (default limit 50, cap 200); `buildPage(rows, page, limit)` shapes the response as `{ data, total, page, pages, limit }`. Rows must carry a `_total` column (window count from SQL) which is stripped before returning.

**Tests**: `npm test` runs `playwright test` (E2E). Run a single spec with `npx playwright test <file>`. Tests need a reachable `DATABASE_URL` and reuse a running dev server (`webServer.reuseExistingServer: true` in `playwright.config.ts` — starts `npm run dev` if none is up, 120s timeout). `tests/e2e-utils.ts` creates/enables its own user (`e2e@facturpro.test`, role `admin`) in `global-setup` and disables it in `global-teardown`, so tests never depend on the real admin password.

## Document lifecycle and auto-locking

Documents are auto-locked by DB triggers the moment they reach a terminal status — any further UPDATE is blocked.

| Document | Status that triggers lock | Allowed after lock |
|---|---|---|
| `devis` | `signe` | nothing (fully locked) |
| `avenants` | `signe` | nothing |
| `factures` | `emise` | `statut: emise → payee` only |
| `acomptes` | `encaisse` | nothing |

**Avoirs (credit notes)**: a facture of type `avoir` carries `facture_origine_id` pointing to the original facture (added by migration 003). When creating an avoir, always set this foreign key.

The `entreprise_id` column on `clients` and `articles` is **not** in `schema.sql` — it is added by `migration_001_auth.sql`. Always assume it exists at runtime, but be aware raw `schema.sql` alone does not define it.

## Compliance invariants — never bypass

**Immutability triggers**: `BEFORE UPDATE` triggers on `devis`, `factures`, `acomptes`, `avenants` block any modification once `locked = 1`. The only allowed transition on locked factures is `emise → payee`. Triggers are defined in `schema.sql` and re-applied at every startup (idempotent `CREATE OR REPLACE`).

**Sealing chain**: `journal_scellement` rows must never be inserted outside of `ScelleService.scellerDocument()`. The cumulative SHA-256 chain links every document; `verifierChaine()` detects any break. Integrity is verifiable via `GET /api/factures/scellement/verifier`.

**Numbering**: `NumerotationService.getNextNumero()` is the only safe way to allocate document numbers. It uses `ON CONFLICT DO UPDATE` to guarantee no gap and no duplicate, even under concurrent requests.

**FEC**: `fec_ecritures` columns follow the exact DGFiP specification. `FecExportService.exporterCSV()` tab-separates them. Do not rename columns or change their order.

**Archives**: `archive_documents` is immutable (UPDATE and DELETE blocked by triggers). Retention is 10 years.
