import { query, withTransaction } from '../db/database';

export interface FactureFournisseur {
  id: number;
  entreprise_id: number;
  numero: string;
  fournisseur_id?: number | null;
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

export interface FFLigneInput {
  type?: 'ligne' | 'commentaire';
  designation: string;
  description?: string;
  quantite: number;
  unite?: string;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  remise_pct?: number;
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

// Calcule les lignes (mêmes règles que les documents de vente) et les totaux
async function calculerLignesFF(lignes: FFLigneInput[]) {
  const tvaRes = await query('SELECT id, taux FROM taux_tva');
  const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

  const calculees = lignes.map((l, i) => {
    if (l.type === 'commentaire') {
      return { ...l, position: i + 1, taux_tva_valeur: 0,
               montant_ht: 0, montant_tva: 0, montant_ttc: 0 };
    }
    const taux   = tvaMap.get(l.taux_tva_id) ?? 0;
    const remise = l.remise_pct ?? 0;
    const mHT    = Math.round(l.quantite * l.prix_unitaire_ht * (1 - remise / 100) * 100) / 100;
    const mTVA   = Math.round(mHT * taux) / 100;
    return { ...l, position: i + 1, taux_tva_valeur: taux,
             montant_ht: mHT, montant_tva: mTVA, montant_ttc: mHT + mTVA };
  });
  const totaux = calculees.reduce(
    (acc, l) => ({ ht: acc.ht + l.montant_ht, tva: acc.tva + l.montant_tva, ttc: acc.ttc + l.montant_ttc }),
    { ht: 0, tva: 0, ttc: 0 }
  );
  return { calculees, totaux };
}

async function insererLignesFF(client: any, ffId: number, lignes: any[]) {
  for (const l of lignes) {
    const isComment = l.type === 'commentaire';
    await client.query(`
      INSERT INTO factures_fournisseurs_lignes (facture_fournisseur_id, position, type,
        designation, description, quantite, unite, prix_unitaire_ht, taux_tva_id,
        taux_tva_valeur, remise_pct, montant_ht, montant_tva, montant_ttc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [ffId, l.position, l.type ?? 'ligne', l.designation, l.description ?? null,
        isComment ? 0 : l.quantite, l.unite ?? null,
        isComment ? 0 : l.prix_unitaire_ht,
        isComment ? null : l.taux_tva_id, l.taux_tva_valeur,
        l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc]);
  }
}

async function syncTvaDeductible(entreprise_id: number, periode: string): Promise<void> {
  const r = await query(`
    SELECT SUM(montant_tva) AS total
    FROM factures_fournisseurs
    WHERE entreprise_id = $1 AND TO_CHAR(date_facture, 'YYYY-MM') = $2
  `, [entreprise_id, periode]);
  const total = Number(r.rows[0]?.total ?? 0);
  // Upsert même à 0 : une modification/suppression peut faire retomber la
  // période à zéro et doit écraser l'ancien montant
  await query(`
    INSERT INTO tva_deductible (entreprise_id, periode, montant, notes)
    VALUES ($1, $2, $3, 'Calculé depuis les factures fournisseurs')
    ON CONFLICT (entreprise_id, periode) DO UPDATE
      SET montant = EXCLUDED.montant, notes = EXCLUDED.notes, updated_at = NOW()
  `, [entreprise_id, periode, total]);
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

  static async obtenir(id: number, entreprise_id: number): Promise<(FactureFournisseur & { lignes: any[] }) | null> {
    const r = await query(
      `SELECT * FROM factures_fournisseurs WHERE id = $1 AND entreprise_id = $2`,
      [id, entreprise_id]
    );
    const ff = r.rows[0];
    if (!ff) return null;
    const lr = await query(
      'SELECT * FROM factures_fournisseurs_lignes WHERE facture_fournisseur_id = $1 ORDER BY position', [id]);
    return { ...ff, lignes: lr.rows };
  }

  static async creer(data: Partial<FactureFournisseur> & { lignes?: FFLigneInput[] }, entreprise_id: number): Promise<FactureFournisseur> {
    // Deux modes de saisie : lignes détaillées (éditeur WYSIWYG, totaux calculés)
    // ou montants globaux (import CSV, API directe)
    const hasLignes = !!data.lignes?.length;
    const { calculees, totaux } = hasLignes
      ? await calculerLignesFF(data.lignes!)
      : { calculees: [] as any[], totaux: null as any };

    return withTransaction(async (client) => {
      const q = client.query.bind(client);
      let montant_ht: number, taux_tva: number, montant_tva: number, montant_ttc: number;
      if (hasLignes) {
        montant_ht  = Math.round(totaux.ht * 100) / 100;
        montant_tva = Math.round(totaux.tva * 100) / 100;
        montant_ttc = Math.round(totaux.ttc * 100) / 100;
        taux_tva    = montant_ht > 0 ? Math.round(montant_tva / montant_ht * 10000) / 100 : 0;
      } else {
        montant_ht  = Number(data.montant_ht);
        taux_tva    = Number(data.taux_tva ?? 20);
        montant_tva = Math.round(montant_ht * taux_tva) / 100;
        montant_ttc = montant_ht + montant_tva;
      }

      const r = await q(`
        INSERT INTO factures_fournisseurs
          (entreprise_id, numero, fournisseur_id, fournisseur_nom, fournisseur_siret, date_facture, date_echeance,
           montant_ht, taux_tva, montant_tva, montant_ttc, compte_charge, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [entreprise_id, data.numero, data.fournisseur_id ?? null, data.fournisseur_nom, data.fournisseur_siret ?? null,
          data.date_facture, data.date_echeance ?? null,
          montant_ht, taux_tva, montant_tva, montant_ttc,
          data.compte_charge ?? '606', data.description ?? null]);

      const ff: FactureFournisseur = r.rows[0];
      if (hasLignes) await insererLignesFF(client, ff.id, calculees);
      await enregistrerFEC(ff, client);

      const periode = toISODate(ff.date_facture).slice(0, 7);
      await syncTvaDeductible(entreprise_id, periode);

      return ff;
    });
  }

