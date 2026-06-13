import { test, expect } from '@playwright/test';
import { apiLogin, getPool, closePool } from './e2e-utils';
import { PDFDocument } from 'pdf-lib';

// Documents d'achat : commandes fournisseurs et factures d'achats avec lignes.
// Vérifie les totaux calculés, le PDF du bon de commande, le chaînage non
// bloquant, et la comptabilité automatique (écritures FEC, régénération à la
// modification, nettoyage à la suppression). Les documents créés sont
// supprimés en fin de test (aucun verrou côté achats).

test.afterAll(async () => { await closePool(); });

const lignes = [
  { designation: 'Article E2E A', description: 'Description test', quantite: 2, prix_unitaire_ht: 100, taux_tva_id: 1 },
  { designation: 'Article E2E B', quantite: 1, prix_unitaire_ht: 50, taux_tva_id: 1, remise_pct: 10 },
  { type: 'commentaire', designation: 'Commentaire E2E' },
];
// 2×100 + 50×0,9 = 245 HT ; TVA 20 % = 49 ; TTC = 294

test('commande fournisseur : lignes, totaux, PDF, mise à jour, suppression', async ({ request }) => {
  const { auth } = await apiLogin(request);

  const createRes = await request.post('/api/commandes-fournisseurs', {
    headers: auth,
    data: { fournisseur_nom: 'Fournisseur E2E', date_commande: '2026-06-01', description: 'E2E — à supprimer', lignes },
  });
  expect(createRes.ok(), await createRes.text()).toBeTruthy();
  const cmd = await createRes.json();
  expect(cmd.numero).toMatch(/^CMD-\d{4}-\d{4}$/);
  expect(Number(cmd.montant_ht)).toBe(245);
  expect(Number(cmd.montant_ttc)).toBe(294);
  expect(cmd.lignes).toHaveLength(3);

  // PDF du bon de commande
  const pdfRes = await request.get(`/api/commandes-fournisseurs/${cmd.id}/apercu`, { headers: auth });
  expect(pdfRes.ok()).toBeTruthy();
  const pdf = await PDFDocument.load(await pdfRes.body());
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

  // Envoi email : refusé sans adresse
  const sendRes = await request.post(`/api/commandes-fournisseurs/${cmd.id}/envoyer-email`, { headers: auth, data: {} });
  expect(sendRes.status()).toBe(400);

  // Mise à jour : statut + lignes recalculées
  const putRes = await request.put(`/api/commandes-fournisseurs/${cmd.id}`, {
    headers: auth,
    data: { statut: 'receptionnee', lignes: lignes.slice(0, 1) },
  });
  expect(putRes.ok(), await putRes.text()).toBeTruthy();
  const upd = await putRes.json();
  expect(upd.statut).toBe('receptionnee');
  expect(Number(upd.montant_ht)).toBe(200);
  expect(upd.lignes).toHaveLength(1);

  const delRes = await request.delete(`/api/commandes-fournisseurs/${cmd.id}`, { headers: auth });
  expect(delRes.ok()).toBeTruthy();
});

test('facture d\'achat : FEC à la création, régénération à la modification, chaînage, suppression', async ({ request }) => {
  const { auth } = await apiLogin(request);
  const pool = getPool();

  const ffRes = await request.post('/api/factures-fournisseurs', {
    headers: auth,
    data: { numero: `E2E-FA-${Date.now()}`, fournisseur_nom: 'Fournisseur E2E', date_facture: '2026-06-01', compte_charge: '607', lignes },
  });
  expect(ffRes.ok(), await ffRes.text()).toBeTruthy();
  const ff = await ffRes.json();
  expect(Number(ff.montant_ht)).toBe(245);

  // 3 écritures FEC (journal AC : 401 crédit, 607 débit, 44566 débit)
  const fec1 = await pool.query(
    'SELECT compte_num, debit, credit FROM fec_ecritures WHERE facture_fournisseur_id = $1 ORDER BY ecriture_num', [ff.id]);
  expect(fec1.rows).toHaveLength(3);
  expect(Number(fec1.rows.find(r => r.compte_num === '401')?.credit)).toBe(294);

  // GET retourne les lignes
  const getRes = await request.get(`/api/factures-fournisseurs/${ff.id}`, { headers: auth });
  expect((await getRes.json()).lignes).toHaveLength(3);

  // Modification (statut recue) : montants et FEC régénérés
  const putRes = await request.put(`/api/factures-fournisseurs/${ff.id}`, {
    headers: auth,
    data: { lignes: [{ designation: 'Article E2E C', quantite: 1, prix_unitaire_ht: 300, taux_tva_id: 1 }] },
  });
  expect(putRes.ok(), await putRes.text()).toBeTruthy();
  expect(Number((await putRes.json()).montant_ht)).toBe(300);
  const fec2 = await pool.query(
    "SELECT SUM(credit) AS c FROM fec_ecritures WHERE facture_fournisseur_id = $1 AND compte_num = '401'", [ff.id]);
  expect(Number(fec2.rows[0].c)).toBe(360);

  // Chaînage non bloquant commande <-> facture d'achat
  const cmdRes = await request.post('/api/commandes-fournisseurs', {
    headers: auth,
    data: { fournisseur_nom: 'Fournisseur E2E', date_commande: '2026-06-01', lignes: lignes.slice(0, 1) },
  });
  const cmd = await cmdRes.json();
  const linkRes = await request.put(`/api/commandes-fournisseurs/${cmd.id}`, {
    headers: auth, data: { facture_fournisseur_id: ff.id },
  });
  expect(linkRes.ok()).toBeTruthy();
  const linked = await (await request.get(`/api/commandes-fournisseurs/${cmd.id}`, { headers: auth })).json();
  expect(linked.facture_numero).toBe(ff.numero);

  // Suppression : FEC nettoyé
  await request.delete(`/api/commandes-fournisseurs/${cmd.id}`, { headers: auth });
  const delRes = await request.delete(`/api/factures-fournisseurs/${ff.id}`, { headers: auth });
  expect(delRes.ok()).toBeTruthy();
  const fec3 = await pool.query('SELECT COUNT(*) AS n FROM fec_ecritures WHERE facture_fournisseur_id = $1', [ff.id]);
  expect(Number(fec3.rows[0].n)).toBe(0);
});
