# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run dev      # ts-node + nodemon hot-reload, http://localhost:3000
npm run build    # tsc -> dist/
npm start        # node dist/server/index.js (prod)
```

DB default: `postgresql://facturation:facturation@localhost:5432/facturation` (override with `DATABASE_URL` in `.env`).

Admin default on first start: `admin@localhost` / `Admin1234!` (override with `ADMIN_EMAIL` / `ADMIN_DEFAULT_PASS`).

`npm run build` also copies `src/client/` → `dist/client/` and all `*.sql` from `src/server/db/` → `dist/server/db/`. When adding a new migration or client asset, the build step is required before `npm start` picks it up.

### Installer (Inno Setup)
```powershell
.\installer\build.ps1   # compiles TS, builds prod payload, downloads portable Node + NSSM
# Then compile installer\FacturPro.iss with Inno Setup 6+ -> FacturPro-Setup.exe
```

## Architecture

**Entry point**: `src/server/index.ts` — Express app. All routes are under `/api/*` and protected by the `authenticate` JWT middleware, except `/api/auth`.

**Database layer**: `src/server/db/database.ts`
- Exports `query()`, `getPool()`, and `withTransaction<T>(fn)` (use for multi-step atomic operations).
- `initDb()` runs `schema.sql` then each migration in order; called once at startup before the server listens.
- PostgreSQL timestamps are parsed to ISO strings via `types.setTypeParser`.

**Adding a migration**: create `src/server/db/migration_NNN_name.sql` (must be idempotent: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) **and** register it explicitly in `initDb()` in `database.ts`. Migrations currently present: 001–008, 010–016 (009 is intentionally absent — do not reuse that number). Notable schema additions by migration:
- 004: `articles.stock` (nullable = unmanaged) + `numero_serie` on devis/facture line items
- 006/007: SEPA fields on `clients` (`iban`, `bic`, `mandat_rum`, `mandat_date`, `mandat_type`) and on `entreprise`
- 008: `clients.mode_reglement_defaut`
- 011: `factures.type_avoir` — `'valoir'` (default) or `'remboursement'`
- 012: `entreprise.cgv_texte` and `entreprise.mention_legale`
- 013: creates `audit_log` table
- 014: `clients.conditions_paiement`
- 015: `devis.created_by` (FK → `utilisateurs`)
- 016: `user_entreprises.voir_tout` (commercial visibility flag)

**Type augmentation**: `src/server/types/express.d.ts` extends `Express.Request` with `user?: AuthUser`. Import `AuthUser` from `middleware/auth` when you need the type elsewhere.

**Auth middleware**: `src/server/middleware/auth.ts`
- `authenticate` — validates Bearer JWT, attaches `req.user` (`AuthUser`: `id`, `email`, `entreprise_id`, `role`, `is_super_admin`, `voir_tout`).
- `requirePerm('resource:r|w')` — guards routes; `is_super_admin` bypasses all permission checks.
- Roles: `admin`, `comptable`, `commercial`, `lecteur`. Permission matrix is in `ROLE_PERMS` in that file.
- `voir_tout` is only meaningful for the `commercial` role (always `true` for other roles). When `false`, list endpoints filter documents to only those where `created_by = req.user.id`. The flag lives in `user_entreprises.voir_tout` and is embedded in the JWT at login. **Changing `voir_tout` in the DB takes effect only after the user re-authenticates** (the old JWT still carries the old value).

**Multi-tenant**: every business entity (`clients`, `articles`, `devis`, `factures`, `acomptes`, `bons_livraison`) carries an `entreprise_id`. Routes scope queries to `req.user.entreprise_id`. A user can belong to multiple companies via `user_entreprises`.