  // Modification d'une facture d'achat non payée : remplace l'en-tête et les
  // lignes, puis régénère les écritures FEC (suppression + réécriture) et
  // resynchronise la TVA déductible des périodes concernées. Autorisé côté
  // achats : aucun verrou légal sur les documents reçus (cf. migration 026).
  static async mettreAJour(id: number, data: Partial<FactureFournisseur> & { lignes?: FFLigneInput[] }, entreprise_id: number): Promise<FactureFournisseur> {
    const cur = await this.obtenir(id, entreprise_id);
    if (!cur) throw new Error('Facture fournisseur introuvable');
    if (cur.statut === 'payee') throw new Error('Impossible de modifier une facture payée');

    const hasLignes = !!data.lignes?.length;
    const { calculees, totaux } = hasLignes
      ? await calculerLignesFF(data.lignes!)
      : { calculees: [] as any[], totaux: null as any };

    const anciennePeriode = toISODate(cur.date_facture).slice(0, 7);

    const updated = await withTransaction(async (client) => {
      const q = client.query.bind(client);
      let montant_ht: number, taux_tva: number, montant_tva: number, montant_ttc: number;
      if (hasLignes) {
        montant_ht  = Math.round(totaux.ht * 100) / 100;
        montant_tva = Math.round(totaux.tva * 100) / 100;
        montant_ttc = Math.round(totaux.ttc * 100) / 100;
        taux_tva    = montant_ht > 0 ? Math.round(montant_tva / montant_ht * 10000) / 100 : 0;
      } else if (data.montant_ht !== undefined) {
        montant_ht  = Number(data.montant_ht);
        taux_tva    = Number(data.taux_tva ?? cur.taux_tva);
        montant_tva = Math.round(montant_ht * taux_tva) / 100;
        montant_ttc = montant_ht + montant_tva;
      } else {
        montant_ht  = Number(cur.montant_ht);
        taux_tva    = Number(cur.taux_tva);
        montant_tva = Number(cur.montant_tva);
        montant_ttc = Number(cur.montant_ttc);
      }

      const r = await q(`
        UPDATE factures_fournisseurs SET
          numero=$1, fournisseur_id=$2, fournisseur_nom=$3, fournisseur_siret=$4,
          date_facture=$5, date_echeance=$6, montant_ht=$7, taux_tva=$8,
          montant_tva=$9, montant_ttc=$10, compte_charge=$11, description=$12, updated_at=NOW()
        WHERE id=$13 AND entreprise_id=$14
        RETURNING *
      `, [data.numero ?? cur.numero,
          data.fournisseur_id !== undefined ? data.fournisseur_id : (cur as any).fournisseur_id,
          data.fournisseur_nom ?? cur.fournisseur_nom,
          data.fournisseur_siret !== undefined ? data.fournisseur_siret : cur.fournisseur_siret,
          data.date_facture ?? cur.date_facture,
          data.date_echeance !== undefined ? data.date_echeance : cur.date_echeance,
          montant_ht, taux_tva, montant_tva, montant_ttc,
          data.compte_charge ?? cur.compte_charge,
          data.description !== undefined ? data.description : cur.description,
          id, entreprise_id]);
      const ff: FactureFournisseur = r.rows[0];

      if (hasLignes) {
        await q('DELETE FROM factures_fournisseurs_lignes WHERE facture_fournisseur_id = $1', [id]);
        await insererLignesFF(client, id, calculees);
      }

      // Régénération FEC : les écritures d'une facture non payée sont
      // remplacées (mêmes ecriture_num — supprimées puis réécrites)
      await q('DELETE FROM fec_ecritures WHERE facture_fournisseur_id = $1', [id]);
      await enregistrerFEC(ff, client);

      return ff;
    });

    const nouvellePeriode = toISODate(updated.date_facture).slice(0, 7);
    await syncTvaDeductible(entreprise_id, anciennePeriode);
    if (nouvellePeriode !== anciennePeriode) await syncTvaDeductible(entreprise_id, nouvellePeriode);

    return updated;
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
