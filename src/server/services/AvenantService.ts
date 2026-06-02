import { query, withTransaction } from '../db/database';
import { NumerotationService } from './NumerotationService';
import { ScelleService } from './ScelleService';
import { ArchiveService } from './ArchiveService';

export class AvenantService {
  static async creer(devisInitialId: number, motif: string, lignes: Array<{
    type_ligne: string;
    designation: string;
    description?: string;
    quantite: number;
    unite?: string;
    prix_unitaire_ht: number;
    taux_tva_id: number;
    remise_pct?: number;
  }>) {
    const dr = await query('SELECT * FROM devis WHERE id = $1', [devisInitialId]);
    const devis = dr.rows[0];
    if (!devis) throw new Error('Devis initial introuvable');
    if (devis.statut !== 'signe') throw new Error('Un avenant ne peut être créé que sur un devis signé');

    const tvaRes = await query('SELECT id, taux FROM taux_tva');
    const tvaMap = new Map<number, number>(tvaRes.rows.map((r: any) => [r.id, r.taux]));

    const lignesCalculees = lignes.map((l, i) => {
      const taux   = tvaMap.get(l.taux_tva_id) ?? 0;
      const remise = l.remise_pct ?? 0;
      const mHT    = Math.round(l.quantite * l.prix_unitaire_ht * (1 - remise / 100) * 100) / 100;
      const mTVA   = Math.round(mHT * taux) / 100;
      return { ...l, position: i + 1, taux_tva_valeur: taux,
               montant_ht: mHT, montant_tva: mTVA, montant_ttc: mHT + mTVA };
    });

    const delta = lignesCalculees.reduce((acc, l) => {
      const signe = l.type_ligne === 'suppression' ? -1 : 1;
      return { ht: acc.ht + signe * l.montant_ht, tva: acc.tva + signe * l.montant_tva, ttc: acc.ttc + signe * l.montant_ttc };
    }, { ht: 0, tva: 0, ttc: 0 });

    return withTransaction(async (client) => {
      const numero = await NumerotationService.getNextNumero('AVENANT');
      const ins = await client.query(`
        INSERT INTO avenants (numero, devis_initial_id, motif,
          delta_montant_ht, delta_montant_tva, delta_montant_ttc,
          nouveau_montant_ht, nouveau_montant_ttc)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
      `, [numero, devisInitialId, motif,
          delta.ht, delta.tva, delta.ttc,
          devis.montant_ht + delta.ht, devis.montant_ttc + delta.ttc]);

      const avenantId = ins.rows[0].id;
      for (const l of lignesCalculees) {
        await client.query(`
          INSERT INTO avenants_lignes (avenant_id, position, type_ligne, designation,
            description, quantite, unite, prix_unitaire_ht, taux_tva_id, taux_tva_valeur,
            remise_pct, montant_ht, montant_tva, montant_ttc)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [avenantId, l.position, l.type_ligne, l.designation, l.description ?? null,
            l.quantite, l.unite ?? null, l.prix_unitaire_ht, l.taux_tva_id, l.taux_tva_valeur,
            l.remise_pct ?? 0, l.montant_ht, l.montant_tva, l.montant_ttc]);
      }

      const r = await client.query('SELECT * FROM avenants WHERE id = $1', [avenantId]);
      return r.rows[0];
    });
  }

  static async signer(id: number) {
    const ar = await query('SELECT * FROM avenants WHERE id = $1', [id]);
    const avenant = ar.rows[0];
    if (!avenant) throw new Error('Avenant introuvable');
    if (avenant.locked) throw new Error('Avenant déjà signé');

    // Récupère l'entreprise_id depuis le devis parent
    const dr = await query('SELECT entreprise_id FROM devis WHERE id = $1', [avenant.devis_initial_id]);
    const entreprise_id: number | undefined = dr.rows[0]?.entreprise_id;

    await withTransaction(async (client) => {
      await client.query("UPDATE avenants SET statut='signe', updated_at=NOW() WHERE id=$1", [id]);
      const ar2 = await client.query('SELECT * FROM avenants WHERE id = $1', [id]);
      const lr  = await client.query('SELECT * FROM avenants_lignes WHERE avenant_id = $1', [id]);
      const complet = { ...ar2.rows[0], lignes: lr.rows };
      const hash = await ScelleService.scellerDocument('AVENANT', id, avenant.numero, complet, client);
      await client.query("UPDATE avenants SET hash_scellement=$1 WHERE id=$2", [hash, id]);
      await ArchiveService.archiver('AVENANT', id, avenant.numero, complet, entreprise_id, client);
    });

    const ar2 = await query('SELECT * FROM avenants WHERE id = $1', [id]);
    const lr  = await query('SELECT * FROM avenants_lignes WHERE avenant_id = $1', [id]);
    return { ...ar2.rows[0], lignes: lr.rows };
  }

  static async lister(devisId?: number) {
    if (devisId) {
      const r = await query('SELECT * FROM avenants WHERE devis_initial_id = $1 ORDER BY created_at', [devisId]);
      return r.rows;
    }
    const r = await query('SELECT * FROM avenants ORDER BY created_at DESC');
    return r.rows;
  }
}
