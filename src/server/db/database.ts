import { Pool, types } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Retourne les TIMESTAMPTZ et DATE sous forme de chaînes ISO
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());
types.setTypeParser(1114, (val: string) => new Date(val + 'Z').toISOString());
types.setTypeParser(1082, (val: string) => val); // DATE → string YYYY-MM-DD

const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// Appliquées dans l'ordre par initDb(). Toutes idempotentes.
// 009 volontairement absent — ne pas réutiliser ce numéro.
const MIGRATIONS = [
  'migration_001_auth.sql',
  'migration_002_backup_config.sql',
  'migration_003_avoir.sql',
  'migration_004_stock_serie.sql',
  'migration_005_client_adresse2.sql',
  'migration_006_client_sepa.sql',
  'migration_007_entreprise_sepa.sql',
  'migration_008_client_reglement.sql',
  'migration_010_article_prix_achat.sql',
  'migration_011_avoir_type.sql',
  'migration_012_cgv.sql',
  'migration_013_audit_log.sql',
  'migration_014_client_conditions_paiement.sql',
  'migration_015_devis_created_by.sql',
  'migration_016_user_voir_tout.sql',
  'migration_017_archive_entreprise.sql',
  'migration_018_exercices.sql',
  'migration_019_mentions_legales.sql',
  'migration_020_tva_deductible.sql',
  'migration_021_relances_signature.sql',
  'migration_022_notif_echeance.sql',
  'migration_023_factures_fournisseurs.sql',
  'migration_024_comment_lines.sql',
  'migration_025_commentaires_predefinis.sql',
  'migration_026_fournisseurs_commandes.sql',
  'migration_027_acompte_facture.sql',
  'migration_028_article_id_lignes.sql',
  'migration_029_achats_lignes.sql',
  'migration_030_backup_verif.sql',
];

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://facturation:facturation@localhost:5432/facturation',
    });
    // Sans ce handler, une erreur sur un client idle (ex. connexion coupée
    // par l'administrateur PostgreSQL) est une 'error' non gérée qui fait
    // planter tout le processus Node.
    pool.on('error', err => console.error('[db] erreur pool PostgreSQL :', err));
  }
  return pool;
}

export async function query(sql: string, params?: any[]): Promise<{ rows: any[] }> {
  return getPool().query(sql, params);
}

export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  await getPool().query(schema);

  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.resolve(__dirname, file), 'utf-8');
    await getPool().query(sql);
  }

  await createDefaultAdmin();
}

async function createDefaultAdmin(): Promise<void> {
  const r = await query('SELECT id FROM utilisateurs WHERE is_super_admin = 1 LIMIT 1');
  if (r.rows.length > 0) return;

  const bcrypt = await import('bcrypt');
  const defaultPass = process.env.ADMIN_DEFAULT_PASS ?? 'Admin1234!';
  const hash = await bcrypt.hash(defaultPass, 10);

  const ur = await query(`
    INSERT INTO utilisateurs (email, password_hash, nom, prenom, is_super_admin)
    VALUES ($1, $2, 'Administrateur', 'Super', 1)
    ON CONFLICT (email) DO UPDATE SET is_super_admin = 1
    RETURNING id
  `, [process.env.ADMIN_EMAIL ?? 'admin@localhost', hash]);

  // Créer une société par défaut si aucune n'existe (installation vierge)
  let er = await query('SELECT id FROM entreprise ORDER BY id LIMIT 1');
  if (!er.rows[0]) {
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@localhost';
    const companyName = process.env.COMPANY_NAME ?? 'Mon Entreprise';
    er = await query(`
      INSERT INTO entreprise (raison_sociale, forme_juridique, is_ei, siret, adresse, code_postal, ville, pays, email, regime_tva)
      VALUES ($1, 'SAS', 0, '00000000000000', 'A completer', '00000', 'A completer', 'FR', $2, 'normal')
      RETURNING id
    `, [companyName, adminEmail]);
    console.log(`✓ Société "${companyName}" créée — à compléter dans Paramètres`);
  }

  if (er.rows[0] && ur.rows[0]) {
    await query(`
      INSERT INTO user_entreprises (user_id, entreprise_id, role)
      VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING
    `, [ur.rows[0].id, er.rows[0].id]);
  }

  console.log(`✓ Admin par défaut créé : ${process.env.ADMIN_EMAIL ?? 'admin@localhost'} / ${defaultPass}`);
}
