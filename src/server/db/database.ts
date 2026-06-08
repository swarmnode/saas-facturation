import { Pool, types } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Retourne les TIMESTAMPTZ et DATE sous forme de chaînes ISO
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());
types.setTypeParser(1114, (val: string) => new Date(val + 'Z').toISOString());
types.setTypeParser(1082, (val: string) => val); // DATE → string YYYY-MM-DD

const SCHEMA_PATH     = path.resolve(__dirname, 'schema.sql');
const MIGRATION_PATH  = path.resolve(__dirname, 'migration_001_auth.sql');
const MIGRATION2_PATH = path.resolve(__dirname, 'migration_002_backup_config.sql');
const MIGRATION3_PATH = path.resolve(__dirname, 'migration_003_avoir.sql');
const MIGRATION4_PATH = path.resolve(__dirname, 'migration_004_stock_serie.sql');
const MIGRATION5_PATH = path.resolve(__dirname, 'migration_005_client_adresse2.sql');
const MIGRATION6_PATH = path.resolve(__dirname, 'migration_006_client_sepa.sql');
const MIGRATION7_PATH = path.resolve(__dirname, 'migration_007_entreprise_sepa.sql');
const MIGRATION8_PATH  = path.resolve(__dirname, 'migration_008_client_reglement.sql');
const MIGRATION10_PATH = path.resolve(__dirname, 'migration_010_article_prix_achat.sql');
const MIGRATION11_PATH = path.resolve(__dirname, 'migration_011_avoir_type.sql');
const MIGRATION12_PATH = path.resolve(__dirname, 'migration_012_cgv.sql');
const MIGRATION13_PATH = path.resolve(__dirname, 'migration_013_audit_log.sql');
const MIGRATION14_PATH = path.resolve(__dirname, 'migration_014_client_conditions_paiement.sql');
const MIGRATION15_PATH = path.resolve(__dirname, 'migration_015_devis_created_by.sql');
const MIGRATION16_PATH = path.resolve(__dirname, 'migration_016_user_voir_tout.sql');
const MIGRATION17_PATH = path.resolve(__dirname, 'migration_017_archive_entreprise.sql');
const MIGRATION18_PATH = path.resolve(__dirname, 'migration_018_exercices.sql');
const MIGRATION19_PATH = path.resolve(__dirname, 'migration_019_mentions_legales.sql');
const MIGRATION20_PATH = path.resolve(__dirname, 'migration_020_tva_deductible.sql');
const MIGRATION21_PATH = path.resolve(__dirname, 'migration_021_relances_signature.sql');
const MIGRATION22_PATH = path.resolve(__dirname, 'migration_022_notif_echeance.sql');
const MIGRATION23_PATH = path.resolve(__dirname, 'migration_023_factures_fournisseurs.sql');
const MIGRATION24_PATH = path.resolve(__dirname, 'migration_024_comment_lines.sql');
const MIGRATION25_PATH = path.resolve(__dirname, 'migration_025_commentaires_predefinis.sql');
const MIGRATION26_PATH = path.resolve(__dirname, 'migration_026_fournisseurs_commandes.sql');
const MIGRATION27_PATH = path.resolve(__dirname, 'migration_027_acompte_facture.sql');

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://facturation:facturation@localhost:5432/facturation',
    });
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

  const migration = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  await getPool().query(migration);

  const migration2 = fs.readFileSync(MIGRATION2_PATH, 'utf-8');
  await getPool().query(migration2);

  const migration3 = fs.readFileSync(MIGRATION3_PATH, 'utf-8');
  await getPool().query(migration3);

  const migration4 = fs.readFileSync(MIGRATION4_PATH, 'utf-8');
  await getPool().query(migration4);

  const migration5 = fs.readFileSync(MIGRATION5_PATH, 'utf-8');
  await getPool().query(migration5);

  const migration6 = fs.readFileSync(MIGRATION6_PATH, 'utf-8');
  await getPool().query(migration6);

  const migration7 = fs.readFileSync(MIGRATION7_PATH, 'utf-8');
  await getPool().query(migration7);

  const migration8 = fs.readFileSync(MIGRATION8_PATH, 'utf-8');
  await getPool().query(migration8);

  const migration10 = fs.readFileSync(MIGRATION10_PATH, 'utf-8');
  await getPool().query(migration10);

  const migration11 = fs.readFileSync(MIGRATION11_PATH, 'utf-8');
  await getPool().query(migration11);

  const migration12 = fs.readFileSync(MIGRATION12_PATH, 'utf-8');
  await getPool().query(migration12);

  const migration13 = fs.readFileSync(MIGRATION13_PATH, 'utf-8');
  await getPool().query(migration13);

  const migration14 = fs.readFileSync(MIGRATION14_PATH, 'utf-8');
  await getPool().query(migration14);

  const migration15 = fs.readFileSync(MIGRATION15_PATH, 'utf-8');
  await getPool().query(migration15);

  const migration16 = fs.readFileSync(MIGRATION16_PATH, 'utf-8');
  await getPool().query(migration16);

  const migration17 = fs.readFileSync(MIGRATION17_PATH, 'utf-8');
  await getPool().query(migration17);

  const migration18 = fs.readFileSync(MIGRATION18_PATH, 'utf-8');
  await getPool().query(migration18);

  const migration19 = fs.readFileSync(MIGRATION19_PATH, 'utf-8');
  await getPool().query(migration19);

  const migration20 = fs.readFileSync(MIGRATION20_PATH, 'utf-8');
  await getPool().query(migration20);

  const migration21 = fs.readFileSync(MIGRATION21_PATH, 'utf-8');
  await getPool().query(migration21);

  const migration22 = fs.readFileSync(MIGRATION22_PATH, 'utf-8');
  await getPool().query(migration22);

  const migration23 = fs.readFileSync(MIGRATION23_PATH, 'utf-8');
  await getPool().query(migration23);

  const migration24 = fs.readFileSync(MIGRATION24_PATH, 'utf-8');
  await getPool().query(migration24);

  const migration25 = fs.readFileSync(MIGRATION25_PATH, 'utf-8');
  await getPool().query(migration25);

  const migration26 = fs.readFileSync(MIGRATION26_PATH, 'utf-8');
  await getPool().query(migration26);

  const migration27 = fs.readFileSync(MIGRATION27_PATH, 'utf-8');
  await getPool().query(migration27);

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
