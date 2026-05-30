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
