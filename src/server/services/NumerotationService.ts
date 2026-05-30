import { query } from '../db/database';

const PREFIXES: Record<string, string> = {
  DEVIS:    'DEV',
  FACTURE:  'FAC',
  AVOIR:    'AV',
  ACOMPTE:  'AC',
  AVENANT:  'AVN',
  BL:       'BL',
};

export class NumerotationService {
  static async getNextNumero(type: string, entreprise_id?: number): Promise<string> {
    const annee   = new Date().getFullYear();
    const prefixe = PREFIXES[type] ?? type;
    const entId   = entreprise_id ?? (await query('SELECT id FROM entreprise ORDER BY id LIMIT 1')).rows[0]?.id ?? 1;

    const result = await query(`
      INSERT INTO sequence_numerotation (type_document, annee, prefixe, dernier_numero, entreprise_id)
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (type_document, annee, entreprise_id)
      DO UPDATE SET dernier_numero = sequence_numerotation.dernier_numero + 1
      RETURNING prefixe, dernier_numero
    `, [type, annee, prefixe, entId]);

    const row = result.rows[0];
    return `${row.prefixe}-${annee}-${String(row.dernier_numero).padStart(4, '0')}`;
  }
}
