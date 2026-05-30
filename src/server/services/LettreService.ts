import { query } from '../db/database';

function seqToLettre(n: number): string {
  let result = '';
  n += 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function dateLet(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export class LettreService {

  static async getNextLettre(entreprise_id: number): Promise<string> {
    const annee = new Date().getFullYear();
    const r = await query(`
      INSERT INTO sequence_numerotation (type_document, annee, prefixe, dernier_numero, entreprise_id)
      VALUES ('LETTRAGE', $1, 'LET', 1, $2)
      ON CONFLICT (type_document, annee, entreprise_id)
      DO UPDATE SET dernier_numero = sequence_numerotation.dernier_numero + 1
      RETURNING dernier_numero
    `, [annee, entreprise_id]);
    return seqToLettre(r.rows[0].dernier_numero - 1);
  }

  // Lettrage automatique lors du marquage "payée" d'une facture.
  // Lettres les lignes 411 de l'émission + les lignes 411 du règlement (journal BQ).
  static async lettrerPaiement(facture_id: number, entreprise_id: number): Promise<string | null> {
    const r = await query(
      `SELECT id FROM fec_ecritures WHERE facture_id = $1 AND compte_num LIKE '411%'`,
      [facture_id]
    );
    if (!r.rows.length) return null;

    const lettre = await this.getNextLettre(entreprise_id);
    await query(
      `UPDATE fec_ecritures SET ecriture_let = $1, date_let = $2 WHERE id = ANY($3)`,
      [lettre, dateLet(), r.rows.map((x: any) => x.id)]
    );
    return lettre;
  }

  // Lettrage automatique lors de l'émission d'un avoir sur une facture existante.
  static async lettrerAvoir(avoir_id: number, facture_origine_id: number, entreprise_id: number): Promise<string | null> {
    const r = await query(
      `SELECT id FROM fec_ecritures WHERE facture_id = ANY($1) AND compte_num LIKE '411%'`,
      [[avoir_id, facture_origine_id]]
    );
    if (!r.rows.length) return null;

    const lettre = await this.getNextLettre(entreprise_id);
    await query(
      `UPDATE fec_ecritures SET ecriture_let = $1, date_let = $2 WHERE id = ANY($3)`,
      [lettre, dateLet(), r.rows.map((x: any) => x.id)]
    );
    return lettre;
  }

  // Lettrage manuel : l'opérateur sélectionne les lignes à rapprocher.
  static async lettrer(ecriture_ids: number[], entreprise_id: number): Promise<string> {
    if (!ecriture_ids.length) throw new Error('Aucune écriture sélectionnée');

    // Vérifier que toutes les écritures appartiennent à cette entreprise
    const check = await query(`
      SELECT COUNT(*) AS n FROM fec_ecritures e
      JOIN factures f ON f.id = e.facture_id
      WHERE e.id = ANY($1) AND f.entreprise_id = $2
    `, [ecriture_ids, entreprise_id]);
    if (Number(check.rows[0].n) !== ecriture_ids.length) {
      throw new Error('Certaines écritures sont inaccessibles');
    }

    // Vérifier l'équilibre débit = crédit (tolérance 0.01€)
    const bal = await query(`
      SELECT SUM(debit) AS d, SUM(credit) AS c FROM fec_ecritures WHERE id = ANY($1)
    `, [ecriture_ids]);
    const diff = Math.abs(bal.rows[0].d - bal.rows[0].c);
    if (diff > 0.01) {
      throw new Error(`Lettrage déséquilibré : débit ${(+bal.rows[0].d).toFixed(2)} ≠ crédit ${(+bal.rows[0].c).toFixed(2)} (écart ${diff.toFixed(2)} €)`);
    }

    const lettre = await this.getNextLettre(entreprise_id);
    await query(
      `UPDATE fec_ecritures SET ecriture_let = $1, date_let = $2 WHERE id = ANY($3)`,
      [lettre, dateLet(), ecriture_ids]
    );
    return lettre;
  }

  // Délettrage d'une lettre (remet ecriture_let = NULL sur toutes les lignes associées).
  static async delettrer(lettre: string, entreprise_id: number): Promise<void> {
    await query(`
      UPDATE fec_ecritures SET ecriture_let = NULL, date_let = NULL
      WHERE ecriture_let = $1
        AND facture_id IN (SELECT id FROM factures WHERE entreprise_id = $2)
    `, [lettre, entreprise_id]);
  }

  // Liste toutes les écritures 411 pour l'interface de lettrage, groupées par client.
  static async listerCompte411(entreprise_id: number) {
    const r = await query(`
      SELECT
        e.id, e.ecriture_num, e.ecriture_date, e.journal_code,
        e.compte_num, e.compte_lib, e.comp_aux_num, e.comp_aux_lib,
        e.ecriture_lib, e.debit, e.credit, e.ecriture_let, e.date_let,
        e.facture_id,
        f.numero   AS facture_numero,
        f.type_facture,
        f.statut   AS facture_statut,
        f.client_id,
        COALESCE(c.raison_sociale, c.prenom || ' ' || c.nom) AS client_nom
      FROM fec_ecritures e
      JOIN factures f ON f.id = e.facture_id
      JOIN clients c  ON c.id = f.client_id
      WHERE f.entreprise_id = $1 AND e.compte_num LIKE '411%'
      ORDER BY client_nom, e.ecriture_let NULLS FIRST, e.ecriture_date
    `, [entreprise_id]);
    return r.rows;
  }
}
