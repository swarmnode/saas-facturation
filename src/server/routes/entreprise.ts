import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { initRelanceScheduler } from '../services/RelanceScheduler';

const router = Router();

const LOGO_DIR = path.resolve(process.cwd(), 'storage', 'logo');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
      cb(null, LOGO_DIR);
    },
    // Nommage par entreprise_id pour éviter qu'une société écrase le logo d'une autre (multi-tenant)
    filename: (req, file, cb) => cb(null, `logo_${req.user!.entreprise_id}` + path.extname(file.originalname).toLowerCase()),
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.mimetype);
    cb(null, ok as any);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.get('/', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    res.json(r.rows[0] ?? null);
  } catch(e) { next(e); }
});

// Liste toutes les sociétés (super_admin uniquement)
router.get('/all', async (req, res, next) => {
  try {
    if (!req.user!.is_super_admin) return res.status(403).json({ error: 'Réservé au super-administrateur' });
    const r = await query('SELECT * FROM entreprise ORDER BY raison_sociale');
    res.json(r.rows);
  } catch(e) { next(e); }
});

// Crée une nouvelle société (super_admin uniquement)
router.post('/new', async (req, res, next) => {
  try {
    if (!req.user!.is_super_admin) return res.status(403).json({ error: 'Réservé au super-administrateur' });
    const b = req.body;
    const r = await query(`
      INSERT INTO entreprise (raison_sociale, forme_juridique, is_EI, siret, tva_intracom,
        adresse, adresse2, code_postal, ville, pays, telephone, email, site_web, regime_tva, capital_social, rcs_ville)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [b.raison_sociale, b.forme_juridique, b.is_EI ? 1 : 0,
        b.siret, b.tva_intracom || null, b.adresse,
        b.adresse2 || null, b.code_postal, b.ville, b.pays || 'France',
        b.telephone || null, b.email, b.site_web || null,
        b.regime_tva || 'normal', b.capital_social ? Number(b.capital_social) : null,
        b.rcs_ville || null]);
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

// Modifie une société quelconque (super_admin uniquement)
router.post('/update/:id', async (req, res, next) => {
  try {
    if (!req.user!.is_super_admin) return res.status(403).json({ error: 'Réservé au super-administrateur' });
    const id = Number(req.params.id);
    const b = req.body;
    await query(`
      UPDATE entreprise SET raison_sociale=$1, forme_juridique=$2, is_EI=$3, siret=$4,
        tva_intracom=$5, adresse=$6, adresse2=$7, code_postal=$8, ville=$9, pays=$10, telephone=$11,
        email=$12, site_web=$13, regime_tva=$14, capital_social=$15, rcs_ville=$16, updated_at=NOW()
        WHERE id=$17
    `, [b.raison_sociale, b.forme_juridique, b.is_EI ? 1 : 0, b.siret, b.tva_intracom || null,
        b.adresse, b.adresse2 || null, b.code_postal, b.ville, b.pays || 'France',
        b.telephone || null, b.email, b.site_web || null, b.regime_tva || 'normal',
        b.capital_social ? Number(b.capital_social) : null, b.rcs_ville || null, id]);
    const r2 = await query('SELECT * FROM entreprise WHERE id=$1', [id]);
    res.json(r2.rows[0]);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('settings:w'), async (req, res, next) => {
  try {
    const b = req.body;
    await query(`
      UPDATE entreprise SET raison_sociale=$1, forme_juridique=$2, is_EI=$3, siret=$4,
        tva_intracom=$5, adresse=$6, adresse2=$7, code_postal=$8, ville=$9, pays=$10, telephone=$11,
        email=$12, site_web=$13, regime_tva=$14, capital_social=$15, rcs_ville=$16,
        iban=$17, bic=$18, ics=$19,
        cgv_texte=$20, mention_legale=$21,
        updated_at=NOW() WHERE id=$22
    `, [b.raison_sociale, b.forme_juridique, b.is_EI ? 1 : 0,
        b.siret, b.tva_intracom || null, b.adresse,
        b.adresse2 || null, b.code_postal, b.ville, b.pays || 'France',
        b.telephone || null, b.email, b.site_web || null,
        b.regime_tva || 'normal', b.capital_social ? Number(b.capital_social) : null,
        b.rcs_ville || null,
        b.iban || null, b.bic || null, b.ics || null,
        b.cgv_texte || null, b.mention_legale || null,
        req.user!.entreprise_id]);
    const r2 = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    res.json(r2.rows[0]);
  } catch(e) { next(e); }
});

router.post('/smtp', requirePerm('settings:w'), async (req, res, next) => {
  try {
    await query(`
      UPDATE entreprise SET smtp_host=$1, smtp_port=$2, smtp_secure=$3,
        smtp_user=$4, smtp_pass=$5, smtp_from=$6, email_mode=$7, updated_at=NOW()
      WHERE id=$8
    `, [req.body.smtp_host ?? null, req.body.smtp_port ?? 587,
        req.body.smtp_secure ? 1 : 0, req.body.smtp_user ?? null,
        req.body.smtp_pass ?? null, req.body.smtp_from ?? null,
        req.body.email_mode ?? 'mapi', req.user!.entreprise_id]);
    const r2 = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    res.json(r2.rows[0]);
  } catch(e) { next(e); }
});

router.post('/relances', requirePerm('settings:w'), async (req, res, next) => {
  try {
    const b = req.body;
    await query(`
      UPDATE entreprise SET
        relance_auto_active  = $1,
        relance_auto_jours   = $2,
        relance_auto_heure   = $3,
        notif_echeance_active = $4,
        notif_echeance_jours  = $5,
        updated_at = NOW()
      WHERE id = $6
    `, [
      b.relance_auto_active ? 1 : 0,
      Number(b.relance_auto_jours) || 15,
      b.relance_auto_heure || '08:00',
      b.notif_echeance_active ? 1 : 0,
      Number(b.notif_echeance_jours) || 3,
      req.user!.entreprise_id,
    ]);
    await initRelanceScheduler();
    const r2 = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    res.json(r2.rows[0]);
  } catch(e) { next(e); }
});

router.post('/logo', requirePerm('settings:w'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier image invalide (PNG, JPG, SVG, max 2 Mo)' });
    const entrepriseId = req.user!.entreprise_id;
    const logoPath = `/storage/logo/${req.file.filename}`;
    await sharp(req.file.path).resize({ width: 600, withoutEnlargement: true }).png().toFile(path.join(LOGO_DIR, `logo_pdf_${entrepriseId}.png`));
    await query('UPDATE entreprise SET logo_path=$1 WHERE id=$2', [logoPath, entrepriseId]);
    res.json({ logo_path: logoPath });
  } catch(err) { next(err); }
});

router.delete('/logo', requirePerm('settings:w'), async (req, res, next) => {
  try {
    const entrepriseId = req.user!.entreprise_id;
    const er = await query('SELECT logo_path FROM entreprise WHERE id=$1', [entrepriseId]);
    const e  = er.rows[0];
    if (e?.logo_path) {
      const abs = path.resolve(process.cwd(), (e.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      const pdfPng = path.join(LOGO_DIR, `logo_pdf_${entrepriseId}.png`);
      if (fs.existsSync(pdfPng)) fs.unlinkSync(pdfPng);
      await query('UPDATE entreprise SET logo_path=NULL WHERE id=$1', [entrepriseId]);
    }
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
