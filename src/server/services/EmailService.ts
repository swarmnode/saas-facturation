import nodemailer, { SentMessageInfo } from 'nodemailer';
import { PassThrough } from 'stream';
import { FacturXService } from './FacturXService';
import { query } from '../db/database';

function makeTransportConfig(entreprise: any) {
  if (!entreprise?.smtp_host) return null;
  return {
    host: entreprise.smtp_host, port: entreprise.smtp_port ?? 587,
    secure: !!entreprise.smtp_secure,
    auth: { user: entreprise.smtp_user, pass: entreprise.smtp_pass },
  };
}

async function getTransporter(entreprise: any) {
  const cfg = makeTransportConfig(entreprise);
  if (cfg) return { transporter: nodemailer.createTransport(cfg), test: false };
  const testAccount = await nodemailer.createTestAccount();
  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    }),
    test: true,
  };
}

async function pdfFromStream(streamFn: (pass: PassThrough) => Promise<void>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    pass.on('end', () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);
    streamFn(pass).catch(reject);
  });
}

export class EmailService {
  static async envoyerDevis(devisId: number, emailDestinataire: string): Promise<{ previewUrl?: string }> {
    const er = await query('SELECT * FROM entreprise LIMIT 1');
    const entreprise = er.rows[0];

    const dr = await query('SELECT * FROM devis WHERE id = $1', [devisId]);
    const devis = dr.rows[0];
    if (!devis) throw new Error('Devis introuvable');
    const lr = await query('SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY position', [devisId]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [devis.client_id]);
    const client = cr.rows[0];

    const pdfBuffer = await pdfFromStream(pass =>
      FacturXService.genererDevisStream({ ...devis, lignes: lr.rows }, entreprise, client, pass)
    );

    const { transporter, test } = await getTransporter(entreprise);
    const clientNom = client.type_client === 'professionnel'
      ? client.raison_sociale : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

    const info: SentMessageInfo = await transporter.sendMail({
      from:    entreprise?.smtp_from || entreprise?.email || 'test@facturation.local',
      to:      emailDestinataire,
      subject: `Devis ${devis.numero} — ${entreprise.raison_sociale}`,
      text: [
        `Bonjour${clientNom ? ' ' + clientNom : ''},`, '',
        `Veuillez trouver ci-joint le devis ${devis.numero}${devis.objet ? ` (${devis.objet})` : ''}.`, '',
        `Montant HT : ${Number(devis.montant_ht).toFixed(2)} €`,
        `Montant TTC : ${Number(devis.montant_ttc).toFixed(2)} €`, '',
        'Cordialement,', entreprise.raison_sociale,
        entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '', entreprise.email,
      ].filter(Boolean).join('\n'),
      attachments: [{ filename: `${devis.numero}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    return { previewUrl: test ? (nodemailer.getTestMessageUrl(info) || undefined) : undefined };
  }

  static async envoyerFacture(factureId: number, emailDestinataire: string): Promise<{ previewUrl?: string }> {
    const er = await query('SELECT * FROM entreprise LIMIT 1');
    const entreprise = er.rows[0];
    const fr = await query('SELECT * FROM factures WHERE id = $1', [factureId]);
    const facture = fr.rows[0];
    if (!facture) throw new Error('Facture introuvable');
    const lr = await query('SELECT * FROM factures_lignes WHERE facture_id = $1 ORDER BY position', [factureId]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [facture.client_id]);
    const client = cr.rows[0];

    const pdfBuffer = await pdfFromStream(pass =>
      FacturXService.genererFactureStream({ ...facture, lignes: lr.rows }, entreprise, client, pass)
    );

    const { transporter, test } = await getTransporter(entreprise);
    const clientNom = client.type_client === 'professionnel'
      ? client.raison_sociale : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

    const info: SentMessageInfo = await transporter.sendMail({
      from:    entreprise?.smtp_from || entreprise?.email || 'test@facturation.local',
      to:      emailDestinataire,
      subject: `Facture ${facture.numero} — ${entreprise.raison_sociale}`,
      text: [
        `Bonjour${clientNom ? ' ' + clientNom : ''},`, '',
        `Veuillez trouver ci-joint la facture ${facture.numero}.`, '',
        `Montant HT  : ${Number(facture.montant_ht).toFixed(2)} €`,
        `Montant TTC : ${Number(facture.montant_ttc).toFixed(2)} €`,
        facture.date_echeance ? `Échéance : ${facture.date_echeance}` : '', '',
        'Cordialement,', entreprise.raison_sociale,
        entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '', entreprise.email,
      ].filter(Boolean).join('\n'),
      attachments: [{ filename: `${facture.numero}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    return { previewUrl: test ? (nodemailer.getTestMessageUrl(info) || undefined) : undefined };
  }

  static async envoyerBL(blId: number, emailDestinataire: string): Promise<{ previewUrl?: string }> {
    const er = await query('SELECT * FROM entreprise LIMIT 1');
    const entreprise = er.rows[0];
    const br = await query('SELECT * FROM bons_livraison WHERE id = $1', [blId]);
    const bl = br.rows[0];
    if (!bl) throw new Error('Bon de livraison introuvable');
    const lr = await query('SELECT * FROM bons_livraison_lignes WHERE bl_id = $1 ORDER BY position', [blId]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [bl.client_id]);
    const client = cr.rows[0];

    const pdfBuffer = await pdfFromStream(pass =>
      FacturXService.genererBLStream({ ...bl, lignes: lr.rows }, entreprise, client, pass)
    );

    const { transporter, test } = await getTransporter(entreprise);
    const clientNom = client.type_client === 'professionnel'
      ? client.raison_sociale : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

    const info: SentMessageInfo = await transporter.sendMail({
      from:    entreprise?.smtp_from || entreprise?.email || 'test@facturation.local',
      to:      emailDestinataire,
      subject: `Bon de livraison ${bl.numero} — ${entreprise.raison_sociale}`,
      text: [
        `Bonjour${clientNom ? ' ' + clientNom : ''},`, '',
        `Veuillez trouver ci-joint le bon de livraison ${bl.numero}.`,
        bl.date_livraison ? `Date de livraison : ${bl.date_livraison}` : '',
        bl.lieu_livraison ? `Lieu : ${bl.lieu_livraison}` : '', '',
        'Cordialement,', entreprise.raison_sociale,
        entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '', entreprise.email,
      ].filter(Boolean).join('\n'),
      attachments: [{ filename: `${bl.numero}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    return { previewUrl: test ? (nodemailer.getTestMessageUrl(info) || undefined) : undefined };
  }

  static async envoyerAcompte(acompteId: number, emailDestinataire: string): Promise<{ previewUrl?: string }> {
    const er = await query('SELECT * FROM entreprise LIMIT 1');
    const entreprise = er.rows[0];
    const ar = await query('SELECT * FROM acomptes WHERE id = $1', [acompteId]);
    const acompte = ar.rows[0];
    if (!acompte) throw new Error('Acompte introuvable');
    const cr = await query('SELECT * FROM clients WHERE id = $1', [acompte.client_id]);
    const client = cr.rows[0];

    const pdfBuffer = await pdfFromStream(pass =>
      FacturXService.genererAcompteStream(acompte, entreprise, client, pass)
    );

    const { transporter, test } = await getTransporter(entreprise);
    const clientNom = client.type_client === 'professionnel'
      ? client.raison_sociale : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

    const info: SentMessageInfo = await transporter.sendMail({
      from:    entreprise?.smtp_from || entreprise?.email || 'test@facturation.local',
      to:      emailDestinataire,
      subject: `Facture d'acompte ${acompte.numero} — ${entreprise.raison_sociale}`,
      text: [
        `Bonjour${clientNom ? ' ' + clientNom : ''},`, '',
        `Veuillez trouver ci-joint la facture d'acompte ${acompte.numero}.`, '',
        `Montant HT  : ${Number(acompte.montant_ht).toFixed(2)} €`,
        `Montant TTC : ${Number(acompte.montant_ttc).toFixed(2)} €`, '',
        'Cordialement,', entreprise.raison_sociale,
        entreprise.telephone ? `Tél. : ${entreprise.telephone}` : '', entreprise.email,
      ].filter(Boolean).join('\n'),
      attachments: [{ filename: `${acompte.numero}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    return { previewUrl: test ? (nodemailer.getTestMessageUrl(info) || undefined) : undefined };
  }

  // Email générique (relances, etc.)
  static async envoyerEmail(opts: { to: string; subject: string; text: string; attachments?: any[] }): Promise<{ previewUrl?: string }> {
    const er = await query('SELECT * FROM entreprise LIMIT 1');
    const { transporter, test } = await getTransporter(er.rows[0]);
    const info: SentMessageInfo = await transporter.sendMail({
      from:        er.rows[0]?.smtp_from || er.rows[0]?.email || 'noreply@facturpro.local',
      to:          opts.to,
      subject:     opts.subject,
      text:        opts.text,
      attachments: opts.attachments,
    });
    return { previewUrl: test ? (nodemailer.getTestMessageUrl(info) || undefined) : undefined };
  }
}
