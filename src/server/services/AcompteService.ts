import { query } from '../db/database';
import { NumerotationService } from './NumerotationService';
import { ScelleService } from './ScelleService';
import { ArchiveService } from './ArchiveService';

export class AcompteService {
  static async creer(input: {
    client_id: number;
    entreprise_id: number;
    devis_id?: number;
    facture_id?: number;
    montant_ttc: number;
    taux_tva_id: number;
    pourcentage?: number;
  }) {
    const tvaRes = await query('SELECT taux FROM taux_tva WHERE id = $1', [input.taux_tva_id]);
    const tva = tvaRes.rows[0];
    if (!tva) throw new Error('Taux TVA introuvable');

    const taux  = tva.taux;
    const mHT   = Math.round(input.montant_ttc / (1 + taux / 100) * 100) / 100;
    const mTVA  = Math.round((input.montant_ttc - mHT) * 100) / 100;
    const numero = await NumerotationService.getNextNumero('ACOMPTE', input.entreprise_id);

    const r = await query(`
      INSERT INTO acomptes (numero, client_id, entreprise_id, devis_id, facture_id, pourcentage,
        montant_ht, montant_tva, montant_ttc, taux_tva_valeur)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [numero, input.client_id, input.entreprise_id, input.devis_id ?? null, input.facture_id ?? null,
        input.pourcentage ?? null, mHT, mTVA, input.montant_ttc, taux]);

    return r.rows[0];
  }

  static async obtenir(id: number, entreprise_id?: number) {
    const params: any[] = [id];
    const tenantFilter = entreprise_id
      ? `AND a.entreprise_id = $${params.push(entreprise_id)}`
      : '';
    const r = await query(`
      SELECT a.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             f.numero AS facture_utilisee_numero
      FROM acomptes a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN factures f ON f.acompte_id = a.id
      WHERE a.id = $1 ${tenantFilter}
    `, params);
    return r.rows[0] ?? null;
  }

  static async lister(entreprise_id: number, commercial_id?: number,
                      page?: number, limit?: number) {
    const params: any[] = [entreprise_id];
    const commercialFilter = commercial_id
      ? `AND a.client_id IN (SELECT DISTINCT client_id FROM devis WHERE created_by = $${params.push(commercial_id)} AND entreprise_id = $1)`
      : '';
    const pagClause = (page && limit)
      ? `LIMIT $${params.push(limit)} OFFSET $${params.push((page - 1) * limit)}`
      : '';
    const r = await query(`
      SELECT a.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             f.numero AS facture_utilisee_numero,
             COUNT(*) OVER() AS _total
      FROM acomptes a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN factures f ON f.acompte_id = a.id
      WHERE a.entreprise_id = $1 ${commercialFilter}
      ORDER BY a.created_at DESC ${pagClause}
    `, params);
    return r.rows;
  }

  static async encaisser(id: number, dateEncaissement?: string, modePaiement?: string) {
    const ar = await query('SELECT * FROM acomptes WHERE id = $1', [id]);
    const acompte = ar.rows[0];
    if (!acompte) throw new Error('Acompte introuvable');
    if (acompte.locked) throw new Error('Cet acompte est déjà encaissé');

    const dateEnc = dateEncaissement ?? new Date().toISOString();
    const futur   = { ...acompte, statut: 'encaisse', date_encaissement: dateEnc,
                      mode_paiement: modePaiement ?? null };
    const hash    = await ScelleService.scellerDocument('ACOMPTE', id, acompte.numero, futur);

    await query(`
      UPDATE acomptes SET statut='encaisse', date_encaissement=$1, mode_paiement=$2,
        hash_scellement=$3, updated_at=NOW() WHERE id=$4
    `, [dateEnc, modePaiement ?? null, hash, id]);

    const complet = await this.obtenir(id);
    await ArchiveService.archiver('ACOMPTE', id, acompte.numero, complet!);

    return this.obtenir(id);
  }
}
