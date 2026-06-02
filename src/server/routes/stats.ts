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

// ── DSO + Prévisions trésorerie ───────────────────────────────────────────────
router.get('/tresorerie', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const [dso, prev] = await Promise.all([
      // DSO = délai moyen émission → paiement (365 derniers jours)
      query(`SELECT ROUND(AVG(
               date_paiement::date - date_emission::date
             )::numeric, 1) AS jours
             FROM factures
             WHERE entreprise_id=$1 AND statut='payee'
               AND date_paiement IS NOT NULL AND date_emission IS NOT NULL
               AND date_paiement::date >= CURRENT_DATE - INTERVAL '365 days'`, [eid]),

      // Prévisions : factures émises non payées avec échéance, 90 prochains jours
      query(`SELECT f.numero, f.montant_ttc, f.date_echeance::date AS echeance,
                    COALESCE(c.raison_sociale, TRIM(c.prenom||' '||c.nom)) AS client_nom
             FROM factures f LEFT JOIN clients c ON c.id=f.client_id
             WHERE f.entreprise_id=$1 AND f.statut='emise' AND f.type_facture!='avoir'
               AND f.date_echeance IS NOT NULL
               AND f.date_echeance::date <= CURRENT_DATE + INTERVAL '90 days'
             ORDER BY f.date_echeance ASC`, [eid]),
    ]);
    res.json({
      dso_jours: parseFloat(dso.rows[0].jours) || 0,
      previsions: prev.rows.map((r: any) => ({
        numero:      r.numero,
        client_nom:  r.client_nom,
        montant_ttc: parseFloat(r.montant_ttc),
        echeance:    r.echeance,
      })),
    });
  } catch(e) { next(e); }
});

// ── Top articles ──────────────────────────────────────────────────────────────
router.get('/top-articles', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const annee = new Date().getFullYear();
    const r = await query(`
      SELECT fl.designation,
             SUM(fl.quantite)   AS total_qte,
             SUM(fl.montant_ht) AS total_ht,
             COUNT(DISTINCT f.id) AS nb_factures
      FROM factures_lignes fl
      JOIN factures f ON f.id = fl.facture_id
      WHERE f.entreprise_id=$1 AND f.type_facture!='avoir'
        AND f.statut IN ('emise','payee')
        AND EXTRACT(YEAR FROM f.date_emission::timestamp) = $2
      GROUP BY fl.designation
      ORDER BY total_ht DESC LIMIT 10
    `, [eid, annee]);
    res.json(r.rows.map((row: any) => ({
      designation:  row.designation,
      total_qte:    parseFloat(row.total_qte),
      total_ht:     parseFloat(row.total_ht),
      nb_factures:  parseInt(row.nb_factures),
    })));
  } catch(e) { next(e); }
});

