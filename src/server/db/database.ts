import { Pool, types } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Retourne les TIMESTAMPTZ sous forme de chaînes ISO
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());
types.setTypeParser(1114, (val: string) => new Date(val + 'Z').toISOString());

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

  // Affecter à la première société si elle existe
  const er = await query('SELECT id FROM entreprise ORDER BY id LIMIT 1');
  if (er.rows[0] && ur.rows[0]) {
    await query(`
      INSERT INTO user_entreprises (user_id, entreprise_id, role)
      VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING
    `, [ur.rows[0].id, er.rows[0].id]);
  }

  console.log(`✓ Admin par défaut créé : ${process.env.ADMIN_EMAIL ?? 'admin@localhost'} / ${defaultPass}`);
}
