import { test, expect } from '@playwright/test';
import { apiLogin, uiLogin, getPool, closePool } from './e2e-utils';

// Filtres de statut des listes (BL et acomptes) : le nombre de documents
// affichés après filtrage correspond à la répartition réelle en base.
// Le rendu produit 2 <tr> par document (ligne de données + ligne d'actions).
//
// `tabMgr` est un `const` global défini par app.js (script classique, non un
// module) : il n'apparaît pas sur `window` mais reste accessible comme
// identifiant global dans page.evaluate(). Cette déclaration ne sert qu'à
// TypeScript.
declare const tabMgr: any;

test.afterAll(async () => { await closePool(); });

async function repartition(table: string, entrepriseId: number): Promise<Record<string, number>> {
  const r = await getPool().query(
    `SELECT statut, COUNT(*) AS n FROM ${table} WHERE entreprise_id = $1 GROUP BY statut`, [entrepriseId]);
  return Object.fromEntries(r.rows.map((x: any) => [x.statut, Number(x.n)]));
}

const compterDocs = (page: any) => page.evaluate(() =>
  document.querySelectorAll('.tab-panel.active tbody tr').length / 2);

test('filtre de statut — bons de livraison', async ({ page, request }) => {
  const { token, entreprise_id } = await apiLogin(request);
  const attendu = await repartition('bons_livraison', entreprise_id);

  await uiLogin(page, token);
  await page.evaluate(() => tabMgr.openViewTab('bons-livraison'));
  await page.waitForSelector('#topbarActions select.btn-outline');
  await page.waitForTimeout(600);

  const sel = page.locator('#topbarActions select.btn-outline').first();
  const total = Object.values(attendu).reduce((a, b) => a + b, 0);
  for (const statut of ['brouillon', 'emis', 'livre']) {
    await sel.selectOption(statut);
    await page.waitForTimeout(300);
    const n   = await compterDocs(page);
    const exp = attendu[statut] || 0;
    // Le filtre s'applique à la page courante (50 docs) : égalité stricte
    // seulement si la liste tient sur une page
    if (total <= 50) expect(n, `statut ${statut}`).toBe(exp);
    else             expect(n, `statut ${statut}`).toBeLessThanOrEqual(exp);
  }
  await sel.selectOption('');
});

test('filtre de statut — acomptes', async ({ page, request }) => {
  const { token, entreprise_id } = await apiLogin(request);
  const attendu = await repartition('acomptes', entreprise_id);

  await uiLogin(page, token);
  await page.evaluate(() => tabMgr.openViewTab('acomptes'));
  await page.waitForSelector('#topbarActions select.btn-outline');
  await page.waitForTimeout(600);

  const sel = page.locator('#topbarActions select.btn-outline').first();
  const total = Object.values(attendu).reduce((a, b) => a + b, 0);
  for (const statut of ['en_attente', 'encaisse']) {
    await sel.selectOption(statut);
    await page.waitForTimeout(300);
    const n   = await compterDocs(page);
    const exp = attendu[statut] || 0;
    if (total <= 50) expect(n, `statut ${statut}`).toBe(exp);
    else             expect(n, `statut ${statut}`).toBeLessThanOrEqual(exp);
  }
});
