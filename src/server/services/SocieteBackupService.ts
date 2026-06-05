import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, PassThrough, Writable } from 'stream';
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
}

// ─── Définition des tables (ordre FK : les parents avant les enfants) ─────────

interface TableDef {
  name: string;
  sql: (eid: number) => string;
  // Certaines tables ont des triggers UPDATE/DELETE inaltérables → INSERT uniquement
  immutable?: boolean;
  // Conflit sur séquence numérotation : prendre le maximum
  conflictSql?: string;
}

const TABLES: TableDef[] = [
  {
    name: 'entreprise',
    sql: eid => `SELECT * FROM entreprise WHERE id = ${eid}`,
  },
  {
    // On exporte uniquement les utilisateurs liés à cette société
    name: 'utilisateurs',
    sql: eid => `SELECT * FROM utilisateurs WHERE id IN (SELECT user_id FROM user_entreprises WHERE entreprise_id = ${eid})`,
  },
  {
    name: 'user_entreprises',
    sql: eid => `SELECT * FROM user_entreprises WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'sequence_numerotation',
    sql: eid => `SELECT * FROM sequence_numerotation WHERE entreprise_id = ${eid}`,
    // Prendre le max pour ne jamais rétrograder une séquence
    conflictSql: 'ON CONFLICT DO NOTHING',
  },
  {
    name: 'clients',
    sql: eid => `SELECT * FROM clients WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'articles',
    sql: eid => `SELECT * FROM articles WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'devis',
    sql: eid => `SELECT * FROM devis WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'devis_lignes',
    sql: eid => `SELECT dl.* FROM devis_lignes dl WHERE dl.devis_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})`,
  },
  {
    name: 'avenants',
    sql: eid => `SELECT a.* FROM avenants a WHERE a.devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})`,
  },
  {
    name: 'avenants_lignes',
    sql: eid => `SELECT al.* FROM avenants_lignes al WHERE al.avenant_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid}))`,
  },
  {
    name: 'factures',
    sql: eid => `SELECT * FROM factures WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'factures_lignes',
    sql: eid => `SELECT fl.* FROM factures_lignes fl WHERE fl.facture_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid})`,
  },
  {
    name: 'acomptes',
    sql: eid => `SELECT * FROM acomptes WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'bons_livraison',
    sql: eid => `SELECT * FROM bons_livraison WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'bons_livraison_lignes',
    sql: eid => `SELECT bl.* FROM bons_livraison_lignes bl WHERE bl.bl_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = ${eid})`,
  },
  {
    name: 'factures_fournisseurs',
    sql: eid => `SELECT * FROM factures_fournisseurs WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'fec_ecritures',
    sql: eid =>
      `SELECT fe.* FROM fec_ecritures fe WHERE ` +
      `fe.facture_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid}) ` +
      `OR fe.facture_fournisseur_id IN (SELECT id FROM factures_fournisseurs WHERE entreprise_id = ${eid})`,
  },
  {
    // Pas de colonne entreprise_id directe → filtre par type+document_id
    name: 'journal_scellement',
    sql: eid =>
      `SELECT js.* FROM journal_scellement js WHERE ` +
      `(js.type_document IN ('FACTURE','AVOIR') AND js.document_id IN (SELECT id FROM factures WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'DEVIS'    AND js.document_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'ACOMPTE'  AND js.document_id IN (SELECT id FROM acomptes WHERE entreprise_id = ${eid})) ` +
      `OR (js.type_document = 'AVENANT'  AND js.document_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = ${eid}))) ` +
      `OR (js.type_document = 'BL'       AND js.document_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = ${eid}))`,
    immutable: true,
  },
  {
    name: 'archive_documents',
    sql: eid => `SELECT * FROM archive_documents WHERE entreprise_id = ${eid}`,
    immutable: true,
  },
  {
    name: 'audit_log',
    sql: eid => `SELECT * FROM audit_log WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'tva_deductible',
    sql: eid => `SELECT * FROM tva_deductible WHERE entreprise_id = ${eid}`,
  },
  {
    name: 'exercices',
    sql: eid => `SELECT * FROM exercices WHERE entreprise_id = ${eid}`,
  },
];

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exporterSociete(entreprise_id: number): Promise<Buffer> {
  const entRes = await query('SELECT raison_sociale FROM entreprise WHERE id = $1', [entreprise_id]);
  if (!entRes.rows.length) throw new Error(`Société ${entreprise_id} introuvable`);
  const raison_sociale: string = entRes.rows[0].raison_sociale;

  const tables: SocieteBackup['tables'] = [];

  for (const def of TABLES) {
    const res = await query(def.sql(entreprise_id));
    if (!res.rows.length) {
      tables.push({ name: def.name, columns: [], rows: [] });
      continue;
    }
    const columns = Object.keys(res.rows[0]);
    const rows = res.rows.map(row => columns.map(c => row[c]));
    tables.push({ name: def.name, columns, rows });
  }

  const backup: SocieteBackup = {
    format: 'societe-v1',
    version: process.env.npm_package_version ?? '0.0.0',
    entreprise_id,
    raison_sociale,
    exported_at: new Date().toISOString(),
    tables,
  };

  const json = JSON.stringify(backup);
  return await gzip(Buffer.from(json, 'utf8'));
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export interface RestoreResult {
  entreprise_id: number;
  raison_sociale: string;
  tables: Array<{ name: string; inserted: number; skipped: number }>;
}

export async function restaurerSociete(buffer: Buffer): Promise<RestoreResult> {
  const json = (await gunzip(buffer)).toString('utf8');
  const backup: SocieteBackup = JSON.parse(json);

  if (backup.format !== 'societe-v1') {
    throw new Error(`Format non supporté : "${backup.format}". Utilisez un fichier exporté par FacturPro.`);
  }

  const result: RestoreResult = {
    entreprise_id: backup.entreprise_id,
    raison_sociale: backup.raison_sociale,
    tables: [],
  };

  await withTransaction(async client => {
    for (const def of TABLES) {
      const tableData = backup.tables.find(t => t.name === def.name);
      if (!tableData || !tableData.rows.length || !tableData.columns.length) {
        result.tables.push({ name: def.name, inserted: 0, skipped: 0 });
        continue;
      }

      const { columns, rows } = tableData;
      let inserted = 0;
      let skipped = 0;

      // Filtrer les colonnes qui existent dans la table cible (compatibilité entre versions)
      const colList = columns.join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      // Toutes les tables : INSERT ON CONFLICT DO NOTHING
      // - Tables immuables (journal_scellement, archive_documents) : triggers UPDATE/DELETE bloquants, INSERT OK
      // - Documents verrouillés : triggers UPDATE bloquants, INSERT OK
      // - Utilisateurs : ON CONFLICT DO NOTHING évite d'écraser des comptes existants
      const sql = `INSERT INTO ${def.name} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      for (const row of rows) {
        try {
          const r = await client.query(sql, row);
          if (r.rowCount && r.rowCount > 0) inserted++;
          else skipped++;
        } catch (e: any) {
          // Colonne inconnue (backup d'une version plus récente) → retry sans cette colonne
          if (e.code === '42703') {
            // Tenter de trouver les colonnes valides
            const validCols = await getExistingColumns(client, def.name);
            const filtered = filterColumns(columns, row, validCols);
            if (filtered.cols.length === 0) { skipped++; continue; }
            const sqlF = `INSERT INTO ${def.name} (${filtered.cols.join(', ')}) VALUES (${filtered.cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`;
            const r2 = await client.query(sqlF, filtered.vals);
            if (r2.rowCount && r2.rowCount > 0) inserted++;
            else skipped++;
          } else {
            throw e;
          }
        }
      }

      result.tables.push({ name: def.name, inserted, skipped });
    }
  });

  return result;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

async function getExistingColumns(client: any, table: string): Promise<string[]> {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [table]
  );
  return r.rows.map((row: any) => row.column_name as string);
}

function filterColumns(columns: string[], row: unknown[], valid: string[]) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  columns.forEach((c, i) => {
    if (valid.includes(c)) { cols.push(c); vals.push(row[i]); }
  });
  return { cols, vals };
}

function gzip(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip({ level: 6 });
    gz.on('data', d => chunks.push(d));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(input);
  });
}

function gunzip(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGunzip();
    gz.on('data', d => chunks.push(d));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(input);
  });
}
