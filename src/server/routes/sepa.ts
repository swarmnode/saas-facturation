import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';

const router = Router();

function esc(s: string | null | undefined): string {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatIban(s: string): string {
  return String(s || '').replace(/\s/g, '').toUpperCase();
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function isoNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// POST /api/sepa/generer
// Body: { facture_ids: number[], date_execution: string, sequence: 'FRST'|'RCUR'|'FNAL'|'OOFF' }
router.post('/generer', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const { facture_ids, date_execution, sequence = 'RCUR' } = req.body;
    if (!facture_ids?.length) return res.status(400).json({ error: 'Aucune facture sélectionnée' });
    if (!date_execution)       return res.status(400).json({ error: 'Date d\'exécution requise' });

    const entrepriseId = req.user!.entreprise_id;

    // Récupérer les infos de l'entreprise créancière
    const er = await query('SELECT * FROM entreprise WHERE id=$1', [entrepriseId]);
    const ent = er.rows[0];
    if (!ent) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!ent.iban) return res.status(400).json({ error: 'IBAN de l\'entreprise non renseigné (Paramètres → Entreprise → Prélèvement SEPA)' });
    if (!ent.ics)  return res.status(400).json({ error: 'ICS (Identifiant Créancier SEPA) non renseigné' });

    // Récupérer les factures avec les infos clients SEPA
    const placeholders = facture_ids.map((_: any, i: number) => `$${i + 2}`).join(',');
    const fr = await query(`
      SELECT f.id, f.numero, f.montant_ttc, f.client_id,
             c.raison_sociale, c.nom, c.prenom, c.civilite,
             c.iban AS client_iban, c.bic AS client_bic,
             c.mandat_rum, c.mandat_date, c.mandat_type
        FROM factures f
        JOIN clients c ON c.id = f.client_id
       WHERE f.id IN (${placeholders}) AND f.entreprise_id = $1
    `, [entrepriseId, ...facture_ids]);

    if (!fr.rows.length) return res.status(400).json({ error: 'Aucune facture trouvée' });

    // Vérifier que chaque client a les infos SEPA
    const missing = fr.rows.filter(f => !f.client_iban || !f.client_bic || !f.mandat_rum || !f.mandat_date);
    if (missing.length) {
      const nums = missing.map(f => f.numero).join(', ');
      return res.status(400).json({ error: `Infos SEPA manquantes pour les factures : ${nums}. Vérifiez IBAN, BIC, RUM et date de mandat dans la fiche client.` });
    }

    const msgId    = `MSG-${Date.now()}`;
    const pmtInfId = `PMT-${Date.now()}`;
    const total    = fr.rows.reduce((s: number, f: any) => s + parseFloat(f.montant_ttc), 0);
    const nbTx     = fr.rows.length;

    const txns = fr.rows.map((f: any) => {
      const nom = f.raison_sociale || [f.civilite, f.prenom, f.nom].filter(Boolean).join(' ');
      const iban = formatIban(f.client_iban);
      const bic  = String(f.client_bic || '').replace(/\s/g,'').toUpperCase();
      const amt  = parseFloat(f.montant_ttc).toFixed(2);
      const type = f.mandat_type || sequence;
      return `      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${esc(f.numero)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${amt}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${esc(f.mandat_rum)}</MndtId>
            <DtOfSgntr>${esc(f.mandat_date?.slice(0,10))}</DtOfSgntr>
          </MndtRltdInf>
          <CdtrSchmeId>
            <Id><PrvtId><Othr>
              <Id>${esc(ent.ics)}</Id>
              <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
            </Othr></PrvtId></Id>
          </CdtrSchmeId>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId><BIC>${esc(bic)}</BIC></FinInstnId></DbtrAgt>
        <Dbtr><Nm>${esc(nom)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${esc(iban)}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${esc(f.numero)}</Ustrd></RmtInf>
      </DrctDbtTxInf>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02 pain.008.001.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${isoNow()}</CreDtTm>
      <NbOfTxs>${nbTx}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${esc(ent.raison_sociale)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(pmtInfId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${nbTx}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>${esc(sequence)}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${esc(date_execution)}</ReqdColltnDt>
      <Cdtr>
        <Nm>${esc(ent.raison_sociale)}</Nm>
        <PstlAdr><Ctry>FR</Ctry></PstlAdr>
      </Cdtr>
      <CdtrAcct><Id><IBAN>${esc(formatIban(ent.iban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${esc(String(ent.bic||'').replace(/\s/g,'').toUpperCase())}</BIC></FinInstnId></CdtrAgt>
      <CdtrSchmeId>
        <Id><PrvtId><Othr>
          <Id>${esc(ent.ics)}</Id>
          <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
        </Othr></PrvtId></Id>
      </CdtrSchmeId>
${txns}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

    const filename = `SEPA_${date_execution}_${nbTx}tx.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch(e) { next(e); }
});

export default router;
