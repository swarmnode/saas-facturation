import { query } from '../db/database';

export interface ArticleInput {
  reference?: string;
  designation: string;
  description?: string;
  unite?: string;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  actif?: boolean;
}

export class ArticleService {
  static async lister(entreprise_id: number) {
    const r = await query(`
      SELECT a.*, t.libelle AS tva_libelle, t.taux AS tva_taux
      FROM articles a JOIN taux_tva t ON a.taux_tva_id = t.id
      WHERE a.actif = 1 AND a.entreprise_id = $1 ORDER BY a.designation
    `, [entreprise_id]);
    return r.rows;
  }

  static async rechercher(q: string, entreprise_id: number) {
    const like = `%${q}%`;
    const r = await query(`
      SELECT a.*, t.libelle AS tva_libelle, t.taux AS tva_taux
      FROM articles a JOIN taux_tva t ON a.taux_tva_id = t.id
      WHERE a.actif = 1 AND a.entreprise_id = $1
        AND (a.designation ILIKE $2 OR a.reference ILIKE $2 OR a.description ILIKE $2)
      ORDER BY a.designation LIMIT 10
    `, [entreprise_id, like]);
    return r.rows;
  }

  static async obtenir(id: number) {
    const r = await query('SELECT * FROM articles WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  }

  static async creer(input: ArticleInput, entreprise_id: number) {
    const r = await query(`
      INSERT INTO articles (reference, designation, description, unite, prix_unitaire_ht, taux_tva_id, entreprise_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [input.reference ?? null, input.designation, input.description ?? null,
        input.unite ?? null, input.prix_unitaire_ht, input.taux_tva_id, entreprise_id]);
    return r.rows[0];
  }

  static async mettreAJour(id: number, input: Partial<ArticleInput>) {
    const cur = await this.obtenir(id);
    if (!cur) throw new Error('Article introuvable');
    const r = await query(`
      UPDATE articles SET reference=$1, designation=$2, description=$3, unite=$4,
        prix_unitaire_ht=$5, taux_tva_id=$6, actif=$7, updated_at=NOW()
      WHERE id=$8
      RETURNING *
    `, [
      input.reference   ?? cur.reference,
      input.designation ?? cur.designation,
      input.description ?? cur.description,
      input.unite       ?? cur.unite,
      input.prix_unitaire_ht ?? cur.prix_unitaire_ht,
      input.taux_tva_id      ?? cur.taux_tva_id,
      input.actif !== false ? 1 : 0,
      id,
    ]);
    return r.rows[0];
  }

  static async supprimer(id: number) {
    await query("UPDATE articles SET actif=0, updated_at=NOW() WHERE id=$1", [id]);
  }
}
