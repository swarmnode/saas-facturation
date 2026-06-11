import { Router } from 'express';
import multer from 'multer';
import { requirePerm } from '../middleware/auth';
import { FournisseurService } from '../services/FournisseurService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    if (!b.numero || !b.fournisseur_nom || !b.date_facture || (!b.montant_ht && !b.lignes?.length)) {
      return res.status(400).json({ error: 'Champs obligatoires : numero, fournisseur_nom, date_facture, montant_ht ou lignes' });
    }
    res.status(201).json(await FournisseurService.creer(b, req.user!.entreprise_id));
  } catch(e) { next(e); }
});

// Modification d'une facture d'achat non payée (régénère les écritures FEC)
router.put('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    res.json(await FournisseurService.mettreAJour(Number(req.params.id), req.body, req.user!.entreprise_id));
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

// ── Import CSV ────────────────────────────────────────────────────────────────
// Format attendu (avec en-tête) :
// date_facture,fournisseur_nom,fournisseur_siret,numero,description,montant_ht,taux_tva,compte_charge,date_echeance
router.post('/import-csv', requirePerm('factures:w'), upload.single('csv'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier CSV manquant' });
    const lines = req.file.buffer.toString('utf-8').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'Fichier vide ou sans données' });

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx = (col: string) => header.indexOf(col);

    const results: { ok: number; errors: string[] } = { ok: 0, errors: [] };

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const get  = (col: string) => cols[idx(col)] ?? '';
      try {
        const montant_ht = parseFloat(get('montant_ht').replace(',', '.'));
        if (!get('fournisseur_nom') || !get('date_facture') || isNaN(montant_ht)) {
          results.errors.push(`Ligne ${i + 1} : champs obligatoires manquants (fournisseur_nom, date_facture, montant_ht)`);
          continue;
        }
        await FournisseurService.creer({
          fournisseur_nom:   get('fournisseur_nom'),
          fournisseur_siret: get('fournisseur_siret') || undefined,
          numero:            get('numero') || `IMP-L${i}`,
          date_facture:      get('date_facture'),
          date_echeance:     get('date_echeance') || undefined,
          description:       get('description') || undefined,
          montant_ht,
          taux_tva:          parseFloat(get('taux_tva').replace(',', '.')) || 20,
          compte_charge:     get('compte_charge') || '606',
        }, req.user!.entreprise_id);
        results.ok++;
      } catch (e: any) {
        results.errors.push(`Ligne ${i + 1} : ${e.message}`);
      }
    }
    res.json(results);
  } catch(e) { next(e); }
});

export default router;
