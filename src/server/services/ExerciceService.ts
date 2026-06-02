import crypto from 'crypto';
import { query, withTransaction } from '../db/database';

export interface Exercice {
  id: number;
  annee: number;
  entreprise_id: number;
  date_ouverture: string;
  date_cloture: string | null;
  statut: 'ouvert' | 'clos';
  clos_le: string | null;
  nb_ecritures: number | null;
  hash_cloture: string | null;
}

export class ExerciceService {

  static async lister(entreprise_id: number): Promise<Exercice[]> {
    const r = await query(
      `SELECT * FROM exercices WHERE entreprise_id = $1 ORDER BY annee DESC`,
      [entreprise_id]
    );
    return r.rows;
  }

  static async obtenir(annee: number, entreprise_id: number): Promise<Exercice | null> {
    const r = await query(
      `SELECT * FROM exercices WHERE annee = $1 AND entreprise_id = $2`,
      [annee, entreprise_id]
    );
    return r.rows[0] ?? null;
  }

  static async ouvrir(annee: number, entreprise_id: number): Promise<Exercice> {
    const r = await query(`
      INSERT INTO exercices (annee, entreprise_id, date_ouverture)
      VALUES ($1, $2, CURRENT_DATE)
      ON CONFLICT (annee, entreprise_id) DO UPDATE SET statut = exercices.statut
      RETURNING *
    `, [annee, entreprise_id]);
    return r.rows[0];
  }

  static async cloturer(annee: number, entreprise_id: number): Promise<{
    exercice: Exercice;
    nb_ecritures: number;
    hash_cloture: string;
  }> {
    // Auto-crée l'exercice s'il n'existe pas encore
    await this.ouvrir(annee, entreprise_id);

    const ex = await this.obtenir(annee, entreprise_id);
    if (ex?.statut === 'clos') throw new Error(`L'exercice ${annee} est déjà clôturé.`);

    // Récupère toutes les écritures de l'année pour cette entreprise
    const r = await query(`
      SELECT e.* FROM fec_ecritures e
      JOIN factures f ON f.id = e.facture_id
      WHERE f.entreprise_id = $1 AND LEFT(e.ecriture_date, 4) = $2
      ORDER BY e.ecriture_date, e.ecriture_num
    `, [entreprise_id, String(annee)]);

    const ecritures = r.rows;
    const nb_ecritures = ecritures.length;

    // Hash SHA-256 du contenu TSV (identique à l'export FEC)
    const headers = [
      'JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib',
      'CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit',
      'EcritureLet','DateLet','ValidDate','MontantDevise','Idevise'
    ];
    const lignes = ecritures.map((l: any) => [
      l.journal_code, l.journal_lib, l.ecriture_num, l.ecriture_date,
      l.compte_num, l.compte_lib, l.comp_aux_num ?? '', l.comp_aux_lib ?? '',
      l.piece_ref ?? '', l.piece_date ?? '', l.ecriture_lib,
      Number(l.debit).toFixed(2), Number(l.credit).toFixed(2),
      l.ecriture_let ?? '', l.date_let ?? '', l.valid_date ?? '',
      l.montant_devise ?? '', l.idevise ?? ''
    ].join('\t'));
    const fecContent = [headers.join('\t'), ...lignes].join('\n');
    const hash_cloture = crypto.createHash('sha256').update(fecContent, 'utf8').digest('hex');

    const updated = await withTransaction(async (client) => {
      const upd = await client.query(`
        UPDATE exercices
        SET statut = 'clos',
            date_cloture = CURRENT_DATE,
            clos_le = NOW(),
            nb_ecritures = $3,
            hash_cloture = $4
        WHERE annee = $1 AND entreprise_id = $2
        RETURNING *
      `, [annee, entreprise_id, nb_ecritures, hash_cloture]);
      return upd.rows[0] as Exercice;
    });

    return { exercice: updated, nb_ecritures, hash_cloture };
  }

  // Génère le contenu texte du FEC pour un exercice (filtré par année + entreprise)
  static async exporterFEC(annee: number, entreprise_id: number): Promise<string> {
    const r = await query(`
      SELECT e.* FROM fec_ecritures e
      JOIN factures f ON f.id = e.facture_id
      WHERE f.entreprise_id = $1 AND LEFT(e.ecriture_date, 4) = $2
      ORDER BY e.ecriture_date, e.ecriture_num
    `, [entreprise_id, String(annee)]);

    const headers = [
      'JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib',
      'CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit',
      'EcritureLet','DateLet','ValidDate','MontantDevise','Idevise'
    ];
    const rows = r.rows.map((l: any) => [
      l.journal_code, l.journal_lib, l.ecriture_num, l.ecriture_date,
      l.compte_num, l.compte_lib, l.comp_aux_num ?? '', l.comp_aux_lib ?? '',
      l.piece_ref ?? '', l.piece_date ?? '', l.ecriture_lib,
      Number(l.debit).toFixed(2), Number(l.credit).toFixed(2),
      l.ecriture_let ?? '', l.date_let ?? '', l.valid_date ?? '',
      l.montant_devise ?? '', l.idevise ?? ''
    ].join('\t'));
    return [headers.join('\t'), ...rows].join('\n');
  }
}
