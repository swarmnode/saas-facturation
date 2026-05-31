import { Router } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';

const router = Router();

// ── KPIs financiers ──────────────────────────────────────────────────────────
// ?periode=mois|trimestre|annee  (défaut : mois)
router.get('/kpis', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const p   = String(req.query.periode || 'mois');

    const intervalMap: Record<string, string> = {
      mois:      "date_trunc('month', CURRENT_DATE)",
      trimestre: "date_trunc('quarter', CURRENT_DATE)",
      annee:     "date_trunc('year', CURRENT_DATE)",
    };
    const debut = intervalMap[p] || intervalMap['mois'];

    const [facture, encaisse, attente, retard, devisConv, delai] = await Promise.all([
      query(`SELECT COALESCE(SUM(montant_ht),0) AS ht, COALESCE(SUM(montant_ttc),0) AS ttc, COUNT(*) AS nb
             FROM factures
             WHERE entreprise_id=$1 AND type_facture!='avoir' AND statut IN ('emise','payee')
               AND date_emission::timestamp >= ${debut}`, [eid]),

      query(`SELECT COALESCE(SUM(montant_ttc),0) AS ttc
             FROM factures
             WHERE entreprise_id=$1 AND type_facture!='avoir' AND statut='payee'
               AND date_paiement IS NOT NULL AND date_paiement::timestamp >= ${debut}`, [eid]),

      query(`SELECT COALESCE(SUM(montant_ttc),0) AS ttc, COUNT(*) AS nb
             FROM factures
             WHERE entreprise_id=$1 AND type_facture!='avoir' AND statut='emise'`, [eid]),

      query(`SELECT COALESCE(SUM(montant_ttc),0) AS ttc, COUNT(*) AS nb
             FROM factures
             WHERE entreprise_id=$1 AND type_facture!='avoir' AND statut='emise'
               AND date_echeance IS NOT NULL AND date_echeance::date < CURRENT_DATE`, [eid]),

      query(`SELECT
               COUNT(*) FILTER (WHERE statut IN ('accepte','signe')) AS acceptes,
               COUNT(*) FILTER (WHERE statut NOT IN ('brouillon'))    AS envoyes
             FROM devis WHERE entreprise_id=$1
               AND created_at >= CURRENT_DATE - INTERVAL '90 days'`, [eid]),

      // Délai moyen devis → acceptation (180 derniers jours)
      query(`SELECT ROUND(AVG(
               EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
             )::numeric, 1) AS jours
             FROM devis
             WHERE entreprise_id=$1 AND statut IN ('accepte','signe')
               AND created_at >= CURRENT_DATE - INTERVAL '180 days'`, [eid]),
    ]);

    const nb = parseInt(facture.rows[0].nb);
    const ht = parseFloat(facture.rows[0].ht);

    res.json({
      facture_ht:      ht,
      facture_ttc:     parseFloat(facture.rows[0].ttc),
      facture_nb:      nb,
      montant_moyen_ht: nb > 0 ? Math.round(ht / nb) : 0,
      encaisse_ttc:    parseFloat(encaisse.rows[0].ttc),
      attente_ttc:     parseFloat(attente.rows[0].ttc),
      attente_nb:      parseInt(attente.rows[0].nb),
      retard_ttc:  parseFloat(retard.rows[0].ttc),
      retard_nb:   parseInt(retard.rows[0].nb),
      devis_acceptes:       parseInt(devisConv.rows[0].acceptes),
      devis_envoyes:        parseInt(devisConv.rows[0].envoyes),
      delai_moyen_acceptation: parseFloat(delai.rows[0].jours) || 0,
    });
  } catch(e) { next(e); }
});

