import { Router } from 'express';
import { AcompteService } from '../services/AcompteService';
import { paginateParams, buildPage } from '../utils/paginate';
import { FacturXService } from '../services/FacturXService';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const commercial_id = req.user!.role === 'commercial' && !req.user!.voir_tout ? req.user!.id : undefined;
    const { page, limit, all } = paginateParams(req.query);
    const rows = await AcompteService.lister(req.user!.entreprise_id, commercial_id, all ? undefined : page, all ? undefined : limit);
    res.json(all ? rows : buildPage(rows, page, limit));
  } catch(e) { next(e); }
});

router.get('/:id', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const a = await AcompteService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    res.json(a);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('acomptes:w'), async (req, res, next) => {
  try { res.status(201).json(await AcompteService.creer({ ...req.body, entreprise_id: req.user!.entreprise_id })); } catch(e) { next(e); }
});

router.post('/:id/encaisser', requirePerm('acomptes:w'), async (req, res, next) => {
  try {
    res.json(await AcompteService.encaisser(
      Number(req.params.id),
      req.body.date_encaissement,
      req.body.mode_paiement
    ));
  } catch(e) { next(e); }
});

router.post('/:id/envoyer-email', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const { EmailService } = await import('../services/EmailService');
    const id    = Number(req.params.id);
    const email = req.body?.email_client as string | undefined;
    if (!email) return res.json({ ok: true });
    const result = await EmailService.envoyerAcompte(id, email);
    res.json({ ok: true, preview_url: result.previewUrl ?? null });
  } catch(e: any) { next(e); }
});

router.get('/:id/apercu', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const a = await AcompteService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(a as any).client_id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(a as any).numero}.pdf"`);
    await FacturXService.genererAcompteStream(a, er.rows[0], cr.rows[0], res);
  } catch(e) { next(e); }
});

router.get('/:id/eml', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const a = await AcompteService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(a as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      FacturXService.genererAcompteStream(a, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.query.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Facture d'acompte ${(a as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint la facture d'acompte ${(a as any).numero}.`,
      '',
      `Montant HT  : ${Number((a as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((a as any).montant_ttc).toFixed(2)} €`,
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
      `--${boundary}`, `Content-Type: application/pdf; name="${(a as any).numero}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${(a as any).numero}.pdf"`, ``,
      pdfB64.match(/.{1,76}/g)!.join('\r\n'), ``, `--${boundary}--`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${(a as any).numero}.eml"`);
    res.send(eml);
  } catch(e) { next(e); }
});

router.post('/:id/mapi', requirePerm('acomptes:r'), async (req, res, next) => {
  try {
    const a = await AcompteService.obtenir(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(a as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const tmpPdf = path.join(os.tmpdir(), `${(a as any).numero}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on('data', (c: Buffer) => chunks.push(c));
      pass.on('end', () => { fs.writeFileSync(tmpPdf, Buffer.concat(chunks)); resolve(); });
      pass.on('error', reject);
      FacturXService.genererAcompteStream(a, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.body?.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Facture d'acompte ${(a as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint la facture d'acompte ${(a as any).numero}.`,
      '',
      `Montant HT  : ${Number((a as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((a as any).montant_ttc).toFixed(2)} €`,
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

router.delete('/:id', requirePerm('acomptes:w'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ar = await query('SELECT locked FROM acomptes WHERE id=$1', [id]);
    if (!ar.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    if (ar.rows[0].locked) return res.status(400).json({ error: 'Impossible de supprimer un acompte encaissé.' });
    await query('DELETE FROM acomptes WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
