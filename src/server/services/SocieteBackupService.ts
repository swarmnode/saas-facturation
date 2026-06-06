import { createGzip, createGunzip } from 'zlib';
import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../db/database';

// ─── Format du fichier ────────────────────────────────────────────────────────

export interface SocieteBackup {
  format: 'societe-v1';
  version: string;
  entreprise_id: number;
  raison_sociale: string;
  exported_at: string;
  tables: Array<{
    name: string;
    columns: string[];
    rows: unknown[][];
  }>;
  files?: Array<{
    path: string;  // chemin relatif depuis process.cwd()
    data: string;  // base64
  }>;
}

// ─── Mode de restauration ─────────────────────────────────────────────────────
//
//  'skip'  : INSERT ON CONFLICT DO NOTHING — même instance, les lignes déjà
//            présentes (même PK) sont conservées, les manquantes sont insérées.
//
//  'remap' : chaque table reçoit de nouveaux IDs consécutifs au MAX(id) actuel
//            de la table cible ; toutes les colonnes FK sont remappées en
//            cascade. Conçu pour l'import cross-instance sans collision.
//
export type RestoreMode = 'skip' | 'remap';

// ─── Colonnes FK à remapper en mode 'remap' ───────────────────────────────────

interface FkCol {
  col: string;       // nom de la colonne dans cette table
  ref: string;       // table référencée
  nullable?: boolean;
}

const FK_COLUMNS: Record<string, FkCol[]> = {
  user_entreprises: [
    { col: 'user_id',       ref: 'utilisateurs' },
    { col: 'entreprise_id', ref: 'entreprise'   },
  ],
  sequence_numerotation: [{ col: 'entreprise_id', ref: 'entreprise' }],
  clients:  [{ col: 'entreprise_id', ref: 'entreprise' }],
  articles: [{ col: 'entreprise_id', ref: 'entreprise' }],
  devis: [
    { col: 'client_id',    ref: 'clients'      },
    { col: 'entreprise_id',ref: 'entreprise'   },
    { col: 'created_by',   ref: 'utilisateurs', nullable: true },
  ],
  devis_lignes: [{ col: 'devis_id', ref: 'devis' }],
  avenants:       [{ col: 'devis_initial_id', ref: 'devis'    }],
  avenants_lignes:[{ col: 'avenant_id',       ref: 'avenants' }],
  factures: [
    { col: 'devis_id',           ref: 'devis',    nullable: true },
    { col: 'client_id',          ref: 'clients'                  },
    { col: 'entreprise_id',      ref: 'entreprise'               },
    { col: 'facture_origine_id', ref: 'factures', nullable: true },
  ],
  factures_lignes: [{ col: 'facture_id', ref: 'factures' }],
  acomptes: [
    { col: 'facture_id',    ref: 'factures', nullable: true },
    { col: 'devis_id',      ref: 'devis',    nullable: true },
    { col: 'client_id',     ref: 'clients'                  },
    { col: 'entreprise_id', ref: 'entreprise'               },
  ],
  bons_livraison: [
    { col: 'client_id',     ref: 'clients'                  },
    { col: 'entreprise_id', ref: 'entreprise'               },
    { col: 'devis_id',      ref: 'devis',    nullable: true },
    { col: 'facture_id',    ref: 'factures', nullable: true },
  ],
  bons_livraison_lignes: [
    { col: 'bl_id',      ref: 'bons_livraison'       },
    { col: 'article_id', ref: 'articles', nullable: true },
  ],
  factures_fournisseurs: [{ col: 'entreprise_id', ref: 'entreprise' }],
  fec_ecritures: [
    { col: 'facture_id',             ref: 'factures',             nullable: true },
    { col: 'facture_fournisseur_id', ref: 'factures_fournisseurs',nullable: true },
  ],
  // journal_scellement.document_id : référence polymorphique gérée séparément
  archive_documents: [{ col: 'entreprise_id', ref: 'entreprise' }],
  // archive_documents.document_id_original : référence polymorphique gérée séparément
  audit_log: [
    { col: 'entreprise_id', ref: 'entreprise'               },
    { col: 'user_id',       ref: 'utilisateurs', nullable: true },
  ],
  tva_deductible: [{ col: 'entreprise_id', ref: 'entreprise' }],
  exercices:      [{ col: 'entreprise_id', ref: 'entreprise' }],
};

