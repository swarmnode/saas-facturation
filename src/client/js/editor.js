// ── WYSIWYG Document Editor ────────────────────────────────────────────────
// Handles devis and facture creation/editing in an A4-like inline view.
// Depends on globals from app.js: clientOptions, tvaOptions, api, tabMgr, openPdf, attachArticleAutocomplete

const DocEditor = (() => {

  let _entreprise  = null;
  let _brandColor  = '#1A3A5C';

  // ── Utilities ───────────────────────────────────────────────────────────

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function serializeDraft(el, type) {
    const page = el.querySelector('.a4-page');
    if (!page) return null;
    const lignes = [];
    const isBL = type === 'bl';
    page.querySelectorAll('.e-ligne-row').forEach(row => {
      if (isBL) {
        const d = row.querySelector('.e-desig')?.value.trim();
        if (!d) return;
        lignes.push({
          designation:  d,
          description:  row.querySelector('.e-description-inp')?.innerText.trim() || '',
          quantite:     parseFloat(row.querySelector('.e-qty')?.value) || 1,
          unite:        row.querySelector('.e-unite')?.value.trim() || '',
          numero_serie: row.querySelector('.e-serie')?.value.trim() || '',
        });
      } else {
        const d = row.querySelector('.e-desig')?.value.trim();
        if (!d) return;
        lignes.push({
          designation:      d,
          description:      row.querySelector('.e-description-inp')?.innerText.trim() || '',
          quantite:         parseFloat(row.querySelector('.e-qty')?.value) || 1,
          prix_unitaire_ht: parseFloat(row.querySelector('.e-pu')?.value) || 0,
          taux_tva_id:      parseInt(row.querySelector('.e-tva-sel')?.value) || 1,
          remise_pct:       parseFloat(row.querySelector('.e-remise')?.value) || 0,
          numero_serie:     row.querySelector('.e-serie')?.value.trim() || '',
        });
      }
    });
    return {
      type,
      client_id:           parseInt(page.querySelector('[name=client_id]')?.value) || null,
      objet:               page.querySelector('[name=objet]')?.value || '',
      date_validite:       page.querySelector('[name=date_validite]')?.value || '',
      date_emission:       page.querySelector('[name=date_emission]')?.value || '',
      date_echeance:       page.querySelector('[name=date_echeance]')?.value || '',
      conditions_paiement: page.querySelector('[name=conditions_paiement]')?.innerText.trim() || '',
      notes:               page.querySelector('[name=notes]')?.innerText.trim() || '',
      is_free:             page.querySelector('[name=is_free]')?.checked || false,
      tva_mode:            page.querySelector('[name=tva_mode]')?.value || 'normal',
      mode_paiement:       page.querySelector('[name=mode_paiement]')?.value || '',
      lieu_livraison:      page.querySelector('[name=lieu_livraison]')?.value || '',
      facture_origine_id:  page.dataset.factureOrigineId ? parseInt(page.dataset.factureOrigineId) : undefined,
      lignes,
    };
  }

  function saveDraft(docKey, el, type) {
    try {
      const draft = serializeDraft(el, type);
      if (draft) localStorage.setItem('facturpro_draft_' + docKey, JSON.stringify(draft));
    } catch(e) {}
  }

  function loadDraft(docKey) {
    try { return JSON.parse(localStorage.getItem('facturpro_draft_' + docKey) || 'null'); }
    catch(e) { return null; }
  }

  function clearDraft(docKey) {
    localStorage.removeItem('facturpro_draft_' + docKey);
  }

  function fmt(n) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' €';
  }

  function tvaLabel(t) {
    if (t.taux > 0) return t.taux.toLocaleString('fr-FR') + ' %';
    if ((t.libelle || '').toLowerCase().includes('autoliquidation')) return 'Autoliq.';
    return 'Exo.';
  }

  function lighten(hex, a = 0.93) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const lr = Math.round(r+(255-r)*a), lg = Math.round(g+(255-g)*a), lb = Math.round(b+(255-b)*a);
    return '#' + [lr,lg,lb].map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  async function extractBrandColor(imgUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 50;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 50, 50);
          const { data } = ctx.getImageData(0,0,50,50);
          const hist = {};
          for (let i = 0; i < data.length; i += 4) {
            const [r,g,b] = [data[i],data[i+1],data[i+2]];
            if (r > 215 && g > 215 && b > 215) continue;
            const k = [r,g,b].map(v => Math.round(v/16)*16).join(',');
            hist[k] = (hist[k]||0) + 1;
          }
          let max = 0, best = '#1A3A5C';
          for (const [k, n] of Object.entries(hist)) {
            if (n > max) { max = n; best = '#' + k.split(',').map(v => (+v).toString(16).padStart(2,'0')).join(''); }
          }
          resolve(best);
        } catch { resolve('#1A3A5C'); }
      };
      img.onerror = () => resolve('#1A3A5C');
      img.src = imgUrl + '?t=' + Date.now();
    });
  }

  // ── Client search component ────────────────────────────────────────────

  function clientName(c) {
    return c.raison_sociale || [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ');
  }

  function initClientSearch(wrap, hiddenInput, preview) {
    if (!wrap) return;
    const searchInp = wrap.querySelector('.e-client-search');
    const drop      = wrap.querySelector('.e-client-drop');
    if (!searchInp || !drop) return;

    // Prévisualisation initiale
    const initCid = parseInt(hiddenInput?.value);
    if (initCid) renderClientPreview(clientOptions.find(c => c.id === initCid) || null, preview);

    function showDrop(q) {
      const filtered = q.length < 1
        ? clientOptions.slice(0, 30)
        : clientOptions.filter(c => clientName(c).toLowerCase().includes(q.toLowerCase()));

      drop.innerHTML = '';
      filtered.forEach(c => {
        const d = document.createElement('div');
        d.className = 'e-client-drop-item';
        d.textContent = clientName(c);
        d.onmousedown = () => {
          hiddenInput.value = c.id;
          searchInp.value   = clientName(c);
          renderClientPreview(c, preview);
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
          drop.style.display = 'none';
        };
        drop.appendChild(d);
      });

      const newItem = document.createElement('div');
      newItem.className = 'e-client-drop-new';
      newItem.textContent = '+ Nouveau client';
      newItem.onmousedown = () => {
        drop.style.display = 'none';
        openQuickClientCreate({ closest: () => null }, null, null, null, null);
      };
      drop.appendChild(newItem);
      drop.style.display = 'block';
    }

    searchInp.addEventListener('focus', () => showDrop(searchInp.value));
    searchInp.addEventListener('input', () => {
      showDrop(searchInp.value);
      hiddenInput.value = '';
      renderClientPreview(null, preview);
    });
    searchInp.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 200));
  }

  // ── Ligne row ───────────────────────────────────────────────────────────

  function calcLigne(row) {
    const qty    = parseFloat(row.querySelector('.e-qty').value)    || 0;
    const pu     = parseFloat(row.querySelector('.e-pu').value)     || 0;
    const remise = parseFloat(row.querySelector('.e-remise').value) || 0;
    const ht = qty * pu * (1 - remise / 100);
    row.querySelector('.e-ligne-total').textContent = fmt(ht);
    return ht;
  }

  function calcTotaux(page) {
    const tvaMap = {};
    let totalHT = 0;

    page.querySelectorAll('.e-ligne-row').forEach(row => {
      const qty    = parseFloat(row.querySelector('.e-qty').value)    || 0;
      const pu     = parseFloat(row.querySelector('.e-pu').value)     || 0;
      const remise = parseFloat(row.querySelector('.e-remise').value) || 0;
      const tvaId  = row.querySelector('.e-tva-sel').value;
      const tvaOpt = tvaOptions.find(t => t.id == tvaId);
      const taux   = tvaOpt ? tvaOpt.taux : 0;
      const ht     = qty * pu * (1 - remise / 100);
      totalHT += ht;
      tvaMap[taux] = (tvaMap[taux] || 0) + ht * taux / 100;
    });

    let totalTVA = 0;
    const tvaLinesEl = page.querySelector('.e-tva-lines');
    tvaLinesEl.innerHTML = '';
    Object.entries(tvaMap).filter(([,v]) => v > 0).forEach(([taux, montant]) => {
      totalTVA += montant;
      const div = document.createElement('div');
      div.className = 'e-total-row';
      div.innerHTML = `<span>TVA ${taux} %</span><span>${fmt(montant)}</span>`;
      tvaLinesEl.appendChild(div);
    });

    page.querySelector('.e-ht-val').textContent  = fmt(totalHT);
    page.querySelector('.e-ttc-val').textContent = fmt(totalHT + totalTVA);
  }

  function makeLigneRow(l = {}, page, opts = {}) {
    const showSerie = opts.showSerie ?? false;
    const tvaOpts = tvaOptions.map(t =>
      `<option value="${t.id}" ${t.id == (l.taux_tva_id || 1) ? 'selected' : ''}>${tvaLabel(t)}</option>`
    ).join('');

    const stockInfo = (l._stock != null)
      ? `<span class="e-stock-badge" title="Stock disponible">${l._stock}</span>`
      : '';

    const tr = document.createElement('tr');
    tr.className = 'e-ligne-row';
    tr.innerHTML = `
      <td class="e-td-desig">
        <div style="display:flex;align-items:center;gap:4px">
          <input class="e-cell e-desig" value="${(l.designation||'').replace(/"/g,'&quot;')}" placeholder="Désignation…" style="flex:1">
          ${stockInfo}
        </div>
        ${l.description ? `<div class="e-description-inp" contenteditable="true">${l.description}</div>` : '<div class="e-description-inp" contenteditable="true" data-placeholder="Description (optionnel)…"></div>'}
        ${showSerie ? `<input class="e-cell e-serie" value="${(l.numero_serie||'').replace(/"/g,'&quot;')}" placeholder="N° de série…" style="font-size:8pt;color:#888;margin-top:2px">` : ''}
      </td>
      <td class="e-td-num"><input class="e-cell e-qty" type="number" value="${l.quantite||1}" min="0.001" step="0.001"${l._stock != null ? ` max="${l._stock}"` : ''}></td>
      <td class="e-td-num"><input class="e-cell e-pu"  type="number" value="${l.prix_unitaire_ht||''}" step="0.01" placeholder="0,00"></td>
      <td class="e-td-num"><input class="e-cell e-remise" type="number" value="${l.remise_pct||0}" min="0" max="100"></td>
      <td class="e-td-tva"><select class="e-cell e-tva-sel">${tvaOpts}</select></td>
      <td class="e-td-total e-ligne-total">${fmt(l.montant_ht||0)}</td>
      <td class="e-td-del"><button class="e-del-btn" title="Supprimer la ligne">✕</button></td>`;

    tr.querySelector('.e-del-btn').onclick = () => { tr.remove(); calcTotaux(page); };
    tr.querySelectorAll('.e-qty,.e-pu,.e-remise,.e-tva-sel').forEach(el =>
      el.addEventListener('input', () => { calcLigne(tr); calcTotaux(page); })
    );

    const desigInp = tr.querySelector('.e-desig');
    attachArticleAutocomplete(desigInp, tr.querySelector('.e-pu'), tr.querySelector('.e-tva-sel'));
    desigInp.addEventListener('input', () => calcTotaux(page));

    // Quand un article est sélectionné via autocomplete, appliquer le stock
    desigInp.addEventListener('article-selected', (e) => {
      const art = e.detail;
      if (art?.quantite_stock != null) {
        const qtyInp = tr.querySelector('.e-qty');
        qtyInp.max = art.quantite_stock;
        // Mettre à jour le badge stock
        let badge = tr.querySelector('.e-stock-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'e-stock-badge';
          badge.title = 'Stock disponible';
          desigInp.parentNode.insertBefore(badge, desigInp.nextSibling);
        }
        badge.textContent = art.quantite_stock;
      }
    });

    return tr;
  }

  // ── HTML builder ────────────────────────────────────────────────────────

  function buildHTML(type, entreprise, doc) {
    const isFacture = type === 'facture' || type === 'avoir';
    const isAvoir   = type === 'avoir';
    const label     = isAvoir ? 'AVOIR' : (isFacture ? 'FACTURE' : 'DEVIS');
    const numero    = doc?.numero || '—';
    const today     = new Date().toISOString().slice(0,10);
    const bc        = _brandColor;

    const logoHTML = entreprise.logo_path
      ? `<img class="e-logo" src="/storage/logo/logo_pdf.png?t=${Date.now()}" alt="logo">`
      : '';

    const initCli      = clientOptions.find(c => c.id == doc?.client_id);
    const initCliName  = initCli ? (initCli.raison_sociale || [initCli.civilite, initCli.prenom, initCli.nom].filter(Boolean).join(' ')) : '';



    const tvaModeSel = isFacture ? `
      <div class="e-meta-row">
        <span class="e-meta-label">Régime TVA</span>
        <select class="e-meta-sel" name="tva_mode">
          <option value="normal"          ${(doc?.tva_mode||'normal')==='normal'          ? 'selected':''}>Normal</option>
          <option value="franchise_293b"  ${doc?.tva_mode==='franchise_293b'              ? 'selected':''}>Franchise 293 B</option>
          <option value="autoliquidation" ${doc?.tva_mode==='autoliquidation'             ? 'selected':''}>Autoliquidation</option>
        </select>
      </div>
      <div class="e-meta-row">
        <span class="e-meta-label">Mode de règlement</span>
        <select class="e-meta-sel" name="mode_paiement">
          <option value="">— Non précisé —</option>
          ${['Virement bancaire','Virement SEPA','Chèque','Espèces','Carte bancaire','Prélèvement','Prélèvement SEPA','PayPal','Autre']
            .map(m => { const v = m.toLowerCase().replace(/ /g,'_').replace(/é/g,'e').replace(/è/g,'e'); return `<option value="${v}" ${doc?.mode_paiement===v?'selected':''}>${m}</option>`; }).join('')}
        </select>
      </div>` : `
      <div class="e-meta-row e-meta-row-check">
        <label><input type="checkbox" name="is_free" ${doc?.is_free?'checked':''}> Devis gratuit</label>
      </div>`;

    const dateFields = isFacture ? `
      <div class="e-date-row"><span class="e-date-label">Date d'émission</span><input class="e-date-inp" type="date" name="date_emission" value="${doc?.date_emission?.slice(0,10)||today}"></div>
      ${!isAvoir && (doc?.date_echeance || !doc?.locked) ? `<div class="e-date-row"><span class="e-date-label">Échéance</span><input class="e-date-inp" type="date" name="date_echeance" value="${doc?.date_echeance?.slice(0,10)||''}"></div>` : ''}
      ${isAvoir && doc?.facture_origine_numero ? `<div class="e-date-row"><span class="e-date-label" style="color:#888">Avoir sur</span><span style="font-size:9pt;font-weight:600;color:#555">${doc.facture_origine_numero}</span></div>` : ''}` : `
      <div class="e-date-row"><span class="e-date-label">Date</span><input class="e-date-inp" type="date" name="date_creation" value="${doc?.date_creation?.slice(0,10)||today}"></div>
      <div class="e-date-row"><span class="e-date-label">Valable jusqu'au</span><input class="e-date-inp" type="date" name="date_validite" value="${doc?.date_validite?.slice(0,10)||new Date(Date.now()+30*864e5).toISOString().slice(0,10)}"></div>`;

    return `
    <div class="e-toolbar">
      <div class="e-tb-left">
        <button class="btn btn-outline btn-sm e-close-btn">← Retour</button>
        <span class="e-tb-title">${numero === '—' ? `Nouveau ${label.toLowerCase()}` : `${label} ${numero}`}</span>
      </div>
      <div class="e-tb-right">
        ${doc?.id ? `<button class="btn btn-outline btn-sm e-preview-btn">👁 Aperçu PDF</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
        <button class="btn btn-primary btn-sm e-save-btn">Enregistrer</button>
      </div>
    </div>

    <div class="e-canvas">
      <div class="a4-page">

        <div class="e-page-header">
          <div class="e-company">
            <div class="e-company-name">${entreprise.raison_sociale}${entreprise.is_EI?' EI':''}</div>
            <div class="e-company-line">${entreprise.adresse}</div>
            ${entreprise.adresse2 ? `<div class="e-company-line">${entreprise.adresse2}</div>` : ''}
            <div class="e-company-line">${entreprise.code_postal} ${entreprise.ville}</div>
            <div class="e-company-line">SIRET : ${entreprise.siret}</div>
            ${entreprise.tva_intracom ? `<div class="e-company-line">TVA : ${entreprise.tva_intracom}</div>` : ''}
            <div class="e-company-line">${entreprise.email}</div>
          </div>
          <div class="e-logo-area">${logoHTML}</div>
        </div>

        <div class="e-client-block">
          <div class="e-client-label">Destinataire</div>
          <div class="e-client-search-wrap">
            <input class="e-client-search" placeholder="Rechercher un client…" autocomplete="off" value="${initCliName.replace(/"/g,'&quot;')}">
            <input type="hidden" name="client_id" value="${doc?.client_id || ''}">
            <div class="e-client-drop" style="display:none"></div>
          </div>
          <div class="e-client-preview"></div>
        </div>

        <div class="e-separator" style="border-top-color:${bc}"></div>

        <div class="e-dochead">
          <div class="e-dochead-left">
            <div class="e-doc-type" style="color:${bc}">${label}</div>
            <div class="e-doc-numero">N° ${numero}</div>
            ${dateFields}
          </div>
          <div class="e-dochead-right">
            <div class="e-meta-row">
              <span class="e-meta-label">Objet</span>
              <input class="e-meta-inp" name="objet" value="${(doc?.objet||'').replace(/"/g,'&quot;')}" placeholder="Objet du document…">
            </div>
            ${tvaModeSel}
          </div>
        </div>

        <table class="e-lignes-table">
          <thead>
            <tr style="background:${bc};color:#fff">
              <th class="e-th-desig">Désignation</th>
              <th class="e-th-num">Qté</th>
              <th class="e-th-num">P.U. HT</th>
              <th class="e-th-num">Remise %</th>
              <th class="e-th-tva">TVA</th>
              <th class="e-th-total">Total HT</th>
              <th class="e-th-del"></th>
            </tr>
          </thead>
          <tbody class="e-lignes-body"></tbody>
        </table>
        <button class="e-add-btn">+ Ajouter une ligne</button>

        <div class="e-footer">
          <div class="e-footer-label">Conditions de paiement</div>
          <div class="e-footer-editable" contenteditable="true" name="conditions_paiement" data-placeholder="Paiement à 30 jours…">${doc?.conditions_paiement||''}</div>
          <div class="e-footer-label" style="margin-top:12px">Notes</div>
          <div class="e-footer-editable" contenteditable="true" name="notes" data-placeholder="Notes complémentaires…">${doc?.notes||''}</div>
        </div>

        <div class="e-doc-bottom">
          <div class="e-doc-bottom-left">
            ${!isFacture ? `
            <div class="e-signature-label">Bon pour accord — Signature du client</div>
            <div class="e-sig-dated-box">
              <div class="e-sig-date-row"><span class="e-sig-date-label">Date :</span><span class="e-sig-date-line"></span></div>
              <div class="e-sig-space"></div>
            </div>
            <div class="e-signature-hint">Précédé de la mention « Bon pour accord »</div>
            ` : ''}
          </div>
          <div class="e-doc-bottom-right">
            <div class="e-totaux-inner">
              <div class="e-total-row e-total-ht-row"><span>Total HT</span><span class="e-ht-val">0,00 €</span></div>
              <div class="e-tva-lines"></div>
              <div class="e-total-row e-total-ttc-row" style="color:${bc}"><span>Total TTC</span><span class="e-ttc-val">0,00 €</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── Client preview ──────────────────────────────────────────────────────

  function renderClientPreview(client, el) {
    if (!client) { el.innerHTML = ''; return; }
    const nom   = client.type_client === 'professionnel'
      ? (client.raison_sociale || '')
      : [client.civilite, client.prenom, client.nom].filter(Boolean).join(' ');
    const adr   = [client.adresse, client.adresse2].filter(Boolean).join(', ');
    const ville = [client.code_postal, client.ville].filter(Boolean).join(' ');
    el.innerHTML = `
      <div class="e-cp-name">${nom}</div>
      ${adr   ? `<div>${adr}</div>`   : ''}
      ${ville ? `<div>${ville}</div>` : ''}
      ${client.tva_intracom ? `<div>TVA : ${client.tva_intracom}</div>` : ''}`;
  }
  // ── Init wiring ─────────────────────────────────────────────────────────

  function initEditor(type, id, el, doc) {
    const page   = el.querySelector('.a4-page');
    const tbody  = el.querySelector('.e-lignes-body');
    const docKey = el.dataset.docKey;

    // Auto-save pour les nouveaux documents non sauvegardés
    if (!id && docKey) {
      const autoSave = debounce(() => saveDraft(docKey, el, type), 600);
      page.addEventListener('input',  autoSave);
      page.addEventListener('change', autoSave);

      // Sauvegarde forcée immédiate avant rechargement / fermeture
      const flushSave = () => saveDraft(docKey, el, type);
      window.addEventListener('beforeunload', flushSave);
      // Nettoyage si l'onglet est fermé volontairement
      el.querySelector('.e-close-btn')?.addEventListener('click', () => {
        window.removeEventListener('beforeunload', flushSave);
      }, { once: true });
    }

    // Signature block: devis only
    const sigBlock = el.querySelector('.e-signature-block');
    if (sigBlock && type === 'facture') sigBlock.style.display = 'none';

    // Legal footer

    // Client selector
    // Client search
    const clientPreview = el.querySelector('.e-client-preview');
    initClientSearch(el.querySelector('.e-client-search-wrap'), el.querySelector('[name=client_id]'), clientPreview);

    // Pre-fill lines (or one blank if editable)
    const readonly   = !!(doc?.locked);
    const showSerie  = (type === 'facture' || type === 'avoir');
    const lignes = doc?.lignes?.length ? doc.lignes : (readonly ? [] : [{}]);
    lignes.forEach(l => tbody.appendChild(makeLigneRow(l, page, { showSerie })));
    calcTotaux(page);

    if (readonly) {
      // ── Read-only mode ──────────────────────────────────────────────────
      page.classList.add('e-readonly');
      page.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; el.style.pointerEvents = 'none'; });
      page.querySelectorAll('.e-del-btn').forEach(btn => { btn.onclick = null; btn.disabled = true; });
      page.querySelectorAll('[contenteditable]').forEach(el => el.setAttribute('contenteditable', 'false'));
      el.querySelector('.e-add-btn').style.display = 'none';

      // Replace save button with contextual actions
      const saveBtn = el.querySelector('.e-save-btn');
      const isAvoir = doc?.type_facture === 'avoir';
      saveBtn.outerHTML; // no-op reference
      const toolbar = el.querySelector('.e-tb-right');
      toolbar.innerHTML = `
        <button class="btn btn-outline btn-sm e-preview-btn">👁 Aperçu PDF</button>
        <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
        ${type === 'devis' ? `
          <button class="btn btn-outline btn-sm e-send-devis-btn">✉ Envoyer</button>
          ${doc?.statut === 'signe' ? `<button class="btn btn-warning btn-sm e-avenant-btn">📝 Avenant</button>` : ''}
          ${doc?.statut === 'signe' ? `<button class="btn btn-outline btn-sm e-facturer-btn">🧾 Facturer</button>` : ''}
          ${doc?.statut === 'signe' ? `<button class="btn btn-outline btn-sm e-bl-btn">🚚 BL</button>` : ''}
        ` : `
          <button class="btn btn-outline btn-sm e-send-btn">✉ Envoyer</button>
          ${doc?.statut === 'emise' ? `<button class="btn btn-primary btn-sm e-pay-btn">💳 Payer</button>` : ''}
          ${['emise','payee'].includes(doc?.statut) && !isAvoir ? `<button class="btn btn-outline btn-sm e-avoir-btn">Avoir</button>` : ''}
        `}
      `;

      const route = (type === 'avoir' || type === 'facture') ? 'factures' : 'devis';
      toolbar.querySelector('.e-preview-btn').onclick = () => openPdf(`/api/${route}/${id}/apercu`);
      if (type === 'devis') {
        toolbar.querySelector('.e-send-devis-btn')?.addEventListener('click', () => envoyerDevis(id));
        toolbar.querySelector('.e-avenant-btn')?.addEventListener('click', () => showAvenantForm(id));
        toolbar.querySelector('.e-facturer-btn')?.addEventListener('click', () => showFactureFromDevisForm(id));
        toolbar.querySelector('.e-bl-btn')?.addEventListener('click', () => showBLFromDevisForm(id));
      } else {
        toolbar.querySelector('.e-send-btn').onclick    = () => envoyerFacture(id);
        toolbar.querySelector('.e-pay-btn')?.addEventListener('click', () => payerFacture(id));
        toolbar.querySelector('.e-avoir-btn')?.addEventListener('click', () => DocEditor.openAvoir(id));
      }
    } else {
      // ── Edit mode ───────────────────────────────────────────────────────
      el.querySelector('.e-add-btn').onclick = () => {
        const row = makeLigneRow({}, page, { showSerie });
        tbody.appendChild(row);
        row.querySelector('.e-desig').focus();
      };

      const previewBtn = el.querySelector('.e-preview-btn');
      if (previewBtn) {
        const route = (type === 'avoir' || type === 'facture') ? 'factures' : 'devis';
        previewBtn.onclick = () => openPdf(`/api/${route}/${id}/apercu`);
      }

      // Boutons contextuels devis dans la toolbar
      if (type === 'devis' && id) {
        const tbRight = el.querySelector('.e-tb-right');
        const saveBtn = tbRight.querySelector('.e-save-btn');
        const ins = (b) => tbRight.insertBefore(b, saveBtn);
        const btn = (label, cls, fn, disabled = false) => {
          const b = document.createElement('button');
          b.className = `btn ${cls} btn-sm`;
          b.textContent = label;
          if (disabled) { b.disabled = true; b.style.cursor = 'default'; b.style.opacity = '1'; }
          else b.onclick = fn;
          return b;
        };
        const s = doc?.statut;

        // Bouton Accepter/Accepté — toujours présent
        if (s === 'accepte') {
          // Accepté : vert, non cliquable
          ins(btn('✓ Accepté', 'btn-success', null, true));
          // → BL prioritaire
          ins(btn('🚚 → BL', 'btn-primary', () => showBLFromDevisForm(id)));
          ins(btn('🧾 Facturer', 'btn-outline', () => showFactureFromDevisForm(id)));
          ins(btn('Signer', 'btn-outline', async () => {
            if (!confirm('Signer ce devis ? Il sera verrouillé.')) return;
            await api.post(`/api/devis/${id}/signer`);
            tabMgr.closeTab(el.dataset.tid); tabMgr.openViewTab('devis');
          }));
        } else if (s === 'signe') {
          ins(btn('✓ Accepté', 'btn-success', null, true));
          ins(btn('📝 Avenant', 'btn-warning', () => showAvenantForm(id)));
          ins(btn('🧾 Facturer', 'btn-outline', () => showFactureFromDevisForm(id)));
          ins(btn('🚚 BL', 'btn-outline', () => showBLFromDevisForm(id)));
        } else {
          // brouillon ou envoye : bouton Accepter blanc cliquable
          const accepterBtn = btn('Accepter', 'btn-outline', async () => {
            accepterBtn.disabled = true;
            accepterBtn.textContent = '…';
            const r = await api.post(`/api/devis/${id}/accepter`);
            if (r?.error) {
              alert(r.error);
              accepterBtn.disabled = false;
              accepterBtn.textContent = 'Accepter';
              return;
            }
            // Mise à jour en place : Accepter → ✓ Accepté + → BL
            accepterBtn.textContent = '✓ Accepté';
            accepterBtn.className = 'btn btn-success btn-sm';
            accepterBtn.disabled = true;
            accepterBtn.style.cursor = 'default';
            accepterBtn.style.opacity = '1';
            const blBtn = btn('🚚 → BL', 'btn-primary', () => showBLFromDevisForm(id));
            tbRight.insertBefore(blBtn, accepterBtn.nextSibling);
            const facturerBtn = btn('🧾 Facturer', 'btn-outline', () => showFactureFromDevisForm(id));
            tbRight.insertBefore(facturerBtn, blBtn.nextSibling);
          });
          ins(accepterBtn);
          if (s === 'envoye') {
            ins(btn('Signer', 'btn-outline', async () => {
              if (!confirm('Signer ce devis ? Il sera verrouillé.')) return;
              await api.post(`/api/devis/${id}/signer`);
              tabMgr.closeTab(el.dataset.tid); tabMgr.openViewTab('devis');
            }));
          }
          ins(btn('✉ Envoyer', 'btn-outline', () => envoyerDevis(id)));
        }
      }

      const saveBtn = el.querySelector('.e-save-btn');

      // Dirty state : revenir à "Enregistrer" à chaque modification
      const markDirty = () => {
        saveBtn.textContent = 'Enregistrer';
        saveBtn.className   = 'btn btn-primary btn-sm e-save-btn';
        saveBtn.disabled    = false;
      };
      page.addEventListener('input',  markDirty);
      page.addEventListener('change', markDirty);

      saveBtn.onclick = async () => {
        saveBtn.disabled    = true;
        saveBtn.textContent = 'Enregistrement…';
        const ok = await saveDoc(type, id, el, page);
        if (ok) {
          saveBtn.textContent = '✓ Enregistré';
          saveBtn.className   = 'btn btn-success btn-sm e-save-btn';
          saveBtn.disabled    = true;
          saveBtn.style.cursor  = 'default';
          saveBtn.style.opacity = '1';
        } else {
          saveBtn.disabled    = false;
          saveBtn.textContent = 'Enregistrer';
        }
      };
    }

    // Close → back to list (always)
    el.querySelector('.e-close-btn').onclick = () => {
      tabMgr.closeTab(el.dataset.tid);
    };
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function saveDoc(type, id, el, page) {
    const route = type === 'facture' ? 'factures' : 'devis';

    const lignes = [];
    page.querySelectorAll('.e-ligne-row').forEach(row => {
      const desig = row.querySelector('.e-desig').value.trim();
      if (!desig) return;
      lignes.push({
        designation:      desig,
        description:      row.querySelector('.e-description-inp')?.innerText.trim() || undefined,
        quantite:         parseFloat(row.querySelector('.e-qty').value)    || 1,
        prix_unitaire_ht: parseFloat(row.querySelector('.e-pu').value)     || 0,
        taux_tva_id:      parseInt(row.querySelector('.e-tva-sel').value)  || 1,
        remise_pct:       parseFloat(row.querySelector('.e-remise').value) || 0,
        numero_serie:     row.querySelector('.e-serie')?.value.trim()      || undefined,
      });
    });

    const clientId = parseInt(page.querySelector('[name=client_id]').value);
    if (!clientId)     { alert('Veuillez sélectionner un client.'); return false; }
    if (!lignes.length) { alert('Ajoutez au moins une ligne.');     return false; }

    const data = {
      client_id: clientId,
      objet:     page.querySelector('[name=objet]')?.value.trim() || undefined,
      lignes,
      conditions_paiement: page.querySelector('[name=conditions_paiement]')?.innerText.trim() || undefined,
      notes:               page.querySelector('[name=notes]')?.innerText.trim() || undefined,
    };

    if (type === 'devis') {
      data.date_validite = page.querySelector('[name=date_validite]')?.value || undefined;
      data.is_free       = page.querySelector('[name=is_free]')?.checked || false;
    } else {
      data.date_emission       = page.querySelector('[name=date_emission]')?.value  || undefined;
      data.date_echeance       = page.querySelector('[name=date_echeance]')?.value  || undefined;
      data.tva_mode            = page.querySelector('[name=tva_mode]')?.value       || 'normal';
      data.mode_paiement       = page.querySelector('[name=mode_paiement]')?.value  || undefined;
      if (type === 'avoir') {
        data.type_facture        = 'avoir';
        data.facture_origine_id  = page.dataset.factureOrigineId ? parseInt(page.dataset.factureOrigineId) : undefined;
      }
    }

    try {
      let result;
      if (id) {
        result = await api.put(`/api/${route}/${id}`, data);
      } else {
        data.entreprise_id = _entreprise.id;
        result = await api.post(`/api/${route}`, data);
      }
      if (result?.error) { alert(result.error); return false; }
      if (el.dataset.docKey) clearDraft(el.dataset.docKey);
      // Mettre à jour le titre de l'onglet avec le nouveau numéro
      if (result?.numero) {
        const titleEl = el.querySelector('.e-tb-title');
        if (titleEl) titleEl.textContent = `${type === 'devis' ? 'DEVIS' : 'FACTURE'} ${result.numero}`;
      }
      return true;
    } catch(e) {
      alert('Erreur lors de l\'enregistrement');
      return false;
    }
  }

  // ── Public entry points ─────────────────────────────────────────────────

  async function open(type, id, prefill = {}) {
    const route = (type === 'facture' || type === 'avoir') ? 'factures' : 'devis';

    const [entreprise, doc] = await Promise.all([
      api.get('/api/entreprise'),
      id ? api.get(`/api/${route}/${id}`) : Promise.resolve(null),
    ]);

    // Les documents verrouillés s'ouvrent en lecture seule (pas de blocage)

    // effectiveDoc : avoir depuis facture OR restauration draft OR doc existant
    let effectiveDoc = doc;
    if (!id) {
      if (prefill.factureOrigine) {
        effectiveDoc = { ...prefill.factureOrigine, id: null, numero: null, statut: 'brouillon', locked: 0,
            facture_origine_id: prefill.factureOrigine.id,
            facture_origine_numero: prefill.factureOrigine.numero };
      } else if (prefill.draft) {
        effectiveDoc = { ...prefill.draft, id: null, numero: null, locked: 0 };
      }
    }

    _entreprise = entreprise;
    if (entreprise.logo_path) _brandColor = await extractBrandColor('/storage/logo/logo_pdf.png');

    const typeLabel = type === 'avoir' ? 'avoir' : (type === 'facture' ? 'facture' : 'devis');
    const tabLabel  = id ? (doc?.numero || `${typeLabel} ${id}`)
                         : (type === 'avoir' ? 'Nouvel avoir' : `Nouveau ${typeLabel}`);

    // Clé stable pour le draft (preservée si c'est une restauration)
    const docKey = id ? String(id) : (prefill.docKey || `new-${type}-${Date.now()}`);

    tabMgr.openDocTab(type, docKey, tabLabel, async (el) => {
      el.classList.add('e-editor-panel');
      el.dataset.docKey = docKey;
      el.innerHTML = buildHTML(type, entreprise, effectiveDoc);
      if (prefill.factureOrigine) {
        el.querySelector('.a4-page').dataset.factureOrigineId = prefill.factureOrigine.id;
      }
      initEditor(type, id, el, effectiveDoc);
    });
  }

  // ── BL HTML builder ─────────────────────────────────────────────────────

  function buildBLHTML(entreprise, bl, prefill) {
    const numero = bl?.numero || '—';
    const today  = new Date().toISOString().slice(0, 10);
    const bc     = _brandColor;

    const logoHTML = entreprise.logo_path
      ? `<img class="e-logo" src="/storage/logo/logo_pdf.png?t=${Date.now()}" alt="logo">`
      : '';

    const blInitCli  = clientOptions.find(c => c.id == (bl?.client_id || prefill?.client_id));
    const blInitName = blInitCli ? (blInitCli.raison_sociale || [blInitCli.civilite, blInitCli.prenom, blInitCli.nom].filter(Boolean).join(' ')) : '';


    return `
    <div class="e-toolbar">
      <div class="e-tb-left">
        <button class="btn btn-outline btn-sm e-close-btn">← Retour</button>
        <span class="e-tb-title">${numero === '—' ? 'Nouveau bon de livraison' : `BL ${numero}`}</span>
      </div>
      <div class="e-tb-right">
        ${bl?.id ? `<button class="btn btn-outline btn-sm e-preview-btn">👁 Aperçu PDF</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
        <button class="btn btn-primary btn-sm e-save-btn">Enregistrer</button>
      </div>
    </div>

    <div class="e-canvas">
      <div class="a4-page">

        <div class="e-page-header">
          <div class="e-company">
            <div class="e-company-name">${entreprise.raison_sociale}${entreprise.is_EI?' EI':''}</div>
            <div class="e-company-line">${entreprise.adresse}</div>
            ${entreprise.adresse2 ? `<div class="e-company-line">${entreprise.adresse2}</div>` : ''}
            <div class="e-company-line">${entreprise.code_postal} ${entreprise.ville}</div>
            <div class="e-company-line">SIRET : ${entreprise.siret}</div>
            <div class="e-company-line">${entreprise.email}</div>
          </div>
          <div class="e-logo-area">${logoHTML}</div>
        </div>

        <div class="e-client-block">
          <div class="e-client-search-wrap">
            <input class="e-client-search" placeholder="Rechercher un client…" autocomplete="off" value="${blInitName.replace(/"/g,'&quot;')}">
            <input type="hidden" name="client_id" value="${bl?.client_id || prefill?.client_id || ''}">
            <div class="e-client-drop" style="display:none"></div>
          </div>

          <div class="e-client-preview"></div>
        </div>

        <div class="e-separator" style="border-top-color:${bc}"></div>

        <div class="e-dochead">
          <div class="e-dochead-left">
            <div class="e-doc-type" style="color:${bc}">BON DE LIVRAISON</div>
            <div class="e-doc-numero">N° ${numero}</div>
            <div class="e-date-row">
              <span class="e-date-label">Date d'émission</span>
              <input class="e-date-inp" type="date" name="date_emission" value="${bl?.date_emission?.slice(0,10)||today}">
            </div>
          </div>
          <div class="e-dochead-right">
            <div class="e-meta-row">
              <span class="e-meta-label">Lieu de livraison</span>
              <input class="e-meta-inp" name="lieu_livraison" value="${(bl?.lieu_livraison||prefill?.lieu_livraison||'').replace(/"/g,'&quot;')}" placeholder="Adresse ou lieu…">
            </div>
            ${bl?.devis_id || prefill?.devis_id ? `<div class="e-meta-row"><span class="e-meta-label">Réf. devis</span><span style="font-size:9pt;color:#555">${prefill?.devis_numero || ''}</span></div>` : ''}
            ${bl?.facture_id || prefill?.facture_id ? `<div class="e-meta-row"><span class="e-meta-label">Réf. facture</span><span style="font-size:9pt;color:#555">${prefill?.facture_numero || ''}</span></div>` : ''}
          </div>
        </div>

        <table class="e-lignes-table">
          <thead>
            <tr style="background:${bc};color:#fff">
              <th class="e-th-desig">Désignation</th>
              <th class="e-th-num">Qté</th>
              <th class="e-th-tva" style="width:10%">Unité</th>
              <th class="e-th-del"></th>
            </tr>
          </thead>
          <tbody class="e-bl-body"></tbody>
        </table>
        <button class="e-add-btn">+ Ajouter une ligne</button>

        <div class="e-footer">
          <div class="e-footer-label">Notes / Instructions de livraison</div>
          <div class="e-footer-editable" contenteditable="true" name="notes" data-placeholder="Remarques, conditions de livraison…">${bl?.notes||''}</div>
        </div>


        <div class="e-signature-single">
          <div class="e-signature-label">Signature du destinataire — Bon pour accord de réception</div>
          <div class="e-sig-dated-box">
            <div class="e-sig-date-row"><span class="e-sig-date-label">Date :</span><span class="e-sig-date-line"></span></div>
            <div class="e-sig-space"></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function makeBLRow(l = {}, page) {
    const stockInfo = (l._stock != null)
      ? `<span class="e-stock-badge" title="Stock disponible">${l._stock}</span>`
      : '';
    const tr = document.createElement('tr');
    tr.className = 'e-ligne-row';
    tr.innerHTML = `
      <td class="e-td-desig">
        <div style="display:flex;align-items:center;gap:4px">
          <input class="e-cell e-desig" value="${(l.designation||'').replace(/"/g,'&quot;')}" placeholder="Désignation…" style="flex:1">
          ${stockInfo}
        </div>
        <div class="e-description-inp" contenteditable="true" data-placeholder="Description (optionnel)…">${l.description||''}</div>
        <input class="e-cell e-serie" value="${(l.numero_serie||'').replace(/"/g,'&quot;')}" placeholder="N° de série…" style="font-size:8pt;color:#888;margin-top:2px">
      </td>
      <td class="e-td-num"><input class="e-cell e-qty" type="number" value="${l.quantite||1}" min="0.001" step="0.001"${l._stock != null ? ` max="${l._stock}"` : ''}></td>
      <td class="e-td-tva"><input class="e-cell e-unite" value="${l.unite||''}" placeholder="heure…"></td>
      <td class="e-td-del"><button class="e-del-btn" title="Supprimer">✕</button></td>`;

    tr.querySelector('.e-del-btn').onclick = () => tr.remove();
    const desigInp = tr.querySelector('.e-desig');
    attachArticleAutocomplete(desigInp, null, null, tr.querySelector('.e-unite'));

    desigInp.addEventListener('article-selected', (e) => {
      const art = e.detail;
      if (art?.quantite_stock != null) {
        tr.querySelector('.e-qty').max = art.quantite_stock;
        let badge = tr.querySelector('.e-stock-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'e-stock-badge';
          badge.title = 'Stock disponible';
          desigInp.parentNode.insertBefore(badge, desigInp.nextSibling);
        }
        badge.textContent = art.quantite_stock;
      }
    });

    return tr;
  }

  async function openBL(id = null, prefill = {}) {
    const [entreprise, bl] = await Promise.all([
      api.get('/api/entreprise'),
      id ? api.get(`/api/bons-livraison/${id}`) : Promise.resolve(null),
    ]);

    _entreprise = entreprise;
    if (entreprise.logo_path) _brandColor = await extractBrandColor('/storage/logo/logo_pdf.png');

    const tabLabel = id ? (bl?.numero || `BL ${id}`) : 'Nouveau BL';
    const docKey   = id ? String(id) : (prefill.docKey || `new-bl-${Date.now()}`);

    // Restauration draft BL
    const effectiveBL = (!id && prefill.draft) ? { ...prefill.draft, lignes: prefill.draft.lignes } : bl;

    tabMgr.openDocTab('bl', docKey, tabLabel, async (el) => {
      el.classList.add('e-editor-panel');
      el.dataset.docKey = docKey;
      el.innerHTML = buildBLHTML(entreprise, effectiveBL, prefill);

      const page     = el.querySelector('.a4-page');
      const tbody    = el.querySelector('.e-bl-body');
      // Client search BL
      const clientPrev  = el.querySelector('.e-client-preview');
      initClientSearch(el.querySelector('.e-client-search-wrap'), el.querySelector('[name=client_id]'), clientPrev);

      // Lines
      const blReadonly = bl && bl.statut === 'livre';
      const lignes = effectiveBL?.lignes?.length ? effectiveBL.lignes
                   : (prefill.lignes?.length ? prefill.lignes : [{}]);

      // Auto-save pour les nouveaux BL
      if (!id && docKey) {
        const autoSave = debounce(() => saveDraft(docKey, el, 'bl'), 600);
        page.addEventListener('input',  autoSave);
        page.addEventListener('change', autoSave);
        const flushSave = () => saveDraft(docKey, el, 'bl');
        window.addEventListener('beforeunload', flushSave);
        el.querySelector('.e-close-btn')?.addEventListener('click', () => {
          window.removeEventListener('beforeunload', flushSave);
        }, { once: true });
      }
      lignes.forEach(l => tbody.appendChild(makeBLRow(l, page)));

      if (blReadonly) {
        page.classList.add('e-readonly');
        page.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; el.style.pointerEvents = 'none'; });
        page.querySelectorAll('.e-del-btn').forEach(btn => { btn.onclick = null; btn.disabled = true; });
        page.querySelectorAll('[contenteditable]').forEach(el => el.setAttribute('contenteditable', 'false'));
        el.querySelector('.e-add-btn').style.display = 'none';
        el.querySelector('.e-save-btn').style.display = 'none';
      } else {
        el.querySelector('.e-add-btn').onclick = () => {
          const row = makeBLRow({}, page);
          tbody.appendChild(row);
          row.querySelector('.e-desig').focus();
        };
      }

      el.querySelector('.e-close-btn').onclick = () => tabMgr.closeTab(el.dataset.tid);

      const previewBtn = el.querySelector('.e-preview-btn');
      if (previewBtn) previewBtn.onclick = () => openPdf(`/api/bons-livraison/${id}/apercu`);

      el.querySelector('.e-save-btn').onclick = async () => {
        const lignesData = [];
        tbody.querySelectorAll('.e-ligne-row').forEach(row => {
          const desig = row.querySelector('.e-desig').value.trim();
          if (!desig) return;
          lignesData.push({
            designation:  desig,
            description:  row.querySelector('.e-description-inp')?.innerText.trim() || undefined,
            quantite:     parseFloat(row.querySelector('.e-qty').value) || 1,
            unite:        row.querySelector('.e-unite')?.value.trim() || undefined,
            numero_serie: row.querySelector('.e-serie')?.value.trim() || undefined,
          });
        });

        const clientId = parseInt(page.querySelector('[name=client_id]')?.value);
        if (!clientId)      return alert('Veuillez sélectionner un client.');
        if (!lignesData.length) return alert('Ajoutez au moins une ligne.');

        const data = {
          client_id:      clientId,
          date_livraison: undefined,
          lieu_livraison: page.querySelector('[name=lieu_livraison]')?.value.trim() || undefined,
          notes:          page.querySelector('[name=notes]')?.innerText.trim() || undefined,
          lignes:         lignesData,
          ...(prefill.devis_id   ? { devis_id:   prefill.devis_id }   : {}),
          ...(prefill.facture_id ? { facture_id: prefill.facture_id } : {}),
        };

        const saveBtn = el.querySelector('.e-save-btn');
        saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…';
        try {
          const r = id
            ? await api.put(`/api/bons-livraison/${id}`, data)
            : await api.post('/api/bons-livraison', { ...data, entreprise_id: _entreprise.id });
          if (r?.error) { alert(r.error); return; }
          if (el.dataset.docKey) clearDraft(el.dataset.docKey);
          tabMgr.closeTab(el.dataset.tid);
          tabMgr.openViewTab('bons-livraison');
        } finally {
          saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer';
        }
      };
    });
  }

  async function openAcompte(id) {
    const [entreprise, ac] = await Promise.all([
      api.get('/api/entreprise'),
      api.get(`/api/acomptes/${id}`),
    ]);
    if (!ac || !ac.id) return;

    _entreprise = entreprise;
    if (entreprise.logo_path) _brandColor = await extractBrandColor('/storage/logo/logo_pdf.png');

    const bc     = _brandColor;
    const numero = ac.numero || '—';

    const clientOpts = clientOptions.map(c => {
      const name = c.raison_sociale || [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ');
      return `<option value="${c.id}" ${c.id == ac.client_id ? 'selected' : ''}>${name}</option>`;
    }).join('');

    const logoHTML = entreprise.logo_path
      ? `<img class="e-logo" src="/storage/logo/logo_pdf.png?t=${Date.now()}" alt="logo">` : '';

    tabMgr.openDocTab('acompte', id, numero, async (el) => {
      el.classList.add('e-editor-panel');
      el.innerHTML = `
        <div class="e-toolbar">
          <div class="e-tb-left">
            <button class="btn btn-outline btn-sm e-close-btn">← Retour</button>
            <span class="e-tb-title">ACOMPTE ${numero}</span>
          </div>
          <div class="e-tb-right">
            <button class="btn btn-outline btn-sm" onclick="openPdf('/api/acomptes/${id}/apercu')">👁 Aperçu PDF</button>
            <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
            ${ac.statut === 'en_attente' ? `<button class="btn btn-success btn-sm" onclick="encaisserAcompte(${id})">Encaisser</button>` : ''}
          </div>
        </div>
        <div class="e-canvas">
          <div class="a4-page">
            <div class="e-page-header">
              <div class="e-company">
                <div class="e-company-name">${entreprise.raison_sociale}${entreprise.is_EI?' EI':''}</div>
                <div class="e-company-line">${entreprise.adresse}</div>
                <div class="e-company-line">${entreprise.code_postal} ${entreprise.ville}</div>
                <div class="e-company-line">SIRET : ${entreprise.siret}</div>
              </div>
              <div class="e-logo-area">${logoHTML}</div>
            </div>
            <div class="e-client-block">
              <div class="e-client-label">Destinataire</div>
              <select class="e-client-sel" disabled>${clientOpts}</select>
              <div class="e-client-preview" id="acClientPreview"></div>
            </div>
            <div class="e-separator" style="border-top-color:${bc}"></div>
            <div class="e-dochead">
              <div class="e-dochead-left">
                <div class="e-doc-type" style="color:${bc}">ACOMPTE</div>
                <div class="e-doc-numero">N° ${numero}</div>
                <div class="e-date-row"><span class="e-date-label">Date</span><span style="font-size:9pt">${ac.created_at ? new Date(ac.created_at).toLocaleDateString('fr-FR') : '—'}</span></div>
                ${ac.date_encaissement ? `<div class="e-date-row"><span class="e-date-label">Encaissé le</span><span style="font-size:9pt">${new Date(ac.date_encaissement).toLocaleDateString('fr-FR')}</span></div>` : ''}
              </div>
              <div class="e-dochead-right">
                ${ac.mode_paiement ? `<div class="e-meta-row"><span class="e-meta-label">Mode</span><span style="font-size:9pt">${ac.mode_paiement}</span></div>` : ''}
                ${ac.pourcentage ? `<div class="e-meta-row"><span class="e-meta-label">Pourcentage</span><span style="font-size:9pt">${ac.pourcentage} %</span></div>` : ''}
              </div>
            </div>
            <div class="e-doc-bottom">
              <div class="e-doc-bottom-left"></div>
              <div class="e-doc-bottom-right">
                <div class="e-totaux-inner">
                  <div class="e-total-row"><span>Montant HT</span><span>${new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2}).format(ac.montant_ht||0)} €</span></div>
                  <div class="e-total-row"><span>TVA ${ac.taux_tva_valeur||0} %</span><span>${new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2}).format(ac.montant_tva||0)} €</span></div>
                  <div class="e-total-row e-total-ttc-row" style="color:${bc}"><span>Total TTC</span><span>${new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2}).format(ac.montant_ttc||0)} €</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>`;

      // Client preview
      const prev = el.querySelector('#acClientPreview');
      const cid  = parseInt(el.querySelector('.e-client-sel')?.value);
      renderClientPreview(cid ? clientOptions.find(c => c.id === cid) : null, prev);

      el.querySelector('.e-close-btn').onclick = () => tabMgr.closeTab(el.dataset.tid);
    });
  }

  return {
    openDevis:   (id = null) => open('devis',   id || null),
    openFacture: (id = null) => open('facture', id || null),
    openAvoir:   async (factureId) => {
      const factureOrigine = await api.get(`/api/factures/${factureId}`);
      return open('avoir', null, { factureOrigine });
    },
    openBL:      (id = null, prefill = {}) => openBL(id || null, prefill),
    openAcompte: (id) => openAcompte(id),
    // Restauration de brouillons non sauvegardés
    restoreDraft: (type, docKey) => {
      const draft = loadDraft(docKey);
      if (!draft) return;
      if (type === 'bl') return openBL(null, { docKey, draft });
      return open(type, null, { docKey, draft });
    },
  };
})();
