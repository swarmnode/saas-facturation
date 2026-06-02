import { query, withTransaction } from '../db/database';
import { NumerotationService } from './NumerotationService';
import { ScelleService } from './ScelleService';
import { ArchiveService } from './ArchiveService';

export interface LigneInput {
  designation: string;
  description?: string;
  quantite: number;
  unite?: string;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  remise_pct?: number;
}

export interface DevisInput {
  client_id: number;
  entreprise_id: number;
  objet?: string;
  date_validite?: string;
  conditions_paiement?: string;
  notes?: string;
  is_free?: boolean;
  lignes: LigneInput[];
}

export class DevisService {
  static async creer(input: DevisInput) {
    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignesCalculees = input.lignes.map((l, i) => {
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
      const numero = await NumerotationService.getNextNumero('DEVIS', input.entreprise_id);
      const ins = await client.query(`
        INSERT INTO devis (numero, client_id, entreprise_id, objet, date_validite,
          conditions_paiement, notes, is_free, montant_ht, montant_tva, montant_ttc, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
      `, [numero, input.client_id, input.entreprise_id, input.objet ?? null,
          input.date_validite ?? null, input.conditions_paiement ?? null,
          input.notes ?? null, input.is_free ? 1 : 0,
          totaux.ht, totaux.tva, totaux.ttc, (input as any).created_by ?? null]);

      const devisId = ins.rows[0].id;
      for (const l of lignesCalculees) {
        await client.query(`
          INSERT INTO devis_lignes (devis_id, position, designation, description, quantite,
            unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
            montant_ht, montant_tva, montant_ttc)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [devisId, l.position, l.designation, l.description ?? null, l.quantite,
            l.unite ?? null, l.prix_unitaire_ht, l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc]);
      }

      const r = await client.query('SELECT * FROM devis WHERE id = $1', [devisId]);
      return r.rows[0];
    });
  }

  static async lister(entreprise_id: number, commercial_id?: number) {
    const filter = commercial_id
      ? 'AND d.created_by = $2'
      : '';
    const params: any[] = commercial_id ? [entreprise_id, commercial_id] : [entreprise_id];
    const r = await query(`
      SELECT d.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part
      FROM devis d LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.entreprise_id = $1 ${filter} ORDER BY d.created_at DESC
    `, params);
    return r.rows;
  }

  static async obtenir(id: number, entreprise_id?: number) {
    const params: any[] = [id];
    const tenantFilter = entreprise_id
      ? `AND d.entreprise_id = $${params.push(entreprise_id)}`
      : '';
    const dr = await query(`
      SELECT d.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part
      FROM devis d LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1 ${tenantFilter}
    `, params);
    const devis = dr.rows[0];
    if (!devis) return null;
    const lr = await query('SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY position', [id]);
    return { ...devis, lignes: lr.rows };
  }

  static async mettreAJour(id: number, input: Partial<DevisInput>) {
    const dr = await query('SELECT * FROM devis WHERE id = $1', [id]);
    const devis = dr.rows[0];
    if (!devis) throw new Error('Devis introuvable');
    if (devis.locked) throw new Error('Ce devis est verrouillé');

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE devis SET objet=$1, date_validite=$2, conditions_paiement=$3,
          notes=$4, is_free=$5, updated_at=NOW() WHERE id=$6
      `, [input.objet ?? devis.objet, input.date_validite ?? devis.date_validite,
          input.conditions_paiement ?? devis.conditions_paiement,
          input.notes ?? devis.notes, input.is_free ? 1 : 0, id]);

      if (input.lignes && input.lignes.length > 0) {
        const tvaRes = await client.query('SELECT id, taux FROM taux_tva');
        const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));
        await client.query('DELETE FROM devis_lignes WHERE devis_id = $1', [id]);
        let totHT = 0, totTVA = 0;
        for (const [i, l] of input.lignes.entries()) {
          const taux = tvaMap.get(l.taux_tva_id) ?? 0;
          const mHT  = Math.round(l.quantite * l.prix_unitaire_ht * (1 - (l.remise_pct ?? 0) / 100) * 100) / 100;
          const mTVA = Math.round(mHT * taux) / 100;
          totHT += mHT; totTVA += mTVA;
          await client.query(`
            INSERT INTO devis_lignes (devis_id, position, designation, description, quantite,
              unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur, remise_pct,
              montant_ht, montant_tva, montant_ttc)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `, [id, i + 1, l.designation, l.description ?? null, l.quantite,
              l.unite ?? null, l.prix_unitaire_ht, l.taux_tva_id, taux, l.remise_pct ?? 0,
              mHT, mTVA, mHT + mTVA]);
        }
        await client.query('UPDATE devis SET montant_ht=$1, montant_tva=$2, montant_ttc=$3 WHERE id=$4',
          [totHT, totTVA, totHT + totTVA, id]);
      }
    });
    return this.obtenir(id);
  }

  static async dupliquer(id: number) {
    const source = await this.obtenir(id) as any;
    if (!source) throw new Error('Devis introuvable');
    const er = await query('SELECT id FROM entreprise LIMIT 1');
    const entreprise = er.rows[0];
    return this.creer({
      client_id:           source.client_id,
      entreprise_id:       entreprise?.id ?? source.entreprise_id,
      objet:               source.objet ? `Copie — ${source.objet}` : undefined,
      date_validite:       source.date_validite,
      conditions_paiement: source.conditions_paiement,
      notes:               source.notes,
      is_free:             source.is_free,
      lignes: (source.lignes ?? []).map((l: any) => ({
        designation: l.designation, description: l.description,
        quantite: l.quantite, unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        taux_tva_id: l.taux_tva_id, remise_pct: l.remise_pct,
      })),
    });
  }

  static async changerStatut(id: number, statut: 'envoye' | 'accepte' | 'signe' | 'expire' | 'refuse') {
    const dr = await query('SELECT * FROM devis WHERE id = $1', [id]);
    const devis = dr.rows[0];
    if (!devis) throw new Error('Devis introuvable');
    if (devis.locked && statut !== 'expire') throw new Error('Ce devis est verrouillé');

    await withTransaction(async (client) => {
      await client.query("UPDATE devis SET statut=$1, updated_at=NOW() WHERE id=$2", [statut, id]);

      if (statut === 'signe') {
        const complet = await this.obtenir(id);
        const hash    = await ScelleService.scellerDocument('DEVIS', id, devis.numero, complet!, client);
        await client.query("UPDATE devis SET hash_scellement=$1 WHERE id=$2", [hash, id]);
        await ArchiveService.archiver('DEVIS', id, devis.numero, complet!, devis.entreprise_id, client);
      }
    });
    return this.obtenir(id);
  }
}
