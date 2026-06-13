async function renderArticles(el) {
  _articlesData = await api.get('/api/articles');
  _articlesSortCol = null;
  _articlesSortDir = 1;
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="showArticleForm()">+ Nouvel article</button>
    <button class="btn btn-outline" onclick="exportCSV('/api/articles/export','articles')">⬇ Exporter CSV</button>
    <label class="btn btn-outline" style="cursor:pointer;margin:0;text-transform:none">⬆ Importer CSV
      <input type="file" accept=".csv" style="display:none" onchange="importCSV('/api/articles/import',this,()=>renderArticles(el))">
    </label>`;

  el.innerHTML = `
    <div style="margin-bottom:10px">
      <input id="articleSearch" type="search" placeholder="Rechercher par référence ou désignation…"
        style="width:100%;max-width:420px;padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px"
        oninput="_renderArticlesTable()">
    </div>
    <div class="card"><div class="table-wrap">
      <table id="articlesTable">
        <thead><tr>
          <th data-sort="reference" style="cursor:pointer;user-select:none">Réf. <span class="sort-ind"></span></th>
          <th data-sort="designation" style="cursor:pointer;user-select:none">Désignation <span class="sort-ind"></span></th>
          <th>Description</th>
          <th data-sort="unite" style="cursor:pointer;user-select:none">Unité <span class="sort-ind"></span></th>
          <th data-sort="prix_unitaire_ht" class="text-right" style="cursor:pointer;user-select:none">Prix vente HT <span class="sort-ind"></span></th>
          <th data-sort="prix_achat_ht" class="text-right" style="cursor:pointer;user-select:none">Prix achat HT <span class="sort-ind"></span></th>
          <th data-sort="_marge" class="text-right" style="cursor:pointer;user-select:none">Marge <span class="sort-ind"></span></th>
          <th data-sort="tva_taux" style="cursor:pointer;user-select:none">TVA <span class="sort-ind"></span></th>
          <th data-sort="quantite_stock" class="text-right" style="cursor:pointer;user-select:none">Stock <span class="sort-ind"></span></th>
          <th></th>
        </tr></thead>
        <tbody id="articlesTableBody"></tbody>
      </table>
    </div></div>`;

  el.querySelector('#articlesTable thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (_articlesSortCol === col) _articlesSortDir *= -1;
    else { _articlesSortCol = col; _articlesSortDir = 1; }
    _renderArticlesTable();
  });

  _renderArticlesTable();
}

function _renderArticlesTable() {
  const q = (document.getElementById('articleSearch')?.value || '').toLowerCase().trim();
  let rows = _articlesData.filter(a =>
    !q ||
    (a.reference || '').toLowerCase().includes(q) ||
    (a.designation || '').toLowerCase().includes(q) ||
    (a.description || '').toLowerCase().includes(q)
  );

  if (_articlesSortCol) {
    rows = [...rows].sort((a, b) => {
      let va, vb;
      if (_articlesSortCol === '_marge') {
        va = (a.prix_achat_ht != null) ? (+a.prix_unitaire_ht - +a.prix_achat_ht) : -Infinity;
        vb = (b.prix_achat_ht != null) ? (+b.prix_unitaire_ht - +b.prix_achat_ht) : -Infinity;
      } else {
        va = a[_articlesSortCol] ?? '';
        vb = b[_articlesSortCol] ?? '';
      }
      if (va < vb) return -_articlesSortDir;
      if (va > vb) return  _articlesSortDir;
      return 0;
    });
  }

  // Mettre à jour les indicateurs de tri dans les en-têtes
  document.querySelectorAll('#articlesTable thead th[data-sort]').forEach(th => {
    const ind = th.querySelector('.sort-ind');
    if (!ind) return;
    if (th.dataset.sort === _articlesSortCol) ind.textContent = _articlesSortDir > 0 ? ' ▲' : ' ▼';
    else ind.textContent = '';
  });

  const tbody = document.getElementById('articlesTableBody');
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(a => {
    const pv = +a.prix_unitaire_ht || 0;
    const pa = a.prix_achat_ht != null ? +a.prix_achat_ht : null;
    const marge = pa != null ? pv - pa : null;
    const tauxMarque = (marge != null && pv > 0) ? (marge / pv * 100) : null;
    const margeHtml = marge != null
      ? `<span style="color:${marge >= 0 ? 'var(--success)' : 'var(--danger)'}">
           ${fmt.money(marge)} <small>(${tauxMarque.toFixed(1)}%)</small>
         </span>`
      : '—';
    return `<tr>
      <td><code>${a.reference || '—'}</code></td>
      <td><strong style="cursor:pointer;color:var(--primary)" onclick="showArticleFiche(${a.id})">${a.designation}</strong></td>
      <td style="color:var(--text-muted);font-size:12px">${a.description || '—'}</td>
      <td>${a.unite || '—'}</td>
      <td class="text-right">${fmt.money(pv)}</td>
      <td class="text-right">${pa != null ? fmt.money(pa) : '—'}</td>
      <td class="text-right">${margeHtml}</td>
      <td>${a.tva_taux}%</td>
      <td class="text-right">${a.quantite_stock != null ? `<span class="e-stock-badge">${a.quantite_stock}</span>` : '—'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-outline btn-sm" onclick="showArticleFiche(${a.id})">Fiche</button>
          <button class="btn btn-outline btn-sm" onclick="showArticleForm(${a.id})">Éditer</button>
          <button class="btn-trash" onclick="deleteArticle(${a.id})" title="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="empty">Aucun article</td></tr>';
}

async function showArticleFiche(id) {
  const [art, stats] = await Promise.all([
    api.get(`/api/articles/${id}`),
    api.get(`/api/articles/${id}/stats`),
  ]);

  const pv = +art.prix_unitaire_ht || 0;
  const pa = art.prix_achat_ht != null ? +art.prix_achat_ht : null;
  const marge = pa != null ? pv - pa : null;
  const tauxMarque = (marge != null && pv > 0) ? (marge / pv * 100).toFixed(1) : null;
  const tauxMarge  = (marge != null && pa > 0)  ? (marge / pa * 100).toFixed(1) : null;

  const kpiBox = (label, val, sub) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:130px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${label}</div>
      <div style="font-size:20px;font-weight:700">${val}</div>
      ${sub ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const docRow = d => {
    const badge = fmt.badge(d.statut);
    const date  = fmt.date(d.date_doc);
    const open  = d.type === 'devis'
      ? `modal.hide();DocEditor.openDevis(${d.id})`
      : `modal.hide();DocEditor.openFacture(${d.id})`;
    return `<tr style="cursor:pointer" onclick="${open}">
      <td>${badge}</td>
      <td><strong>${d.numero}</strong></td>
      <td>${d.client || '—'}</td>
      <td style="color:var(--text-muted)">${date}</td>
    </tr>`;
  };

  const html = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      ${kpiBox('Devis', stats.nb_devis, 'documents')}
      ${kpiBox('Factures', stats.nb_factures, 'émises / payées')}
      ${kpiBox('Qté vendue', stats.qte_vendue % 1 === 0 ? stats.qte_vendue : stats.qte_vendue.toFixed(2), art.unite || '')}
      ${kpiBox('CA HT généré', fmt.money(stats.ca_ht), '')}
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;flex-wrap:wrap">
      <span>Prix vente HT : <strong>${fmt.money(pv)}</strong></span>
      ${pa != null ? `<span>Prix achat HT : <strong>${fmt.money(pa)}</strong></span>` : ''}
      ${marge != null ? `<span>Marge : <strong style="color:${marge>=0?'var(--success)':'var(--danger)'}">${fmt.money(marge)}</strong> (marque ${tauxMarque}%, marge ${tauxMarge}%)</span>` : ''}
      <span>TVA : <strong>${art.tva_taux}%</strong></span>
      ${art.quantite_stock != null ? `<span>Stock : <strong>${art.quantite_stock}</strong></span>` : ''}
      ${stats.derniere_utilisation ? `<span>Dernière utilisation : <strong>${fmt.date(stats.derniere_utilisation)}</strong></span>` : ''}
    </div>
    ${stats.documents.length ? `
    <div style="font-weight:600;margin-bottom:8px">Documents récents</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Statut</th><th>N°</th><th>Client</th><th>Date</th></tr></thead>
      <tbody>${stats.documents.map(docRow).join('')}</tbody>
    </table></div>` : '<p style="color:var(--text-muted);font-size:13px">Cet article n\'a pas encore été utilisé dans un document.</p>'}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="modal.hide();showArticleForm(${id})">Éditer l'article</button>
      <button class="btn btn-outline" onclick="modal.hide()">Fermer</button>
    </div>`;

  modal.show(art.designation + (art.reference ? ' <small style="font-weight:normal;color:var(--text-muted)">[' + art.reference + ']</small>' : ''), html);
}

async function showArticleForm(id) {
  const a = id ? await api.get(`/api/articles/${id}`) : {};
  const tvaOpts = tvaOptions.map(t =>
    `<option value="${t.id}" ${t.id == (a.taux_tva_id ?? 1) ? 'selected' : ''}>${t.libelle}</option>`).join('');

  const unites = ['heure','jour','demi-journée','semaine','mois','pièce','unité','forfait','lot','m²','m³','m','km','kg','L','tonne'];
  const uniteVal = a.unite || '';
  const uniteIsCustom = uniteVal && !unites.includes(uniteVal);
  const html = `
    <form id="articleForm">
      <div class="form-row">
        <div class="form-group"><label>Référence</label>
          <input name="reference" value="${a.reference || ''}" placeholder="ART-001"/>
        </div>
        <div class="form-group"><label>Stock disponible</label>
          <input name="quantite_stock" type="number" step="0.001" min="0"
            value="${a.quantite_stock ?? ''}" placeholder="Laisser vide si non géré"/>
        </div>
      </div>
      <div class="form-group"><label>Désignation *</label>
        <input name="designation" value="${a.designation || ''}" required/>
      </div>
      <div class="form-group"><label>Description</label>
        <textarea name="description">${a.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Prix unitaire HT *</label>
          <input name="prix_unitaire_ht" id="artPrixVente" type="number" step="0.01" min="0"
            value="${a.prix_unitaire_ht ?? ''}" required/>
        </div>
        <div class="form-group"><label>Prix d'achat HT
          <small style="font-weight:normal;color:var(--text-muted)"> — optionnel, pour le calcul de marge</small>
        </label>
          <input name="prix_achat_ht" id="artPrixAchat" type="number" step="0.01" min="0"
            value="${a.prix_achat_ht ?? ''}"/>
        </div>
      </div>
      <div id="artMargeInfo" style="display:none;padding:8px 12px;border-radius:6px;margin-bottom:8px;font-size:13px"></div>
      <div class="form-row">
        <div class="form-group"><label>Taux TVA *</label>
          <select name="taux_tva_id">${tvaOpts}</select>
        </div>
      </div>
      <div class="form-group"><label>Unité de facturation
        <small style="font-weight:normal;color:var(--text-muted)"> — affiché après la quantité sur les documents</small>
      </label>
        <select name="unite" id="articleUniteSelect">
          <option value="">— Non précisé —</option>
          ${unites.map(u => `<option value="${u}" ${uniteVal===u?'selected':''}>${u.charAt(0).toUpperCase()+u.slice(1)}</option>`).join('')}
          <option value="__autre__" ${uniteIsCustom?'selected':''}>Autre…</option>
        </select>
        <input name="unite_custom" id="articleUniteCustom" value="${uniteIsCustom ? uniteVal : ''}"
          placeholder="Saisir l'unité…" style="margin-top:6px;display:${uniteIsCustom?'block':'none'}"/>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`;

  modal.show(id ? 'Modifier l\'article' : 'Nouvel article', html, body => {
    const sel    = body.querySelector('#articleUniteSelect');
    const custom = body.querySelector('#articleUniteCustom');
    sel.addEventListener('change', () => {
      custom.style.display = sel.value === '__autre__' ? 'block' : 'none';
      if (sel.value === '__autre__') custom.focus();
    });

    // Calcul de marge en temps réel
    const pvInput = body.querySelector('#artPrixVente');
    const paInput = body.querySelector('#artPrixAchat');
    const margeEl = body.querySelector('#artMargeInfo');
    function updateMarge() {
      const pv = parseFloat(pvInput.value) || 0;
      const pa = parseFloat(paInput.value);
      if (!paInput.value || isNaN(pa) || pv === 0) { margeEl.style.display = 'none'; return; }
      const marge = pv - pa;
      const tauxMarque = marge / pv * 100;
      const tauxMarge  = pa > 0 ? marge / pa * 100 : 0;
      const color = marge >= 0 ? '#2e7d32' : '#c62828';
      const bg    = marge >= 0 ? '#e8f5e9' : '#ffebee';
      margeEl.style.display = 'block';
      margeEl.style.background = bg;
      margeEl.style.color = color;
      margeEl.innerHTML = `
        Marge brute : <strong>${marge.toFixed(2)} €</strong>
        &nbsp;·&nbsp; Taux de marque : <strong>${tauxMarque.toFixed(1)} %</strong>
        &nbsp;·&nbsp; Taux de marge : <strong>${tauxMarge.toFixed(1)} %</strong>`;
    }
    pvInput.addEventListener('input', updateMarge);
    paInput.addEventListener('input', updateMarge);
    updateMarge();

    body.querySelector('#articleForm').onsubmit = async e => {
      e.preventDefault();
      const fd    = new FormData(e.target);
      const unite = sel.value === '__autre__'
        ? (custom.value.trim() || undefined)
        : (sel.value || undefined);
      const stock = fd.get('quantite_stock');
      const achat = fd.get('prix_achat_ht');
      const data = {
        reference:        fd.get('reference') || undefined,
        designation:      fd.get('designation'),
        description:      fd.get('description') || undefined,
        unite,
        prix_unitaire_ht: parseFloat(fd.get('prix_unitaire_ht') || '0'),
        prix_achat_ht:    achat ? parseFloat(achat) : null,
        taux_tva_id:      parseInt(fd.get('taux_tva_id') || '1'),
        quantite_stock:   stock ? parseFloat(stock) : null,
      };
      if (id) await api.put(`/api/articles/${id}`, data);
      else    await api.post('/api/articles', data);
      modal.hide();
      tabMgr.openViewTab('articles');
    };
  });
}

async function deleteArticle(id) {
  if (!confirm('Supprimer cet article du catalogue ?')) return;
  await api.delete(`/api/articles/${id}`);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('articles');
}

// ── Autocomplete articles dans les lignes ────────────────────────────────
function attachArticleAutocomplete(desInput, puInput, tvaSelect, uniteInput) {
  let dropdown = null;
  let timer    = null;

  desInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = desInput.value.trim();
    if (q.length < 2) { removeAc(); return; }
    timer = setTimeout(async () => {
      const results = await api.get(`/api/articles/search?q=${encodeURIComponent(q)}`);
      showAc(results || [], q);
    }, 200);
  });

  desInput.addEventListener('blur', () => setTimeout(removeAc, 200));
  desInput.addEventListener('keydown', e => { if (e.key === 'Escape') removeAc(); });
  // Fermer si on clique ailleurs ou si on change d'onglet/vue
  document.addEventListener('click', e => { if (dropdown && !dropdown.contains(e.target) && e.target !== desInput) removeAc(); }, true);
  document.addEventListener('visibilitychange', removeAc);

  function showAc(items, q) {
    removeAc();
    dropdown = document.createElement('div');
    dropdown.className = 'ac-list';
    const rect = desInput.getBoundingClientRect();
    dropdown.style.top   = `${rect.bottom + window.scrollY + 2}px`;
    dropdown.style.left  = `${rect.left + window.scrollX}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    dropdown.style.position = 'fixed';

    items.forEach(a => {
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML =
        `<strong>${a.designation}</strong>${a.reference ? ` <small>[${a.reference}]</small>` : ''}<br/>` +
        `<small>${fmt.money(a.prix_unitaire_ht)} HT &middot; TVA ${a.tva_taux}%${a.unite ? ' &middot; ' + a.unite : ''}</small>`;
      div.onmousedown = () => {
        desInput.value = a.designation;
        if (puInput)    { puInput.value    = a.prix_unitaire_ht; puInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (tvaSelect)  { tvaSelect.value  = a.taux_tva_id;     tvaSelect.dispatchEvent(new Event('input', { bubbles: true })); }
        if (uniteInput) uniteInput.value = a.unite || '';
        removeAc();
        desInput.dispatchEvent(new CustomEvent('article-selected', { detail: a, bubbles: true }));
        (puInput || uniteInput) && (puInput || uniteInput).focus();
      };
      dropdown.appendChild(div);
    });

    // Option "Créer un article"
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid var(--border);margin:4px 0';
    dropdown.appendChild(sep);
    const create = document.createElement('div');
    create.className = 'ac-item';
    create.style.color = 'var(--primary)';
    create.innerHTML = `<strong>+ Créer "${q}"</strong>`;
    create.onmousedown = () => {
      removeAc();
      openQuickArticleCreate(q, desInput, puInput, tvaSelect, uniteInput);
    };
    dropdown.appendChild(create);

    document.body.appendChild(dropdown);
  }

  function removeAc() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }
}

function openQuickArticleCreate(designation, desInput, puInput, tvaSelect, uniteInput) {
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');
  const html = `
    <form id="quickArticleForm">
      <div class="form-group"><label>Désignation *</label>
        <input name="designation" value="${designation}" required/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Référence</label>
          <input name="reference" placeholder="ART-001"/>
        </div>
        <div class="form-group"><label>Unité</label>
          <input name="unite" placeholder="h, j, pièce, forfait…"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Prix unitaire HT *</label>
          <input name="prix_unitaire_ht" type="number" step="0.01" min="0" required/>
        </div>
        <div class="form-group"><label>Taux TVA *</label>
          <select name="taux_tva_id">${tvaOpts}</select>
        </div>
      </div>
      <div class="form-group"><label>Description</label>
        <textarea name="description" rows="2"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal2.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer l'article</button>
      </div>
    </form>`;

  modal2.show('Nouvel article', html, body => {
    body.querySelector('#quickArticleForm').onsubmit = async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = {
        designation:      fd.get('designation'),
        reference:        fd.get('reference') || undefined,
        description:      fd.get('description') || undefined,
        unite:            fd.get('unite') || undefined,
        prix_unitaire_ht: parseFloat(fd.get('prix_unitaire_ht') || '0'),
        taux_tva_id:      parseInt(fd.get('taux_tva_id') || '1'),
      };
      const article = await api.post('/api/articles', data);
      if (article?.error) { alert(article.error); return; }
      if (desInput)  desInput.value    = article.designation;
      if (puInput)   puInput.value     = article.prix_unitaire_ht;
      if (tvaSelect) tvaSelect.value   = article.taux_tva_id;
      if (uniteInput) uniteInput.value = article.unite || '';
      modal2.hide();
    };
  });
}

// ── Autocomplete SIRENE (raison sociale → siret + adresse) ───────────────
function attachSireneAutocomplete(input, formEl) {
  let drop = null, timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { removeDrop(); return; }
    timer = setTimeout(async () => {
      try {
        const res  = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&nombre=6`);
        const data = await res.json();
        if (!data.results?.length) { removeDrop(); return; }
        showDrop(data.results);
      } catch { removeDrop(); }
    }, 350);
  });
  input.addEventListener('blur', () => setTimeout(removeDrop, 200));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') removeDrop(); });

  function showDrop(items) {
    removeDrop();
    drop = document.createElement('div');
    drop.className = 'ac-list';
    const r = input.getBoundingClientRect();
    Object.assign(drop.style, { position:'fixed', top:`${r.bottom+2}px`, left:`${r.left}px`, width:`${Math.max(r.width,320)}px`, zIndex:99999 });
    items.forEach(e => {
      const nom   = e.nom_complet || '';
      const siege = e.siege || {};
      const adresse = siege.adresse || '';
      const cp    = siege.code_postal || '';
      const ville = siege.libelle_commune || '';
      const siret = siege.siret || '';
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `<strong>${nom}</strong><br/><small>${[adresse, cp, ville].filter(Boolean).join(', ')}</small>`;
      div.onmousedown = () => {
        input.value = nom;
        const set = (n, v) => { const el = formEl.querySelector(`[name="${n}"]`); if (el && v) el.value = v; };
        set('siret', siret); set('adresse', adresse); set('code_postal', cp); set('ville', ville);
        removeDrop();
        formEl.querySelector('[name="email"]')?.focus();
      };
      drop.appendChild(div);
    });
    document.body.appendChild(drop);
  }
  function removeDrop() { if (drop) { drop.remove(); drop = null; } }
}

// ── Autocomplete Nominatim / OSM (adresse → CP + ville) ──────────────────
function attachNominatimAutocomplete(input, formEl) {
  let drop = null, timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 4) { removeDrop(); return; }
    timer = setTimeout(async () => {
      try {
        const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=fr&addressdetails=1&limit=5`;
        const res  = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
        const data = await res.json();
        if (!data.length) { removeDrop(); return; }
        showDrop(data);
      } catch { removeDrop(); }
    }, 400);
  });
  input.addEventListener('blur', () => setTimeout(removeDrop, 200));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') removeDrop(); });

  function showDrop(items) {
    removeDrop();
    drop = document.createElement('div');
    drop.className = 'ac-list';
    const r = input.getBoundingClientRect();
    Object.assign(drop.style, { position:'fixed', top:`${r.bottom+2}px`, left:`${r.left}px`, width:`${Math.max(r.width,320)}px`, zIndex:99999 });
    items.forEach(item => {
      const addr  = item.address || {};
      const rue   = [addr.house_number, addr.road].filter(Boolean).join(' ');
      const cp    = addr.postcode || '';
      const ville = addr.city || addr.town || addr.village || addr.municipality || '';
      if (!rue && !cp) return;
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.innerHTML = `<strong>${rue || item.display_name.split(',')[0]}</strong><br/><small>${[cp, ville].filter(Boolean).join(' — ')}</small>`;
      div.onmousedown = () => {
        if (rue) input.value = rue;
        const set = (n, v) => { const el = formEl.querySelector(`[name="${n}"]`); if (el && v) el.value = v; };
        set('code_postal', cp); set('ville', ville);
        removeDrop();
        formEl.querySelector('[name="code_postal"]')?.focus();
      };
      drop.appendChild(div);
    });
    if (!drop.children.length) { drop.remove(); drop = null; return; }
    document.body.appendChild(drop);
  }
  function removeDrop() { if (drop) { drop.remove(); drop = null; } }
}