// ── Marge du catalogue ────────────────────────────────────────────────────────
router.get('/marge', requirePerm('articles:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const r = await query(`
      SELECT designation, prix_unitaire_ht, prix_achat_ht,
             ROUND(((prix_unitaire_ht - prix_achat_ht) / NULLIF(prix_unitaire_ht,0) * 100)::numeric, 1) AS taux_marque
      FROM articles
      WHERE entreprise_id=$1 AND prix_achat_ht IS NOT NULL AND actif=1 AND prix_unitaire_ht > 0
      ORDER BY taux_marque ASC
    `, [eid]);
    res.json(r.rows.map((row: any) => ({
      designation:    row.designation,
      prix_vente:     parseFloat(row.prix_unitaire_ht),
      prix_achat:     parseFloat(row.prix_achat_ht),
      taux_marque:    parseFloat(row.taux_marque),
    })));
  } catch(e) { next(e); }
});

// ── Comparaison N vs N-1 ──────────────────────────────────────────────────────
router.get('/comparaison', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const annee = new Date().getFullYear();
    const r = await query(`
      SELECT gs AS mois_num,
             to_char(to_date(gs::text,'MM'),'Mon') AS mois_label,
             COALESCE(SUM(f.montant_ht) FILTER (
               WHERE f.statut IN ('emise','payee')
                 AND EXTRACT(YEAR FROM f.date_emission::timestamp) = $2
             ), 0) AS ca_n,
             COALESCE(SUM(f.montant_ht) FILTER (
               WHERE f.statut IN ('emise','payee')
                 AND EXTRACT(YEAR FROM f.date_emission::timestamp) = $2 - 1
             ), 0) AS ca_n1
      FROM generate_series(1,12) gs
      LEFT JOIN factures f
        ON f.entreprise_id = $1 AND f.type_facture != 'avoir'
        AND EXTRACT(MONTH FROM f.date_emission::timestamp) = gs
        AND EXTRACT(YEAR  FROM f.date_emission::timestamp) IN ($2::int, ($2::int - 1))
      GROUP BY gs ORDER BY gs
    `, [eid, annee]);
    res.json(r.rows.map((row: any) => ({
      mois:      parseInt(row.mois_num),
      label:     row.mois_label,
      ca_n:      parseFloat(row.ca_n),
      ca_n1:     parseFloat(row.ca_n1),
    })));
  } catch(e) { next(e); }
});

// ── Répartitions ──────────────────────────────────────────────────────────────
router.get('/repartitions', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const annee = new Date().getFullYear();
    const [reglement, tva] = await Promise.all([
      // Répartition par mode de règlement
      query(`SELECT COALESCE(mode_paiement,'non_precise') AS mode,
                    COUNT(*) AS nb, COALESCE(SUM(montant_ht),0) AS ca_ht
             FROM factures
             WHERE entreprise_id=$1 AND type_facture!='avoir'
               AND statut IN ('emise','payee')
               AND EXTRACT(YEAR FROM date_emission::timestamp) = $2
             GROUP BY mode ORDER BY ca_ht DESC`, [eid, annee]),

      // Répartition par taux TVA
      query(`SELECT t.taux,
                    COALESCE(SUM(fl.montant_ht),0)  AS base_ht,
                    COALESCE(SUM(fl.montant_tva),0) AS tva
             FROM factures_lignes fl
             JOIN factures f ON f.id=fl.facture_id
             JOIN taux_tva t ON t.id=fl.taux_tva_id
             WHERE f.entreprise_id=$1 AND f.type_facture!='avoir'
               AND f.statut IN ('emise','payee')
               AND EXTRACT(YEAR FROM f.date_emission::timestamp) = $2
             GROUP BY t.taux ORDER BY t.taux DESC`, [eid, annee]),
    ]);
    res.json({
      reglement: reglement.rows.map((r: any) => ({
        mode:   r.mode,
        nb:     parseInt(r.nb),
        ca_ht:  parseFloat(r.ca_ht),
      })),
      tva: tva.rows.map((r: any) => ({
        taux:     parseFloat(r.taux),
        base_ht:  parseFloat(r.base_ht),
        tva:      parseFloat(r.tva),
      })),
    });
  } catch(e) { next(e); }
});

// ── Attestation anti-fraude TVA ───────────────────────────────────────────────
router.get('/attestation', requirePerm('settings:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const er  = await query('SELECT * FROM entreprise WHERE id=$1', [eid]);
    const ent = er.rows[0];
    const date = new Date().toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });
    const annee = new Date().getFullYear();

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#222;line-height:1.6}
        h1{color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:8px}
        h2{color:#1a3a5c;font-size:15px;margin-top:24px}
        .cadre{border:1px solid #ccc;padding:16px;border-radius:4px;margin:16px 0}
        .sign{margin-top:40px;display:flex;justify-content:space-between}
        @media print{body{margin:20px}}</style>
    </head><body>
      <h1>Attestation de conformité</h1>
      <p><strong>Logiciel :</strong> FacturPro — SaaS de devis et facturation conforme au droit français</p>
      <p><strong>Éditeur :</strong> FacturPro (logiciel open source — AGPL v3)</p>
      <p><strong>Date d'édition :</strong> ${date}</p>

      <div class="cadre">
        <strong>Entreprise utilisatrice</strong><br/>
        ${ent.raison_sociale || '—'}<br/>
        SIRET : ${ent.siret || '—'}<br/>
        ${ent.adresse ? ent.adresse + ', ' + ent.code_postal + ' ' + ent.ville : ''}
      </div>

      <h2>Article 88 de la loi de finances 2016 (entrée en vigueur le 1er janvier 2018)</h2>
      <p>Le logiciel FacturPro satisfait aux obligations de la loi anti-fraude TVA par les mécanismes suivants :</p>

      <h2>1. Inaltérabilité</h2>
      <p>Les données de transactions (factures, avoirs, acomptes) sont verrouillées dès leur émission par des triggers de base de données PostgreSQL (<code>BEFORE UPDATE</code>). Toute tentative de modification est bloquée au niveau du moteur de base de données. La seule transition autorisée est le passage du statut <em>émise</em> à <em>payée</em>.</p>

      <h2>2. Sécurisation</h2>
      <p>Chaque document fiscal émis est signé par un hash SHA-256 cumulatif (<em>journal_scellement</em>). Ce journal chaîne tous les documents : toute altération, même directement en base, est détectable via la route <code>GET /api/factures/scellement/verifier</code>. Le journal est protégé par des triggers qui interdisent toute modification ou suppression.</p>

      <h2>3. Conservation</h2>
      <p>Les snapshots JSON de chaque document émis sont archivés dans la table <em>archive_documents</em>, immuable (triggers UPDATE/DELETE bloqués). La rétention est configurée pour 10 ans, conformément à l'article L. 102 B du Livre des Procédures Fiscales.</p>

      <h2>4. Archivage</h2>
      <p>Le Fichier des Écritures Comptables (FEC) est généré automatiquement à chaque émission de facture et exportable au format DGFiP (texte tabulé) via <code>GET /api/factures/export/fec</code>. Les colonnes respectent exactement la spécification technique de la DGFiP.</p>

      <h2>5. Numérotation sans rupture</h2>
      <p>La numérotation des documents (<em>FAC-AAAA-NNNN</em>, <em>DEV-AAAA-NNNN</em>, etc.) est garantie séquentielle et sans doublon par un mécanisme <code>INSERT … ON CONFLICT DO UPDATE</code> atomique sur la table <em>sequence_numerotation</em>.</p>

      <div class="sign">
        <div>
          <p>Fait à _________________________, le ${date}</p>
          <p>Signature du représentant légal :</p>
          <br/><br/>
          <p>_________________________ &nbsp;&nbsp; _________________________</p>
          <p style="font-size:12px">Nom &amp; qualité &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Cachet</p>
        </div>
      </div>

      <p style="margin-top:32px;font-size:11px;color:#888">Document généré par FacturPro le ${date}. Ce document atteste de la conformité technique du logiciel. Il ne constitue pas une attestation comptable ou juridique et doit être complété par votre expert-comptable si requis par l'administration fiscale.</p>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="attestation_conformite_${annee}.html"`);
    res.send(html);
  } catch(e) { next(e); }
});

