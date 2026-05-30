import { Router } from 'express';
import { ArchiveService } from '../services/ArchiveService';

const router = Router();

router.get('/', async (_req, res, next) => {
  try { res.json(await ArchiveService.lister()); } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const a = await ArchiveService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    res.json(a);
  } catch(e) { next(e); }
});

export default router;