// ── Conditions de paiement ────────────────────────────────────────────────
const CP_PRESETS = [
  'Paiement à la livraison',
  'Paiement à réception de facture',
  'Paiement à 30 jours',
  'Paiement en 2 fois',
  'Paiement en 3 fois',
  'Paiement en 4 fois',
  'Paiement en 5 fois',
  '50% à la commande, solde à la livraison',
  '30% à la commande, solde à la livraison',
];

function conditionsPaiementHTML(val) {
  val = val || '';
  const isPreset = CP_PRESETS.includes(val);
  const opts = CP_PRESETS.map(p => `<option value="${p}" ${val === p ? 'selected' : ''}>${p}</option>`).join('');
  return `
    <select class="cp-select">
      <option value="">-- Choisir --</option>
      ${opts}
      <option value="__autre__" ${val && !isPreset ? 'selected' : ''}>Autre...</option>
    </select>
    <input name="conditions_paiement" class="cp-text" placeholder="Conditions personnalisées"
      value="${val}" style="margin-top:6px;${val && !isPreset ? '' : 'display:none'}"/>`;
}

function attachConditionsPaiement(container) {
  container.querySelectorAll('.cp-select').forEach(sel => {
    const txt = sel.nextElementSibling;
    if (!txt || !txt.classList.contains('cp-text')) return;
    if (sel.value && sel.value !== '__autre__') txt.value = sel.value;
    sel.onchange = () => {
      if (sel.value === '__autre__') {
        txt.style.display = '';
        txt.value = '';
        txt.focus();
      } else {
        txt.style.display = 'none';
        txt.value = sel.value;
      }
    };
  });
}

