import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';

const router = Router();

router.get('/', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const r = await query(
      'SELECT id, texte FROM commentaires_predefinis WHERE entreprise_id=$1 ORDER BY created_at DESC',
      [req.user!.entreprise_id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('devis:w'), async (req, res, next) => {
  try {
    const { texte } = req.body;
    if (!texte?.trim()) return res.status(400).json({ error: 'Texte requis' });
    const r = await query(
      'INSERT INTO commentaires_predefinis (texte, entreprise_id) VALUES ($1,$2) RETURNING id, texte',
      [texte.trim(), req.user!.entreprise_id]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('devis:w'), async (req, res, next) => {
  try {
    await query(
      'DELETE FROM commentaires_predefinis WHERE id=$1 AND entreprise_id=$2',
      [Number(req.params.id), req.user!.entreprise_id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