// ── Pipeline commercial ───────────────────────────────────────────────────────
router.get('/pipeline', requirePerm('devis:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const r = await query(`
      SELECT
        COUNT(*) FILTER (WHERE statut='brouillon')                               AS nb_brouillon,
        COALESCE(SUM(montant_ttc) FILTER (WHERE statut='brouillon'),0)           AS ttc_brouillon,
        COUNT(*) FILTER (WHERE statut='envoye')                                  AS nb_envoye,
        COALESCE(SUM(montant_ttc) FILTER (WHERE statut='envoye'),0)              AS ttc_envoye,
        COUNT(*) FILTER (WHERE statut IN ('accepte','signe'))                    AS nb_accepte,
        COALESCE(SUM(montant_ttc) FILTER (WHERE statut IN ('accepte','signe')),0) AS ttc_accepte,
        COUNT(*) FILTER (WHERE statut IN ('accepte','signe')
          AND EXISTS (SELECT 1 FROM factures f WHERE f.devis_id=devis.id))       AS nb_facture
      FROM devis WHERE entreprise_id=$1
    `, [eid]);
    const row = r.rows[0];
    res.json([
      { etape: 'Brouillons',  nb: parseInt(row.nb_brouillon), ttc: parseFloat(row.ttc_brouillon) },
      { etape: 'Envoyés',     nb: parseInt(row.nb_envoye),    ttc: parseFloat(row.ttc_envoye) },
      { etape: 'Acceptés',    nb: parseInt(row.nb_accepte),   ttc: parseFloat(row.ttc_accepte) },
      { etape: 'Facturés',    nb: parseInt(row.nb_facture),   ttc: null },
    ]);
  } catch(e) { next(e); }
});

// ── Top 10 clients ────────────────────────────────────────────────────────────
router.get('/top-clients', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const annee = new Date().getFullYear();
    const r = await query(`
      SELECT
        COALESCE(c.raison_sociale, TRIM(COALESCE(c.prenom,'')||' '||COALESCE(c.nom,''))) AS client_nom,
        c.id AS client_id,
        SUM(f.montant_ht)  AS ca_ht,
        COUNT(f.id)        AS nb_factures
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      WHERE f.entreprise_id=$1 AND f.type_facture!='avoir'
        AND f.statut IN ('emise','payee')
        AND EXTRACT(YEAR FROM f.date_emission::timestamp) = $2
      GROUP BY c.id, client_nom
      ORDER BY ca_ht DESC LIMIT 10
    `, [eid, annee]);

    const total = r.rows.reduce((s: number, row: any) => s + parseFloat(row.ca_ht), 0);
    res.json(r.rows.map((row: any) => ({
      client_nom:  row.client_nom,
      client_id:   row.client_id,
      ca_ht:       parseFloat(row.ca_ht),
      nb_factures: parseInt(row.nb_factures),
      part_pct:    total > 0 ? Math.round(parseFloat(row.ca_ht) / total * 100) : 0,
    })));
  } catch(e) { next(e); }
});

// ── Balance âgée ─────────────────────────────────────────────────────────────
router.get('/balance-agee', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const r = await query(`
      SELECT f.numero, f.montant_ttc, f.date_echeance, f.date_emission,
             COALESCE(c.raison_sociale, c.prenom || ' ' || c.nom) AS client_nom,
             CASE
               WHEN f.date_echeance IS NULL THEN 0
               ELSE CURRENT_DATE - f.date_echeance::date
             END AS retard_jours
      FROM factures f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.entreprise_id = $1 AND f.statut = 'emise' AND f.type_facture != 'avoir'
      ORDER BY retard_jours DESC, f.date_echeance ASC NULLS LAST
    `, [eid]);

    const rows = r.rows.map((row: any) => ({
      numero:      row.numero,
      client_nom:  row.client_nom,
      montant_ttc: parseFloat(row.montant_ttc),
      date_echeance: row.date_echeance,
      retard_jours: parseInt(row.retard_jours) || 0,
    }));

    // Résumé par tranche
    const tranches = [
      { label: 'À venir / Non échu', min: -Infinity, max: 0 },
      { label: '1 – 30 jours',       min: 1,  max: 30  },
      { label: '31 – 60 jours',      min: 31, max: 60  },
      { label: '61 – 90 jours',      min: 61, max: 90  },
      { label: '+ de 90 jours',      min: 91, max: Infinity },
    ];
    const summary = tranches.map(t => ({
      label: t.label,
      montant: rows.filter((r: any) => r.retard_jours >= t.min && r.retard_jours <= t.max)
                   .reduce((s: number, r: any) => s + r.montant_ttc, 0),
      nb: rows.filter((r: any) => r.retard_jours >= t.min && r.retard_jours <= t.max).length,
    }));

    res.json({ rows, summary });
  } catch(e) { next(e); }
});

// ── Évolution mensuelle 12 mois ───────────────────────────────────────────────
router.get('/evolution', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const r = await query(`
      SELECT
        to_char(gs, 'YYYY-MM') AS mois,
        to_char(gs, 'Mon YYYY') AS label,
        COALESCE(SUM(f.montant_ht) FILTER (
          WHERE f.statut IN ('emise','payee') AND f.type_facture != 'avoir'
        ), 0) AS facture_ht,
        COALESCE(SUM(f.montant_ht) FILTER (
          WHERE f.statut = 'payee' AND f.type_facture != 'avoir'
        ), 0) AS encaisse_ht,
        COALESCE(SUM(a.montant_ht) FILTER (
          WHERE a.type_facture = 'avoir' AND a.statut = 'emise'
        ), 0) AS avoirs_ht
      FROM generate_series(
        date_trunc('month', CURRENT_DATE - INTERVAL '11 months'),
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) gs
      LEFT JOIN factures f
        ON f.entreprise_id = $1
        AND date_trunc('month', f.date_emission::timestamp) = gs
      LEFT JOIN factures a
        ON a.entreprise_id = $1
        AND date_trunc('month', a.date_emission::timestamp) = gs
        AND a.type_facture = 'avoir'
        AND a.statut = 'emise'
      GROUP BY gs ORDER BY gs
    `, [eid]);

    res.json(r.rows.map((row: any) => ({
      mois:        row.mois,
      label:       row.label,
      facture_ht:  parseFloat(row.facture_ht),
      encaisse_ht: parseFloat(row.encaisse_ht),
      avoirs_ht:   parseFloat(row.avoirs_ht),
    })));
  } catch(e) { next(e); }
});

export default router;
