import { Router } from 'express';
import { requirePerm } from '../middleware/auth';
import { FournisseurService } from '../services/FournisseurService';

const router = Router();

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const statut = req.query.statut as string | undefined;
    res.json(await FournisseurService.lister(req.user!.entreprise_id, statut));
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const ff = await FournisseurService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    if (!ff) return res.status(404).json({ error: 'Facture fournisseur introuvable' });
    res.json(ff);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.numero || !b.fournisseur_nom || !b.date_facture || !b.montant_ht) {
      return res.status(400).json({ error: 'Champs obligatoires : numero, fournisseur_nom, date_facture, montant_ht' });
    }
    res.status(201).json(await FournisseurService.creer(b, req.user!.entreprise_id));
  } catch(e) { next(e); }
});

router.post('/:id/payer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    res.json(await FournisseurService.payer(
      Number(req.params.id),
      req.body,
      req.user!.entreprise_id
    ));
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    await FournisseurService.supprimer(Number(req.params.id), req.user!.entreprise_id);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