// ── Avoirs ────────────────────────────────────────────────────────────────
// ── Acomptes ──────────────────────────────────────────────────────────────
async function envoyerAcompte(id) {
  const [acompte, entreprise] = await Promise.all([
    api.get(`/api/acomptes/${id}`),
    api.get('/api/entreprise'),
  ]);
  const client      = await api.get(`/api/clients/${acompte.client_id}`);
  const emailClient = client?.email || '';
  const modePref = isAndroid ? 'mailto' : (entreprise?.email_mode || 'mapi');

  modal.open('Envoyer la facture d\'acompte', `
    <form id="envoyerAcompteForm">
      <div class="form-group">
        <label>Mode d'envoi</label>
        <select id="envoyerAcompteMode">
          <option value="mapi"   ${modePref === 'mapi'   ? 'selected' : ''}>MAPI — Client mail Windows (Outlook, Thunderbird…)</option>
          <option value="mailto" ${modePref === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
          <option value="smtp"   ${modePref === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique</option>
        </select>
      </div>
      <div class="form-group">
        <label>Email du client</label>
        <input name="email_client" type="email" value="${emailClient}" placeholder="client@exemple.fr"/>
      </div>
      <div id="mapiAcompteNote" style="${modePref === 'mapi' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Le client mail s'ouvrira avec la facture d'acompte déjà attachée en PDF.
        </div>
      </div>
      <div id="mailtoAcompteNote" style="${modePref === 'mailto' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Votre application mail s'ouvrira avec le sujet et le corps pré-remplis. Joignez le PDF manuellement si nécessaire.
        </div>
      </div>
      <div id="envoyerAcompteError" style="color:var(--danger);font-size:13px;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Envoyer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('envoyerAcompteMode').onchange = function() {
    document.getElementById('mapiAcompteNote').style.display   = this.value === 'mapi'   ? '' : 'none';
    document.getElementById('mailtoAcompteNote').style.display = this.value === 'mailto' ? '' : 'none';
  };

  document.getElementById('envoyerAcompteForm').onsubmit = async e => {
    e.preventDefault();
    const emailVal = e.target.email_client.value.trim();
    const modeVal  = document.getElementById('envoyerAcompteMode').value;
    const btn      = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';

    if (modeVal === 'mapi') {
      const mapiRes = await api.post(`/api/acomptes/${id}/mapi`, { email: emailVal });
      if (mapiRes?.ok) { modal.close(); return; }
      await downloadFile(`/api/acomptes/${id}/eml?email=${encodeURIComponent(emailVal)}`, `${acompte.numero}.eml`);
      modal.close();
      return;
    }

    if (modeVal === 'mailto') {
      const nomEntreprise = entreprise?.raison_sociale || entreprise?.nom || '';
      const titre = `Acompte ${acompte.numero} — ${nomEntreprise}`;
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint votre facture d'acompte ${acompte.numero}.\n\nCordialement,\n${nomEntreprise}`;
      await envoyerAvecPdf(`/api/acomptes/${id}/apercu`, `${acompte.numero}.pdf`, emailVal, titre, corps);
      modal.close(); return;
    }

    // SMTP
    const res = await api.post(`/api/acomptes/${id}/envoyer-email`, { email_client: emailVal || undefined });
    if (res?.error) {
      document.getElementById('envoyerAcompteError').textContent = res.error;
      btn.disabled = false; btn.textContent = 'Envoyer';
      return;
    }
    modal.close();
    if (res?.preview_url) {
      if (confirm('Email envoyé (mode test Ethereal).\nOuvrir la prévisualisation ?'))
        window.open(res.preview_url, '_blank');
    }
  };
}

