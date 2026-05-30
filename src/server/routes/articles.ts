import { Router } from 'express';
import { ArticleService } from '../services/ArticleService';
import { requirePerm } from '../middleware/auth';

const router = Router();

router.get('/search', requirePerm('articles:r'), async (req, res, next) => {
  try {
    res.json(await ArticleService.rechercher(String(req.query.q ?? ''), req.user!.entreprise_id));
  } catch(e) { next(e); }
});

router.get('/', requirePerm('articles:r'), async (req, res, next) => {
  try { res.json(await ArticleService.lister(req.user!.entreprise_id)); } catch(e) { next(e); }
});

router.get('/:id', requirePerm('articles:r'), async (req, res, next) => {
  try {
    const a = await ArticleService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    res.json(a);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('articles:w'), async (req, res, next) => {
  try {
    res.status(201).json(await ArticleService.creer(req.body, req.user!.entreprise_id));
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('articles:w'), async (req, res, next) => {
  try { res.json(await ArticleService.mettreAJour(Number(req.params.id), req.body)); } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('articles:w'), async (req, res, next) => {
  try { await ArticleService.supprimer(Number(req.params.id)); res.json({ ok: true }); } catch(e) { next(e); }
});

export default router;
