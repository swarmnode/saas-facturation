import { Router } from 'express';
import { logAudit } from './audit';
import { FactureService } from '../services/FactureService';
import { paginateParams, buildPage } from '../utils/paginate';
import { FecExportService } from '../services/FecExportService';
import { ScelleService } from '../services/ScelleService';
import { FacturXService } from '../services/FacturXService';
import { ChorusProService } from '../services/ChorusProService';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/export/fec', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const annee = req.query.annee ? Number(req.query.annee) : undefined;
    const csv   = await FecExportService.exporterCSV(annee, req.user!.entreprise_id);
    const suffix = annee ? `_${annee}` : `_${new Date().toISOString().slice(0,10)}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="FEC${suffix}.txt"`);
    res.send(csv);
  } catch(e) { next(e); }
});

router.get('/scellement/verifier', requirePerm('factures:r'), async (_req, res, next) => {
  try { res.json(await ScelleService.verifierChaine()); } catch(e) { next(e); }
});

router.get('/', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const commercial_id = req.user!.role === 'commercial' && !req.user!.voir_tout ? req.user!.id : undefined;
    const { page, limit, all } = paginateParams(req.query);
    const rows = await FactureService.lister(req.user!.entreprise_id, undefined, commercial_id, all ? undefined : page, all ? undefined : limit);
    res.json(all ? rows : buildPage(rows, page, limit));
  } catch(e) { next(e); }
});

router.get('/avoirs/liste', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const commercial_id = req.user!.role === 'commercial' && !req.user!.voir_tout ? req.user!.id : undefined;
    const { page, limit, all } = paginateParams(req.query);
    const rows = await FactureService.lister(req.user!.entreprise_id, 'avoir', commercial_id, all ? undefined : page, all ? undefined : limit);
    res.json(all ? rows : buildPage(rows, page, limit));
  } catch(e) { next(e); }
});

router.get('/:id/avoirs-cumul', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const f  = await FactureService.obtenir(id, req.user!.entreprise_id);
    if (!f) return res.status(404).json({ error: 'Introuvable' });
    const factureTtc  = Math.abs(parseFloat((f as any).montant_ttc));
    const avoirsTtc   = await FactureService.getAvoirsCumul(id);
    const avoirsRes   = await (await import('../db/database')).query(`
      SELECT COUNT(*) AS nb, ARRAY_AGG(numero ORDER BY created_at) AS numeros
      FROM factures WHERE facture_origine_id=$1 AND type_facture='avoir' AND statut IN ('emise','payee')
    `, [id]);
    res.json({
      facture_ttc:   factureTtc,
      avoirs_ttc:    avoirsTtc,
      avoirs_nb:     parseInt(avoirsRes.rows[0].nb),
      avoirs_numeros: avoirsRes.rows[0].numeros ?? [],
      disponible_ttc: Math.max(0, factureTtc - avoirsTtc),
    });
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const f = await FactureService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    if (!f) return res.status(404).json({ error: 'Introuvable' });
    res.json(f);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('factures:w'), async (req, res, next) => {
  try {
    res.status(201).json(await FactureService.creer({ ...req.body, entreprise_id: req.user!.entreprise_id }));
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try { res.json(await FactureService.mettreAJour(Number(req.params.id), req.body)); } catch(e) { next(e); }
});

router.post('/:id/emettre', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const result = await FactureService.emettre(Number(req.params.id));
    await logAudit(req, 'emettre_facture', 'factures', Number(req.params.id), { numero: (result as any)?.numero });
    res.json(result);
  } catch(e) { next(e); }
});

router.post('/:id/payer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const result = await FactureService.marquerPayee(Number(req.params.id), req.body.date_paiement, req.body.mode_paiement);
    await logAudit(req, 'payer_facture', 'factures', Number(req.params.id), { mode: req.body.mode_paiement });
    res.json(result);
  } catch(e) { next(e); }
});

router.get('/:id/pdf', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const f = await FactureService.obtenir(Number(req.params.id), req.user!.entreprise_id);
    const pdf_path = (f as any)?.pdf_path;
    if (!pdf_path) return res.status(404).json({ error: 'PDF non généré' });
    const full = path.resolve(process.cwd(), 'storage', 'pdf', pdf_path);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Fichier introuvable' });
    res.sendFile(full);
  } catch(e) { next(e); }
});

