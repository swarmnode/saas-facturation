import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { NumerotationService } from '../services/NumerotationService';

const router = Router();

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const { statut } = req.query;
    const params: any[] = [req.user!.entreprise_id];
    let sql = `
      SELECT c.*, ff.numero AS facture_numero, ff.statut AS facture_statut
      FROM commandes_fournisseurs c
      LEFT JOIN factures_fournisseurs ff ON ff.id = c.facture_fournisseur_id
      WHERE c.entreprise_id = $1`;
    if (statut && statut !== 'all') {
      params.push(statut);
      sql += ` AND c.statut = $${params.length}`;
    }
    sql += ' ORDER BY c.date_commande DESC, c.id DESC';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT c.*, ff.numero AS facture_numero, ff.statut AS facture_statut
       FROM commandes_fournisseurs c
       LEFT JOIN factures_fournisseurs ff ON ff.id = c.facture_fournisseur_id
       WHERE c.id = $1 AND c.entreprise_id = $2`,
      [req.params.id, req.user!.entreprise_id]
    );
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    res.json(c);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.fournisseur_nom || !b.date_commande) {
      return res.status(400).json({ error: 'Fournisseur et date de commande obligatoires' });
    }
    const numero = await NumerotationService.getNextNumero('COMMANDE', req.user!.entreprise_id);
    const r = await query(`
      INSERT INTO commandes_fournisseurs (entreprise_id, numero, fournisseur_id, fournisseur_nom,
        date_commande, date_livraison_prevue, description, montant_ht, statut, facture_fournisseur_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [req.user!.entreprise_id, numero,
        b.fournisseur_id ? parseInt(b.fournisseur_id) : null, b.fournisseur_nom,
        b.date_commande, b.date_livraison_prevue || null, b.description || null,
        b.montant_ht ? parseFloat(b.montant_ht) : 0,
        b.statut || 'en_cours',
        b.facture_fournisseur_id ? parseInt(b.facture_fournisseur_id) : null]);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    const r = await query(`
      UPDATE commandes_fournisseurs SET
        fournisseur_id=$1, fournisseur_nom=$2, date_commande=$3, date_livraison_prevue=$4,
        description=$5, montant_ht=$6, statut=$7, facture_fournisseur_id=$8, updated_at=NOW()
      WHERE id=$9 AND entreprise_id=$10
      RETURNING *
    `, [b.fournisseur_id ? parseInt(b.fournisseur_id) : null, b.fournisseur_nom,
        b.date_commande, b.date_livraison_prevue || null, b.description || null,
        b.montant_ht ? parseFloat(b.montant_ht) : 0,
        b.statut || 'en_cours',
        b.facture_fournisseur_id ? parseInt(b.facture_fournisseur_id) : null,
        req.params.id, req.user!.entreprise_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const r = await query('DELETE FROM commandes_fournisseurs WHERE id=$1 AND entreprise_id=$2 RETURNING id',
      [req.params.id, req.user!.entreprise_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
