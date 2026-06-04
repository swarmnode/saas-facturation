import { query, withTransaction } from '../db/database';
import { NumerotationService } from './NumerotationService';

export interface BLLigneInput {
  designation: string;
  description?: string;
  quantite: number;
  unite?: string;
  article_id?: number;
  numero_serie?: string;
}

export interface BLInput {
  client_id: number;
  entreprise_id: number;
  devis_id?: number;
  facture_id?: number;
  date_livraison?: string;
  lieu_livraison?: string;
  notes?: string;
  lignes: BLLigneInput[];
}

export class BonLivraisonService {
  static async creer(input: BLInput) {
    const blId = await withTransaction(async (client) => {
      const numero = await NumerotationService.getNextNumero('BL', input.entreprise_id);
      const ins = await client.query(`
        INSERT INTO bons_livraison
          (numero, client_id, entreprise_id, devis_id, facture_id, date_livraison, lieu_livraison, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
      `, [numero, input.client_id, input.entreprise_id,
          input.devis_id ?? null, input.facture_id ?? null,
          input.date_livraison ?? null, input.lieu_livraison ?? null,
          input.notes ?? null]);

      const blId = ins.rows[0].id;
      for (const [i, l] of input.lignes.entries()) {
        await client.query(`
          INSERT INTO bons_livraison_lignes (bl_id, position, designation, description, quantite, unite, article_id, numero_serie)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [blId, i + 1, l.designation, l.description ?? null,
            l.quantite, l.unite ?? null, l.article_id ?? null, l.numero_serie ?? null]);
      }

      return blId;
    });
    return this.obtenir(blId);
  }

  static async lister(entreprise_id: number, page?: number, limit?: number) {
    const params: any[] = [entreprise_id];
    const pagClause = (page && limit)
      ? `LIMIT $${params.push(limit)} OFFSET $${params.push((page - 1) * limit)}`
      : '';
    const r = await query(`
      SELECT bl.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part,
             COUNT(*) OVER() AS _total
      FROM bons_livraison bl LEFT JOIN clients c ON bl.client_id = c.id
      WHERE bl.entreprise_id = $1
      ORDER BY bl.created_at DESC ${pagClause}
    `, params);
    return r.rows;
  }

  static async obtenir(id: number) {
    const br = await query(`
      SELECT bl.*, c.raison_sociale AS client_nom, c.nom AS client_nom_part
      FROM bons_livraison bl LEFT JOIN clients c ON bl.client_id = c.id
      WHERE bl.id = $1
    `, [id]);
    const bl = br.rows[0];
    if (!bl) return null;
    const lr = await query('SELECT * FROM bons_livraison_lignes WHERE bl_id = $1 ORDER BY position', [id]);
    return { ...bl, lignes: lr.rows };
  }

  static async mettreAJour(id: number, input: Partial<BLInput>) {
    const br = await query('SELECT * FROM bons_livraison WHERE id = $1', [id]);
    const bl = br.rows[0];
    if (!bl) throw new Error('Bon de livraison introuvable');
    const chaine = bl.devis_id || bl.facture_id;
    if (chaine && bl.statut === 'livre') throw new Error('Ce bon de livraison est clôturé');

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE bons_livraison SET
          date_livraison=$1, lieu_livraison=$2, notes=$3, updated_at=NOW()
        WHERE id=$4
      `, [input.date_livraison ?? bl.date_livraison,
          input.lieu_livraison ?? bl.lieu_livraison,
          input.notes ?? bl.notes, id]);

      if (input.lignes && input.lignes.length > 0) {
        await client.query('DELETE FROM bons_livraison_lignes WHERE bl_id = $1', [id]);
        for (const [i, l] of input.lignes.entries()) {
          await client.query(`
            INSERT INTO bons_livraison_lignes (bl_id, position, designation, description, quantite, unite, article_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `, [id, i + 1, l.designation, l.description ?? null,
              l.quantite, l.unite ?? null, l.article_id ?? null]);
        }
      }
    });
    return this.obtenir(id);
  }

  static async changerStatut(id: number, statut: 'emis' | 'livre') {
    const br = await query('SELECT * FROM bons_livraison WHERE id = $1', [id]);
    if (!br.rows[0]) throw new Error('Bon de livraison introuvable');
    await query("UPDATE bons_livraison SET statut=$1, updated_at=NOW() WHERE id=$2", [statut, id]);
    return this.obtenir(id);
  }

  static async supprimer(id: number) {
    const br = await query('SELECT statut, devis_id, facture_id FROM bons_livraison WHERE id = $1', [id]);
    const bl = br.rows[0];
    if (!bl) throw new Error('Introuvable');
    const chaine = bl.devis_id || bl.facture_id;
    if (chaine && bl.statut !== 'brouillon') throw new Error('Seuls les brouillons peuvent être supprimés');
    await query('DELETE FROM bons_livraison WHERE id = $1', [id]);
  }
}
