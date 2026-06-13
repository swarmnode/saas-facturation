// ── Journal d'audit ───────────────────────────────────────────────────────
async function renderAudit(el) {
  document.getElementById('topbarActions').innerHTML = '';
  el.innerHTML = '<div class="card"><p style="color:var(--text-muted)">Chargement…</p></div>';
  const logs = await api.get('/api/audit') ?? [];
  const ACTION_LABELS = {
    login: '🔐 Connexion', emettre_facture: '📤 Émission facture',
    payer_facture: '💳 Paiement', emettre_avoir: '↩️ Avoir émis',
    supprimer: '🗑️ Suppression', relancer: '📨 Relance',
  };
  el.innerHTML = `<div class="card">
    <h2 style="margin-bottom:16px;color:var(--primary)">Journal d'audit <span style="font-size:13px;font-weight:400;color:var(--text-muted)">(200 dernières entrées)</span></h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Ressource</th><th>IP</th></tr></thead>
        <tbody>${logs.length ? logs.map(l => `<tr>
          <td style="white-space:nowrap;font-size:12px">${new Date(l.created_at).toLocaleString('fr-FR')}</td>
          <td style="font-size:12px">${l.user_email||'—'}</td>
          <td>${ACTION_LABELS[l.action]||l.action}</td>
          <td style="font-size:12px">${l.ressource ? `${l.ressource}${l.ressource_id?' #'+l.ressource_id:''}` : '—'}${l.details ? ' <span style="color:var(--text-muted)">'+(JSON.stringify(l.details).slice(0,60))+'</span>' : ''}</td>
          <td style="font-size:11px;color:var(--text-muted)">${l.ip||'—'}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="empty">Aucune entrée</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── Déclaration TVA (CA3) ─────────────────────────────────────────────────
async function renderDeclTVA(el) {
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-outline" onclick="window.print()">🖨️ Imprimer</button>`;

  const now   = new Date();
  let annee   = now.getFullYear();
  let mois    = now.getMonth(); // mois précédent
  let periode = 'mois';
  if (mois === 0) { mois = 12; annee--; } // janvier → décembre précédent

  async function load() {
    let url = `/api/stats/ca3?annee=${annee}`;
    if (periode === 'mois') url += `&mois=${mois}`;
    else if (periode === 'trimestre') url += `&trimestre=${Math.ceil(mois / 3)}`;
    const periodeKey = periode === 'mois' ? `${annee}-${String(mois).padStart(2,'0')}`
                     : periode === 'trimestre' ? `${annee}-T${Math.ceil(mois/3)}`
                     : String(annee);
    const [d, ded] = await Promise.all([
      api.get(url),
      api.get(`/api/stats/tva-deductible?periode=${periodeKey}`),
    ]);
    d._tva_deductible = ded;
    render(d);
  }

  const MOIS_FR = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const TAUX_LBL = { 20: 'Taux normal 20 %', 10: 'Taux intermédiaire 10 %', 5.5: 'Taux réduit 5,5 %', 2.1: 'Taux particulier 2,1 %', 0: 'Exonéré / 0 %' };

  function row(label, baseHT, tva, bold = false) {
    const s = bold ? 'font-weight:700;background:var(--primary-light)' : '';
    return `<tr style="${s}">
      <td style="padding:8px 12px">${label}</td>
      <td style="padding:8px 12px;text-align:right">${baseHT != null ? fmt.money(baseHT) : ''}</td>
      <td style="padding:8px 12px;text-align:right">${tva != null ? fmt.money(tva) : ''}</td>
    </tr>`;
  }

  function render(d) {
    const selAnnee = [annee-1, annee, annee+1].map(a =>
      `<option value="${a}" ${a===annee?'selected':''}>${a}</option>`).join('');
    const selMois = MOIS_FR.slice(1).map((m, i) =>
      `<option value="${i+1}" ${i+1===mois?'selected':''}>${m}</option>`).join('');
    const selTrim = [1,2,3,4].map(t =>
      `<option value="${t}" ${Math.ceil(mois/3)===t?'selected':''}>${'T'+t}</option>`).join('');

    const rows = d.tva_collectee.map(t =>
      row(TAUX_LBL[t.taux] || `TVA ${t.taux} %`, t.base_ht, t.tva)
    ).join('');

    const avoirRow = d.avoirs.nb > 0
      ? row(`Avoirs émis (${d.avoirs.nb}) — à déduire`, -d.avoirs.base_ht, -d.avoirs.tva)
      : '';

    const franchiseRow = d.franchise.nb > 0
      ? `<tr><td colspan="3" style="padding:8px 12px;color:var(--text-muted);font-size:12px">
          Opérations en franchise 293 B (non soumises) : ${d.franchise.nb} facture(s) — ${fmt.money(d.franchise.ht)} HT
        </td></tr>` : '';

    el.innerHTML = `
      <style>
        @media print {
          .sidebar, .tab-bar, #topbarActions, .nav-item, .e-toolbar { display:none!important; }
          .tab-panels { position:static!important; overflow:visible!important; }
          .tab-panel   { position:static!important; overflow:visible!important; display:block!important; padding:0!important; }
          .ca3-controls { display:none!important; }
          body { background:#fff!important; }
        }
      </style>

      <div class="ca3-controls" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
        <span style="font-weight:600">Période :</span>
        <select onchange="ca3SetPeriode(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">
          <option value="mois" ${periode==='mois'?'selected':''}>Mensuelle</option>
          <option value="trimestre" ${periode==='trimestre'?'selected':''}>Trimestrielle</option>
          <option value="annee" ${periode==='annee'?'selected':''}>Annuelle</option>
        </select>
        ${periode !== 'annee' ? `<select onchange="ca3SetMois(+this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">
          ${periode==='mois' ? selMois : selTrim}
        </select>` : ''}
        <select onchange="ca3SetAnnee(+this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">${selAnnee}</select>
        <button class="btn btn-primary btn-sm" onclick="ca3Load()">Actualiser</button>
      </div>

      <div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:10px;padding:32px;font-family:'Helvetica Neue',sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1a3a5c">
          <div>
            <div style="font-size:20px;font-weight:700;color:#1a3a5c">DÉCLARATION DE TVA <span class="help-icon" data-tooltip="${helpTexts.decl_tva.replace(/"/g,'&quot;')}">?</span></div>
            <div style="font-size:14px;color:#555;margin-top:4px">Formulaire CA3 — ${d.periode}</div>
          </div>
          <div style="text-align:right;font-size:12px;color:#555">
            <div style="font-weight:600">${d.entreprise.raison_sociale || ''}</div>
            <div>SIRET : ${d.entreprise.siret || '—'}</div>
            ${d.entreprise.tva_intracom ? `<div>TVA : ${d.entreprise.tva_intracom}</div>` : ''}
          </div>
        </div>

        <h3 style="font-size:13px;font-weight:700;color:#1a3a5c;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">
          A — TVA collectée sur opérations imposables
        </h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
          <thead>
            <tr style="background:#1a3a5c;color:#fff">
              <th style="padding:8px 12px;text-align:left;font-weight:600">Opération</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600">Base HT</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600">TVA collectée</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="padding:8px 12px;color:var(--text-muted)">Aucune opération imposable sur cette période</td></tr>'}
            ${avoirRow}
            ${franchiseRow}
            ${row('TOTAL TVA COLLECTÉE BRUTE', null, d.total_tva_brute, true)}
            ${d.avoirs.nb > 0 ? row('TOTAL TVA COLLECTÉE NETTE (après avoirs)', null, d.total_tva_nette, true) : ''}
          </tbody>
        </table>

        <h3 style="font-size:13px;font-weight:700;color:#1a3a5c;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">
          B — TVA déductible
        </h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:13px">
          <thead><tr style="background:#1a3a5c;color:#fff">
            <th style="padding:8px 12px;text-align:left;font-weight:600">Opération</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600">Montant</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style="padding:8px 12px">TVA déductible sur achats et charges</td>
              <td style="padding:8px 12px;text-align:right">
                <input id="tvaDed" type="number" min="0" step="0.01"
                  value="${(d._tva_deductible?.montant||0).toFixed(2)}"
                  style="width:110px;text-align:right;border:1px solid var(--border);border-radius:4px;padding:4px 6px"
                  onchange="ca3SaveTvaDed(this.value)">
              </td>
            </tr>
            <tr style="font-weight:700;background:var(--primary-light)">
              <td style="padding:8px 12px">TOTAL TVA DÉDUCTIBLE</td>
              <td style="padding:8px 12px;text-align:right" id="totalTvaDed">${fmt.money(d._tva_deductible?.montant||0)}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:20px">
          <input id="tvaDedNotes" placeholder="Notes (optionnel)…" value="${d._tva_deductible?.notes||''}"
            style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px 10px;font-size:12px;box-sizing:border-box"
            onchange="ca3SaveTvaDed(document.getElementById('tvaDed').value, this.value)">
        </div>

        <h3 style="font-size:13px;font-weight:700;color:#1a3a5c;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">
          C — TVA à payer (ligne 16 CA3)
        </h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
          <tbody>
            <tr><td style="padding:8px 12px">TVA collectée nette (section A)</td><td style="padding:8px 12px;text-align:right;font-weight:600">${fmt.money(d.total_tva_nette)}</td></tr>
            <tr><td style="padding:8px 12px">TVA déductible (section B)</td><td style="padding:8px 12px;text-align:right;font-weight:600" id="tvaDedDisplay">${fmt.money(d._tva_deductible?.montant||0)}</td></tr>
            <tr style="font-weight:700;font-size:14px;background:#1a3a5c;color:#fff">
              <td style="padding:10px 12px">SOLDE TVA À PAYER / CRÉDIT</td>
              <td style="padding:10px 12px;text-align:right" id="soldeTva">${fmt.money(d.total_tva_nette - (d._tva_deductible?.montant||0))}</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:12px 16px;font-size:12px;color:#166534">
          <strong>ℹ TVA déductible :</strong> Saisissez le montant dans le champ ci-dessus — il est enregistré automatiquement pour cette période.
          Vérifiez avec votre expert-comptable avant dépôt.
        </div>

        <div style="margin-top:20px;font-size:11px;color:#9ca3af;text-align:center">
          Généré par FacturPro le ${new Date().toLocaleDateString('fr-FR')} — Document non officiel
        </div>
      </div>`;
  }

  window.ca3Load     = load;
  window.ca3SetAnnee = a  => { annee = a; };
  window.ca3SetMois  = m  => { mois  = m; };
  window.ca3SetPeriode = p => { periode = p; load(); };

  window.ca3SaveTvaDed = async function(montant, notes) {
    const periodeKey = periode === 'mois' ? `${annee}-${String(mois).padStart(2,'0')}`
                     : periode === 'trimestre' ? `${annee}-T${Math.ceil(mois/3)}`
                     : String(annee);
    const val = parseFloat(montant)||0;
    await api.put('/api/stats/tva-deductible', { periode: periodeKey, montant: val, notes: notes||'' });
    const dedEl = document.getElementById('totalTvaDed');
    const dispEl = document.getElementById('tvaDedDisplay');
    const soldeEl = document.getElementById('soldeTva');
    if (dedEl) dedEl.textContent = fmt.money(val);
    if (dispEl) dispEl.textContent = fmt.money(val);
    // Re-fetch latest tva_nette from current render data
    const curNette = parseFloat(document.querySelector('[data-tva-nette]')?.dataset.tvaNette||'0');
    if (soldeEl) soldeEl.textContent = fmt.money(curNette - val);
  };

  await load();
}

// ── Statistiques ──────────────────────────────────────────────────────────
async function renderStats(el) {
  document.getElementById('topbarActions').innerHTML = '';
  el.innerHTML = '<div class="card"><p style="color:var(--text-muted)">Chargement…</p></div>';

  let periode = 'mois';

  async function load() {
    const [kpis, balance, evolution, pipeline, topClients, treso, topArt, marge, comparaison, repartitions, statsFourn] = await Promise.all([
      api.get(`/api/stats/kpis?periode=${periode}`),
      api.get('/api/stats/balance-agee'),
      api.get('/api/stats/evolution'),
      api.get('/api/stats/pipeline'),
      api.get('/api/stats/top-clients'),
      api.get('/api/stats/tresorerie'),
      api.get('/api/stats/top-articles'),
      api.get('/api/stats/marge'),
      api.get('/api/stats/comparaison'),
      api.get('/api/stats/repartitions'),
      api.get('/api/stats/fournisseurs'),
    ]);
    render(kpis, balance, evolution, pipeline, topClients, treso, topArt, marge, comparaison, repartitions, statsFourn);
  }

  function periodeLabel(p) {
    return { mois: 'Ce mois', trimestre: 'Ce trimestre', annee: 'Cette année' }[p] || p;
  }

  function svgBar(data) {
    const maxVal = Math.max(...data.map(d => Math.max(d.facture_ht, d.encaisse_ht)), 1);
    const W = 700, H = 200, padL = 60, padB = 36, padR = 10, padT = 10;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const barW = chartW / data.length;
    const subW = barW * 0.35;

    const yTicks = 5;
    let grid = '', bars = '', labels = '', yLabels = '';

    for (let i = 0; i <= yTicks; i++) {
      const v = (maxVal / yTicks) * i;
      const y = padT + chartH - (chartH * i / yTicks);
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
      yLabels += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${Math.round(v / 1000)}k</text>`;
    }

    data.forEach((d, i) => {
      const x = padL + i * barW + barW * 0.1;
      const hF = Math.max(1, chartH * d.facture_ht / maxVal);
      const hE = Math.max(1, chartH * d.encaisse_ht / maxVal);
      const yF = padT + chartH - hF;
      const yE = padT + chartH - hE;

      bars += `<rect x="${x}" y="${yF}" width="${subW}" height="${hF}" fill="#3b82f6" rx="2" opacity="0.85">
                 <title>${d.label} — Facturé : ${fmt.money(d.facture_ht)}</title></rect>`;
      bars += `<rect x="${x + subW + 2}" y="${yE}" width="${subW}" height="${hE}" fill="#22c55e" rx="2" opacity="0.85">
                 <title>${d.label} — Encaissé : ${fmt.money(d.encaisse_ht)}</title></rect>`;

      const shortLabel = d.label.replace(/ \d{4}$/, '').slice(0, 3);
      labels += `<text x="${x + subW}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="#6b7280">${shortLabel}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:200px">
      ${grid}${yLabels}${bars}${labels}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#d1d5db" stroke-width="1"/>
      <line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}" stroke="#d1d5db" stroke-width="1"/>
    </svg>`;
  }

  function trancheColor(min, max) {
    if (max <= 0) return '#22c55e';
    if (min <= 30) return '#f59e0b';
    if (min <= 60) return '#f97316';
    return '#ef4444';
  }

  function card(title, content) {
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px">${title ? `<div style="font-size:13px;font-weight:600;margin-bottom:12px">${title}</div>` : ''}${content}</div>`;
  }
  function kpiCard(label, val, sub, color) {
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;flex:1;min-width:145px">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${val}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${sub}</div>
    </div>`;
  }

  function svgDonut(slices, total) {
    if (!total) return '<p style="color:var(--text-muted);font-size:13px">Aucune donnée</p>';
    const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f43f5e','#0ea5e9'];
    const R = 70, r = 35, cx = 90, cy = 90;
    let angle = -Math.PI / 2, paths = '', legend = '';
    slices.forEach((s, i) => {
      const pct = s.val / total;
      const a2  = angle + pct * 2 * Math.PI;
      const large = pct > 0.5 ? 1 : 0;
      const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(a2),   y2 = cy + R * Math.sin(a2);
      const ix1= cx + r * Math.cos(angle), iy1= cy + r * Math.sin(angle);
      const ix2= cx + r * Math.cos(a2),   iy2= cy + r * Math.sin(a2);
      const col = COLORS[i % COLORS.length];
      paths += `<path d="M${ix1},${iy1}L${x1},${y1}A${R},${R} 0 ${large},1 ${x2},${y2}L${ix2},${iy2}A${r},${r} 0 ${large},0 ${ix1},${iy1}Z" fill="${col}"><title>${s.label}: ${Math.round(pct*100)}%</title></path>`;
      legend += `<div style="display:flex;align-items:center;gap:5px;font-size:11px;margin-bottom:3px"><span style="width:10px;height:10px;border-radius:2px;background:${col};flex-shrink:0"></span>${s.label} <span style="color:var(--text-muted)">${Math.round(pct*100)}%</span></div>`;
      angle = a2;
    });
    return `<div style="display:flex;gap:16px;align-items:center"><svg viewBox="0 0 180 180" style="width:130px;height:130px;flex-shrink:0">${paths}</svg><div>${legend}</div></div>`;
  }

  function svgBarDouble(data, key1, key2, col1, col2, label1, label2) {
    const maxVal = Math.max(...data.map(d => Math.max(d[key1]||0, d[key2]||0)), 1);
    const W = 680, H = 180, padL = 50, padB = 30, padR = 10, padT = 10;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const barW = chartW / data.length, subW = barW * 0.35;
    let grid = '', bars = '', labels = '', yLabels = '';
    for (let i = 0; i <= 4; i++) {
      const v = maxVal / 4 * i, y = padT + chartH - chartH * i / 4;
      grid    += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
      yLabels += `<text x="${padL-4}" y="${y+4}" text-anchor="end" font-size="10" fill="#9ca3af">${Math.round(v/1000)}k</text>`;
    }
    data.forEach((d, i) => {
      const x  = padL + i * barW + barW * 0.1;
      const h1 = Math.max(1, chartH * (d[key1]||0) / maxVal);
      const h2 = Math.max(1, chartH * (d[key2]||0) / maxVal);
      bars += `<rect x="${x}" y="${padT+chartH-h1}" width="${subW}" height="${h1}" fill="${col1}" rx="2" opacity="0.85"><title>${d.label||d.mois} ${label1}: ${Math.round(d[key1]||0)}</title></rect>`;
      bars += `<rect x="${x+subW+2}" y="${padT+chartH-h2}" width="${subW}" height="${h2}" fill="${col2}" rx="2" opacity="0.85"><title>${d.label||d.mois} ${label2}: ${Math.round(d[key2]||0)}</title></rect>`;
      labels += `<text x="${x+subW}" y="${H-padB+14}" text-anchor="middle" font-size="9" fill="#6b7280">${(d.label||d.mois||'').slice(0,3)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:180px">
      ${grid}${yLabels}${bars}${labels}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+chartH}" stroke="#d1d5db" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+chartH}" x2="${W-padR}" y2="${padT+chartH}" stroke="#d1d5db" stroke-width="1"/>
    </svg>`;
  }

  function render(kpis, balance, evolution, pipeline, topClients, treso, topArt, marge, comparaison, repartitions, statsFourn) {
    const tauxConv = kpis.devis_envoyes > 0
      ? Math.round(kpis.devis_acceptes / kpis.devis_envoyes * 100) : 0;

    const periodes = ['mois','trimestre','annee'].map(p =>
      `<button class="btn ${p === periode ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="statsPeriode('${p}')">${periodeLabel(p)}</button>`
    ).join('');

    // ── KPIs ────────────────────────────────────────────────────────────────
    const kpiRow = [
      kpiCard('CA facturé HT', fmt.money(kpis.facture_ht), `${kpis.facture_nb} facture(s) — ${periodeLabel(periode)}`, 'var(--primary)'),
      kpiCard('Montant moyen', fmt.money(kpis.montant_moyen_ht), 'par facture HT', 'var(--primary)'),
      kpiCard('CA encaissé', fmt.money(kpis.encaisse_ttc), periodeLabel(periode), '#22c55e'),
      kpiCard('En attente', fmt.money(kpis.attente_ttc), `${kpis.attente_nb} facture(s) émise(s)`, '#f59e0b'),
      kpiCard('En retard', fmt.money(kpis.retard_ttc), `${kpis.retard_nb} facture(s) échue(s)`, kpis.retard_nb > 0 ? '#ef4444' : '#22c55e'),
      kpiCard(`Conversion devis <span class="help-icon" style="text-transform:none" data-tooltip="${helpTexts.stats_conversion.replace(/"/g,'&quot;')}">?</span>`, `${tauxConv} %`, `Délai moyen : ${kpis.delai_moyen_acceptation}j`, 'var(--primary)'),
    ].join('');

    // ── Pipeline commercial ─────────────────────────────────────────────────
    const pipelineHtml = pipeline.map((s, i) => {
      const colors = ['#64748b','#3b82f6','#22c55e','#8b5cf6'];
      const arrow = i < pipeline.length - 1 ? `<span style="color:#d1d5db;font-size:20px;align-self:center">›</span>` : '';
      return `<div style="text-align:center;flex:1">
        <div style="font-size:22px;font-weight:700;color:${colors[i]}">${s.nb}</div>
        <div style="font-size:11px;font-weight:600;color:${colors[i]};margin:2px 0">${s.etape}</div>
        ${s.ttc != null ? `<div style="font-size:10px;color:var(--text-muted)">${fmt.money(s.ttc)}</div>` : ''}
      </div>${arrow}`;
    }).join('');

    // ── Top clients ─────────────────────────────────────────────────────────
    const maxCA = Math.max(...topClients.map(c => c.ca_ht), 1);
    const topHtml = topClients.length ? topClients.map((c, i) => {
      const risk = c.part_pct >= 30;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span>${i + 1}. <strong>${c.client_nom}</strong> <span style="color:var(--text-muted)">(${c.nb_factures} fact.)</span></span>
          <span><strong>${fmt.money(c.ca_ht)}</strong>
            <span style="margin-left:6px;font-weight:700;color:${risk ? '#ef4444' : '#64748b'}">${c.part_pct} %</span>
          </span>
        </div>
        <div style="height:6px;border-radius:3px;background:var(--border)">
          <div style="height:100%;border-radius:3px;width:${Math.round(c.ca_ht/maxCA*100)}%;background:${risk ? '#ef4444' : 'var(--primary)'}"></div>
        </div>
      </div>`;
    }).join('') : '<p style="color:var(--text-muted);font-size:13px">Aucune facture cette année</p>';

    // ── Balance âgée ────────────────────────────────────────────────────────
    const balanceSummary = balance.summary.map((t, i) => {
      const colors = ['#22c55e','#f59e0b','#f97316','#ef4444','#dc2626'];
      return t.nb ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="color:${colors[i]};font-weight:600">${t.label}</span>
        <span><strong>${fmt.money(t.montant)}</strong> <span style="color:var(--text-muted);font-size:12px">(${t.nb})</span></span>
      </div>` : '';
    }).join('');

    const balanceRows = balance.rows.map(r => {
      const color = r.retard_jours <= 0 ? '#22c55e' : r.retard_jours <= 30 ? '#f59e0b' : r.retard_jours <= 60 ? '#f97316' : '#ef4444';
      const retardLabel = r.retard_jours <= 0 ? (r.date_echeance ? 'À venir' : 'Sans échéance') : `${r.retard_jours}j de retard`;
      return `<tr>
        <td><strong>${r.numero}</strong></td><td>${r.client_nom || '—'}</td>
        <td style="text-align:right">${fmt.money(r.montant_ttc)}</td>
        <td>${r.date_echeance ? fmt.date(r.date_echeance) : '—'}</td>
        <td><span style="color:${color};font-weight:600;font-size:12px">${retardLabel}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Aucune créance en attente</td></tr>';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0">Statistiques</h2>
        <div style="display:flex;gap:6px">${periodes}</div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${kpiRow}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        ${card(`Pipeline commercial <span class="help-icon" data-tooltip="${helpTexts.stats_pipeline.replace(/"/g,'&quot;')}">?</span>`, `<div style="display:flex;gap:4px;align-items:stretch">${pipelineHtml}</div>`)}
        ${card(`Balance âgée <span class="help-icon" data-tooltip="${helpTexts.stats_balance_agee.replace(/"/g,'&quot;')}">?</span>`, balanceSummary || '<p style="color:var(--text-muted);font-size:13px">Aucune créance ouverte</p>')}
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
        ${card(`Évolution CA (12 mois) <span style="font-size:11px;font-weight:400;color:var(--text-muted)"><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin:0 4px 0 10px"></span>Facturé HT <span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin:0 4px 0 8px"></span>Encaissé HT</span>`, svgBar(evolution))}
        ${card(`Top clients — ${new Date().getFullYear()} <span style="font-size:11px;font-weight:400;color:#ef4444">  ⚠ ≥ 30 %</span> <span class="help-icon" data-tooltip="${helpTexts.stats_top_clients_risque.replace(/"/g,'&quot;')}">?</span>`, topHtml)}
      </div>

      ${card(`Détail des créances (${balance.rows.length})`, `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>N°</th><th>Client</th><th style="text-align:right">Montant TTC</th><th>Échéance</th><th>Statut</th></tr></thead>
        <tbody>${balanceRows}</tbody>
      </table></div>`)}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        ${card(`DSO : ${treso.dso_jours}j <span style="font-weight:400;font-size:12px;color:var(--text-muted)">— délai moyen de paiement</span> <span class="help-icon" data-tooltip="${helpTexts.stats_dso.replace(/"/g,'&quot;')}">?</span> — Prévisions 90j <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(${treso.previsions.length} facture(s))</span>`, (() => {
          if (!treso.previsions.length) return '<p style="color:var(--text-muted);font-size:13px">Aucune échéance dans les 90 prochains jours</p>';
          const groupes = {};
          treso.previsions.forEach(p => {
            const d = new Date(p.echeance), now = new Date();
            let label;
            const diff = Math.ceil((d - now) / 864e5);
            if (diff < 0) label = 'En retard';
            else if (diff <= 7) label = 'Cette semaine';
            else if (diff <= 14) label = 'Semaine prochaine';
            else if (diff <= 30) label = 'Dans 30 jours';
            else label = 'Dans 90 jours';
            if (!groupes[label]) groupes[label] = { total: 0, nb: 0 };
            groupes[label].total += p.montant_ttc; groupes[label].nb++;
          });
          const ordre = ['En retard','Cette semaine','Semaine prochaine','Dans 30 jours','Dans 90 jours'];
          const colors = { 'En retard': '#ef4444', 'Cette semaine': '#f97316', 'Semaine prochaine': '#f59e0b', 'Dans 30 jours': '#3b82f6', 'Dans 90 jours': '#94a3b8' };
          return ordre.filter(k => groupes[k]).map(k =>
            `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="color:${colors[k]};font-weight:600">${k}</span>
              <span><strong>${fmt.money(groupes[k].total)}</strong> <span style="color:var(--text-muted);font-size:12px">(${groupes[k].nb})</span></span>
            </div>`).join('');
        })())}

        ${card('Comparaison N vs N-1 ' + `<span style="font-size:11px;font-weight:400;color:var(--text-muted)"><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin:0 4px 0 8px"></span>${new Date().getFullYear()} <span style="display:inline-block;width:10px;height:10px;background:#94a3b8;border-radius:2px;margin:0 4px 0 8px"></span>${new Date().getFullYear()-1}</span>`,
          svgBarDouble(comparaison, 'ca_n', 'ca_n1', '#3b82f6', '#94a3b8', String(new Date().getFullYear()), String(new Date().getFullYear()-1))
        )}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        ${card(`Top articles — ${new Date().getFullYear()}`, (() => {
          if (!topArt.length) return '<p style="color:var(--text-muted);font-size:13px">Aucune facture cette année</p>';
          const maxHT = Math.max(...topArt.map(a => a.total_ht), 1);
          return topArt.map((a, i) => `<div style="margin-bottom:9px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span>${i+1}. <strong>${a.designation}</strong> <span style="color:var(--text-muted)">${a.total_qte} unités</span></span>
              <strong>${fmt.money(a.total_ht)}</strong>
            </div>
            <div style="height:5px;border-radius:3px;background:var(--border)">
              <div style="height:100%;border-radius:3px;width:${Math.round(a.total_ht/maxHT*100)}%;background:var(--primary)"></div>
            </div>
          </div>`).join('');
        })())}

        ${card(`Marge du catalogue (articles avec prix achat) <span class="help-icon" data-tooltip="${helpTexts.stats_marge_catalogue.replace(/"/g,'&quot;')}">?</span>`, (() => {
          if (!marge.length) return '<p style="color:var(--text-muted);font-size:13px">Aucun article avec prix d\'achat renseigné</p>';
          return `<table class="data-table" style="font-size:12px"><thead><tr><th>Article</th><th style="text-align:right">P.V. HT</th><th style="text-align:right">P.A. HT</th><th style="text-align:right">Taux marque</th></tr></thead><tbody>${
            marge.map(m => {
              const color = m.taux_marque < 20 ? '#ef4444' : m.taux_marque < 40 ? '#f59e0b' : '#22c55e';
              return `<tr><td>${m.designation}</td><td style="text-align:right">${fmt.money(m.prix_vente)}</td><td style="text-align:right">${fmt.money(m.prix_achat)}</td><td style="text-align:right;color:${color};font-weight:700">${m.taux_marque} %</td></tr>`;
            }).join('')
          }</tbody></table>`;
        })())}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;margin-bottom:8px">
        ${card(`Répartition par mode de règlement — ${new Date().getFullYear()}`, (() => {
          const total = repartitions.reglement.reduce((s, r) => s + r.ca_ht, 0);
          const modeLabels = { virement:'Virement bancaire', virement_sepa:'Virement SEPA', cheque:'Chèque', especes:'Espèces', carte:'Carte bancaire', prelevement:'Prélèvement', prelevement_sepa:'Prélèvement SEPA', paypal:'PayPal', autre:'Autre', non_precise:'Non précisé' };
          return svgDonut(repartitions.reglement.map(r => ({ label: modeLabels[r.mode]||r.mode, val: r.ca_ht })), total);
        })())}

        ${card(`Répartition TVA — ${new Date().getFullYear()}`, (() => {
          const totalHT = repartitions.tva.reduce((s, r) => s + r.base_ht, 0);
          const rows = repartitions.tva.map(r => {
            const pct = totalHT > 0 ? Math.round(r.base_ht / totalHT * 100) : 0;
            return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
              <span><strong>TVA ${r.taux} %</strong></span>
              <span style="text-align:right">Base : ${fmt.money(r.base_ht)} <span style="color:var(--text-muted);font-size:11px">(${pct}%)</span><br><span style="font-size:11px;color:var(--text-muted)">TVA : ${fmt.money(r.tva)}</span></span>
            </div>`;
          }).join('') || '<p style="color:var(--text-muted);font-size:13px">Aucune donnée</p>';
          const totalTVA = repartitions.tva.reduce((s, r) => s + r.tva, 0);
          return rows + (totalHT ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700"><span>Total</span><span>${fmt.money(totalHT)} HT — TVA ${fmt.money(totalTVA)}</span></div>` : '');
        })())}
      </div>

      ${statsFourn ? `
      <h2 style="margin:24px 0 12px;font-size:16px;color:var(--primary)">Achats fournisseurs</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        ${[
          ['Total achats HT', fmt.money(statsFourn.total_ht), `${statsFourn.nb} facture${statsFourn.nb>1?'s':''}`],
          ['TVA déductible', fmt.money(statsFourn.total_tva), 'Section B CA3'],
          ['À payer', `<span style="color:${statsFourn.a_payer>0?'var(--danger)':'var(--success)'}">` + fmt.money(statsFourn.a_payer) + '</span>', `${statsFourn.nb_a_payer} facture${statsFourn.nb_a_payer>1?'s':''}`],
        ].map(([title, val, sub]) => `<div class="card" style="padding:16px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${title}</div>
          <div style="font-size:22px;font-weight:700;margin:4px 0">${val}</div>
          <div style="font-size:12px;color:var(--text-muted)">${sub}</div>
        </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${card('Top 5 fournisseurs', (() => {
          if (!statsFourn.top_fournisseurs?.length) return '<p style="color:var(--text-muted);font-size:13px">Aucune facture fournisseur</p>';
          const maxHT = Math.max(...statsFourn.top_fournisseurs.map(f => f.total_ht), 1);
          return statsFourn.top_fournisseurs.map((f, i) => `
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span>${i+1}. <strong>${f.nom}</strong> <span style="color:var(--text-muted)">${f.nb} fact.</span></span>
                <strong>${fmt.money(f.total_ht)}</strong>
              </div>
              <div style="height:5px;border-radius:3px;background:var(--border)">
                <div style="height:100%;border-radius:3px;width:${Math.round(f.total_ht/maxHT*100)}%;background:#f59e0b"></div>
              </div>
            </div>`).join('');
        })())}
        ${card('Achats mensuels (12 mois)', (() => {
          if (!statsFourn.mensuel?.length) return '<p style="color:var(--text-muted);font-size:13px">Aucune donnée</p>';
          const maxHT = Math.max(...statsFourn.mensuel.map(m => m.ht), 1);
          const W = 320, H = 120, pad = 8;
          const n = statsFourn.mensuel.length;
          const barW = Math.floor((W - pad * 2) / n) - 2;
          const bars = statsFourn.mensuel.map((m, i) => {
            const h = Math.round((m.ht / maxHT) * (H - 24));
            const x = pad + i * ((W - pad*2) / n);
            return `<rect x="${x}" y="${H - h - 16}" width="${barW}" height="${h}" fill="#f59e0b" rx="2"/>
              <text x="${x + barW/2}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#999">${m.mois.slice(5)}</text>`;
          }).join('');
          return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:120px">${bars}</svg>`;
        })())}
      </div>` : ''}
      `;
  }

  window.statsPeriode = async (p) => { periode = p; await load(); };
  await load();
}

async function renderDashboard(el) {
  const [devisList, facturesList, avoirsList, acomptesList, blList] = await Promise.all([
    api.get('/api/devis?all=1'),
    api.get('/api/factures?all=1'),
    api.get('/api/factures/avoirs/liste?all=1'),
    api.get('/api/acomptes?all=1'),
    api.get('/api/bons-livraison?all=1'),
  ]);

  const caTotal        = facturesList.filter(f => f.statut === 'payee').reduce((s, f) => s + (f.montant_ttc || 0), 0);
  const devisEnCours   = devisList.filter(d => ['brouillon','envoye','accepte'].includes(d.statut)).length;
  const facturesEmises = facturesList.filter(f => f.statut === 'emise').length;
  const acomptesAttente = acomptesList.filter(a => a.statut === 'en_attente').length;

  // Fusion et tri chronologique
  const typeLabels = { devis:'DEVIS', facture:'FACTURE', avoir:'AVOIR', acompte:'ACOMPTE', bl:'BL' };
  const typeViews  = { devis:'devis', facture:'factures', avoir:'avoirs', acompte:'acomptes', bl:'bons-livraison' };

  const all = [
    ...devisList.map(d => ({ type:'devis',   doc:d, date: d.created_at, client: d.client_nom||d.client_nom_part||'', montant: d.montant_ttc })),
    ...facturesList.map(f => ({ type:'facture', doc:f, date: f.created_at, client: f.client_nom||f.client_nom_part||'', montant: f.montant_ttc })),
    ...avoirsList.map(a => ({ type:'avoir',   doc:a, date: a.created_at, client: a.client_nom||a.client_nom_part||'', montant: a.montant_ttc })),
    ...acomptesList.map(a => ({ type:'acompte', doc:a, date: a.created_at, client: a.client_nom||a.client_nom_part||'', montant: a.montant_ttc })),
    ...blList.map(b => ({ type:'bl',      doc:b, date: b.created_at, client: b.client_nom||b.client_nom_part||'', montant: null })),
  ];

  function sortAll(list) {
    const { col, dir } = _dashSort;
    return [...list].sort((a, b) => {
      let va, vb;
      if      (col === 'type')    { va = a.type;              vb = b.type; }
      else if (col === 'client')  { va = a.client||'';        vb = b.client||''; }
      else if (col === 'montant') { va = a.montant??-1;       vb = b.montant??-1; }
      else if (col === 'statut')  { va = a.doc.statut||'';    vb = b.doc.statut||''; }
      else                        { va = a.date||'';          vb = b.date||''; }
      if (va < vb) return -dir;
      if (va > vb) return  dir;
      return 0;
    });
  }


  el.innerHTML = `
    <div class="grid-4">
      <div class="card stat-green">
        <div class="card-title">CA encaissé</div>
        <div class="card-value">${fmt.money(caTotal)}</div>
        <div class="card-sub">Factures payées</div>
      </div>
      <div class="card stat-blue">
        <div class="card-title">Devis en cours</div>
        <div class="card-value">${devisEnCours}</div>
        <div class="card-sub">Brouillons + envoyés</div>
      </div>
      <div class="card stat-orange">
        <div class="card-title">Factures émises</div>
        <div class="card-value">${facturesEmises}</div>
        <div class="card-sub">En attente de paiement</div>
      </div>
      <div class="card stat-red">
        <div class="card-title">Acomptes en attente</div>
        <div class="card-value">${acomptesAttente}</div>
        <div class="card-sub">À encaisser</div>
      </div>
    </div>
    <div class="card" id="dashDocCard">
      <div class="section-header"><h2>Tous les documents</h2></div>
      <div class="table-wrap">
        ${all.length ? `<table id="dashTable">
          <thead><tr>
            <th class="dash-th" data-col="type">Type</th>
            <th>N°</th>
            <th class="dash-th" data-col="client">Client</th>
            <th class="dash-th text-right" data-col="montant">Montant TTC</th>
            <th class="dash-th" data-col="statut">Statut</th>
            <th class="dash-th" data-col="date">Date</th>
          </tr></thead>
          <tbody id="dashTbody"></tbody>
        </table>` : '<div class="empty">Aucun document</div>'}
      </div>
    </div>`;

  // Fonction de rendu du tbody (réutilisée après chaque tri)
  // Mapping type dashboard → clé DOC_CONFIGS
  const DASH_TO_CFG = { devis:'devis', facture:'factures', avoir:'avoirs', acompte:'acomptes', bl:'bons-livraison' };

  function renderDashRows(list) {
    const sorted = sortAll(list);
    const tbody  = document.getElementById('dashTbody');
    if (!tbody) return;
    tbody.innerHTML = sorted.map(({ type, doc, date, client, montant }) => {
      const label   = typeLabels[type];
      const cfg     = DOC_CONFIGS[DASH_TO_CFG[type]];
      const onClick = cfg ? cfg.rowOpen(doc) : '';
      const btns    = cfg ? cfg.actions(doc).filter(Boolean).join('') : '';
      return `
        <tr class="data-row" onclick="${onClick}" style="cursor:pointer">
          <td><span class="badge badge-type-${type}">${label}</span></td>
          <td><strong>${doc.numero || '—'}</strong></td>
          <td>${client || '—'}</td>
          <td class="text-right">${montant != null ? fmt.money(montant) : '—'}</td>
          <td>${fmt.badge(doc.statut)}</td>
          <td>${fmt.date(date)}</td>
        </tr>
        <tr class="row-actions"><td colspan="6"><div class="btn-row">${btns}</div></td></tr>`;
    }).join('');

    // Mettre à jour les indicateurs de tri
    document.querySelectorAll('.dash-th').forEach(th => {
      const col = th.dataset.col;
      th.innerHTML = th.textContent.replace(/ [▲▼]$/, '');
      if (col === _dashSort.col) th.innerHTML += _dashSort.dir > 0 ? ' ▲' : ' ▼';
    });
  }

  if (all.length) {
    renderDashRows(all);

    // Brancher les clics de tri
    document.querySelectorAll('.dash-th').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        _dashSort = { col, dir: _dashSort.col === col ? -_dashSort.dir : -1 };
        renderDashRows(all);
      });
    });
  }
}

function navigate(view) {
  tabMgr.openViewTab(view);
}

