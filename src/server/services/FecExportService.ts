import { query } from '../db/database';

export class FecExportService {
  static async enregistrerFacture(factureId: number) {
    const r = await query(`
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
      await query(`
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

  static async exporterCSV(): Promise<string> {
    const r     = await query('SELECT * FROM fec_ecritures ORDER BY ecriture_date, ecriture_num');
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
      l.ecriture_let ?? '', l.date_let ?? '', l.valid_date,
      l.montant_devise ?? '', l.idevise ?? ''
    ].join('\t'));

    return [headers.join('\t'), ...rows].join('\n');
  }
}
