import { Router } from 'express';
import { requirePerm } from '../middleware/auth';
import { ExerciceService } from '../services/ExerciceService';
import { query } from '../db/database';
import PDFDocument from 'pdfkit';

const router = Router();

// ── Liste des exercices ────────────────────────────────────────────────────
router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    res.json(await ExerciceService.lister(req.user!.entreprise_id));
  } catch(e) { next(e); }
});

// ── Ouvrir un exercice ────────────────────────────────────────────────────
router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const { annee, date_ouverture } = req.body;
    if (!annee || isNaN(Number(annee))) return res.status(400).json({ error: 'Année invalide' });
    res.status(201).json(await ExerciceService.ouvrir(Number(annee), req.user!.entreprise_id, date_ouverture));
  } catch(e) { next(e); }
});

// ── Clôturer un exercice ──────────────────────────────────────────────────
router.post('/:annee/cloturer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const annee = Number(req.params.annee);
    if (isNaN(annee)) return res.status(400).json({ error: 'Année invalide' });
    const { date_cloture } = req.body ?? {};
    const result = await ExerciceService.cloturer(annee, req.user!.entreprise_id, date_cloture);
    res.json(result);
  } catch(e) { next(e); }
});

// ── Export FEC de l'exercice ──────────────────────────────────────────────
router.get('/:annee/fec', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const annee = Number(req.params.annee);
    if (isNaN(annee)) return res.status(400).json({ error: 'Année invalide' });
    const csv = await ExerciceService.exporterFEC(annee, req.user!.entreprise_id);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="FEC_${annee}.txt"`);
    res.send(csv);
  } catch(e) { next(e); }
});

// ── PV de clôture PDF ─────────────────────────────────────────────────────
router.get('/:annee/pv', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const annee = Number(req.params.annee);
    if (isNaN(annee)) return res.status(400).json({ error: 'Année invalide' });

    const ex = await ExerciceService.obtenir(annee, req.user!.entreprise_id);
    if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });
    if (ex.statut !== 'clos') return res.status(400).json({ error: 'L\'exercice n\'est pas encore clôturé' });

    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const ent = er.rows[0];

    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PV_Cloture_${annee}.pdf"`);
    doc.pipe(res);

    // En-tête
    doc.fontSize(18).font('Helvetica-Bold')
       .text('PROCÈS-VERBAL DE CLÔTURE D\'EXERCICE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica')
       .text(`Exercice fiscal ${annee}`, { align: 'center' });
    doc.moveDown(1.5);

    // Société
    doc.fontSize(11).font('Helvetica-Bold').text('Société');
    doc.font('Helvetica').fontSize(10)
       .text(`${ent.raison_sociale}  —  ${ent.forme_juridique ?? ''}`)
       .text(`SIRET : ${ent.siret ?? 'N/A'}`)
       .text(`TVA Intracom : ${ent.tva_intracom ?? 'N/A'}`);
    doc.moveDown(1);

    // Exercice
    doc.fontSize(11).font('Helvetica-Bold').text('Informations de l\'exercice');
    doc.font('Helvetica').fontSize(10)
       .text(`Année fiscale       : ${annee}`)
       .text(`Date d'ouverture   : ${ex.date_ouverture ?? '-'}`)
       .text(`Date de clôture    : ${ex.date_cloture ?? '-'}`)
       .text(`Clôturé le         : ${ex.clos_le ? new Date(ex.clos_le).toLocaleString('fr-FR') : '-'}`)
       .text(`Nombre d'écritures : ${ex.nb_ecritures ?? 0}`);
    doc.moveDown(1);

    // Intégrité
    doc.fontSize(11).font('Helvetica-Bold').text('Empreinte d\'intégrité (SHA-256)');
    doc.font('Courier').fontSize(8).text(ex.hash_cloture ?? '-', { lineBreak: true });
    doc.moveDown(1);

    // Conformité
    doc.font('Helvetica').fontSize(9)
       .text(
         'Ce document atteste la clôture de l\'exercice comptable conformément à l\'article 88 ' +
         'de la loi n° 2015-1785 du 29 décembre 2015 (loi anti-fraude TVA) et à l\'article ' +
         '286-I-3° du Code général des impôts. L\'empreinte SHA-256 ci-dessus garantit ' +
         'l\'intégrité du Fichier des Écritures Comptables (FEC) au moment de la clôture.',
         { align: 'justify' }
       );
    doc.moveDown(1.5);

    // Signature
    const y = doc.y;
    doc.fontSize(10).font('Helvetica')
       .text('Fait le : ' + new Date().toLocaleDateString('fr-FR'), 60, y)
       .text('Signature :', 380, y);
    doc.moveTo(380, y + 40).lineTo(530, y + 40).stroke();

    doc.end();
  } catch(e) { next(e); }
});

export default router;
