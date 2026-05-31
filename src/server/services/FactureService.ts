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
  lignes: Array<{
    designation: string;
    description?: string;
    quantite: number;
    unite?: string;
    prix_unitaire_ht: number;
    taux_tva_id: number;
    remise_pct?: number;
    numero_serie?: string;
  }>;
}

export class FactureService {
  static async creer(input: FactureInput) {
    if (input.devis_id && (!input.lignes || input.lignes.length === 0)) {
      const lr = await query('SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY position', [input.devis_id]);
      const dr = await query('SELECT client_id FROM devis WHERE id = $1', [input.devis_id]);
      input.lignes = lr.rows.map((l: any) => ({
        designation: l.designation, description: l.description,
        quantite: l.quantite, unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht, taux_tva_id: l.taux_tva_id, remise_pct: l.remise_pct,
      }));
      if (!input.client_id && dr.rows[0]) input.client_id = dr.rows[0].client_id;
    }

    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignesCalculees = (input.lignes ?? []).map((l, i) => {
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
          montant_ht, montant_tva, montant_ttc)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id
      `, [numero, input.client_id, input.entreprise_id, input.devis_id ?? null,
          input.facture_origine_id ?? null, input.type_facture ?? 'standard',
          typeAvoir,
          input.date_echeance ?? null, input.conditions_paiement ?? null,
          modePaiementCreer, input.notes ?? null, input.tva_mode ?? 'normal',
          totaux.ht, totaux.tva, totaux.ttc]);

      const factureId = ins.rows[0].id;
      for (const l of lignesCalculees) {
        await client.query(`
          INSERT INTO factures_lignes (facture_id, position, designation, description,
            quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
            montant_ht, montant_tva, montant_ttc, numero_serie)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [factureId, l.position, l.designation, l.description ?? null,
            l.quantite, l.unite ?? null, l.prix_unitaire_ht, l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc,
            l.numero_serie ?? null]);
      }

      const r = await client.query('SELECT * FROM factures WHERE id = $1', [factureId]);
      return r.rows[0];
    });
  }

  static async lister(entreprise_id: number, type?: string) {
    const typeFilter = type ? `AND f.type_facture = '${type}'` : `AND f.type_facture != 'avoir'`;
    const r = await query(`
      SELECT f.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             c.mode_reglement_defaut,
             fo.numero AS facture_origine_numero
      FROM factures f
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN factures fo ON fo.id = f.facture_origine_id
      WHERE f.entreprise_id = $1 ${typeFilter} ORDER BY f.created_at DESC
    `, [entreprise_id]);
    return r.rows;
  }

  static async listerAvoirs(entreprise_id: number) {
    return this.lister(entreprise_id, 'avoir');
  }

  static async mettreAJour(id: number, input: Partial<FactureInput>) {
    const cur = await this.obtenir(id);
    if (!cur) throw new Error('Facture introuvable');
    if ((cur as any).locked) throw new Error('INALTÉRABILITÉ : cette facture est verrouillée.');

    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignes = input.lignes ?? (cur as any).lignes ?? [];
    const lignesCalculees = lignes.map((l: any, i: number) => {
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
      // Un remboursement ne peut pas passer par prélèvement SEPA (sens inverse)
      const modePaiement = (typeAvoir === 'remboursement' && input.mode_paiement === 'prelevement_sepa')
        ? 'virement_sepa'
        : (input.mode_paiement ?? null);

      await client.query(`
        UPDATE factures SET
          client_id=$1, date_echeance=$2, conditions_paiement=$3, mode_paiement=$4,
          notes=$5, tva_mode=$6, type_avoir=$7, objet=$8,
          montant_ht=$9, montant_tva=$10, montant_ttc=$11, updated_at=NOW()
        WHERE id=$12 AND locked=0
      `, [
        input.client_id ?? (cur as any).client_id,
        input.date_echeance ?? null,
        input.conditions_paiement ?? null,
        modePaiement,
        input.notes ?? null,
        input.tva_mode ?? (cur as any).tva_mode,
        typeAvoir,
        (input as any).objet ?? (cur as any).objet ?? null,
        totaux.ht, totaux.tva, totaux.ttc, id,
      ]);

      await client.query('DELETE FROM factures_lignes WHERE facture_id = $1', [id]);
      for (const l of lignesCalculees) {
        await client.query(`
          INSERT INTO factures_lignes (facture_id, position, designation, description,
            quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
            montant_ht, montant_tva, montant_ttc, numero_serie)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [id, l.position, l.designation, l.description ?? null,
            l.quantite, l.unite ?? null, l.prix_unitaire_ht, l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc,
            l.numero_serie ?? null]);
      }
      return this.obtenir(id);
    });
  }

  static async obtenir(id: number) {
    const fr = await query(`
      SELECT f.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             c.mode_reglement_defaut,
             fo.numero AS facture_origine_numero
      FROM factures f
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN factures fo ON fo.id = f.facture_origine_id
      WHERE f.id = $1
    `, [id]);
    const facture = fr.rows[0];
    if (!facture) return null;
    const lr = await query('SELECT * FROM factures_lignes WHERE facture_id = $1 ORDER BY position', [id]);
    return { ...facture, lignes: lr.rows };
  }

  static async emettre(id: number) {
    const fr = await query('SELECT * FROM factures WHERE id = $1', [id]);
    const facture = fr.rows[0];
    if (!facture) throw new Error('Facture introuvable');
    if (facture.locked) throw new Error('INALTÉRABILITÉ : cette facture est verrouillée (Loi anti-fraude TVA 2018).');

    const er = await query('SELECT * FROM entreprise WHERE id = $1', [facture.entreprise_id]);
    const cr = await query('SELECT * FROM clients WHERE id = $1', [facture.client_id]);
    const entreprise = er.rows[0];
    const client     = cr.rows[0];

    const complet = await this.obtenir(id);
    const pdfPath = await FacturXService.genererFacture(complet as any, entreprise, client);
    const hash    = await ScelleService.scellerDocument('FACTURE', id, facture.numero, complet!);

    await query(`
      UPDATE factures SET statut='emise', date_emission=to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        hash_scellement=$1, pdf_path=$2, updated_at=NOW() WHERE id=$3
    `, [hash, pdfPath, id]);

    const final = await this.obtenir(id);
    await ArchiveService.archiver('FACTURE', id, facture.numero, final!);
    await FecExportService.enregistrerFacture(id);

    // Lettrage automatique avoir ↔ facture d'origine
    if (facture.type_facture === 'avoir' && facture.facture_origine_id) {
      await LettreService.lettrerAvoir(id, facture.facture_origine_id, facture.entreprise_id);
    }

    return this.obtenir(id);
  }

  static async marquerPayee(id: number, datePaiement?: string, modePaiement?: string) {
    const fr = await query('SELECT entreprise_id FROM factures WHERE id = $1', [id]);
    const entreprise_id = fr.rows[0]?.entreprise_id;

    await query(`
      UPDATE factures SET statut='payee', date_paiement=$1, mode_paiement=$2, updated_at=NOW()
      WHERE id=$3 AND locked=1
    `, [datePaiement ?? new Date().toISOString(), modePaiement ?? null, id]);

    // Enregistrer les écritures de règlement en FEC et lettrer
    await FecExportService.enregistrerPaiement(id);
    if (entreprise_id) {
      await LettreService.lettrerPaiement(id, entreprise_id);
    }

    return this.obtenir(id);
  }
}
