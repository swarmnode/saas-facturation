import { Router } from 'express';
import { LettreService } from '../services/LettreService';
import { requirePerm } from '../middleware/auth';

const router = Router();

// GET /api/lettrage — liste les écritures 411 pour la vue de lettrage
router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    res.json(await LettreService.listerCompte411(req.user!.entreprise_id));
  } catch(e) { next(e); }
});

// POST /api/lettrage/lettrer — lettrage manuel
// Body: { ecriture_ids: number[] }
router.post('/lettrer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const { ecriture_ids } = req.body;
    if (!Array.isArray(ecriture_ids) || !ecriture_ids.length) {
      return res.status(400).json({ error: 'ecriture_ids requis (tableau non vide)' });
    }
    const lettre = await LettreService.lettrer(ecriture_ids, req.user!.entreprise_id);
    res.json({ lettre });
  } catch(e: any) { next(e); }
});

// DELETE /api/lettrage/:lettre — délettrage
router.delete('/:lettre', requirePerm('factures:w'), async (req, res, next) => {
  try {
    await LettreService.delettrer(String(req.params.lettre), req.user!.entreprise_id);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
