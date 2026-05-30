import { Router } from 'express';
import { BonLivraisonService } from '../services/BonLivraisonService';
import { FacturXService } from '../services/FacturXService';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/', requirePerm('bl:r'), async (req, res, next) => {
  try { res.json(await BonLivraisonService.lister(req.user!.entreprise_id)); } catch(e) { next(e); }
});

router.get('/:id', requirePerm('bl:r'), async (req, res, next) => {
  try {
    const bl = await BonLivraisonService.obtenir(Number(req.params.id));
    if (!bl) return res.status(404).json({ error: 'Introuvable' });
    res.json(bl);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('bl:w'), async (req, res, next) => {
  try {
    res.status(201).json(await BonLivraisonService.creer({ ...req.body, entreprise_id: req.user!.entreprise_id }));
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('bl:w'), async (req, res, next) => {
  try { res.json(await BonLivraisonService.mettreAJour(Number(req.params.id), req.body)); } catch(e) { next(e); }
});

router.post('/:id/emettre', requirePerm('bl:w'), async (req, res, next) => {
  try { res.json(await BonLivraisonService.changerStatut(Number(req.params.id), 'emis')); } catch(e) { next(e); }
});

router.post('/:id/livrer', requirePerm('bl:w'), async (req, res, next) => {
  try { res.json(await BonLivraisonService.changerStatut(Number(req.params.id), 'livre')); } catch(e) { next(e); }
});

router.delete('/:id', requirePerm('bl:w'), async (req, res, next) => {
  try { await BonLivraisonService.supprimer(Number(req.params.id)); res.json({ ok: true }); } catch(e) { next(e); }
});

router.get('/:id/apercu', requirePerm('bl:r'), async (req, res, next) => {
  try {
    const bl = await BonLivraisonService.obtenir(Number(req.params.id));
    if (!bl) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(bl as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(bl as any).numero}.pdf"`);
    await FacturXService.genererBLStream(bl, entreprise, client, res);
  } catch(e) { next(e); }
});

router.post('/:id/envoyer-email', requirePerm('bl:r'), async (req, res, next) => {
  try {
    const { EmailService } = await import('../services/EmailService');
    const id    = Number(req.params.id);
    const email = req.body?.email_client as string | undefined;
    if (!email) return res.json({ ok: true });
    const result = await EmailService.envoyerBL(id, email);
    res.json({ ok: true, preview_url: result.previewUrl ?? null });
  } catch(e: any) { next(e); }
});

router.get('/:id/eml', requirePerm('bl:r'), async (req, res, next) => {
  try {
    const bl = await BonLivraisonService.obtenir(Number(req.params.id));
    if (!bl) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(bl as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      FacturXService.genererBLStream(bl, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.query.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Bon de livraison ${(bl as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint le bon de livraison ${(bl as any).numero}.`,
      (bl as any).date_livraison ? `Date de livraison : ${(bl as any).date_livraison}` : '',
      (bl as any).lieu_livraison ? `Lieu : ${(bl as any).lieu_livraison}` : '',
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
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: quoted-printable`, ``,
      corps, ``,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${(bl as any).numero}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${(bl as any).numero}.pdf"`, ``,
      pdfB64.match(/.{1,76}/g)!.join('\r\n'), ``,
      `--${boundary}--`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${(bl as any).numero}.eml"`);
    res.send(eml);
  } catch(e) { next(e); }
});

router.post('/:id/mapi', requirePerm('bl:r'), async (req, res, next) => {
  try {
    const bl = await BonLivraisonService.obtenir(Number(req.params.id));
    if (!bl) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(bl as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const tmpPdf = path.join(os.tmpdir(), `${(bl as any).numero}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on('data', (c: Buffer) => chunks.push(c));
      pass.on('end', () => { fs.writeFileSync(tmpPdf, Buffer.concat(chunks)); resolve(); });
      pass.on('error', reject);
      FacturXService.genererBLStream(bl, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.body?.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Bon de livraison ${(bl as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint le bon de livraison ${(bl as any).numero}.`,
      (bl as any).date_livraison ? `Date de livraison : ${(bl as any).date_livraison}` : '',
      (bl as any).lieu_livraison ? `Lieu : ${(bl as any).lieu_livraison}` : '',
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

export default router;
