import { query, withTransaction } from '../db/database';

export interface FactureFournisseur {
  id: number;
  entreprise_id: number;
  numero: string;
  fournisseur_nom: string;
  fournisseur_siret: string | null;
  date_facture: string;
  date_echeance: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  compte_charge: string;
  description: string | null;
  statut: 'recue' | 'payee';
  date_paiement: string | null;
  mode_paiement: string | null;
  created_at: string;
  updated_at: string;
}

function toISODate(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toDateStr(iso: string | Date): string {
  return toISODate(iso).replace(/-/g, '');
}

async function enregistrerFEC(ff: FactureFournisseur, txClient?: any): Promise<void> {
  const q = txClient ? txClient.query.bind(txClient) : query;
  const dateStr = toDateStr(ff.date_facture);
  const numBase = `FF-${ff.id}`;
  const fournisseurNum = ff.fournisseur_siret ?? `FOUR${ff.id}`;

  const ins = async (sfx: string, cptNum: string, cptLib: string, auxNum: string | null, auxLib: string | null, lib: string, debit: number, credit: number) => {
    await q(`
      INSERT INTO fec_ecritures
        (journal_code, journal_lib, ecriture_num, ecriture_date, compte_num, compte_lib,
         comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib, debit, credit, facture_fournisseur_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (ecriture_num) DO NOTHING
    `, ['AC', 'Achats', `${numBase}-${sfx}`, dateStr,
        cptNum, cptLib, auxNum, auxLib,
        ff.numero, dateStr, lib, debit, credit, ff.id]);
  };

  await ins('1', '401', 'Fournisseurs', fournisseurNum, ff.fournisseur_nom,
    `Facture ${ff.numero} — ${ff.fournisseur_nom}`, 0, ff.montant_ttc);
  await ins('2', ff.compte_charge, `Charge ${ff.compte_charge}`, null, null,
    `Facture ${ff.numero} — ${ff.fournisseur_nom}`, ff.montant_ht, 0);
  if (ff.montant_tva > 0) {
    await ins('3', '44566', 'TVA déductible', null, null,
      `TVA Facture ${ff.numero} — ${ff.fournisseur_nom}`, ff.montant_tva, 0);
  }
}

async function enregistrerPaiementFEC(ff: FactureFournisseur, mode: string, txClient?: any): Promise<void> {
  const q = txClient ? txClient.query.bind(txClient) : query;
  const dateStr = toDateStr(ff.date_paiement ?? ff.date_facture);
  const numBase = `FF-RG-${ff.id}`;
  const compteEnc = mode === 'cheque' ? '5112' : mode === 'especes' ? '530' : '512';
  const libEnc    = mode === 'cheque' ? 'Chèques à encaisser' : mode === 'especes' ? 'Caisse' : 'Banque';

  const ins = async (sfx: string, cptNum: string, cptLib: string, lib: string, debit: number, credit: number) => {
    await q(`
      INSERT INTO fec_ecritures
        (journal_code, journal_lib, ecriture_num, ecriture_date, compte_num, compte_lib,
         piece_ref, piece_date, ecriture_lib, debit, credit, facture_fournisseur_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (ecriture_num) DO NOTHING
    `, ['BQ', 'Banque', `${numBase}-${sfx}`, dateStr,
        cptNum, cptLib, ff.numero, dateStr, lib, debit, credit, ff.id]);
  };

  await ins('1', '401', 'Fournisseurs', `Règlement ${ff.numero} — ${ff.fournisseur_nom}`, ff.montant_ttc, 0);
  await ins('2', compteEnc, libEnc, `Règlement ${ff.numero} — ${ff.fournisseur_nom}`, 0, ff.montant_ttc);
}

async function syncTvaDeductible(entreprise_id: number, periode: string): Promise<void> {
  const r = await query(`
    SELECT SUM(montant_tva) AS total
    FROM factures_fournisseurs
    WHERE entreprise_id = $1 AND TO_CHAR(date_facture, 'YYYY-MM') = $2
  `, [entreprise_id, periode]);
  const total = Number(r.rows[0]?.total ?? 0);
  if (total > 0) {
    await query(`
      INSERT INTO tva_deductible (entreprise_id, periode, montant, notes)
      VALUES ($1, $2, $3, 'Calculé depuis les factures fournisseurs')
      ON CONFLICT (entreprise_id, periode) DO UPDATE
        SET montant = EXCLUDED.montant, notes = EXCLUDED.notes, updated_at = NOW()
    `, [entreprise_id, periode, total]);
  }
}

export class FournisseurService {

  static async lister(entreprise_id: number, statut?: string): Promise<FactureFournisseur[]> {
    const params: any[] = [entreprise_id];
    const statutFilter = statut ? `AND statut = $${params.push(statut)}` : '';
    const r = await query(`
      SELECT * FROM factures_fournisseurs
      WHERE entreprise_id = $1 ${statutFilter}
      ORDER BY date_facture DESC, id DESC
    `, params);
    return r.rows;
  }

  static async obtenir(id: number, entreprise_id: number): Promise<FactureFournisseur | null> {
    const r = await query(
      `SELECT * FROM factures_fournisseurs WHERE id = $1 AND entreprise_id = $2`,
      [id, entreprise_id]
    );
    return r.rows[0] ?? null;
  }

  static async creer(data: Partial<FactureFournisseur>, entreprise_id: number): Promise<FactureFournisseur> {
    return withTransaction(async (client) => {
      const q = client.query.bind(client);
      const montant_ht  = Number(data.montant_ht);
      const taux_tva    = Number(data.taux_tva ?? 20);
      const montant_tva = Math.round(montant_ht * taux_tva) / 100;
      const montant_ttc = montant_ht + montant_tva;

      const r = await q(`
        INSERT INTO factures_fournisseurs
          (entreprise_id, numero, fournisseur_nom, fournisseur_siret, date_facture, date_echeance,
           montant_ht, taux_tva, montant_tva, montant_ttc, compte_charge, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [entreprise_id, data.numero, data.fournisseur_nom, data.fournisseur_siret ?? null,
          data.date_facture, data.date_echeance ?? null,
          montant_ht, taux_tva, montant_tva, montant_ttc,
          data.compte_charge ?? '606', data.description ?? null]);

      const ff: FactureFournisseur = r.rows[0];
      await enregistrerFEC(ff, client);

      const periode = toISODate(ff.date_facture).slice(0, 7);
      await syncTvaDeductible(entreprise_id, periode);

      return ff;
    });
  }

  static async payer(id: number, data: { date_paiement?: string; mode_paiement?: string }, entreprise_id: number): Promise<FactureFournisseur> {
    return withTransaction(async (client) => {
      const q = client.query.bind(client);
      const r = await q(
        `SELECT * FROM factures_fournisseurs WHERE id = $1 AND entreprise_id = $2`,
        [id, entreprise_id]
      );
      const ff: FactureFournisseur = r.rows[0];
      if (!ff) throw new Error('Facture fournisseur introuvable');
      if (ff.statut === 'payee') throw new Error('Facture déjà payée');

      const datePaiement = data.date_paiement ?? new Date().toISOString().slice(0, 10);
      const mode = data.mode_paiement ?? 'virement';

      await q(`
        UPDATE factures_fournisseurs
        SET statut = 'payee', date_paiement = $2, mode_paiement = $3, updated_at = NOW()
        WHERE id = $1
      `, [id, datePaiement, mode]);

      const ffPaid = { ...ff, date_paiement: datePaiement, mode_paiement: mode };
      await enregistrerPaiementFEC(ffPaid, mode, client);

      const r2 = await q(`SELECT * FROM factures_fournisseurs WHERE id = $1`, [id]);
      return r2.rows[0];
    });
  }

  static async supprimer(id: number, entreprise_id: number): Promise<void> {
    const ff = await this.obtenir(id, entreprise_id);
    if (!ff) throw new Error('Facture fournisseur introuvable');
    if (ff.statut === 'payee') throw new Error('Impossible de supprimer une facture payée');

    const periode = toISODate(ff.date_facture).slice(0, 7);
    await query(`DELETE FROM fec_ecritures WHERE facture_fournisseur_id = $1`, [id]);
    await query(`DELETE FROM factures_fournisseurs WHERE id = $1 AND entreprise_id = $2`, [id, entreprise_id]);
    await syncTvaDeductible(entreprise_id, periode);
  }
}
