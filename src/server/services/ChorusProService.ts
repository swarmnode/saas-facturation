import { query } from '../db/database';
import { FacturXService } from './FacturXService';
import fs from 'fs';
import path from 'path';

const PISTE_TOKEN_URL  = process.env.CHORUS_PRO_TOKEN_URL  ?? 'https://piste.gouv.fr/connect/oauth2/token';
const PISTE_API_URL    = process.env.CHORUS_PRO_API_URL    ?? 'https://piste.gouv.fr/chomage-partiel/api';
const CPP_API_URL      = process.env.CHORUS_PRO_CPP_URL    ?? 'https://piste.gouv.fr/cpro/factures/v1';

export interface ChorusStatut {
  idFactureCPP: string;
  statut: string;
  dateDepot: string;
}

export class ChorusProService {

  static isConfigured(): boolean {
    return !!(process.env.CHORUS_PRO_CLIENT_ID && process.env.CHORUS_PRO_CLIENT_SECRET);
  }

  static async getAccessToken(): Promise<string> {
    if (!this.isConfigured())
      throw new Error('Chorus Pro non configuré — définir CHORUS_PRO_CLIENT_ID et CHORUS_PRO_CLIENT_SECRET dans .env');

    const resp = await fetch(PISTE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.CHORUS_PRO_CLIENT_ID!,
        client_secret: process.env.CHORUS_PRO_CLIENT_SECRET!,
        scope:         'openid',
      }),
    });
    const data: any = await resp.json();
    if (!data.access_token) throw new Error(`Chorus Pro OAuth2 échec : ${JSON.stringify(data)}`);
    return data.access_token;
  }

  // Dépôt d'une facture au format Factur-X (PDF/A-3b avec XML embarqué)
  static async deposerFacture(factureId: number): Promise<ChorusStatut> {
    const fr = await query(`
      SELECT f.*, e.siret AS e_siret, e.raison_sociale AS e_nom
      FROM factures f JOIN entreprise e ON e.id = f.entreprise_id
      WHERE f.id = $1
    `, [factureId]);
    const facture = fr.rows[0];
    if (!facture) throw new Error('Facture introuvable');
    if (facture.statut !== 'emise') throw new Error('Seules les factures émises peuvent être déposées sur Chorus Pro');
    if (!facture.pdf_path) throw new Error('PDF non généré — émettez la facture avant le dépôt');

    const pdfPath = path.resolve(process.cwd(), 'storage', 'pdf', facture.pdf_path);
    if (!fs.existsSync(pdfPath)) throw new Error('Fichier PDF introuvable');

    const token   = await this.getAccessToken();
    const pdfB64  = fs.readFileSync(pdfPath).toString('base64');

    // API Chorus Pro : POST /cpro/factures/v1/deposer/flux
    const payload = {
      fichierFlux:      pdfB64,
      nomFichier:       `${facture.numero}.pdf`,
      syntaxeFlux:      'IN_DP_E2_CII_FACTURX_MIN',  // Factur-X MINIMUM
      avecSignature:    false,
      numeroDeMandat:   null,
    };

    const resp = await fetch(`${CPP_API_URL}/deposer/flux`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json;charset=UTF-8',
        'cpro-account':  process.env.CHORUS_PRO_LOGIN ?? '',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Chorus Pro dépôt échoué (HTTP ${resp.status}) : ${err}`);
    }

    const result: any = await resp.json();
    const idFactureCPP = result.idFactureCPP ?? result.numeroFluxDepot ?? 'N/A';

    // Persister l'ID Chorus Pro sur la facture
    await query(`
      UPDATE factures SET chorus_pro_id = $1, chorus_pro_statut = 'DEPOSE', updated_at = NOW()
      WHERE id = $2
    `, [idFactureCPP, factureId]);

    return {
      idFactureCPP,
      statut:    'DEPOSE',
      dateDepot: new Date().toISOString(),
    };
  }

  // Consulte le statut d'une facture déposée
  static async consulterStatut(factureId: number): Promise<ChorusStatut> {
    const fr = await query('SELECT chorus_pro_id FROM factures WHERE id = $1', [factureId]);
    const facture = fr.rows[0];
    if (!facture?.chorus_pro_id) throw new Error('Aucun dépôt Chorus Pro pour cette facture');

    const token = await this.getAccessToken();
    const resp = await fetch(`${CPP_API_URL}/consulter/flux?numeroFluxDepot=${facture.chorus_pro_id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'cpro-account':  process.env.CHORUS_PRO_LOGIN ?? '',
      },
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Chorus Pro consultation échouée (HTTP ${resp.status}) : ${err}`);
    }

    const data: any = await resp.json();
    const statut = data.statutFlux ?? data.statut ?? 'INCONNU';

    await query(`UPDATE factures SET chorus_pro_statut = $1 WHERE id = $2`, [statut, factureId]);

    return { idFactureCPP: facture.chorus_pro_id, statut, dateDepot: data.dateDepot ?? '' };
  }
}