// type_document → table dans journal_scellement et archive_documents
const DOC_TYPE_TO_TABLE: Record<string, string> = {
  FACTURE:  'factures',
  AVOIR:    'factures',
  DEVIS:    'devis',
  ACOMPTE:  'acomptes',
  AVENANT:  'avenants',
  BL:       'bons_livraison',
};

// ─── Définition des tables exportées (ordre FK) ───────────────────────────────

interface TableDef {
  name: string;
  sql: (eid: number) => string;
}

const TABLES: TableDef[] = [
  { name: 'entreprise',          sql: eid => `SELECT * FROM entreprise WHERE id = ${eid}` },
  { name: 'utilisateurs',        sql: eid => `SELECT * FROM utilisateurs WHERE id IN (SELECT user_id FROM user_entreprises WHERE entreprise_id = ${eid})` },
  { name: 'user_entreprises',    sql: eid => `SELECT * FROM user_entreprises WHERE entreprise_id = ${eid}` },
  { name: 'sequence_numerotation', sql: eid => `SELECT * FROM sequence_numerotation WHERE entreprise_id = ${eid}` },
  { name: 'clients',             sql: eid => `SELECT * FROM clients WHERE entreprise_id = ${eid}` },
  { name: 'articles',            sql: eid => `SELECT * FROM articles WHERE entreprise_id = ${eid}` },
  { name: 'devis',               sql: eid => `SELECT * FROM devis WHERE entreprise_id = ${eid}` },
  { name: 'devis_lignes',        sql: eid => `SELECT dl.* FROM devis_lignes dl WHERE dl.devis_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})` },
  { name: 'avenants',            sql: eid => `SELECT a.* FROM avenants a WHERE a.devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})` },
  { name: 'avenants_lignes',     sql: eid => `SELECT al.* FROM avenants_lignes al WHERE al.avenant_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid}))` },
  { name: 'factures',            sql: eid => `SELECT * FROM factures WHERE entreprise_id = ${eid}` },
  { name: 'factures_lignes',     sql: eid => `SELECT fl.* FROM factures_lignes fl WHERE fl.facture_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid})` },
  { name: 'acomptes',            sql: eid => `SELECT * FROM acomptes WHERE entreprise_id = ${eid}` },
  { name: 'bons_livraison',      sql: eid => `SELECT * FROM bons_livraison WHERE entreprise_id = ${eid}` },
  { name: 'bons_livraison_lignes', sql: eid => `SELECT bl.* FROM bons_livraison_lignes bl WHERE bl.bl_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = ${eid})` },
  { name: 'factures_fournisseurs', sql: eid => `SELECT * FROM factures_fournisseurs WHERE entreprise_id = ${eid}` },
  { name: 'fec_ecritures',       sql: eid => `SELECT fe.* FROM fec_ecritures fe WHERE fe.facture_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid}) OR fe.facture_fournisseur_id IN (SELECT id FROM factures_fournisseurs WHERE entreprise_id = ${eid})` },
  { name: 'journal_scellement',  sql: eid =>
      `SELECT js.* FROM journal_scellement js WHERE ` +
      `(js.type_document IN ('FACTURE','AVOIR') AND js.document_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'DEVIS'   AND js.document_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'ACOMPTE' AND js.document_id IN (SELECT id FROM acomptes WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'AVENANT' AND js.document_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid}))) ` +
      `OR (js.type_document = 'BL'      AND js.document_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = ${eid}))` },
  { name: 'archive_documents',   sql: eid => `SELECT * FROM archive_documents WHERE entreprise_id = ${eid}` },
  { name: 'audit_log',           sql: eid => `SELECT * FROM audit_log WHERE entreprise_id = ${eid}` },
  { name: 'tva_deductible',      sql: eid => `SELECT * FROM tva_deductible WHERE entreprise_id = ${eid}` },
  { name: 'exercices',           sql: eid => `SELECT * FROM exercices WHERE entreprise_id = ${eid}` },
];

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exporterSociete(entreprise_id: number): Promise<Buffer> {
  const entRes = await query('SELECT raison_sociale FROM entreprise WHERE id = $1', [entreprise_id]);
  if (!entRes.rows.length) throw new Error(`Société ${entreprise_id} introuvable`);
  const raison_sociale: string = entRes.rows[0].raison_sociale;

  const tables: SocieteBackup['tables'] = [];
  for (const def of TABLES) {
    const res = await query(def.sql(entreprise_id));
    if (!res.rows.length) { tables.push({ name: def.name, columns: [], rows: [] }); continue; }
    const columns = Object.keys(res.rows[0]);
    const rows = res.rows.map(row => columns.map(c => row[c]));
    tables.push({ name: def.name, columns, rows });
  }

  // Logo : storage/logo/logo_pdf.png (chemin canonique unique)
  const files: SocieteBackup['files'] = [];
  const logoPath = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
  if (fs.existsSync(logoPath)) {
    files.push({
      path: 'storage/logo/logo_pdf.png',
      data: fs.readFileSync(logoPath).toString('base64'),
    });
  }

  const backup: SocieteBackup = {
    format: 'societe-v1',
    version: process.env.npm_package_version ?? '0.0.0',
    entreprise_id,
    raison_sociale,
    exported_at: new Date().toISOString(),
    tables,
    ...(files.length ? { files } : {}),
  };

  return gzip(Buffer.from(JSON.stringify(backup), 'utf8'));
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export interface RestoreResult {
  entreprise_id: number;
  raison_sociale: string;
  mode: RestoreMode;
  tables: Array<{ name: string; inserted: number; skipped: number }>;
}

export async function restaurerSociete(
  buffer: Buffer,
  mode: RestoreMode = 'skip'
): Promise<RestoreResult> {
  const json = (await gunzip(buffer)).toString('utf8');
  const backup: SocieteBackup = JSON.parse(json);

  if (backup.format !== 'societe-v1') {
    throw new Error(`Format non supporté : "${backup.format}". Utilisez un fichier exporté par FacturPro.`);
  }

  const result: RestoreResult = {
    entreprise_id: backup.entreprise_id,
    raison_sociale: backup.raison_sociale,
    mode,
    tables: [],
  };

  // Restaurer les fichiers (logo…) avant la transaction DB
  if (backup.files?.length) {
    for (const f of backup.files) {
      const dest = path.resolve(process.cwd(), f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(f.data, 'base64'));
    }
  }

  await withTransaction(async client => {
    // En mode 'remap' : calcul des nouveaux IDs avant toute insertion
    const idMap = mode === 'remap' ? await buildIdMap(client, backup) : null;

    for (const def of TABLES) {
      const tableData = backup.tables.find(t => t.name === def.name);
      if (!tableData || !tableData.rows.length || !tableData.columns.length) {
        result.tables.push({ name: def.name, inserted: 0, skipped: 0 });
        continue;
      }

      let { columns, rows } = tableData;
      let inserted = 0;
      let skipped = 0;

      // Filtrer colonnes inconnues (backup d'une version plus récente)
      const validCols = await getExistingColumns(client, def.name);
      const colMask = columns.map(c => validCols.includes(c));
      if (!colMask.some(Boolean)) { result.tables.push({ name: def.name, inserted: 0, skipped: rows.length }); continue; }
      const filteredCols = columns.filter((_, i) => colMask[i]);

      for (const rawRow of rows) {
        const filteredRow = rawRow.filter((_, i) => colMask[i]);

        const row = idMap
          ? remapRow(def.name, filteredCols, filteredRow, idMap)
          : filteredRow;

        const placeholders = filteredCols.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${def.name} (${filteredCols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

        try {
          const r = await client.query(sql, row);
          if (r.rowCount && r.rowCount > 0) inserted++;
          else skipped++;
        } catch (e: any) {
          // Erreur inattendue → on la propage
          throw e;
        }
      }

      result.tables.push({ name: def.name, inserted, skipped });
    }

    // Recaler toutes les séquences SERIAL sur MAX(id) de chaque table
    for (const def of TABLES) {
      try {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${def.name}), 1), true)`,
          [def.name]
        );
      } catch { /* table sans séquence sur 'id' */ }
    }
  });

  return result;
}

// ─── Mode remap : calcul des nouveaux IDs ────────────────────────────────────

// IdMap : table → (ancien_id → nouvel_id)
type IdMap = Map<string, Map<number, number>>;

async function buildIdMap(client: any, backup: SocieteBackup): Promise<IdMap> {
  const idMap: IdMap = new Map();

  for (const tableData of backup.tables) {
    if (!tableData.rows.length) continue;
    const idIdx = tableData.columns.indexOf('id');
    if (idIdx === -1) continue;

    // MAX(id) actuel dans la table cible
    const r = await client.query(`SELECT COALESCE(MAX(id), 0)::int AS mx FROM ${tableData.name}`);
    let nextId: number = (r.rows[0].mx as number) + 1;

    const tableMap = new Map<number, number>();
    for (const row of tableData.rows) {
      const oldId = row[idIdx] as number;
      tableMap.set(oldId, nextId++);
    }
    idMap.set(tableData.name, tableMap);
  }

  return idMap;
}

function remapRow(
  tableName: string,
  columns: string[],
  row: unknown[],
  idMap: IdMap
): unknown[] {
  const out = [...row];

  // 1. Remapper la PK (id)
  const idIdx = columns.indexOf('id');
  if (idIdx !== -1 && out[idIdx] !== null) {
    const newId = idMap.get(tableName)?.get(out[idIdx] as number);
    if (newId !== undefined) out[idIdx] = newId;
  }

  // 2. Remapper les FK standard
  for (const fk of FK_COLUMNS[tableName] ?? []) {
    const colIdx = columns.indexOf(fk.col);
    if (colIdx === -1 || out[colIdx] === null || out[colIdx] === undefined) continue;
    const newVal = idMap.get(fk.ref)?.get(out[colIdx] as number);
    if (newVal !== undefined) out[colIdx] = newVal;
    // Si la FK est nullable et la référence absente du backup, laisser l'ancienne valeur
    // (peut pointer sur un enregistrement déjà présent dans la cible, ex. taux_tva)
  }

  // 3. journal_scellement.document_id (polymorphique)
  if (tableName === 'journal_scellement') {
    const typeIdx = columns.indexOf('type_document');
    const docIdx  = columns.indexOf('document_id');
    if (typeIdx !== -1 && docIdx !== -1 && out[docIdx] !== null) {
      const refTable = DOC_TYPE_TO_TABLE[out[typeIdx] as string];
      if (refTable) {
        const newDocId = idMap.get(refTable)?.get(out[docIdx] as number);
        if (newDocId !== undefined) out[docIdx] = newDocId;
      }
    }
  }

  // 4. archive_documents.document_id_original (polymorphique)
  if (tableName === 'archive_documents') {
    const typeIdx = columns.indexOf('type_document');
    const docIdx  = columns.indexOf('document_id_original');
    if (typeIdx !== -1 && docIdx !== -1 && out[docIdx] !== null) {
      const refTable = DOC_TYPE_TO_TABLE[(out[typeIdx] as string).toUpperCase()];
      if (refTable) {
        const newDocId = idMap.get(refTable)?.get(out[docIdx] as number);
        if (newDocId !== undefined) out[docIdx] = newDocId;
      }
    }
  }

  return out;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

async function getExistingColumns(client: any, table: string): Promise<string[]> {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [table]
  );
  return r.rows.map((row: any) => row.column_name as string);
}

function gzip(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip({ level: 6 });
    gz.on('data', (d: Buffer) => chunks.push(d));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(input);
  });
}

function gunzip(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGunzip();
    gz.on('data', (d: Buffer) => chunks.push(d));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(input);
  });
}
