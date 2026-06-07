import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { query, withTransaction } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { initRelanceScheduler } from '../services/RelanceScheduler';
import { exporterSociete } from '../services/SocieteBackupService';
import { logAudit } from './audit';

const BACKUPS_SOCIETES_DIR = path.resolve(process.cwd(), 'storage', 'backups_societes');

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

// Supprime définitivement une société (super_admin uniquement)
// Une sauvegarde complète est générée et écrite sur disque AVANT toute suppression — non contournable.
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user!.is_super_admin) return res.status(403).json({ error: 'Réservé au super-administrateur' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });

    if (id === req.user!.entreprise_id) {
      return res.status(400).json({ error: 'Impossible de supprimer la société actuellement sélectionnée. Changez de société active avant de continuer.' });
    }

    const er = await query('SELECT * FROM entreprise WHERE id = $1', [id]);
    const entreprise = er.rows[0];
    if (!entreprise) return res.status(404).json({ error: 'Société introuvable' });

    const cnt = await query('SELECT COUNT(*)::int AS n FROM entreprise');
    if (cnt.rows[0].n <= 1) {
      return res.status(400).json({ error: 'Impossible de supprimer la dernière société restante.' });
    }

    if (req.body?.confirmation_nom !== entreprise.raison_sociale) {
      return res.status(400).json({ error: 'La confirmation ne correspond pas à la raison sociale de la société.' });
    }

    // Sauvegarde imposée — toujours générée et persistée avant toute suppression, ne peut pas être sautée
    const buf = await exporterSociete(id);
    if (!fs.existsSync(BACKUPS_SOCIETES_DIR)) fs.mkdirSync(BACKUPS_SOCIETES_DIR, { recursive: true });
    const diacritics = new RegExp('[\\u0300-\\u036f]', 'g');
    const slug = (entreprise.raison_sociale as string)
      .normalize('NFD').replace(diacritics, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'societe';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `societe_${id}_${slug}_${stamp}.json.gz`;
    fs.writeFileSync(path.join(BACKUPS_SOCIETES_DIR, backupName), buf);

    try {
      await withTransaction(async (client) => {
        const e = id;
        // Ordre inverse des dépendances (FK) — voir TABLES dans SocieteBackupService.ts
        await client.query(`DELETE FROM exercices WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM tva_deductible WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM audit_log WHERE entreprise_id = $1`, [e]);
        // Les deux suppressions suivantes échoueront avec une erreur ISCA si la société
        // a déjà émis/scellé/archivé un document — c'est voulu (conservation légale 10 ans).
        await client.query(`DELETE FROM archive_documents WHERE entreprise_id = $1`, [e]);
        await client.query(
          `DELETE FROM journal_scellement js WHERE
             (js.type_document IN ('FACTURE','AVOIR') AND js.document_id IN (SELECT id FROM factures WHERE entreprise_id = $1))
          OR (js.type_document = 'DEVIS'   AND js.document_id IN (SELECT id FROM devis WHERE entreprise_id = $1))
          OR (js.type_document = 'ACOMPTE' AND js.document_id IN (SELECT id FROM acomptes WHERE entreprise_id = $1))
          OR (js.type_document = 'AVENANT' AND js.document_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = $1)))
          OR (js.type_document = 'BL'      AND js.document_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = $1))`,
          [e]
        );
        await client.query(
          `DELETE FROM fec_ecritures WHERE
             facture_id IN (SELECT id FROM factures WHERE entreprise_id = $1)
          OR facture_fournisseur_id IN (SELECT id FROM factures_fournisseurs WHERE entreprise_id = $1)`,
          [e]
        );
        await client.query(`DELETE FROM factures_fournisseurs WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM bons_livraison_lignes WHERE bl_id IN (SELECT id FROM bons_livraison WHERE entreprise_id = $1)`, [e]);
        await client.query(`DELETE FROM bons_livraison WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM acomptes WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM factures_lignes WHERE facture_id IN (SELECT id FROM factures WHERE entreprise_id = $1)`, [e]);
        await client.query(`DELETE FROM factures WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM avenants_lignes WHERE avenant_id IN (SELECT id FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = $1))`, [e]);
        await client.query(`DELETE FROM avenants WHERE devis_initial_id IN (SELECT id FROM devis WHERE entreprise_id = $1)`, [e]);
        await client.query(`DELETE FROM devis_lignes WHERE devis_id IN (SELECT id FROM devis WHERE entreprise_id = $1)`, [e]);
        await client.query(`DELETE FROM devis WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM articles WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM clients WHERE entreprise_id = $1`, [e]);
        await client.query(`DELETE FROM sequence_numerotation WHERE entreprise_id = $1`, [e]);
        // user_entreprises et commentaires_predefinis sont supprimés par CASCADE
        await client.query(`DELETE FROM entreprise WHERE id = $1`, [e]);
      });
    } catch (txErr: any) {
      const msg: string = txErr?.message || '';
      if (/ISCA/i.test(msg)) {
        return res.status(409).json({
          error: `Suppression impossible : cette société a émis et scellé des documents fiscaux soumis à une conservation légale de 10 ans (archives/journal de scellement inaltérables). Une sauvegarde complète a néanmoins été enregistrée sous storage/backups_societes/${backupName}.`,
        });
      }
      throw txErr;
    }

    await logAudit(req, 'suppression_societe', 'entreprise', id, { raison_sociale: entreprise.raison_sociale, backup: backupName });
    res.json({ ok: true, backup: backupName });
  } catch (e) { next(e); }
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
