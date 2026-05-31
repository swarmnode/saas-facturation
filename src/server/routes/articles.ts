import { Router } from 'express';
import multer from 'multer';
import { ArticleService } from '../services/ArticleService';
import { requirePerm } from '../middleware/auth';
import { query } from '../db/database';
import { toCSV, parseCSV, rowToObj } from '../utils/csv';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// ── Export CSV ───────────────────────────────────────────────────────────────
router.get('/export', requirePerm('articles:r'), async (req, res, next) => {
  try {
    const articles = await ArticleService.lister(req.user!.entreprise_id);
    const headers  = ['Reference', 'Designation', 'Description', 'Unite',
                      'Prix_HT', 'Prix_Achat_HT', 'TVA_Pct', 'Stock', 'Actif'];
    const rows = articles.map(a => [
      a.reference, a.designation, a.description, a.unite,
      a.prix_unitaire_ht, a.prix_achat_ht, a.tva_taux,
      a.quantite_stock, a.actif ? 1 : 0,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="articles_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(toCSV(headers, rows));
  } catch(e) { next(e); }
});

// ── Import CSV ───────────────────────────────────────────────────────────────
router.post('/import', requirePerm('articles:w'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier CSV requis' });
    const text = req.file.buffer.toString('utf-8');
    const { headers, rows } = parseCSV(text);
    const tvas = await query('SELECT id, taux FROM taux_tva WHERE actif=1');
    const tvaMap = new Map<number, number>(tvas.rows.map((r: any) => [r.taux, r.id]));
    const defaultTvaId = tvaMap.get(20) ?? tvas.rows[0]?.id ?? 1;

    let inserted = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const obj = rowToObj(headers, rows[i]);
      const designation = obj['designation'] || obj['d_signation'] || '';
      if (!designation) { errors.push(`Ligne ${i + 2} : désignation manquante`); skipped++; continue; }
      const prixHT = parseFloat(obj['prix_ht'] || obj['prix_unitaire_ht'] || '0') || 0;
      const tvaPct = parseFloat(obj['tva_pct'] || obj['tva'] || '20');
      const tvaId  = tvaMap.get(tvaPct) ?? defaultTvaId;
      try {
        await query(`
          INSERT INTO articles (reference, designation, description, unite, prix_unitaire_ht,
            prix_achat_ht, taux_tva_id, quantite_stock, actif, entreprise_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT DO NOTHING
        `, [
          obj['reference'] || null,
          designation,
          obj['description'] || null,
          obj['unite'] || null,
          prixHT,
          obj['prix_achat_ht'] ? parseFloat(obj['prix_achat_ht']) : null,
          tvaId,
          obj['stock'] || obj['quantite_stock'] ? parseFloat(obj['stock'] || obj['quantite_stock']) : null,
          obj['actif'] === '0' ? 0 : 1,
          req.user!.entreprise_id,
        ]);
        inserted++;
      } catch(err: any) {
        errors.push(`Ligne ${i + 2} (${designation}) : ${err.message}`);
        skipped++;
      }
    }
    res.json({ inserted, skipped, errors });
  } catch(e) { next(e); }
});

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