// Relance client — POST /api/factures/:id/relancer
router.post('/:id/relancer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const id      = Number(req.params.id);
    const { email, sujet, corps } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const { EmailService } = await import('../services/EmailService');
    const facture = await FactureService.obtenir(id);
    if (!facture) return res.status(404).json({ error: 'Introuvable' });

    // Joindre le PDF de la facture
    const er = await query('SELECT * FROM entreprise WHERE id=$1', [(facture as any).entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id=$1', [(facture as any).client_id]);
    const { PassThrough } = await import('stream');
    const pass   = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      FacturXService.genererFactureStream(facture, er.rows[0], cr.rows[0], pass).catch(reject);
    });

    const result = await EmailService.envoyerEmail({
      to:           email,
      subject:      sujet || `Relance — ${(facture as any).numero}`,
      text:         corps || '',
      attachments:  [{ filename: `${(facture as any).numero}.pdf`, content: pdfBuffer }],
      entreprise_id: (facture as any).entreprise_id,
    });
    res.json({ ok: true, preview_url: result?.previewUrl ?? null });
  } catch(e: any) { next(e); }
});

// Lettre de relance imprimable — GET /api/factures/:id/relance-courrier
router.get('/:id/relance-courrier', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const facture = await FactureService.obtenir(Number(req.params.id));
    if (!facture) return res.status(404).json({ error: 'Introuvable' });
    const f  = facture as any;
    const er = await query('SELECT * FROM entreprise WHERE id=$1', [f.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id=$1', [f.client_id]);
    const ent = er.rows[0];
    const cli = cr.rows[0];
    const PDFDocument = (await import('pdfkit')).default;

    const dateStr = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    const dateEch = f.date_echeance ? new Date(f.date_echeance).toLocaleDateString('fr-FR') : '—';
    const jRetard = f.date_echeance
      ? Math.max(0, Math.floor((Date.now() - new Date(f.date_echeance).getTime()) / 86400000))
      : 0;
    const clientNom = cli?.raison_sociale || `${cli?.prenom ?? ''} ${cli?.nom ?? ''}`.trim() || 'Client';
    const clientAdr = [cli?.adresse, cli?.adresse2, `${cli?.code_postal ?? ''} ${cli?.ville ?? ''}`].filter(Boolean).join('\n');

    const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: `Relance ${f.numero}` } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relance_${f.numero}.pdf"`);
    doc.pipe(res);

    // En-tête expéditeur
    doc.fontSize(10).font('Helvetica-Bold').text(ent.raison_sociale || '', { align: 'left' });
    doc.font('Helvetica').text([ent.adresse, `${ent.code_postal ?? ''} ${ent.ville ?? ''}`, ent.telephone ?? ''].filter(Boolean).join('\n'));
    doc.text(ent.email ?? '');

    // Destinataire (aligné à droite)
    doc.font('Helvetica-Bold').text(clientNom, 350, 60, { width: 185, align: 'left' });
    doc.font('Helvetica').text(clientAdr, 350, doc.y, { width: 185 });

    // Lieu et date
    doc.moveDown(3);
    const ville = ent.ville || '';
    doc.text(`${ville ? ville + ', le ' : 'Le '}${dateStr}`, { align: 'right' });

    // Objet
    doc.moveDown(1);
    doc.font('Helvetica-Bold').text(`Objet : Relance — Facture ${f.numero.replace(/-/g, '‑')}`);

    // Corps
    doc.moveDown(1.5).font('Helvetica');
    doc.text(`Madame, Monsieur ${clientNom},`, { lineGap: 4 });
    doc.moveDown(0.5);

    const numSafe = f.numero.replace(/-/g, '‑');
    if (jRetard > 0) {
      doc.text(
        `Sauf erreur ou omission de notre part, nous constatons que la facture ${numSafe} ` +
        `d'un montant de ${Number(f.montant_ttc).toFixed(2)} € TTC, arrivée à échéance le ${dateEch} ` +
        `(il y a ${jRetard} jour${jRetard > 1 ? 's' : ''}), n'a pas encore été réglée à ce jour.`,
        { lineGap: 4 }
      );
    } else {
      doc.text(
        `Nous vous rappelons que la facture ${numSafe} d'un montant de ${Number(f.montant_ttc).toFixed(2)} € TTC ` +
        `arrive à échéance le ${dateEch}. Nous vous remercions d'en tenir compte.`,
        { lineGap: 4 }
      );
    }

    doc.moveDown(0.5);
    doc.text('Nous vous prions de bien vouloir procéder au règlement dans les meilleurs délais ou de prendre contact avec nous si vous avez la moindre question concernant cette facture.', { lineGap: 4 });
    doc.moveDown(0.5);
    doc.text('Dans l\'attente de votre règlement, nous vous adressons nos cordiales salutations.');

    // Signature
    doc.moveDown(3);
    doc.font('Helvetica-Bold').text(ent.raison_sociale || '');
    doc.font('Helvetica').text(ent.email ?? '');

    // Pied de page (sur la même page, après la signature)
    const foot = [
      ent.raison_sociale,
      ent.siret ? `SIRET : ${ent.siret}` : '',
      ent.tva_intracom ? `TVA : ${ent.tva_intracom}` : '',
    ].filter(Boolean).join('  |  ');
    doc.moveDown(3).fontSize(8).fillColor('#888').text(foot, { align: 'center' });

    doc.end();
  } catch(e) { next(e); }
});

