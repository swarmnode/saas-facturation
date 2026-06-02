import { Router } from 'express';
import { ArchiveService } from '../services/ArchiveService';
import { requirePerm } from '../middleware/auth';

const router = Router();

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try { res.json(await ArchiveService.lister(undefined, req.user!.entreprise_id)); } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const a = await ArchiveService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    res.json(a);
  } catch(e) { next(e); }
});

export default router;
