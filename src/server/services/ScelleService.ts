import crypto from 'crypto';
import { query } from '../db/database';

export class ScelleService {
  static async scellerDocument(
    typeDocument: string,
    documentId: number,
    documentNumero: string,
    contenu: object
  ): Promise<string> {
    const hashDocument = crypto
      .createHash('sha256')
      .update(JSON.stringify(contenu))
      .digest('hex');

    const dernierResult = await query(
      'SELECT hash_cumule FROM journal_scellement ORDER BY id DESC LIMIT 1'
    );
    const dernier = dernierResult.rows[0] as { hash_cumule: string } | undefined;

    const hashPrecedent = dernier?.hash_cumule ?? null;
    const hashCumule = crypto
      .createHash('sha256')
      .update(hashDocument + (hashPrecedent ?? ''))
      .digest('hex');

    await query(`
      INSERT INTO journal_scellement
        (type_document, document_id, document_numero, hash_document, hash_precedent, hash_cumule)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [typeDocument, documentId, documentNumero, hashDocument, hashPrecedent, hashCumule]);

    return hashCumule;
  }

  static async verifierChaine(): Promise<{ valide: boolean; premierEcartId?: number }> {
    const result  = await query('SELECT * FROM journal_scellement ORDER BY id');
    const entrees = result.rows as any[];

    for (let i = 0; i < entrees.length; i++) {
      const e               = entrees[i];
      const hashPrecAttendu = i > 0 ? entrees[i - 1].hash_cumule : null;

      if (e.hash_precedent !== hashPrecAttendu)
        return { valide: false, premierEcartId: e.id };

      const hashCumuleAttendu = crypto
        .createHash('sha256')
        .update(e.hash_document + (e.hash_precedent ?? ''))
        .digest('hex');

      if (e.hash_cumule !== hashCumuleAttendu)
        return { valide: false, premierEcartId: e.id };
    }

    return { valide: true };
  }
}
