import { query, withTransaction } from '../db/database';
import { NumerotationService } from './NumerotationService';
import { ScelleService } from './ScelleService';
import { ArchiveService } from './ArchiveService';
import { FacturXService } from './FacturXService';
import { FecExportService } from './FecExportService';
import { LettreService } from './LettreService';

export interface FactureInput {
  client_id: number;
  entreprise_id: number;
  devis_id?: number;
  facture_origine_id?: number;
  type_facture?: string;
  type_avoir?: string;
  date_echeance?: string;
  conditions_paiement?: string;
  mode_paiement?: string;
  notes?: string;
  tva_mode?: string;
  numero_commande?: string;
  escompte_taux?: number;
  penalites_taux?: string;
  indemnite_recouvrement?: number;
  lignes: Array<{
    type?: 'ligne' | 'commentaire';
    designation: string;
    description?: string;
    quantite: number;
    unite?: string;
    prix_unitaire_ht: number;
    taux_tva_id: number;
    remise_pct?: number;
    numero_serie?: string;
    article_id?: number;
  }>;
}

export class FactureService {
  static async creer(input: FactureInput) {
    if (input.devis_id && (!input.lignes || input.lignes.length === 0)) {
      const lr = await query('SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY position', [input.devis_id]);
      const dr = await query('SELECT client_id FROM devis WHERE id = $1', [input.devis_id]);
      input.lignes = lr.rows.map((l: any) => ({
        type: l.type ?? 'ligne',
        designation: l.designation, description: l.description,
        quantite: l.quantite, unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht, taux_tva_id: l.taux_tva_id, remise_pct: l.remise_pct,
      }));
      if (!input.client_id && dr.rows[0]) input.client_id = dr.rows[0].client_id;
    }

    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignesCalculees = (input.lignes ?? []).map((l, i) => {
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

    const totaux = lignesCalculees.reduce(
      (acc, l) => ({ ht: acc.ht + l.montant_ht, tva: acc.tva + l.montant_tva, ttc: acc.ttc + l.montant_ttc }),
      { ht: 0, tva: 0, ttc: 0 }
    );

    return withTransaction(async (client) => {
      const typeDoc   = input.type_facture === 'avoir' ? 'AVOIR' : 'FACTURE';
      const numero    = await NumerotationService.getNextNumero(typeDoc, input.entreprise_id);
      const typeAvoir = input.type_avoir ?? 'valoir';
      const modePaiementCreer = (typeAvoir === 'remboursement' && input.mode_paiement === 'prelevement_sepa')
        ? 'virement_sepa'
        : (input.mode_paiement ?? null);
      const ins = await client.query(`
        INSERT INTO factures (numero, client_id, entreprise_id, devis_id, facture_origine_id, type_facture,
          type_avoir, date_echeance, conditions_paiement, mode_paiement, notes, tva_mode,
          numero_commande, escompte_taux, penalites_taux, indemnite_recouvrement,
          montant_ht, montant_tva, montant_ttc)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id
      `, [numero, input.client_id, input.entreprise_id, input.devis_id ?? null,
          input.facture_origine_id ?? null, input.type_facture ?? 'standard',
          typeAvoir,
          input.date_echeance ?? null, input.conditions_paiement ?? null,
          modePaiementCreer, input.notes ?? null, input.tva_mode ?? 'normal',
          input.numero_commande ?? null, input.escompte_taux ?? 0,
          input.penalites_taux ?? null, input.indemnite_recouvrement ?? null,
          totaux.ht, totaux.tva, totaux.ttc]);

      const factureId = ins.rows[0].id;
      for (const l of lignesCalculees) {
        const isComment = l.type === 'commentaire';
        await client.query(`
          INSERT INTO factures_lignes (facture_id, position, type, designation, description,
            quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
            montant_ht, montant_tva, montant_ttc, numero_serie, article_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [factureId, l.position, l.type ?? 'ligne', l.designation, l.description ?? null,
            isComment ? 0 : l.quantite, l.unite ?? null,
            isComment ? 0 : l.prix_unitaire_ht,
            isComment ? 1 : l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc,
            l.numero_serie ?? null, l.article_id ?? null]);
      }

      const r = await client.query('SELECT * FROM factures WHERE id = $1', [factureId]);
      return r.rows[0];
    });
  }

  static async lister(entreprise_id: number, type?: string, commercial_id?: number,
                      page?: number, limit?: number) {
    const params: any[] = [entreprise_id];
    const typeFilter = type
      ? `AND f.type_facture = $${params.push(type)}`
      : `AND f.type_facture != 'avoir'`;
    let commercialFilter = '';
    if (commercial_id) {
      const cidIdx = params.push(commercial_id);
      commercialFilter = `AND f.client_id IN (SELECT DISTINCT client_id FROM devis WHERE created_by = $${cidIdx} AND entreprise_id = $1)`;
    }
    const pagClause = (page && limit)
      ? `LIMIT $${params.push(limit)} OFFSET $${params.push((page - 1) * limit)}`
      : '';
    const r = await query(`
      SELECT f.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             c.mode_reglement_defaut,
             fo.numero AS facture_origine_numero,
             COUNT(*) OVER() AS _total
      FROM factures f
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN factures fo ON fo.id = f.facture_origine_id
      WHERE f.entreprise_id = $1 ${typeFilter} ${commercialFilter}
      ORDER BY f.created_at DESC ${pagClause}
    `, params);
    return r.rows;
  }

  static async listerAvoirs(entreprise_id: number, commercial_id?: number) {
    return this.lister(entreprise_id, 'avoir', commercial_id);
  }

  static async mettreAJour(id: number, input: Partial<FactureInput>) {
    const cur = await this.obtenir(id);
    if (!cur) throw new Error('Facture introuvable');
    if ((cur as any).locked) throw new Error('INALTÉRABILITÉ : cette facture est verrouillée.');

    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignes = input.lignes ?? (cur as any).lignes ?? [];
    const lignesCalculees = lignes.map((l: any, i: number) => {
      if (l.type === 'commentaire') {
        return { ...l, position: i + 1, taux_tva_valeur: 0,
                 montant_ht: 0, montant_tva: 0, montant_ttc: 0 };
      }
      const taux   = tvaMap.get(l.taux_tva_id) ?? l.taux_tva_valeur ?? 0;
      const remise = l.remise_pct ?? 0;
      const mHT    = Math.round(l.quantite * l.prix_unitaire_ht * (1 - remise / 100) * 100) / 100;
      const mTVA   = Math.round(mHT * taux) / 100;
      return { ...l, position: i + 1, taux_tva_valeur: taux,
               montant_ht: mHT, montant_tva: mTVA, montant_ttc: mHT + mTVA };
    });
    const totaux = lignesCalculees.reduce(
      (acc: any, l: any) => ({ ht: acc.ht + l.montant_ht, tva: acc.tva + l.montant_tva, ttc: acc.ttc + l.montant_ttc }),
      { ht: 0, tva: 0, ttc: 0 }
    );

    return withTransaction(async (client) => {
      const typeAvoir = input.type_avoir ?? (cur as any).type_avoir ?? 'valoir';
      const modePaiement = (typeAvoir === 'remboursement' && input.mode_paiement === 'prelevement_sepa')
        ? 'virement_sepa'
        : (input.mode_paiement ?? null);

      await client.query(`
        UPDATE factures SET
          client_id=$1, date_echeance=$2, conditions_paiement=$3, mode_paiement=$4,
          notes=$5, tva_mode=$6, type_avoir=$7, objet=$8,
          numero_commande=$9, escompte_taux=$10, penalites_taux=$11, indemnite_recouvrement=$12,
          montant_ht=$13, montant_tva=$14, montant_ttc=$15, updated_at=NOW()
        WHERE id=$16 AND locked=0
      `, [
        input.client_id ?? (cur as any).client_id,
        input.date_echeance ?? null,
        input.conditions_paiement ?? null,
        modePaiement,
        input.notes ?? null,
        input.tva_mode ?? (cur as any).tva_mode,
        typeAvoir,
        (input as any).objet ?? (cur as any).objet ?? null,
        input.numero_commande ?? (cur as any).numero_commande ?? null,
        input.escompte_taux ?? (cur as any).escompte_taux ?? 0,
        input.penalites_taux ?? (cur as any).penalites_taux ?? null,
        input.indemnite_recouvrement ?? (cur as any).indemnite_recouvrement ?? null,
        totaux.ht, totaux.tva, totaux.ttc, id,
      ]);

      await client.query('DELETE FROM factures_lignes WHERE facture_id = $1', [id]);
      for (const l of lignesCalculees) {
        const isComment = l.type === 'commentaire';
        await client.query(`
          INSERT INTO factures_lignes (facture_id, position, type, designation, description,
            quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
            montant_ht, montant_tva, montant_ttc, numero_serie, article_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [id, l.position, l.type ?? 'ligne', l.designation, l.description ?? null,
            isComment ? 0 : l.quantite, l.unite ?? null,
            isComment ? 0 : l.prix_unitaire_ht,
            isComment ? 1 : l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc,
            l.numero_serie ?? null, l.article_id ?? null]);
      }
      return this.obtenir(id);
    });
  }

  static async obtenir(id: number, entreprise_id?: number) {
    const params: any[] = [id];
    const tenantFilter = entreprise_id
      ? `AND f.entreprise_id = $${params.push(entreprise_id)}`
      : '';
    const fr = await query(`
      SELECT f.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             c.mode_reglement_defaut,
             fo.numero AS facture_origine_numero,
             ac.numero AS acompte_numero
      FROM factures f
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN factures fo ON fo.id = f.facture_origine_id
      LEFT JOIN acomptes ac ON ac.id = f.acompte_id
      WHERE f.id = $1 ${tenantFilter}
    `, params);
    const facture = fr.rows[0];
    if (!facture) return null;
    const lr = await query('SELECT * FROM factures_lignes WHERE facture_id = $1 ORDER BY position', [id]);
    return { ...facture, lignes: lr.rows };
  }

  static async getAvoirsCumul(factureOrigineId: number, excludeId?: number): Promise<number> {
    const params: any[] = [factureOrigineId];
    const excludeFilter = excludeId ? `AND id != $${params.push(excludeId)}` : '';
    const r = await query(`
      SELECT COALESCE(SUM(ABS(montant_ttc)), 0) AS total
      FROM factures
      WHERE facture_origine_id = $1
        AND type_facture = 'avoir'
        AND statut IN ('emise', 'payee')
        ${excludeFilter}
    `, params);
    return parseFloat(r.rows[0].total) || 0;
  }

  static async emettre(id: number) {
    const fr = await query('SELECT * FROM factures WHERE id = $1', [id]);
    const facture = fr.rows[0];
    if (!facture) throw new Error('Facture introuvable');
    if (facture.locked) throw new Error('INALTÉRABILITÉ : cette facture est verrouillée (Loi anti-fraude TVA 2018).');

    if (facture.type_facture === 'avoir' && facture.facture_origine_id) {
      const origineRes = await query('SELECT montant_ttc, numero FROM factures WHERE id = $1', [facture.facture_origine_id]);
      if (origineRes.rows[0]) {
        const maxTtc    = Math.abs(parseFloat(origineRes.rows[0].montant_ttc));
        const cumul     = await this.getAvoirsCumul(facture.facture_origine_id, id);
        const montant   = Math.abs(parseFloat(facture.montant_ttc));
        const disponible = maxTtc - cumul;
        if (montant > disponible + 0.01) {
          throw new Error(
            `Impossible d'émettre cet avoir : son montant (${montant.toFixed(2)} €) dépasse le solde disponible ` +
            `(${disponible.toFixed(2)} €) sur la facture ${origineRes.rows[0].numero}. ` +
            `Avoirs déjà émis : ${cumul.toFixed(2)} € sur ${maxTtc.toFixed(2)} €.`
          );
        }
      }
    }

    const er = await query('SELECT * FROM entreprise WHERE id = $1', [facture.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [facture.client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    // Génération PDF hors transaction (I/O fichier)
    const complet = await this.obtenir(id);
    const pdfPath = await FacturXService.genererFacture(complet as any, entreprise, client);

    // Toutes les écritures DB en une seule transaction atomique
    await withTransaction(async (tx) => {
      const hash = await ScelleService.scellerDocument('FACTURE', id, facture.numero, complet!, tx);
      await tx.query(`
        UPDATE factures SET statut='emise', date_emission=to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          hash_scellement=$1, pdf_path=$2, updated_at=NOW() WHERE id=$3
      `, [hash, pdfPath, id]);
      await ArchiveService.archiver('FACTURE', id, facture.numero, complet!, facture.entreprise_id, tx);
      await FecExportService.enregistrerFacture(id, tx);
      if (facture.type_facture === 'avoir' && facture.facture_origine_id) {
        await LettreService.lettrerAvoir(id, facture.facture_origine_id, facture.entreprise_id, tx);
      }
    });

    return this.obtenir(id);
  }

  static async marquerPayee(
    id: number,
    datePaiement?: string,
    modePaiement?: string,
    acompte_id?: number | null
  ) {
    const fr = await query('SELECT * FROM factures WHERE id = $1', [id]);
    const facture = fr.rows[0];
    if (!facture) throw new Error('Facture introuvable');
    const entreprise_id = facture.entreprise_id;

    let acompte: any = null;
    let montantAcompteApplique = 0;
    let reliquatMontant = 0;
    let reliquatNumero: string | null = null;

    if (acompte_id) {
      const ar = await query("SELECT * FROM acomptes WHERE id = $1 AND statut = 'encaisse'", [acompte_id]);
      acompte = ar.rows[0];
      if (!acompte) throw new Error('Acompte introuvable ou non encaissé');
      if (acompte.client_id !== facture.client_id)
        throw new Error("L'acompte ne correspond pas au client de la facture");

      const mFac = Math.round(Number(facture.montant_ttc) * 100) / 100;
      const mAc  = Math.round(Number(acompte.montant_ttc) * 100) / 100;
      montantAcompteApplique = Math.min(mAc, mFac);
      reliquatMontant        = Math.round((mAc - montantAcompteApplique) * 100) / 100;

      if (reliquatMontant > 0.01) {
        reliquatNumero = await NumerotationService.getNextNumero('ACOMPTE', entreprise_id);
      }
    }

    let reliquatId: number | null = null;

    await withTransaction(async (tx) => {
      await tx.query(`
        UPDATE factures
        SET statut='payee', date_paiement=$1, mode_paiement=$2,
            acompte_id=$3, montant_acompte_applique=$4, updated_at=NOW()
        WHERE id=$5 AND locked=1
      `, [
        datePaiement ?? new Date().toISOString(),
        modePaiement ?? null,
        acompte_id ?? null,
        montantAcompteApplique || null,
        id,
      ]);

      await FecExportService.enregistrerPaiement(id, tx);
      if (entreprise_id) await LettreService.lettrerPaiement(id, entreprise_id, tx);

      if (reliquatMontant > 0.01 && acompte && reliquatNumero) {
        const taux = Number(acompte.taux_tva_valeur);
        const mHT  = Math.round(reliquatMontant / (1 + taux / 100) * 100) / 100;
        const mTVA = Math.round((reliquatMontant - mHT) * 100) / 100;
        const dateEnc = datePaiement ?? new Date().toISOString();

        const ins = await tx.query(`
          INSERT INTO acomptes (numero, client_id, entreprise_id, montant_ht, montant_tva,
            montant_ttc, taux_tva_valeur, statut, date_encaissement, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'en_attente',NULL,$8)
          RETURNING *
        `, [
          reliquatNumero, acompte.client_id, entreprise_id,
          mHT, mTVA, reliquatMontant, taux,
          `Reliquat — ${acompte.numero}`,
        ]);

        const reliquat = ins.rows[0];
        reliquatId = reliquat.id;

        const futur = { ...reliquat, statut: 'encaisse', date_encaissement: dateEnc };
        const hash  = await ScelleService.scellerDocument('ACOMPTE', reliquat.id, reliquatNumero, futur, tx);

        await tx.query(`
          UPDATE acomptes
          SET statut='encaisse', date_encaissement=$1, hash_scellement=$2,
              locked=1, updated_at=NOW()
          WHERE id=$3
        `, [dateEnc, hash, reliquat.id]);
      }
    });

    if (reliquatId && reliquatNumero) {
      const rr = await query(
        `SELECT a.*, c.raison_sociale AS client_nom
         FROM acomptes a LEFT JOIN clients c ON a.client_id = c.id
         WHERE a.id = $1`,
        [reliquatId]
      );
      if (rr.rows[0]) await ArchiveService.archiver('ACOMPTE', reliquatId, reliquatNumero, rr.rows[0]);
    }

    return this.obtenir(id);
  }
}