**Services** (`src/server/services/`):
- `NumerotationService` — atomic `INSERT … ON CONFLICT DO UPDATE` on `sequence_numerotation`; produces `FAC-YYYY-NNNN`, `DEV-YYYY-NNNN`, etc. Never call raw `INSERT` for numbering.
- `ScelleService` — chained SHA-256 in `journal_scellement`; must be called after emitting a fiscal document. The table is immutable (UPDATE/DELETE blocked by DB triggers).
- `FacturXService` — PDFKit PDF generation + EN 16931 XML. Generates devis, factures, acomptes, bons-livraison as streams (`generer*Stream`) or to disk (`genererFacture`). Logo color is extracted at runtime with `sharp`.
- `FecExportService` — writes accounting entries to `fec_ecritures` when a facture is emitted; exports them as tab-separated text (DGFiP FEC format). **Do not alter column names or order.**
- `LettreService` — lettrage (account matching) of `fec_ecritures` compte 411 lines. `getNextLettre()` uses `sequence_numerotation` with type `LETTRAGE`; `lettrerPaiement()` is called automatically when marking a facture `payee`.
- `BackupScheduler` — `node-cron` job calling `pg_dump.exe` (path from `PG_BIN` env var). Config stored in `backup_config` table; reloaded via `loadAndSchedule()`.
- `EmailService` — Nodemailer; uses SMTP config from `entreprise` table if present, otherwise falls back to Ethereal test account auto-created at runtime.
- `ArchiveService` — stores immutable JSON snapshots of documents in `archive_documents` (SHA-256 hash, 10-year retention). `archiver()` is idempotent (`ON CONFLICT DO NOTHING` on `type_document + document_id_original`). Must be called when a document reaches a terminal status.
- `AvenantService` — creates amendments to signed devis. An avenant can only be created when the parent `devis.statut = 'signe'`; it allocates its own number via `NumerotationService` and seals via `ScelleService`.

**Additional routes** not listed above:
- `sepa` — generates SEPA direct debit XML (pain.008) for a batch of factures. POST `/api/sepa/generer` with `{ facture_ids, date_execution, sequence }`.
- `lettrage` — GET `/api/lettrage` lists compte-411 FEC entries; POST `/api/lettrage/lettrer` for manual matching.
- `stats` — GET `/api/stats/kpis?periode=mois|trimestre|annee` returns financial KPIs (CA, factures emises/payees, impayés, etc.).
- `audit` — GET `/api/audit` reads `audit_log`. The exported `logAudit()` helper is used by other routes to record sensitive actions.

**Email endpoints on factures** (`src/server/routes/factures.ts`):
- `POST /:id/envoyer` — auto-sends to the client's email from DB.
- `POST /:id/envoyer-email` — sends to an explicitly provided `email_client` body field.
- `POST /:id/relancer` — dunning email with a custom subject/body and PDF attachment.
- `GET /:id/eml` — returns a pre-composed RFC 822 `.eml` file for download.
- `POST /:id/mapi` — Windows-only: spawns `powershell.exe` to invoke `MAPISendMail`, opening the user's local mail client. Uses temp files in `os.tmpdir()` and cleans them up automatically.

**Frontend**: `src/client/` — plain HTML/CSS/JS SPA served as static files by Express. All API calls use `fetch` with a `Bearer` token stored in `localStorage`. The catch-all `app.get('*')` route returns `index.html` for client-side routing.

**PDF storage**: `storage/pdf/` — served at `/storage`. Logo is read from `storage/logo/logo_pdf.png` (preferred) or the path in `entreprise.logo_path`.

**File uploads**: Logo is uploaded via `multer` at `POST /api/entreprise/logo` — stored to `storage/logo/logo_pdf.png`.

**Error responses**: All errors go through `src/server/middleware/errorHandler.ts`. Messages containing `INALTÉR` or `ISCA` (immutability/sealing violations from DB triggers) return HTTP 403; everything else returns 500. Response body is always `{ error: string }`.

**Tests**: `@playwright/test` is installed as a devDependency but there is no `npm test` script configured. Playwright tests (if any) must be run directly with `npx playwright test`.

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