router.get('/:id/apercu', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const facture = await FactureService.obtenir(Number(req.params.id));
    if (!facture) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(facture as any).client_id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(facture as any).numero}.pdf"`);
    await FacturXService.genererFactureStream(facture, er.rows[0], cr.rows[0], res);
  } catch(e) { next(e); }
});

// Envoi automatique (récupère l'email du client) — utilisé par l'envoi groupé
router.post('/:id/envoyer', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const { EmailService } = await import('../services/EmailService');
    const { query } = await import('../db/database');
    const id  = Number(req.params.id);
    const fr  = await FactureService.obtenir(id);
    if (!fr) return res.status(404).json({ error: 'Introuvable' });
    const cr  = await query('SELECT email FROM clients WHERE id=$1', [fr.client_id]);
    const email = cr.rows[0]?.email;
    if (!email) return res.status(400).json({ error: `Aucun email pour ce client` });
    const result = await EmailService.envoyerFacture(id, email);
    res.json({ ok: true, preview_url: result.previewUrl ?? null });
  } catch(e: any) { next(e); }
});

router.post('/:id/envoyer-email', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const { EmailService } = await import('../services/EmailService');
    const id    = Number(req.params.id);
    const email = req.body?.email_client as string | undefined;
    if (!email) return res.json({ ok: true });
    const result = await EmailService.envoyerFacture(id, email);
    res.json({ ok: true, preview_url: result.previewUrl ?? null });
  } catch(e: any) { next(e); }
});

