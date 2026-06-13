// Utilitaires partagés des tests E2E.
//
// Les tests n'utilisent PAS le compte admin (son mot de passe peut différer des
// valeurs par défaut sur une base de dev existante) : ils créent leur propre
// utilisateur `e2e@facturpro.test`, activé par global-setup et désactivé par
// global-teardown. Nécessite uniquement l'accès PostgreSQL (DATABASE_URL).
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import type { APIRequestContext, Page } from '@playwright/test';

export const E2E_EMAIL = 'e2e@facturpro.test';
export const E2E_PASS  = 'E2E-FacturPro-1234!';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://facturation:facturation@localhost:5432/facturation',
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  await _pool?.end();
  _pool = null;
}

export async function ensureTestUser(): Promise<void> {
  const pool = getPool();
  const hash = await bcrypt.hash(E2E_PASS, 10);
  const u = await pool.query(`
    INSERT INTO utilisateurs (email, password_hash, nom, prenom, actif, is_super_admin)
    VALUES ($1, $2, 'E2E', 'Playwright', 1, 0)
    ON CONFLICT (email) DO UPDATE SET password_hash = $2, actif = 1
    RETURNING id
  `, [E2E_EMAIL, hash]);
  const e = await pool.query('SELECT id FROM entreprise ORDER BY id LIMIT 1');
  if (!e.rows[0]) throw new Error('Aucune entreprise en base — démarrez le serveur une première fois (initDb)');
  await pool.query(`
    INSERT INTO user_entreprises (user_id, entreprise_id, role)
    VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING
  `, [u.rows[0].id, e.rows[0].id]);
}

// L'utilisateur est désactivé (pas supprimé : il peut être référencé par audit_log)
export async function disableTestUser(): Promise<void> {
  await getPool().query('UPDATE utilisateurs SET actif = 0 WHERE email = $1', [E2E_EMAIL]);
}

export async function apiLogin(request: APIRequestContext): Promise<{ token: string; entreprise_id: number; auth: { Authorization: string } }> {
  let res  = await request.post('/api/auth/login', { data: { email: E2E_EMAIL, password: E2E_PASS } });
  let body = await res.json();
  if (body.require_select) {
    res  = await request.post('/api/auth/login', {
      data: { email: E2E_EMAIL, password: E2E_PASS, entreprise_id: body.entreprises[0].id },
    });
    body = await res.json();
  }
  if (!body.token) throw new Error(`login e2e échoué : ${JSON.stringify(body)}`);
  return { token: body.token, entreprise_id: body.entreprise_id, auth: { Authorization: `Bearer ${body.token}` } };
}

// Connexion côté navigateur : la SPA lit le JWT dans localStorage ('jwt')
export async function uiLogin(page: Page, token: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(t => localStorage.setItem('jwt', t), token);
  await page.goto('/');
  await page.waitForTimeout(1200); // chargement initial de la SPA
}
