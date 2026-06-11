import { query, withTransaction } from '../db/database';
import { NumerotationService } from './NumerotationService';

// Commandes fournisseurs (bons de commande émis) — même modèle de lignes que
// DevisService. Côté achats, aucun verrou/scellement (migration 026) : tout
// est modifiable et supprimable à tout moment.

export interface CommandeLigneInput {
  type?: 'ligne' | 'commentaire';
  designation: string;
  description?: string;
  quantite: number;
  unite?: string;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  remise_pct?: number;
}

export interface CommandeInput {
  entreprise_id: number;
  fournisseur_id?: number | null;
  fournisseur_nom?: string;
  date_commande: string;
  date_livraison_prevue?: string | null;
  description?: string | null;
  notes?: string | null;
  statut?: string;
  facture_fournisseur_id?: number | null;
  montant_ht?: number; // compat saisie sans lignes (ancien formulaire, imports)
  lignes?: CommandeLigneInput[];
}

async function calculerLignes(lignes: CommandeLigneInput[]) {
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

async function insererLignes(client: any, commandeId: number, lignes: any[]) {
  for (const l of lignes) {
    const isComment = l.type === 'commentaire';
    await client.query(`
      INSERT INTO commandes_fournisseurs_lignes (commande_id, position, type, designation,
        description, quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur,
        remise_pct, montant_ht, montant_tva, montant_ttc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [commandeId, l.position, l.type ?? 'ligne', l.designation, l.description ?? null,
        isComment ? 0 : l.quantite, l.unite ?? null,
        isComment ? 0 : l.prix_unitaire_ht,
        isComment ? null : l.taux_tva_id, l.taux_tva_valeur,
        l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc]);
  }
}

// Résout le nom affiché : fiche fournisseur si liée, sinon texte libre
async function resoudreFournisseurNom(input: CommandeInput): Promise<string> {
  if (input.fournisseur_nom?.trim()) return input.fournisseur_nom.trim();
  if (input.fournisseur_id) {
    const r = await query('SELECT raison_sociale FROM fournisseurs WHERE id = $1', [input.fournisseur_id]);
    if (r.rows[0]) return r.rows[0].raison_sociale;
  }
  throw new Error('Fournisseur obligatoire');
}

export class CommandeFournisseurService {

  static async lister(entreprise_id: number, statut?: string) {
    const params: any[] = [entreprise_id];
    const statutFilter = (statut && statut !== 'all')
      ? `AND c.statut = $${params.push(statut)}`
      : '';
    const r = await query(`
      SELECT c.*, ff.numero AS facture_numero, ff.statut AS facture_statut
      FROM commandes_fournisseurs c
      LEFT JOIN factures_fournisseurs ff ON ff.id = c.facture_fournisseur_id
      WHERE c.entreprise_id = $1 ${statutFilter}
      ORDER BY c.date_commande DESC, c.id DESC
    `, params);
    return r.rows;
  }

  static async obtenir(id: number, entreprise_id: number) {
    const r = await query(`
      SELECT c.*, ff.numero AS facture_numero, ff.statut AS facture_statut
      FROM commandes_fournisseurs c
      LEFT JOIN factures_fournisseurs ff ON ff.id = c.facture_fournisseur_id
      WHERE c.id = $1 AND c.entreprise_id = $2
    `, [id, entreprise_id]);
    const commande = r.rows[0];
    if (!commande) return null;
    const lr = await query(
      'SELECT * FROM commandes_fournisseurs_lignes WHERE commande_id = $1 ORDER BY position', [id]);
    return { ...commande, lignes: lr.rows };
  }

  static async creer(input: CommandeInput) {
    const fournisseurNom = await resoudreFournisseurNom(input);
    const hasLignes = !!input.lignes?.length;
    const { calculees, totaux } = hasLignes
      ? await calculerLignes(input.lignes!)
      : { calculees: [], totaux: { ht: Number(input.montant_ht) || 0, tva: 0, ttc: Number(input.montant_ht) || 0 } };

    const commandeId = await withTransaction(async (client) => {
      const numero = await NumerotationService.getNextNumero('COMMANDE', input.entreprise_id);
      const ins = await client.query(`
        INSERT INTO commandes_fournisseurs (entreprise_id, numero, fournisseur_id, fournisseur_nom,
          date_commande, date_livraison_prevue, description, notes, montant_ht, montant_tva, montant_ttc,
          statut, facture_fournisseur_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id
      `, [input.entreprise_id, numero, input.fournisseur_id ?? null, fournisseurNom,
          input.date_commande, input.date_livraison_prevue ?? null,
          input.description ?? null, input.notes ?? null,
          totaux.ht, totaux.tva, totaux.ttc,
          input.statut ?? 'en_cours', input.facture_fournisseur_id ?? null]);
      const id = ins.rows[0].id;
      if (hasLignes) await insererLignes(client, id, calculees);
      return id;
    });
    return this.obtenir(commandeId, input.entreprise_id);
  }

  static async mettreAJour(id: number, entreprise_id: number, input: Partial<CommandeInput>) {
    const cur: any = await this.obtenir(id, entreprise_id);
    if (!cur) throw new Error('Commande introuvable');

    const fournisseurNom = (input.fournisseur_nom?.trim() || input.fournisseur_id)
      ? await resoudreFournisseurNom(input as CommandeInput)
      : cur.fournisseur_nom;

    const hasLignes = !!input.lignes?.length;
    const { calculees, totaux } = hasLignes
      ? await calculerLignes(input.lignes!)
      : { calculees: [],
          totaux: input.montant_ht !== undefined
            ? { ht: Number(input.montant_ht) || 0, tva: 0, ttc: Number(input.montant_ht) || 0 }
            : { ht: Number(cur.montant_ht), tva: Number(cur.montant_tva), ttc: Number(cur.montant_ttc) } };

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE commandes_fournisseurs SET
          fournisseur_id=$1, fournisseur_nom=$2, date_commande=$3, date_livraison_prevue=$4,
          description=$5, notes=$6, montant_ht=$7, montant_tva=$8, montant_ttc=$9,
          statut=$10, facture_fournisseur_id=$11, updated_at=NOW()
        WHERE id=$12 AND entreprise_id=$13
      `, [input.fournisseur_id !== undefined ? input.fournisseur_id : cur.fournisseur_id,
          fournisseurNom,
          input.date_commande ?? cur.date_commande,
          input.date_livraison_prevue !== undefined ? input.date_livraison_prevue : cur.date_livraison_prevue,
          input.description !== undefined ? input.description : cur.description,
          input.notes !== undefined ? input.notes : cur.notes,
          totaux.ht, totaux.tva, totaux.ttc,
          input.statut ?? cur.statut,
          input.facture_fournisseur_id !== undefined ? input.facture_fournisseur_id : cur.facture_fournisseur_id,
          id, entreprise_id]);

      if (hasLignes) {
        await client.query('DELETE FROM commandes_fournisseurs_lignes WHERE commande_id = $1', [id]);
        await insererLignes(client, id, calculees);
      }
    });
    return this.obtenir(id, entreprise_id);
  }

  static async supprimer(id: number, entreprise_id: number): Promise<boolean> {
    const r = await query(
      'DELETE FROM commandes_fournisseurs WHERE id=$1 AND entreprise_id=$2 RETURNING id',
      [id, entreprise_id]);
    return !!r.rows[0];
  }
}