router.get('/:id/eml', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const facture = await FactureService.obtenir(Number(req.params.id));
    if (!facture) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(facture as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      FacturXService.genererFactureStream(facture, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.query.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Facture ${(facture as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint la facture ${(facture as any).numero}.`,
      '',
      `Montant HT  : ${Number((facture as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((facture as any).montant_ttc).toFixed(2)} €`,
      (facture as any).date_echeance ? `Échéance : ${(facture as any).date_echeance}` : '',
      '',
      'Cordialement,',
      entreprise.raison_sociale,
      entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '',
      entreprise.email,
    ].filter(Boolean).join('\r\n');

    const pdfB64 = pdfBuffer.toString('base64');
    const boundary = `----=_Part_${Date.now()}`;
    const eml = [
      `MIME-Version: 1.0`, `To: ${emailTo}`, `Subject: ${sujet}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`, ``,
      `--${boundary}`, `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: quoted-printable`, ``, corps, ``,
      `--${boundary}`, `Content-Type: application/pdf; name="${(facture as any).numero}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${(facture as any).numero}.pdf"`, ``,
      pdfB64.match(/.{1,76}/g)!.join('\r\n'), ``, `--${boundary}--`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${(facture as any).numero}.eml"`);
    res.send(eml);
  } catch(e) { next(e); }
});

router.post('/:id/mapi', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const facture = await FactureService.obtenir(Number(req.params.id));
    if (!facture) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(facture as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const tmpPdf = path.join(os.tmpdir(), `${(facture as any).numero}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on('data', (c: Buffer) => chunks.push(c));
      pass.on('end', () => { fs.writeFileSync(tmpPdf, Buffer.concat(chunks)); resolve(); });
      pass.on('error', reject);
      FacturXService.genererFactureStream(facture, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.body?.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Facture ${(facture as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint la facture ${(facture as any).numero}.`,
      '',
      `Montant HT  : ${Number((facture as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((facture as any).montant_ttc).toFixed(2)} €`,
      (facture as any).date_echeance ? `Échéance : ${(facture as any).date_echeance}` : '',
      '',
      'Cordialement,',
      entreprise.raison_sociale,
      entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '',
      entreprise.email,
    ].filter(Boolean).join('\n');

    const psScript = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class SimpleMapi {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct MapiMessage {
        public uint Reserved; public string Subject; public string NoteText;
        public string MessageType; public string DateReceived; public string ConversationID;
        public uint Flags; public IntPtr Originator;
        public uint RecipCount; public IntPtr Recips; public uint FileCount; public IntPtr Files;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct MapiRecipDesc {
        public uint Reserved; public uint RecipClass; public string Name; public string Address;
        public uint EIDSize; public IntPtr EntryID;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct MapiFileDesc {
        public uint Reserved; public uint Flags; public uint Position;
        public string PathName; public string FileName; public IntPtr FileType;
    }
    [DllImport("MAPI32.DLL", CharSet=CharSet.Ansi)]
    public static extern uint MAPISendMail(IntPtr session, IntPtr uiParam, ref MapiMessage msg, uint flags, uint reserved);
}
"@ -Language CSharp
$recip = New-Object SimpleMapi+MapiRecipDesc
$recip.RecipClass = 1
$recip.Name    = [System.IO.File]::ReadAllText("${tmpPdf}.to.txt")
$recip.Address = "SMTP:" + [System.IO.File]::ReadAllText("${tmpPdf}.to.txt")
$recipPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal([System.Runtime.InteropServices.Marshal]::SizeOf($recip))
[System.Runtime.InteropServices.Marshal]::StructureToPtr($recip, $recipPtr, $false)
$fileDesc = New-Object SimpleMapi+MapiFileDesc
$fileDesc.Position = [uint32]::MaxValue
$fileDesc.PathName = "${tmpPdf}"; $fileDesc.FileName = [System.IO.Path]::GetFileName("${tmpPdf}")
$filePtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal([System.Runtime.InteropServices.Marshal]::SizeOf($fileDesc))
[System.Runtime.InteropServices.Marshal]::StructureToPtr($fileDesc, $filePtr, $false)
$msg = New-Object SimpleMapi+MapiMessage
$msg.Subject = [System.IO.File]::ReadAllText("${tmpPdf}.subj.txt")
$msg.NoteText = [System.IO.File]::ReadAllText("${tmpPdf}.body.txt")
$msg.RecipCount = 1; $msg.Recips = $recipPtr; $msg.FileCount = 1; $msg.Files = $filePtr
$r = [SimpleMapi]::MAPISendMail([IntPtr]::Zero, [IntPtr]::Zero, [ref]$msg, 8, 0)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($recipPtr)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($filePtr)
if ($r -ne 0) { throw "MAPISendMail code $r" }
`;
    fs.writeFileSync(`${tmpPdf}.to.txt`,   emailTo, 'utf-8');
    fs.writeFileSync(`${tmpPdf}.subj.txt`, sujet,   'utf-8');
    fs.writeFileSync(`${tmpPdf}.body.txt`, corps,   'utf-8');
    const tmpPs = `${tmpPdf}.ps1`;
    fs.writeFileSync(tmpPs, psScript, 'utf-8');

    await new Promise<void>((resolve, reject) => {
      execFile('powershell.exe', ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
        { timeout: 15000 }, (err) => {
          try { fs.unlinkSync(tmpPs); } catch {}
          try { fs.unlinkSync(`${tmpPdf}.to.txt`); } catch {}
          try { fs.unlinkSync(`${tmpPdf}.subj.txt`); } catch {}
          try { fs.unlinkSync(`${tmpPdf}.body.txt`); } catch {}
          if (err) reject(err); else resolve();
        });
    });

    res.json({ ok: true });
  } catch(e: any) {
    res.status(500).json({ error: e.message ?? 'Impossible d\'ouvrir le client mail via MAPI' });
  }
});

// ── Chorus Pro ───────────────────────────────────────────────────────────────
router.post('/:id/chorus-pro/deposer', requirePerm('factures:w'), async (req, res, next) => {
  try {
    if (!ChorusProService.isConfigured())
      return res.status(503).json({ error: 'Chorus Pro non configuré (CHORUS_PRO_CLIENT_ID/SECRET manquants dans .env)' });
    const result = await ChorusProService.deposerFacture(Number(req.params.id));
    await logAudit(req, 'chorus_pro_depot', 'factures', Number(req.params.id), result);
    res.json(result);
  } catch(e: any) { next(e); }
});

router.get('/:id/chorus-pro/statut', requirePerm('factures:r'), async (req, res, next) => {
  try {
    if (!ChorusProService.isConfigured())
      return res.status(503).json({ error: 'Chorus Pro non configuré' });
    res.json(await ChorusProService.consulterStatut(Number(req.params.id)));
  } catch(e: any) { next(e); }
});

// Suppression d'un avoir brouillon uniquement
router.delete('/:id', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fr = await query('SELECT type_facture, locked, statut FROM factures WHERE id=$1', [id]);
    if (!fr.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    const f = fr.rows[0];
    if (f.type_facture !== 'avoir') return res.status(400).json({ error: 'Seuls les avoirs peuvent être supprimés. Pour annuler une facture, créez un avoir.' });
    if (f.locked) return res.status(400).json({ error: 'Impossible de supprimer un avoir déjà émis.' });
    await query('DELETE FROM factures WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
