import { Router } from 'express';
import multer from 'multer';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { toCSV, parseCSV, rowToObj } from '../utils/csv';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// ── Export CSV ───────────────────────────────────────────────────────────────
router.get('/export', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM fournisseurs WHERE entreprise_id=$1 ORDER BY raison_sociale',
      [req.user!.entreprise_id]
    );
    const headers = ['Raison_sociale', 'Adresse', 'Adresse2', 'Code_postal', 'Ville', 'Pays',
                     'Email', 'Telephone', 'SIRET', 'TVA_Intracom', 'IBAN', 'BIC', 'Conditions_paiement', 'Notes'];
    const rows = r.rows.map((f: any) => [
      f.raison_sociale, f.adresse, f.adresse2, f.code_postal, f.ville, f.pays,
      f.email, f.telephone, f.siret, f.tva_intracom, f.iban, f.bic, f.conditions_paiement, f.notes,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fournisseurs_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(toCSV(headers, rows));
  } catch(e) { next(e); }
});

// ── Import CSV ───────────────────────────────────────────────────────────────
router.post('/import', requirePerm('factures:w'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier CSV requis' });
    const text = req.file.buffer.toString('utf-8');
    const { headers, rows } = parseCSV(text);

    let inserted = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const obj = rowToObj(headers, rows[i]);
      const raison = obj['raison_sociale'] || '';
      if (!raison) {
        errors.push(`Ligne ${i + 2} : raison sociale obligatoire`);
        skipped++; continue;
      }
      try {
        await query(`
          INSERT INTO fournisseurs (raison_sociale, adresse, adresse2, code_postal, ville, pays,
            email, telephone, siret, tva_intracom, iban, bic, conditions_paiement, notes, entreprise_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          raison,
          obj['adresse'] || null, obj['adresse2'] || null, obj['code_postal'] || null, obj['ville'] || null,
          obj['pays'] || 'France',
          obj['email'] || null, obj['telephone'] || null,
          obj['siret'] || null, obj['tva_intracom'] || null,
          obj['iban'] || null, obj['bic'] || null,
          obj['conditions_paiement'] || null, obj['notes'] || null,
          req.user!.entreprise_id,
        ]);
        inserted++;
      } catch(err: any) {
        errors.push(`Ligne ${i + 2} : ${err.message}`);
        skipped++;
      }
    }
    res.json({ inserted, skipped, errors });
  } catch(e) { next(e); }
});

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM fournisseurs WHERE entreprise_id = $1 ORDER BY raison_sociale',
      [req.user!.entreprise_id]
    );
    res.json(r.rows);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    const r = await query(`
      INSERT INTO fournisseurs (raison_sociale, adresse, adresse2, code_postal, ville, pays,
        email, telephone, siret, tva_intracom, iban, bic, conditions_paiement, notes, entreprise_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [b.raison_sociale, b.adresse ?? null, b.adresse2 ?? null, b.code_postal ?? null, b.ville ?? null,
        b.pays ?? 'France', b.email ?? null, b.telephone ?? null, b.siret ?? null, b.tva_intracom ?? null,
        b.iban ?? null, b.bic ?? null, b.conditions_paiement ?? null, b.notes ?? null,
        req.user!.entreprise_id]);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const b = req.body;
    const r = await query(`
      UPDATE fournisseurs SET raison_sociale=$1, adresse=$2, adresse2=$3, code_postal=$4, ville=$5, pays=$6,
        email=$7, telephone=$8, siret=$9, tva_intracom=$10, iban=$11, bic=$12,
        conditions_paiement=$13, notes=$14, updated_at=NOW()
      WHERE id=$15 AND entreprise_id=$16
      RETURNING *
    `, [b.raison_sociale, b.adresse ?? null, b.adresse2 ?? null, b.code_postal ?? null, b.ville ?? null,
        b.pays ?? 'France', b.email ?? null, b.telephone ?? null, b.siret ?? null, b.tva_intracom ?? null,
        b.iban ?? null, b.bic ?? null, b.conditions_paiement ?? null, b.notes ?? null,
        req.params.id, req.user!.entreprise_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const r = await query(
      'SELECT * FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [req.params.id, req.user!.entreprise_id]
    );
    const f = r.rows[0];
    if (!f) return res.status(404).json({ error: 'Introuvable' });
    res.json(f);
  } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const id            = Number(req.params.id);
    const entreprise_id = req.user!.entreprise_id;
    const fr = await query('SELECT id FROM fournisseurs WHERE id=$1 AND entreprise_id=$2', [id, entreprise_id]);
    if (!fr.rows[0]) return res.status(404).json({ error: 'Introuvable' });

    const docs = await query(
      `(SELECT 1 FROM factures_fournisseurs WHERE fournisseur_id=$1 LIMIT 1)
       UNION ALL
       (SELECT 1 FROM commandes_fournisseurs WHERE fournisseur_id=$1 LIMIT 1)`,
      [id]
    );
    if (docs.rows.length) return res.status(400).json({ error: 'Ce fournisseur a des documents associés (factures ou commandes). Supprimez-les ou détachez-les d\'abord.' });

    await query('DELETE FROM fournisseurs WHERE id=$1 AND entreprise_id=$2', [id, entreprise_id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
