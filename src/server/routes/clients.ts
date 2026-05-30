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
        adresse=$6, code_postal=$7, ville=$8, pays=$9, email=$10, telephone=$11,
        siret=$12, tva_intracom=$13, tva_mode=$14, statut_rgpd=$15, updated_at=NOW()
      WHERE id=$16 AND entreprise_id=$17
      RETURNING *
    `, [b.type_client, b.raison_sociale ?? null, b.civilite ?? null, b.prenom ?? null,
        b.nom ?? null, b.adresse, b.code_postal, b.ville, b.pays ?? 'France',
        b.email ?? null, b.telephone ?? null, b.siret ?? null, b.tva_intracom ?? null,
        b.tva_mode ?? 'normal', b.statut_rgpd ?? 'client', req.params.id, req.user!.entreprise_id]);
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

export default router;
