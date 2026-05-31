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

    // CA facturé période
    const [facture, encaisse, attente, retard, devisConv] = await Promise.all([
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
    ]);

    res.json({
      facture_ht:  parseFloat(facture.rows[0].ht),
      facture_ttc: parseFloat(facture.rows[0].ttc),
      facture_nb:  parseInt(facture.rows[0].nb),
      encaisse_ttc: parseFloat(encaisse.rows[0].ttc),
      attente_ttc: parseFloat(attente.rows[0].ttc),
      attente_nb:  parseInt(attente.rows[0].nb),
      retard_ttc:  parseFloat(retard.rows[0].ttc),
      retard_nb:   parseInt(retard.rows[0].nb),
      devis_acceptes: parseInt(devisConv.rows[0].acceptes),
      devis_envoyes:  parseInt(devisConv.rows[0].envoyes),
    });
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