async function showBLFromAcompteForm(acompteId) {
  const a = await api.get(`/api/acomptes/${acompteId}`);

  const html = `
    <form id="blFromAcompteForm">
      <div class="alert alert-info">BL lié à l'acompte <strong>${a.numero}</strong> (${fmt.money(a.montant_ttc)} TTC). Ajustez les lignes selon ce qui est livré.</div>
      <div class="form-row">
        <div class="form-group"><label>Date de livraison</label>
          <input name="date_livraison" type="date"/>
        </div>
        <div class="form-group"><label>Lieu de livraison</label>
          <input name="lieu_livraison" placeholder="Adresse ou lieu"/>
        </div>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addBLALigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th></th></tr></thead>
        <tbody id="blALignesBody">
          <tr>
            <td><input name="bl_des_1" value="Acompte ${a.numero}" required style="min-width:180px"/></td>
            <td><input name="bl_qty_1" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
            <td><input name="bl_unite_1" value="forfait" style="width:80px"/></td>
            <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
          </tr>
        </tbody>
      </table>
      <div class="form-group" style="margin-top:12px"><label>Notes</label>
        <textarea name="notes" placeholder="Remarques…"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer le BL</button>
      </div>
    </form>`;

  modal.show(`BL depuis ${a.numero}`, html, body => {
    let n = 1;

    attachArticleAutocomplete(
      body.querySelector('[name="bl_des_1"]'), null, null,
      body.querySelector('[name="bl_unite_1"]')
    );

    body.querySelector('#addBLALigne').onclick = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="bl_des_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="bl_qty_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="bl_unite_${n}" placeholder="heure, jour…" style="width:80px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#blALignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="bl_des_${n}"]`), null, null,
        tr.querySelector(`[name="bl_unite_${n}"]`)
      );
    };

    body.querySelector('#blFromAcompteForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= n; i++) {
        if (!fd.get(`bl_des_${i}`)) continue;
        lignes.push({
          designation: fd.get(`bl_des_${i}`),
          quantite:    parseFloat(fd.get(`bl_qty_${i}`) || '1'),
          unite:       fd.get(`bl_unite_${i}`) || undefined,
        });
      }
      const r = await api.post('/api/bons-livraison', {
        client_id:      a.client_id,
        date_livraison: fd.get('date_livraison') || undefined,
        lieu_livraison: fd.get('lieu_livraison') || undefined,
        notes:          fd.get('notes') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      navigate('bons-livraison');
    };
  });
}

