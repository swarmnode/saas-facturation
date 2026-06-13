import { test, expect } from '@playwright/test';
import { apiLogin, uiLogin, closePool } from './e2e-utils';

// Éditeur WYSIWYG : comportement des sous-champs (description masquée quand
// vide, révélée au survol), indicateurs de saut de page, et flux
// commande -> facture d'achat pré-remplie avec chaînage automatique.
//
// `DocEditor` est un `const` global défini par editor.js (script classique,
// non un module) : il n'apparaît pas sur `window` mais reste accessible comme
// identifiant global dans page.evaluate(). Cette déclaration ne sert qu'à
// TypeScript.
declare const DocEditor: any;

test.afterAll(async () => { await closePool(); });

test('sous-champs masqués quand vides, révélés au survol, sauts de page', async ({ page, request }) => {
  const { token } = await apiLogin(request);
  await uiLogin(page, token);

  await page.evaluate(() => DocEditor.openDevis());
  await page.waitForSelector('.tab-panel.active .e-ligne-row');

  const row  = page.locator('.tab-panel.active .e-ligne-row').first();
  const desc = row.locator('.e-description-inp');

  // Vide -> masquée
  await expect(desc).toBeHidden();
  await expect(desc).toHaveClass(/e-sub-empty/);

  // Survol de la ligne -> révélée pour saisie
  await row.hover();
  await expect(desc).toBeVisible();

  // Remplie -> reste visible hors survol
  await desc.click();
  await desc.evaluate(el => {
    (el as HTMLElement).innerText = 'Description e2e multi-mots pour la hauteur';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.tab-panel.active .e-tb-title').click();
  await page.mouse.move(5, 5);
  await expect(desc).toBeVisible();

  // 41 lignes -> au moins un indicateur « — Page 2 — » (miroir du PDF)
  await page.evaluate(() => {
    const btn = document.querySelector('.tab-panel.active .e-add-btn') as HTMLElement;
    for (let i = 0; i < 40; i++) btn.click();
  });
  await page.waitForTimeout(800);
  expect(await page.locator('.tab-panel.active .e-page-break').count()).toBeGreaterThanOrEqual(1);
});

test('facture d\'achat pré-remplie depuis une commande, chaînage au save', async ({ page, request }) => {
  const { auth, token } = await apiLogin(request);

  const cmdRes = await request.post('/api/commandes-fournisseurs', {
    headers: auth,
    data: {
      fournisseur_nom: 'Fournisseur E2E UI',
      date_commande: '2026-06-01',
      description: 'E2E UI — à supprimer',
      lignes: [
        { designation: 'Ligne UI 1', quantite: 2, prix_unitaire_ht: 80, taux_tva_id: 1 },
        { designation: 'Ligne UI 2', quantite: 1, prix_unitaire_ht: 40, taux_tva_id: 1 },
      ],
    },
  });
  const cmd = await cmdRes.json();
  expect(cmd.id).toBeTruthy();

  let ffId: number | null = null;
  try {
    await uiLogin(page, token);
    await page.evaluate(id => DocEditor.openFactureAchatDepuisCommande(id), cmd.id);
    await page.waitForSelector('.tab-panel.active [name=numero_achat]');

    // Pré-remplissage : fournisseur, objet, lignes
    await expect(page.locator('.tab-panel.active .ss-input')).toHaveValue('Fournisseur E2E UI');
    await expect(page.locator('.tab-panel.active [name=objet]')).toHaveValue('E2E UI — à supprimer');
    expect(await page.locator('.tab-panel.active .e-ligne-row').count()).toBe(2);

    // Compléter le numéro fournisseur puis enregistrer
    await page.locator('.tab-panel.active [name=numero_achat]').fill(`E2E-UI-FA-${Date.now()}`);
    await page.locator('.tab-panel.active .e-save-btn').click();
    await page.waitForTimeout(1500);

    // Chaînage automatique : la commande référence la nouvelle facture d'achat
    const linked = await (await request.get(`/api/commandes-fournisseurs/${cmd.id}`, { headers: auth })).json();
    expect(linked.facture_fournisseur_id).toBeTruthy();
    ffId = linked.facture_fournisseur_id;
  } finally {
    await request.delete(`/api/commandes-fournisseurs/${cmd.id}`, { headers: auth });
    if (ffId) await request.delete(`/api/factures-fournisseurs/${ffId}`, { headers: auth });
  }
});
