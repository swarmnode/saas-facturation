import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';

const router = Router();

router.get('/', requirePerm('clients:r'), async (req, res, next) => {
  try {
    const r = await query(
      "SELECT * FROM clients WHERE entreprise_id = $1 AND statut_rgpd != 'anonymise' ORDER BY created_at DESC",
      [req.user!.entreprise_id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('clients:w'), async (req, res, next) => {
  try {
    const b = req.body;
    const r = await query(`
      INSERT INTO clients (type_client, raison_sociale, civilite, prenom, nom,
        adresse, code_postal, ville, pays, email, telephone, siret, tva_intracom,
        tva_mode, statut_rgpd, entreprise_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [b.type_client ?? 'professionnel', b.raison_sociale ?? null, b.civilite ?? null,
        b.prenom ?? null, b.nom ?? null, b.adresse, b.code_postal, b.ville,
        b.pays ?? 'France', b.email ?? null, b.telephone ?? null,
        b.siret ?? null, b.tva_intracom ?? null, b.tva_mode ?? 'normal',
        b.statut_rgpd ?? 'prospect', req.user!.entreprise_id]);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('clients:w'), async (req, res, next) => {
  try {
    const b = req.body;
    const r = await query(`
      UPDATE clients SET type_client=$1, raison_sociale=$2, civilite=$3, prenom=$4, nom=$5,
        adresse=$6, adresse2=$7, code_postal=$8, ville=$9, pays=$10, email=$11, telephone=$12,
        siret=$13, tva_intracom=$14, tva_mode=$15, statut_rgpd=$16,
        iban=$17, bic=$18, titulaire_compte=$19, mandat_rum=$20, mandat_date=$21, mandat_type=$22,
        mode_reglement_defaut=$23, updated_at=NOW()
      WHERE id=$24 AND entreprise_id=$25
      RETURNING *
    `, [b.type_client, b.raison_sociale ?? null, b.civilite ?? null, b.prenom ?? null,
        b.nom ?? null, b.adresse, b.adresse2 ?? null, b.code_postal, b.ville, b.pays ?? 'France',
        b.email ?? null, b.telephone ?? null, b.siret ?? null, b.tva_intracom ?? null,
        b.tva_mode ?? 'normal', b.statut_rgpd ?? 'client',
        b.iban ?? null, b.bic ?? null, b.titulaire_compte ?? null,
        b.mandat_rum ?? null, b.mandat_date ?? null, b.mandat_type ?? null,
        b.mode_reglement_defaut ?? null,
        req.params.id, req.user!.entreprise_id]);
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.get('/taux-tva', async (_req, res, next) => {
  try {
    const r = await query('SELECT * FROM taux_tva WHERE actif = 1');
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('clients:r'), async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM clients WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user!.entreprise_id]
    );
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    res.json(c);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('clients:w'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cr = await query('SELECT id FROM clients WHERE id=$1', [id]);
    if (!cr.rows[0]) return res.status(404).json({ error: 'Introuvable' });

    const docs = await query(
      `SELECT 1 FROM devis WHERE client_id=$1 LIMIT 1
       UNION ALL SELECT 1 FROM factures WHERE client_id=$1 LIMIT 1
       UNION ALL SELECT 1 FROM acomptes WHERE client_id=$1 LIMIT 1
       UNION ALL SELECT 1 FROM bons_livraison WHERE client_id=$1 LIMIT 1`,
      [id]
    );
    if (docs.rows.length) return res.status(400).json({ error: 'Ce client a des documents associés. Supprimez-les d\'abord ou anonymisez le client (RGPD).' });

    await query('DELETE FROM clients WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