async function encaisserAcompte(id) {
  const today = new Date().toISOString().slice(0, 10);
  modal.open('Encaisser l\'acompte', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">La TVA sera immédiatement exigible à la date d'encaissement.</p>
    <form id="encaisserForm">
      <div class="form-row">
        <div class="form-group">
          <label>Date d'encaissement *</label>
          <input name="date_encaissement" type="date" value="${today}" required/>
        </div>
        <div class="form-group">
          <label>Mode de règlement</label>
          <select name="mode_paiement">
            <option value="">— Non précisé —</option>
            <option value="virement">Virement bancaire</option>
            <option value="virement_sepa">Virement SEPA</option>
            <option value="cheque">Chèque</option>
            <option value="especes">Espèces</option>
            <option value="carte">Carte bancaire</option>
            <option value="prelevement">Prélèvement</option>
            <option value="prelevement_sepa">Prélèvement SEPA</option>
            <option value="paypal">PayPal</option>
            <option value="autre">Autre</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Confirmer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('encaisserForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api.post(`/api/acomptes/${id}/encaisser`, {
      date_encaissement: fd.get('date_encaissement'),
      mode_paiement:     fd.get('mode_paiement') || null,
    });
    modal.close();
    tabMgr.openViewTab('acomptes');
  };
}

