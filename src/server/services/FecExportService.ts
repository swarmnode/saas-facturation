import { query } from '../db/database';

function compteEncaissement(mode?: string): [string, string] {
  switch (mode) {
    case 'cheque':  return ['5112', 'Chèques à encaisser'];
    case 'especes': return ['530',  'Caisse'];
    default:        return ['512',  'Banque'];
  }
}

export class FecExportService {

  static async enregistrerPaiement(factureId: number, txClient?: any): Promise<void> {
    const q = txClient ? txClient.query.bind(txClient) : query;
    const r = await q(`
      SELECT f.*,
             COALESCE(c.raison_sociale, c.prenom || ' ' || c.nom) AS client_nom,
             COALESCE(c.siret, 'CLI' || c.id::text) AS client_num
      FROM factures f LEFT JOIN clients c ON f.client_id = c.id
      WHERE f.id = $1
    `, [factureId]);
    const f = r.rows[0];
    if (!f) return;

    const dateStr = (f.date_paiement ?? new Date().toISOString())
      .replace(/[-T:Z.]/g, '').slice(0, 8);
    const numBase = `RG-${f.numero}`;
    const [cptEnc, libEnc] = compteEncaissement(f.mode_paiement);

    const ins = async (sfx: string, cptNum: string, cptLib: string, lib: string, debit: number, credit: number) => {
      await q(`
        INSERT INTO fec_ecritures
          (journal_code, journal_lib, ecriture_num, ecriture_date, compte_num, compte_lib,
           comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib, debit, credit, facture_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (ecriture_num) DO NOTHING
      `, ['BQ', 'Banque', `${numBase}-${sfx}`, dateStr,
          cptNum, cptLib, f.client_num, f.client_nom,
          f.numero, dateStr, lib, debit, credit, factureId]);
    };

    await ins('1', cptEnc, libEnc, `Règlement ${f.numero}`, f.montant_ttc, 0);
    await ins('2', '411', 'Clients', `Règlement ${f.numero}`, 0, f.montant_ttc);
  }

  static async enregistrerFacture(factureId: number, txClient?: any) {
    const q = txClient ? txClient.query.bind(txClient) : query;
    const r = await q(`
      SELECT f.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part, c.siret AS client_siret
      FROM factures f LEFT JOIN clients c ON f.client_id = c.id
      WHERE f.id = $1
    `, [factureId]);
    const facture = r.rows[0];
    if (!facture) return;

    const dateStr   = (facture.date_emission ?? '').replace(/[-T:Z.]/g, '').slice(0, 8);
    const clientLib = facture.client_nom ?? facture.client_nom_part ?? 'Client';
    const clientNum = facture.client_siret ?? `CLI${facture.client_id}`;
    const num       = `VT-${facture.numero}`;

    const ins = async (suffix: string, compteNum: string, compteLib: string, auxNum: string | null, auxLib: string | null, lib: string, debit: number, credit: number) => {
      await q(`
        INSERT INTO fec_ecritures
          (journal_code, journal_lib, ecriture_num, ecriture_date, compte_num, compte_lib,
           comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib, debit, credit, facture_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (ecriture_num) DO NOTHING
      `, ['VT', 'Ventes', `${num}-${suffix}`, dateStr, compteNum, compteLib,
          auxNum, auxLib, facture.numero, dateStr, lib, debit, credit, factureId]);
    };

    await ins('1', '411', 'Clients', clientNum, clientLib, `Facture ${facture.numero}`, facture.montant_ttc, 0);
    await ins('2', '706', 'Prestations de services', null, null, `Facture ${facture.numero}`, 0, facture.montant_ht);
    if (facture.montant_tva > 0) {
      await ins('3', '44571', 'TVA collectée', null, null, `TVA Facture ${facture.numero}`, 0, facture.montant_tva);
    }
  }

  static async exporterCSV(annee?: number, entreprise_id?: number): Promise<string> {
    const params: any[] = [];
    const conditions: string[] = [];

    if (entreprise_id) {
      const p = params.push(entreprise_id);
      conditions.push(`(
        (e.facture_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM factures f WHERE f.id = e.facture_id AND f.entreprise_id = $${p}
        ))
        OR
        (e.facture_fournisseur_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM factures_fournisseurs ff WHERE ff.id = e.facture_fournisseur_id AND ff.entreprise_id = $${p}
        ))
      )`);
    }
    if (annee) {
      conditions.push(`LEFT(e.ecriture_date, 4) = $${params.push(String(annee))}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await query(
      `SELECT e.* FROM fec_ecritures e ${where} ORDER BY e.ecriture_date, e.ecriture_num`,
      params
    );
    const lignes = r.rows as any[];
    const headers = [
      'JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib',
      'CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit',
      'EcritureLet','DateLet','ValidDate','MontantDevise','Idevise'
    ];

    const rows = lignes.map(l => [
      l.journal_code, l.journal_lib, l.ecriture_num, l.ecriture_date,
      l.compte_num, l.compte_lib, l.comp_aux_num ?? '', l.comp_aux_lib ?? '',
      l.piece_ref ?? '', l.piece_date ?? '', l.ecriture_lib,
      l.debit.toFixed(2), l.credit.toFixed(2),
      l.ecriture_let ?? '', l.date_let ?? '', l.valid_date ?? '',
      l.montant_devise ?? '', l.idevise ?? ''
    ].join('\t'));

    return [headers.join('\t'), ...rows].join('\n');
  }
}
