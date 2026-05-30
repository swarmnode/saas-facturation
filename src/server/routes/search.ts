import { Router } from 'express';
import { query } from '../db/database';

const router = Router();

// Construit un filtre AND sur plusieurs tokens : chaque mot doit matcher au moins un champ
function buildTokenFilter(tokens: string[], fields: string[], startIdx: number): { sql: string; params: string[] } {
  const params: string[] = [];
  const clauses = tokens.map(tok => {
    const p = `%${tok}%`;
    params.push(p);
    const idx = startIdx + params.length;
    return `(${fields.map(f => `${f} ILIKE $${idx}`).join(' OR ')})`;
  });
  return { sql: clauses.join(' AND '), params };
}

router.get('/', async (req, res, next) => {
  try {
    const raw = String(req.query.q ?? '').trim();
    if (raw.length < 2) return res.json([]);

    const tokens = raw.split(/\s+/).filter(t => t.length >= 1);
    const eid    = req.user!.entreprise_id;

    const clientNom = `COALESCE(c.raison_sociale, TRIM(COALESCE(c.prenom,'') || ' ' || c.nom))`;

    // Champs cherchés pour chaque type (document + client joint)
    const devisFields    = ['d.numero', 'd.statut', 'c.raison_sociale', 'c.nom', 'c.prenom'];
    const factureFields  = ['f.numero', 'f.statut', 'c.raison_sociale', 'c.nom', 'c.prenom'];
    const blFields       = ['bl.numero', 'bl.statut', 'c.raison_sociale', 'c.nom', 'c.prenom'];
    const acompteFields  = ['a.numero', 'a.statut', 'c.raison_sociale', 'c.nom', 'c.prenom'];
    const clientFields   = ['LOWER(nom)', 'LOWER(prenom)', 'LOWER(COALESCE(raison_sociale,\'\'))', 'LOWER(COALESCE(email,\'\'))', 'LOWER(COALESCE(siret,\'\'))'];
    const articleFields  = ['LOWER(reference)', 'LOWER(designation)'];

    async function search(
      selectSql: string,
      fromSql: string,
      baseParams: any[],
      fields: string[],
      orderSql: string,
      limit: number,
      lowerCase = false
    ) {
      const tok = lowerCase ? tokens.map(t => t.toLowerCase()) : tokens;
      const { sql: filter, params } = buildTokenFilter(tok, fields, baseParams.length);
      return query(
        `${selectSql} ${fromSql} WHERE ${baseParams.map((_, i) => `${Object.keys({eid:1})[0]} = $${i + 1}`).join(' AND ')} AND (${filter}) ${orderSql} LIMIT ${limit}`,
        [...baseParams, ...params]
      );
    }

    // Requêtes parallèles avec filtre multi-tokens
    function makeQuery(
      select: string, from: string, baseWhere: string, baseParams: any[],
      fields: string[], order: string, limit: number, lowerCase = false
    ) {
      const tok = lowerCase ? tokens.map(t => t.toLowerCase()) : tokens;
      const clauses: string[] = [];
      const extraParams: string[] = [];
      let pIdx = baseParams.length + 1;
      for (const t of tok) {
        const p = `%${t}%`;
        extraParams.push(p);
        clauses.push(`(${fields.map(f => `${f} ILIKE $${pIdx}`).join(' OR ')})`);
        pIdx++;
      }
      const sql = `${select} ${from} WHERE ${baseWhere} AND (${clauses.join(' AND ')}) ${order} LIMIT ${limit}`;
      return query(sql, [...baseParams, ...extraParams]);
    }

    const [devis, factures, bls, acomptes, clients, articles] = await Promise.all([
      makeQuery(
        `SELECT d.id, d.numero, d.statut, d.montant_ttc, ${clientNom} AS client_nom`,
        'FROM devis d LEFT JOIN clients c ON c.id = d.client_id',
        'd.entreprise_id = $1', [eid], devisFields,
        'ORDER BY d.date_creation DESC', 8
      ),
      makeQuery(
        `SELECT f.id, f.numero, f.statut, f.montant_ttc, ${clientNom} AS client_nom`,
        'FROM factures f LEFT JOIN clients c ON c.id = f.client_id',
        'f.entreprise_id = $1', [eid], factureFields,
        'ORDER BY f.date_emission DESC', 8
      ),
      makeQuery(
        `SELECT bl.id, bl.numero, bl.statut, ${clientNom} AS client_nom`,
        'FROM bons_livraison bl LEFT JOIN clients c ON c.id = bl.client_id',
        'bl.entreprise_id = $1', [eid], blFields,
        'ORDER BY bl.date_emission DESC', 5
      ),
      makeQuery(
        `SELECT a.id, a.numero, a.statut, a.montant_ttc, ${clientNom} AS client_nom`,
        'FROM acomptes a LEFT JOIN clients c ON c.id = a.client_id',
        'a.entreprise_id = $1', [eid], acompteFields,
        'ORDER BY a.created_at DESC', 5
      ),
      makeQuery(
        'SELECT id, nom, prenom, raison_sociale, email, siret',
        'FROM clients',
        "entreprise_id = $1 AND statut_rgpd != 'anonymise'", [eid], clientFields,
        'ORDER BY nom', 5, true
      ),
      makeQuery(
        'SELECT id, reference, designation, prix_unitaire_ht',
        'FROM articles',
        'entreprise_id = $1', [eid], articleFields,
        'ORDER BY designation', 5, true
      ),
    ]);

    const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format;
    const results: { type: string; label: string; sub: string; id: number }[] = [];

    for (const d of devis.rows)
      results.push({ type: 'devis', label: `${d.numero} — ${d.client_nom ?? ''}`, sub: `${fmt(d.montant_ttc)} · ${d.statut}`, id: d.id });
    for (const f of factures.rows)
      results.push({ type: 'factures', label: `${f.numero} — ${f.client_nom ?? ''}`, sub: `${fmt(f.montant_ttc)} · ${f.statut}`, id: f.id });
    for (const bl of bls.rows)
      results.push({ type: 'bons-livraison', label: `${bl.numero} — ${bl.client_nom ?? ''}`, sub: bl.statut, id: bl.id });
    for (const a of acomptes.rows)
      results.push({ type: 'acomptes', label: `${a.numero} — ${a.client_nom ?? ''}`, sub: `${fmt(a.montant_ttc)} · ${a.statut}`, id: a.id });
    for (const c of clients.rows) {
      const nom = c.raison_sociale || `${c.prenom ?? ''} ${c.nom}`.trim();
      results.push({ type: 'clients', label: nom, sub: c.email ?? '', id: c.id });
    }
    for (const a of articles.rows)
      results.push({ type: 'articles', label: `${a.reference} — ${a.designation}`, sub: `${fmt(a.prix_unitaire_ht)} HT`, id: a.id });

    res.json(results);
  } catch (e) { next(e); }
});

export default router;
