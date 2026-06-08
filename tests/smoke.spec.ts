import { test, expect } from '@playwright/test';

// Parcours de bout en bout : connexion -> client -> devis -> facture -> émission.
// Vérifie au passage la chaîne de conformité critique (numérotation FAC-AAAA-NNNN,
// scellement SHA-256, verrouillage post-émission).
//
// Note : chaque exécution émet une facture réelle, donc immuable et scellée
// (voir compliance invariants dans CLAUDE.md). Ce test laisse des données
// permanentes dans la base — à n'exécuter que sur un environnement de
// développement, jamais sur une base de production.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@localhost';
const ADMIN_PASS = process.env.ADMIN_DEFAULT_PASS || 'Admin1234!';

test('parcours complet : connexion -> client -> devis -> facture -> émission', async ({ request }) => {
  // 1. Connexion (un super admin a accès à plusieurs sociétés -> sélection explicite)
  let loginRes = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  expect(loginRes.ok(), `échec de connexion (${loginRes.status()}): ${await loginRes.text()}`).toBeTruthy();
  let body = await loginRes.json();
  if (body.require_select) {
    const entrepriseId = body.entreprises[0].id;
    loginRes = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASS, entreprise_id: entrepriseId },
    });
    expect(loginRes.ok(), `échec de sélection de société (${loginRes.status()}): ${await loginRes.text()}`).toBeTruthy();
    body = await loginRes.json();
  }
  const token = body.token;
  expect(token).toBeTruthy();

  const auth = { Authorization: `Bearer ${token}` };

  // 2. Création d'un client
  const suffix = Date.now();
  const clientRes = await request.post('/api/clients', {
    headers: auth,
    data: {
      type_client: 'professionnel',
      raison_sociale: `Client Smoke Test ${suffix}`,
      adresse: '1 rue du Test',
      code_postal: '75000',
      ville: 'Paris',
      pays: 'France',
      email: `smoke-${suffix}@example.test`,
    },
  });
  expect(clientRes.ok(), `échec création client (${clientRes.status()}): ${await clientRes.text()}`).toBeTruthy();
  const client = await clientRes.json();
  expect(client.id).toBeTruthy();

  const ligne = {
    designation: 'Prestation de test',
    quantite: 1,
    unite: 'unité',
    prix_unitaire_ht: 100,
    taux_tva_id: 1,
  };

  // 3. Création d'un devis
  const devisRes = await request.post('/api/devis', {
    headers: auth,
    data: { client_id: client.id, lignes: [ligne] },
  });
  expect(devisRes.ok(), `échec création devis (${devisRes.status()}): ${await devisRes.text()}`).toBeTruthy();
  const devis = await devisRes.json();
  expect(devis.numero).toMatch(/^DEV-\d{4}-\d{4}$/);

  // 4. Création d'une facture (lignes saisies directement, sans passer par le devis)
  const factureRes = await request.post('/api/factures', {
    headers: auth,
    data: { client_id: client.id, lignes: [ligne] },
  });
  expect(factureRes.ok(), `échec création facture (${factureRes.status()}): ${await factureRes.text()}`).toBeTruthy();
  const facture = await factureRes.json();
  expect(facture.statut).toBe('brouillon');
  expect(facture.locked).toBeFalsy();

  // 5. Émission de la facture -> numérotation + scellement + verrouillage
  const emettreRes = await request.post(`/api/factures/${facture.id}/emettre`, { headers: auth });
  expect(emettreRes.ok(), `échec émission facture (${emettreRes.status()}): ${await emettreRes.text()}`).toBeTruthy();
  const emise = await emettreRes.json();
  expect(emise.statut).toBe('emise');
  expect(emise.numero).toMatch(/^FAC-\d{4}-\d{4}$/);

  // 6. La facture émise est verrouillée : toute modification doit être rejetée
  const editRes = await request.put(`/api/factures/${facture.id}`, {
    headers: auth,
    data: { lignes: [{ ...ligne, designation: 'Modification interdite' }] },
  });
  expect(editRes.status(), 'une facture émise/verrouillée ne doit plus être modifiable').toBe(403);

  // 7. La chaîne de scellement reste cohérente après cette émission
  const verifRes = await request.get('/api/factures/scellement/verifier', { headers: auth });
  expect(verifRes.ok()).toBeTruthy();
  const verif = await verifRes.json();
  expect(verif.valide).toBe(true);
});
