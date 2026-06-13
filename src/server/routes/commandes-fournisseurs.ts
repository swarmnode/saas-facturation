import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { CommandeFournisseurService } from '../services/CommandeFournisseurService';
import { FacturXService } from '../services/FacturXService';

const router = Router();

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    res.json(await CommandeFournisseurService.lister(req.user!.entreprise_id, req.query.statut as string | undefined));
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const c = await CommandeFournisseurService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    res.json(c);
  } catch(e) { next(e); }
});

router.get('/:id/apercu', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const c: any = await CommandeFournisseurService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const fournisseur = c.fournisseur_id
      ? (await query('SELECT * FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
          [c.fournisseur_id, req.user!.entreprise_id])).rows[0]
      : null;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${c.numero}.pdf"`);
    await FacturXService.genererCommandeStream(c, er.rows[0],
      fournisseur ?? { raison_sociale: c.fournisseur_nom }, res);
  } catch(e) { next(e); }
});

// Envoi du bon de commande au fournisseur (PDF joint)
router.post('/:id/envoyer-email', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const c  = await CommandeFournisseurService.obtenir(id, req.user!.entreprise_id);
    if (!c) return res.status(404).json({ error: 'Introuvable' });
    const email = req.body?.email_client as string | undefined;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const { EmailService } = await import('../services/EmailService');
    const result = await EmailService.envoyerCommande(id, email);
    res.json({ ok: true, preview_url: result.previewUrl ?? null });
  } catch(e) { next(e); }
});

router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    if ((!b.fournisseur_nom && !b.fournisseur_id) || !b.date_commande) {
      return res.status(400).json({ error: 'Fournisseur et date de commande obligatoires' });
    }
    res.status(201).json(await CommandeFournisseurService.creer({
      ...b,
      entreprise_id: req.user!.entreprise_id,
      fournisseur_id: b.fournisseur_id ? parseInt(b.fournisseur_id) : null,
      facture_fournisseur_id: b.facture_fournisseur_id ? parseInt(b.facture_fournisseur_id) : null,
    }));
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    res.json(await CommandeFournisseurService.mettreAJour(Number(req.params.id), req.user!.entreprise_id, {
      ...b,
      fournisseur_id: b.fournisseur_id !== undefined ? (b.fournisseur_id ? parseInt(b.fournisseur_id) : null) : undefined,
      facture_fournisseur_id: b.facture_fournisseur_id !== undefined ? (b.facture_fournisseur_id ? parseInt(b.facture_fournisseur_id) : null) : undefined,
    }));
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const ok = await CommandeFournisseurService.supprimer(Number(req.params.id), req.user!.entreprise_id);
    if (!ok) return res.status(404).json({ error: 'Introuvable' });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