// ── Notifications in-app ─────────────────────────────────────────────────────
router.get('/notifications', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const [retard, expires] = await Promise.all([
      query(`SELECT COUNT(*) AS n FROM factures WHERE entreprise_id=$1 AND statut='emise'
             AND type_facture!='avoir' AND date_echeance IS NOT NULL AND date_echeance::date < CURRENT_DATE`, [eid]),
      query(`SELECT COUNT(*) AS n FROM devis WHERE entreprise_id=$1 AND statut='envoye'
             AND date_validite IS NOT NULL AND date_validite::date < CURRENT_DATE`, [eid]),
    ]);
    res.json({
      factures_retard: parseInt(retard.rows[0].n),
      devis_expires:   parseInt(expires.rows[0].n),
    });
  } catch(e) { next(e); }
});

// ── Déclaration TVA (CA3) ─────────────────────────────────────────────────────
// ?annee=2026&mois=5  ou  ?annee=2026&trimestre=2  ou  ?annee=2026
router.get('/ca3', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const eid       = req.user!.entreprise_id;
    const annee     = parseInt(String(req.query.annee))     || new Date().getFullYear();
    const mois      = req.query.mois      ? parseInt(String(req.query.mois))      : null;
    const trimestre = req.query.trimestre ? parseInt(String(req.query.trimestre)) : null;

    const MOIS_FR = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    let dateFilter: string;
    let periodeLabel: string;
    if (mois) {
      dateFilter   = `AND EXTRACT(YEAR  FROM f.date_emission::timestamp)=${annee} AND EXTRACT(MONTH FROM f.date_emission::timestamp)=${mois}`;
      periodeLabel = `${MOIS_FR[mois]} ${annee}`;
    } else if (trimestre) {
      const m1 = (trimestre - 1) * 3 + 1, m2 = m1 + 2;
      dateFilter   = `AND EXTRACT(YEAR FROM f.date_emission::timestamp)=${annee} AND EXTRACT(MONTH FROM f.date_emission::timestamp) BETWEEN ${m1} AND ${m2}`;
      periodeLabel = `T${trimestre} ${annee} (${MOIS_FR[m1]}–${MOIS_FR[m2]})`;
    } else {
      dateFilter   = `AND EXTRACT(YEAR FROM f.date_emission::timestamp)=${annee}`;
      periodeLabel = String(annee);
    }

    const [tvaCollectee, avoirs, franchise, entreprise] = await Promise.all([
      // TVA collectée par taux (hors avoirs)
      query(`SELECT t.taux, t.libelle,
                    SUM(fl.montant_ht)  AS base_ht,
                    SUM(fl.montant_tva) AS tva
             FROM factures_lignes fl
             JOIN factures f ON f.id=fl.facture_id
             JOIN taux_tva t ON t.id=fl.taux_tva_id
             WHERE f.entreprise_id=$1 AND f.type_facture!='avoir'
               AND f.statut IN ('emise','payee') ${dateFilter}
             GROUP BY t.taux, t.libelle ORDER BY t.taux DESC`, [eid]),

      // Avoirs émis (à déduire)
      query(`SELECT COALESCE(SUM(fl.montant_ht),0) AS base_ht,
                    COALESCE(SUM(fl.montant_tva),0) AS tva,
                    COUNT(DISTINCT f.id) AS nb
             FROM factures_lignes fl
             JOIN factures f ON f.id=fl.facture_id
             WHERE f.entreprise_id=$1 AND f.type_facture='avoir'
               AND f.statut IN ('emise','payee') ${dateFilter}`, [eid]),

      // Opérations en franchise 293 B
      query(`SELECT COALESCE(SUM(f.montant_ht),0) AS ht, COUNT(*) AS nb
             FROM factures f
             WHERE f.entreprise_id=$1 AND f.tva_mode='franchise_293b'
               AND f.type_facture!='avoir' AND f.statut IN ('emise','payee') ${dateFilter}`, [eid]),

      query('SELECT raison_sociale, siret, tva_intracom, adresse, code_postal, ville FROM entreprise WHERE id=$1', [eid]),
    ]);

    const totalBrut = tvaCollectee.rows.reduce((s: number, r: any) => s + parseFloat(r.tva), 0);
    const avoirTva  = parseFloat(avoirs.rows[0].tva);

    res.json({
      periode:       periodeLabel,
      annee, mois, trimestre,
      entreprise:    entreprise.rows[0] ?? {},
      tva_collectee: tvaCollectee.rows.map((r: any) => ({
        taux:     parseFloat(r.taux),
        libelle:  r.libelle,
        base_ht:  parseFloat(r.base_ht),
        tva:      parseFloat(r.tva),
      })),
      avoirs: {
        base_ht: parseFloat(avoirs.rows[0].base_ht),
        tva:     avoirTva,
        nb:      parseInt(avoirs.rows[0].nb),
      },
      franchise: {
        ht: parseFloat(franchise.rows[0].ht),
        nb: parseInt(franchise.rows[0].nb),
      },
      total_tva_brute:  totalBrut,
      total_tva_nette:  totalBrut - avoirTva,
    });
  } catch(e) { next(e); }
});

// ── TVA déductible (section B CA3) — saisie manuelle ────────────────────────
router.get('/tva-deductible', requirePerm('factures:r'), async (req, res, next) => {
  try {
    const periode = req.query.periode as string;
    if (!periode) return res.status(400).json({ error: 'Paramètre periode requis' });
    const r = await query(
      'SELECT * FROM tva_deductible WHERE entreprise_id=$1 AND periode=$2',
      [req.user!.entreprise_id, periode]
    );
    res.json(r.rows[0] ?? { entreprise_id: req.user!.entreprise_id, periode, montant: 0 });
  } catch(e) { next(e); }
});

router.put('/tva-deductible', requirePerm('factures:w'), async (req, res, next) => {
  try {
    const { periode, montant, notes } = req.body;
    if (!periode) return res.status(400).json({ error: 'Paramètre periode requis' });
    const r = await query(`
      INSERT INTO tva_deductible (entreprise_id, periode, montant, notes, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (entreprise_id, periode) DO UPDATE
        SET montant = EXCLUDED.montant, notes = EXCLUDED.notes, updated_at = NOW()
      RETURNING *
    `, [req.user!.entreprise_id, periode, montant ?? 0, notes ?? null]);
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

export default router;
