import { Router } from 'express';
import { DevisService } from '../services/DevisService';
import { AvenantService } from '../services/AvenantService';
import { FacturXService } from '../services/FacturXService';
import { EmailService } from '../services/EmailService';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/', requirePerm('devis:r'), async (req, res, next) => {
  try { res.json(await DevisService.lister(req.user!.entreprise_id)); } catch(e) { next(e); }
});

router.get('/:id', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const d = await DevisService.obtenir(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'Introuvable' });
    res.json(d);
  } catch(e) { next(e); }
});

router.post('/', requirePerm('devis:w'), async (req, res, next) => {
  try {
    res.status(201).json(await DevisService.creer({ ...req.body, entreprise_id: req.user!.entreprise_id }));
  } catch(e) { next(e); }
});

router.put('/:id', requirePerm('devis:w'), async (req, res, next) => {
  try { res.json(await DevisService.mettreAJour(Number(req.params.id), req.body)); } catch(e) { next(e); }
});

router.post('/:id/envoyer', requirePerm('devis:w'), async (req, res, next) => {
  try {
    const id    = Number(req.params.id);
    const email = req.body?.email_client as string | undefined;
    const devis = await DevisService.changerStatut(id, 'envoye');
    let previewUrl: string | undefined;
    if (email) {
      const result = await EmailService.envoyerDevis(id, email);
      previewUrl = result.previewUrl;
    }
    res.json({ ...(devis as any), email_envoye: !!email, preview_url: previewUrl ?? null });
  } catch(e) { next(e); }
});

router.post('/:id/accepter', requirePerm('devis:w'), async (req, res, next) => {
  try {
    const devis = await DevisService.changerStatut(Number(req.params.id), 'accepte');
    // Passer le client de "prospect" à "client" si c'est encore un prospect
    if ((devis as any)?.client_id) {
      await query(
        `UPDATE clients
            SET statut_rgpd = 'client',
                date_derniere_activite = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          WHERE id = $1 AND statut_rgpd = 'prospect'`,
        [(devis as any).client_id]
      );
    }
    res.json(devis);
  } catch(e) { next(e); }
});

router.post('/:id/signer', requirePerm('devis:w'), async (req, res, next) => {
  try { res.json(await DevisService.changerStatut(Number(req.params.id), 'signe')); } catch(e) { next(e); }
});

router.post('/:id/refuser', requirePerm('devis:w'), async (req, res, next) => {
  try { res.json(await DevisService.changerStatut(Number(req.params.id), 'refuse')); } catch(e) { next(e); }
});

router.post('/:id/dupliquer', requirePerm('devis:w'), async (req, res, next) => {
  try { res.status(201).json(await DevisService.dupliquer(Number(req.params.id))); } catch(e) { next(e); }
});

router.get('/:id/apercu', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const devis = await DevisService.obtenir(Number(req.params.id));
    if (!devis) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(devis as any).client_id]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(devis as any).numero}.pdf"`);
    await FacturXService.genererDevisStream(devis, er.rows[0], cr.rows[0], res);
  } catch(e) { next(e); }
});

router.get('/:id/eml', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const id    = Number(req.params.id);
    const devis = await DevisService.obtenir(id);
    if (!devis) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(devis as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);
      FacturXService.genererDevisStream(devis, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.query.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Devis ${(devis as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint le devis ${(devis as any).numero}${(devis as any).objet ? ` (${(devis as any).objet})` : ''}.`,
      '',
      `Montant HT  : ${Number((devis as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((devis as any).montant_ttc).toFixed(2)} €`,
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
      `--${boundary}`, `Content-Type: application/pdf; name="${(devis as any).numero}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${(devis as any).numero}.pdf"`, ``,
      pdfB64.match(/.{1,76}/g)!.join('\r\n'), ``, `--${boundary}--`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${(devis as any).numero}.eml"`);
    res.send(eml);
  } catch(e) { next(e); }
});

router.post('/:id/mapi', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const id    = Number(req.params.id);
    const devis = await DevisService.obtenir(id);
    if (!devis) return res.status(404).json({ error: 'Introuvable' });
    const er = await query('SELECT * FROM entreprise WHERE id = $1', [req.user!.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [(devis as any).client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const { PassThrough } = await import('stream');
    const tmpPdf = path.join(os.tmpdir(), `${(devis as any).numero}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on('data', (c: Buffer) => chunks.push(c));
      pass.on('end', () => { fs.writeFileSync(tmpPdf, Buffer.concat(chunks)); resolve(); });
      pass.on('error', reject);
      FacturXService.genererDevisStream(devis, entreprise, client, pass).catch(reject);
    });

    const emailTo   = (req.body?.email as string) || client?.email || '';
    const clientNom = client?.type_client === 'professionnel'
      ? client.raison_sociale : `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim();
    const sujet = `Devis ${(devis as any).numero} — ${entreprise.raison_sociale}`;
    const corps = [
      `Bonjour${clientNom ? ' ' + clientNom : ''},`,
      '',
      `Veuillez trouver ci-joint le devis ${(devis as any).numero}${(devis as any).objet ? ` (${(devis as any).objet})` : ''}.`,
      '',
      `Montant HT  : ${Number((devis as any).montant_ht).toFixed(2)} €`,
      `Montant TTC : ${Number((devis as any).montant_ttc).toFixed(2)} €`,
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

router.post('/:id/avenant', requirePerm('devis:w'), async (req, res, next) => {
  try {
    const { motif, lignes } = req.body;
    res.status(201).json(await AvenantService.creer(Number(req.params.id), motif, lignes));
  } catch(e) { next(e); }
});

router.get('/:id/avenants', async (req, res, next) => {
  try { res.json(await AvenantService.lister(Number(req.params.id))); } catch(e) { next(e); }
});

router.get('/:id/pdf', async (req, res) => {
  const d = await DevisService.obtenir(Number(req.params.id));
  const pdf_path = (d as any)?.pdf_path;
  if (!pdf_path) return res.status(404).json({ error: 'PDF non généré' });
  const full = path.resolve(process.cwd(), 'storage', 'pdf', pdf_path);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.sendFile(full);
});

router.delete('/:id', requirePerm('devis:w'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const dr = await query('SELECT locked, statut FROM devis WHERE id=$1', [id]);
    if (!dr.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    if (dr.rows[0].locked) return res.status(400).json({ error: 'Impossible de supprimer un devis signé.' });

    const chaines = await query(
      `SELECT 1 FROM factures WHERE devis_id=$1 LIMIT 1
       UNION ALL SELECT 1 FROM acomptes WHERE devis_id=$1 LIMIT 1
       UNION ALL SELECT 1 FROM bons_livraison WHERE devis_id=$1 LIMIT 1`,
      [id]
    );
    if (chaines.rows.length) return res.status(400).json({ error: 'Ce devis est lié à une facture, un acompte ou un BL. Supprimez-les d\'abord.' });

    await query('DELETE FROM devis WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