function showAcompteForm() {
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}">${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');
  const tvaOpts = tvaOptions.map(t =>
    `<option value="${t.id}">${t.libelle}</option>`).join('');

  modal.show('Nouvel acompte', `
    <form id="acompteForm">
      <div class="form-group"><label>Client *</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select name="client_id" required style="flex:1"><option value="">Selectionner...</option>${clientOpts}</select>
          <button type="button" class="btn btn-outline btn-sm" onclick="openQuickClientCreate(this)">+ Nouveau</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Montant TTC *</label><input name="montant_ttc" type="number" step="0.01" required/></div>
        <div class="form-group"><label>Taux TVA *</label><select name="taux_tva_id">${tvaOpts}</select></div>
      </div>
      <div class="form-group"><label>Pourcentage du devis (%)</label>
        <input name="pourcentage" type="number" min="0" max="100" placeholder="30"/>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer</button>
      </div>
    </form>`, body => {
    body.querySelector('#acompteForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api.post('/api/acomptes', {
        client_id:    parseInt(fd.get('client_id')),
        montant_ttc:  parseFloat(fd.get('montant_ttc')),
        taux_tva_id:  parseInt(fd.get('taux_tva_id')),
        pourcentage:  fd.get('pourcentage') ? parseFloat(fd.get('pourcentage')) : undefined,
      });
      modal.hide();
      tabMgr.openViewTab('acomptes');
    };
  });
}

// ── Factures fournisseurs ─────────────────────────────────────────────────

// Règlement d'une facture d'achat — modale partagée entre la liste et l'éditeur WYSIWYG
window.payerFactureAchat = (id, onDone) => {
  const today = new Date().toISOString().slice(0, 10);
  modal.show('Enregistrer le paiement', `
    <div class="form-group"><label>Date de paiement</label>
      <input id="ffDatePaie" type="date" value="${today}"/></div>
    <div class="form-group"><label>Mode de paiement</label>
      <select id="ffModePaie">
        <option value="virement">Virement</option>
        <option value="cheque">Chèque</option>
        <option value="especes">Espèces</option>
        <option value="prelevement">Prélèvement</option>
        <option value="cb">Carte bancaire</option>
      </select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" id="btnConfirmPaie">Confirmer</button>
      <button class="btn btn-outline" onclick="modal.hide()">Annuler</button>
    </div>`, body => {
    body.querySelector('#btnConfirmPaie').onclick = async () => {
      await api.post(`/api/factures-fournisseurs/${id}/payer`, {
        date_paiement: body.querySelector('#ffDatePaie').value,
        mode_paiement: body.querySelector('#ffModePaie').value,
      });
      modal.hide();
      if (onDone) onDone();
    };
  });
};

