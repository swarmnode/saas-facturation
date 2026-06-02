import crypto from 'crypto';
import { query } from '../db/database';

export class ArchiveService {
  static async archiver(
    typeDocument: string,
    documentId: number,
    numero: string,
    contenu: object,
    entreprise_id?: number,
    txClient?: any
  ) {
    const jsonSnapshot  = JSON.stringify(contenu);
    const hashArchive   = crypto.createHash('sha256').update(jsonSnapshot).digest('hex');
    const annee         = new Date().getFullYear();
    const conservation  = new Date();
    conservation.setFullYear(conservation.getFullYear() + 10);

    const q = txClient ? txClient.query.bind(txClient) : query;
    await q(`
      INSERT INTO archive_documents
        (type_document, document_id_original, numero, json_snapshot, hash_archive,
         annee_archivage, conservation_jusqu_au, entreprise_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (type_document, document_id_original) DO NOTHING
    `, [typeDocument, documentId, numero, jsonSnapshot, hashArchive,
        annee, conservation.toISOString(), entreprise_id ?? null]);
  }

  static async lister(type?: string, entreprise_id?: number) {
    const params: any[] = [];
    const typeFilter   = type          ? `AND type_document  = $${params.push(type)}`          : '';
    const tenantFilter = entreprise_id ? `AND entreprise_id  = $${params.push(entreprise_id)}` : '';
    const r = await query(
      `SELECT id, type_document, numero, date_archivage, conservation_jusqu_au
       FROM archive_documents WHERE 1=1 ${typeFilter} ${tenantFilter}
       ORDER BY date_archivage DESC`,
      params
    );
    return r.rows;
  }

  static async obtenir(id: number, entreprise_id?: number) {
    const params: any[] = [id];
    const tenantFilter = entreprise_id ? `AND entreprise_id = $${params.push(entreprise_id)}` : '';
    const r   = await query(
      `SELECT * FROM archive_documents WHERE id = $1 ${tenantFilter}`,
      params
    );
    const doc = r.rows[0];
    if (!doc) return null;
    return { ...doc, contenu: JSON.parse(doc.json_snapshot) };
  }

  static async anonymiserProspects() {
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 3);

    const r = await query(`
      UPDATE clients SET
        prenom = 'Anonymisé', nom = 'Anonymisé', raison_sociale = 'Anonymisé',
        email = NULL, telephone = NULL, adresse = 'Anonymisé',
        statut_rgpd = 'anonymise', date_anonymisation = NOW()::TEXT
      WHERE statut_rgpd = 'prospect'
        AND (date_derniere_activite IS NULL OR date_derniere_activite < $1)
    `, [limite.toISOString()]);
    return (r as any).rowCount ?? 0;
  }
}
