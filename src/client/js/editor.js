// ── WYSIWYG Document Editor ────────────────────────────────────────────────
// Dépend des globaux de app.js : clientOptions, tvaOptions, api, tabMgr,
// openPdf, attachArticleAutocomplete, SearchSelect (components.js)

const DocEditor = (() => {

  // ── Configuration par type de document ───────────────────────────────────

  const ROUTES = {
    devis:   'devis',
    facture: 'factures',
    avoir:   'factures',
    bl:      'bons-livraison',
    acompte: 'acomptes',
  };

  const LIST_VIEWS = {
    devis:   'devis',
    facture: 'factures',
    avoir:   'avoirs',
    bl:      'bons-livraison',
    acompte: 'acomptes',
  };

  const DOC_LABELS = {
    devis:   'DEVIS',
    facture: 'FACTURE',
    avoir:   'AVOIR',
    bl:      'BON DE LIVRAISON',
    acompte: 'ACOMPTE',
  };

  // ── État module ───────────────────────────────────────────────────────────

  let _entreprise = null;
  let _brandColor = '#1A3A5C';

  // ── Utilitaires ───────────────────────────────────────────────────────────

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function fmt(n) {
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    return formatted + ' €'; // espace insécable avant €
  }

  function tvaLabel(t) {
    if (t.taux > 0) return t.taux.toLocaleString('fr-FR') + ' %';
    return (t.libelle || '').toLowerCase().includes('autoliquidation') ? 'Autoliq.' : 'Exo.';
  }

  function lighten(hex, a = 0.93) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return '#' + [r,g,b].map(c => Math.round(c+(255-c)*a).toString(16).padStart(2,'0')).join('');
  }

  async function extractBrandColor(imgUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 50;
          const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,50,50);
          const { data } = ctx.getImageData(0,0,50,50);
          const hist = {};
          for (let i = 0; i < data.length; i += 4) {
            const [r,g,b] = [data[i],data[i+1],data[i+2]];
            if (r>215 && g>215 && b>215) continue;
            const k = [r,g,b].map(v => Math.round(v/16)*16).join(',');
            hist[k] = (hist[k]||0)+1;
          }
          let max=0, best='#1A3A5C';
          for (const [k,n] of Object.entries(hist)) {
            if (n>max) { max=n; best='#'+k.split(',').map(v=>(+v).toString(16).padStart(2,'0')).join(''); }
          }
          resolve(best);
        } catch { resolve('#1A3A5C'); }
      };
      img.onerror = () => resolve('#1A3A5C');
      img.src = imgUrl + '?t=' + Date.now();
    });
  }

  // ── Draft ─────────────────────────────────────────────────────────────────

  function serializeDraft(el, type) {
    const page = el.querySelector('.a4-page'); if (!page) return null;
    const isBL = type === 'bl';
    const lignes = [];
    page.querySelectorAll('.e-ligne-row').forEach(row => {
      const d = row.querySelector('.e-desig')?.value.trim(); if (!d) return;
      lignes.push(isBL ? {
        designation: d,
        description: row.querySelector('.e-description-inp')?.innerText.trim() || '',
        quantite:    parseFloat(row.querySelector('.e-qty')?.value) || 1,
        unite:       row.querySelector('.e-unite')?.value.trim() || '',
        numero_serie:row.querySelector('.e-serie')?.value.trim() || '',
      } : {
        designation:      d,
        description:      row.querySelector('.e-description-inp')?.innerText.trim() || '',
        quantite:         parseFloat(row.querySelector('.e-qty')?.value) || 1,
        prix_unitaire_ht: parseFloat(row.querySelector('.e-pu')?.value) || 0,
        taux_tva_id:      parseInt(row.querySelector('.e-tva-sel')?.value) || 1,
        remise_pct:       parseFloat(row.querySelector('.e-remise')?.value) || 0,
        numero_serie:     row.querySelector('.e-serie')?.value.trim() || '',
      });
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

  const saveDraft  = (key, el, type) => { try { const d=serializeDraft(el,type); if(d) localStorage.setItem('facturpro_draft_'+key, JSON.stringify(d)); } catch(e){} };
  const loadDraft  = key => { try { return JSON.parse(localStorage.getItem('facturpro_draft_'+key)||'null'); } catch(e){ return null; } };
  const clearDraft = key => localStorage.removeItem('facturpro_draft_'+key);

  // ── HTML partagés ─────────────────────────────────────────────────────────

  function buildLogoHTML(entreprise) {
    return entreprise.logo_path
      ? `<img class="e-logo" src="/storage/logo/logo_pdf.png?t=${Date.now()}" alt="logo">`
      : '';
  }

  function buildCompanyHeader(entreprise) {
    return `
      <div class="e-page-header">
        <div class="e-company">
          <div class="e-company-name">${entreprise.raison_sociale}${entreprise.is_EI?' EI':''}</div>
          <div class="e-company-line">${entreprise.adresse}</div>
          ${entreprise.adresse2 ? `<div class="e-company-line">${entreprise.adresse2}</div>` : ''}
          <div class="e-company-line">${entreprise.code_postal} ${entreprise.ville}</div>
          <div class="e-company-line">SIRET : ${entreprise.siret}</div>
          ${entreprise.tva_intracom ? `<div class="e-company-line">TVA : ${entreprise.tva_intracom}</div>` : ''}
          <div class="e-company-line">${entreprise.email}</div>
        </div>
        <div class="e-logo-area">${buildLogoHTML(entreprise)}</div>
      </div>`;
  }

  function clientLabel(c) {
    return c.raison_sociale || [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ');
  }

  function renderClientPreview(client, el) {
    if (!el) return;
    if (!client) { el.innerHTML = ''; return; }
    const parts = [client.civilite,client.prenom,client.nom].filter(Boolean).join(' ');
    const nom   = (client.type_client === 'professionnel' ? (client.raison_sociale||'') : parts) || parts;
    const ville = [client.code_postal, client.ville].filter(Boolean).join(' ');
    el.innerHTML = `
      <div class="e-cp-name">${nom}</div>
      ${client.adresse  ? `<div>${client.adresse}</div>`  : ''}
      ${client.adresse2 ? `<div>${client.adresse2}</div>` : ''}
      ${ville ? `<div>${ville}</div>` : ''}
      ${client.tva_intracom ? `<div>TVA : ${client.tva_intracom}</div>` : ''}`;
  }

  function initClientSearch(wrap, preview) {
    if (!wrap) return;
    const initVal = parseInt(wrap.dataset.initClient) || undefined;
    const sel = SearchSelect(wrap, {
      items:        clientOptions,
      labelFn:      clientLabel,
      valueFn:      c => c.id,
      placeholder:  'Rechercher un client…',
      initialValue: initVal,
      align:        'right',
      createLabel:  '+ Nouveau client',
      onCreate:     () => showClientForm(),
      onSelect:     client => renderClientPreview(client, preview),
    });
    sel.hidden.name = 'client_id';
    if (initVal) {
      const found = clientOptions.find(c => c.id == initVal);
      if (found) {
        renderClientPreview(found, preview);
      } else {
        // Client hors enterprise courante (ex: BL d'une autre société) — fetch direct
        api.get(`/api/clients/${initVal}`).then(c => {
          if (c?.id) {
            renderClientPreview(c, preview);
            sel.input.value  = clientLabel(c);
            sel.hidden.value = c.id;
          }
        }).catch(() => {});
      }
    }
  }

  // ── Ligne rows ────────────────────────────────────────────────────────────

  function calcLigne(row) {
    const qty=parseFloat(row.querySelector('.e-qty').value)||0, pu=parseFloat(row.querySelector('.e-pu').value)||0, r=parseFloat(row.querySelector('.e-remise').value)||0;
    const ht = qty * pu * (1 - r/100);
    row.querySelector('.e-ligne-total').textContent = fmt(ht);
    return ht;
  }

  function calcTotaux(page) {
    const tvaMap = {}; let totalHT = 0;
    page.querySelectorAll('.e-ligne-row').forEach(row => {
      const qty=parseFloat(row.querySelector('.e-qty').value)||0, pu=parseFloat(row.querySelector('.e-pu').value)||0, r=parseFloat(row.querySelector('.e-remise').value)||0;
      const tvaId=row.querySelector('.e-tva-sel')?.value, taux=(tvaOptions.find(t=>t.id==tvaId)||{taux:0}).taux;
      const ht=qty*pu*(1-r/100); totalHT+=ht; tvaMap[taux]=(tvaMap[taux]||0)+ht*taux/100;
    });
    let totalTVA=0;
    const tvaEl=page.querySelector('.e-tva-lines'); if(tvaEl) { tvaEl.innerHTML=''; Object.entries(tvaMap).filter(([,v])=>v>0).forEach(([taux,m])=>{ totalTVA+=m; tvaEl.insertAdjacentHTML('beforeend',`<div class="e-total-row"><span>TVA ${taux} %</span><span>${fmt(m)}</span></div>`); }); }
    const htEl=page.querySelector('.e-ht-val'), ttcEl=page.querySelector('.e-ttc-val');
    if(htEl) htEl.textContent=fmt(totalHT);
    if(ttcEl) ttcEl.textContent=fmt(totalHT+totalTVA);
  }

  function makeLigneRow(l={}, page, opts={}) {
    const showSerie=opts.showSerie??false;
    const tvaOpts=tvaOptions.map(t=>`<option value="${t.id}" ${t.id==(l.taux_tva_id||1)?'selected':''}>${tvaLabel(t)}</option>`).join('');
    const stockBadge=l._stock!=null?`<span class="e-stock-badge" title="Stock">${l._stock}</span>`:'';
    const tr=document.createElement('tr'); tr.className='e-ligne-row';
    tr.innerHTML=`
      <td class="e-td-desig">
        <div style="display:flex;align-items:center;gap:4px"><input class="e-cell e-desig" value="${(l.designation||'').replace(/"/g,'&quot;')}" placeholder="Désignation…" style="flex:1">${stockBadge}</div>
        <div class="e-description-inp" contenteditable="true" data-placeholder="Description…">${l.description||''}</div>
        ${showSerie?`<input class="e-cell e-serie" value="${(l.numero_serie||'').replace(/"/g,'&quot;')}" placeholder="N° de série…" style="font-size:8pt;color:#888;margin-top:2px">`:''}
      </td>
      <td class="e-td-num"><input class="e-cell e-qty" type="number" style="text-align:right" value="${l.quantite||1}" min="0.001" step="0.001"></td>
      <td class="e-td-num"><input class="e-cell e-pu" type="number" style="text-align:right" value="${l.prix_unitaire_ht ?? 1}" step="0.01" placeholder="0,00"></td>
      <td class="e-td-num"><input class="e-cell e-remise" type="number" style="text-align:right" value="${l.remise_pct||0}" min="0" max="100"></td>
      <td class="e-td-tva"><select class="e-cell e-tva-sel">${tvaOpts}</select></td>
      <td class="e-td-total e-ligne-total">${fmt(l.montant_ht||0)}</td>
      <td class="e-td-del"><button class="e-del-btn" title="Supprimer">✕</button></td>`;
    tr.querySelector('.e-del-btn').onclick=()=>{tr.remove();calcTotaux(page);};
    tr.querySelectorAll('.e-qty,.e-pu,.e-remise,.e-tva-sel').forEach(i=>i.addEventListener('input',()=>{calcLigne(tr);calcTotaux(page);}));
    const desig=tr.querySelector('.e-desig');
    attachArticleAutocomplete(desig,tr.querySelector('.e-pu'),tr.querySelector('.e-tva-sel'));
    desig.addEventListener('input',()=>calcTotaux(page));
    desig.addEventListener('article-selected', e => {
      const art = e.detail;
      calcLigne(tr); calcTotaux(page);
      if (art?.quantite_stock!=null){tr.querySelector('.e-qty').max=art.quantite_stock;let badge=tr.querySelector('.e-stock-badge');if(!badge){badge=document.createElement('span');badge.className='e-stock-badge';badge.title='Stock';desig.parentNode.insertBefore(badge,desig.nextSibling);}badge.textContent=art.quantite_stock;}
    });
    return tr;
  }

  function makeBLRow(l={}, page) {
    const stockBadge=l._stock!=null?`<span class="e-stock-badge" title="Stock">${l._stock}</span>`:'';
    const tr=document.createElement('tr'); tr.className='e-ligne-row';
    tr.innerHTML=`
      <td class="e-td-desig">
        <div style="display:flex;align-items:center;gap:4px"><input class="e-cell e-desig" value="${(l.designation||'').replace(/"/g,'&quot;')}" placeholder="Désignation…" style="flex:1">${stockBadge}</div>
        <div class="e-description-inp" contenteditable="true" data-placeholder="Description…">${l.description||''}</div>
        <input class="e-cell e-serie" value="${(l.numero_serie||'').replace(/"/g,'&quot;')}" placeholder="N° de série…" style="font-size:8pt;color:#888;margin-top:2px">
      </td>
      <td class="e-td-num"><input class="e-cell e-qty" type="number" style="text-align:right" value="${l.quantite||1}" min="0.001" step="0.001"${l._stock!=null?` max="${l._stock}"`:''}></td>
      <td class="e-td-tva"><input class="e-cell e-unite" value="${l.unite||''}" placeholder="heure…"></td>
      <td class="e-td-del"><button class="e-del-btn" title="Supprimer">✕</button></td>`;
    tr.querySelector('.e-del-btn').onclick=()=>tr.remove();
    const desig=tr.querySelector('.e-desig');
    attachArticleAutocomplete(desig,null,null,tr.querySelector('.e-unite'));
    desig.addEventListener('article-selected',e=>{const art=e.detail;if(art?.quantite_stock!=null){tr.querySelector('.e-qty').max=art.quantite_stock;let badge=tr.querySelector('.e-stock-badge');if(!badge){badge=document.createElement('span');badge.className='e-stock-badge';badge.title='Stock';desig.parentNode.insertBefore(badge,desig.nextSibling);}badge.textContent=art.quantite_stock;}});
    return tr;
  }

  // ── Builder HTML unifié ───────────────────────────────────────────────────

  function buildDocHTML(type, entreprise, doc) {
    const isBL      = type === 'bl';
    const isFacture = type === 'facture' || type === 'avoir';
    const isAvoir   = type === 'avoir';
    const bc        = _brandColor;
    const numero    = doc?.numero || '—';
    const today     = new Date().toISOString().slice(0,10);
    const label     = DOC_LABELS[type] || type.toUpperCase();

    // Champs de dates selon le type
    const dateFields = isBL ? `
      <div class="e-date-row"><span class="e-date-label">Date d'émission</span><input class="e-date-inp" type="date" name="date_emission" value="${doc?.date_emission?.slice(0,10)||today}"></div>`
    : isFacture ? `
      <div class="e-date-row"><span class="e-date-label">Date d'émission</span><input class="e-date-inp" type="date" name="date_emission" value="${doc?.date_emission?.slice(0,10)||today}"></div>
      ${!isAvoir && (doc?.date_echeance || !doc?.locked) ? `<div class="e-date-row"><span class="e-date-label">Échéance</span><input class="e-date-inp" type="date" name="date_echeance" value="${doc?.date_echeance?.slice(0,10)||''}"></div>` : ''}
      ${isAvoir && doc?.facture_origine_numero ? `<div class="e-date-row"><span class="e-date-label" style="color:#888">Avoir sur</span><span style="font-size:9pt;font-weight:600;color:#555">${doc.facture_origine_numero}</span></div>` : ''}`
    : `
      <div class="e-date-row"><span class="e-date-label">Date</span><input class="e-date-inp" type="date" name="date_creation" value="${doc?.date_creation?.slice(0,10)||today}"></div>
      <div class="e-date-row"><span class="e-date-label">Valable jusqu'au</span><input class="e-date-inp" type="date" name="date_validite" value="${doc?.date_validite?.slice(0,10)||new Date(Date.now()+30*864e5).toISOString().slice(0,10)}"></div>`;

    // Champs meta droite
    const metaFields = isBL ? `
      <div class="e-meta-row"><span class="e-meta-label">Lieu de livraison</span><input class="e-meta-inp" name="lieu_livraison" value="${(doc?.lieu_livraison||'').replace(/"/g,'&quot;')}" placeholder="Adresse ou lieu…"></div>
      ${doc?.devis_id || doc?.facture_id ? `<div class="e-meta-row"><span class="e-meta-label">Réf.</span><span style="font-size:9pt;color:#555">${doc.devis_ref||doc.facture_ref||''}</span></div>` : ''}`
    : isFacture ? `
      <div class="e-meta-row"><span class="e-meta-label">Objet</span><input class="e-meta-inp" name="objet" value="${(doc?.objet||'').replace(/"/g,'&quot;')}" placeholder="Objet du document…"></div>
      <div class="e-meta-row"><span class="e-meta-label">Régime TVA</span><select class="e-meta-sel" name="tva_mode">
        <option value="normal" ${(doc?.tva_mode||'normal')==='normal'?'selected':''}>Normal</option>
        <option value="franchise_293b" ${doc?.tva_mode==='franchise_293b'?'selected':''}>Franchise 293 B</option>
        <option value="autoliquidation" ${doc?.tva_mode==='autoliquidation'?'selected':''}>Autoliquidation</option>
      </select></div>
      <div class="e-meta-row"><span class="e-meta-label">Mode de règlement</span><select class="e-meta-sel" name="mode_paiement">
        <option value="">— Non précisé —</option>
        ${['Virement bancaire','Virement SEPA','Chèque','Espèces','Carte bancaire','Prélèvement','Prélèvement SEPA','PayPal','Autre'].map(m=>{const v=m.toLowerCase().replace(/ /g,'_').replace(/[éè]/g,'e');return`<option value="${v}" ${doc?.mode_paiement===v?'selected':''}>${m}</option>`;}).join('')}
      </select></div>`
    : `
      <div class="e-meta-row"><span class="e-meta-label">Objet</span><input class="e-meta-inp" name="objet" value="${(doc?.objet||'').replace(/"/g,'&quot;')}" placeholder="Objet du document…"></div>
      <div class="e-meta-row e-meta-row-check"><label><input type="checkbox" name="is_free" ${(doc?.is_free||!doc?.id)?'checked':''}> Devis gratuit</label></div>`;

    // Tableau des lignes
    const thCols = isBL
      ? `<th class="e-th-desig">Désignation</th><th class="e-th-num">Qté</th><th class="e-th-tva" style="width:10%">Unité</th><th class="e-th-del"></th>`
      : `<th class="e-th-desig">Désignation</th><th class="e-th-num">Qté</th><th class="e-th-num">P.U. HT</th><th class="e-th-num">Remise %</th><th class="e-th-tva">TVA</th><th class="e-th-total">Total HT</th><th class="e-th-del"></th>`;

    // Zone bas : totaux + signature
    const bottomLeft = isBL ? `
      <div class="e-signature-label">Signature du destinataire — Bon pour accord de réception</div>
      <div class="e-sig-dated-box"><div class="e-sig-date-row"><span class="e-sig-date-label">Date :</span><span class="e-sig-date-line"></span></div><div class="e-sig-space"></div></div>`
    : !isFacture ? `
      <div class="e-signature-label">Bon pour accord — Signature du client</div>
      <div class="e-sig-dated-box"><div class="e-sig-date-row"><span class="e-sig-date-label">Date :</span><span class="e-sig-date-line"></span></div><div class="e-sig-space"></div></div>
      <div class="e-signature-hint">Précédé de la mention « Bon pour accord »</div>`
    : '';

    const bottomRight = !isBL ? `
      <div class="e-totaux-inner">
        <div class="e-total-row e-total-ht-row"><span>Total HT</span><span class="e-ht-val">0,00 €</span></div>
        <div class="e-tva-lines"></div>
        <div class="e-total-row e-total-ttc-row" style="color:${bc}"><span>Total TTC</span><span class="e-ttc-val">0,00 €</span></div>
      </div>` : '';

    // Footer (conditions/notes)
    const footer = isBL ? `
      <div class="e-footer">
        <div class="e-footer-label">Notes / Instructions de livraison</div>
        <div class="e-footer-editable" contenteditable="true" name="notes" data-placeholder="Remarques…">${doc?.notes||''}</div>
      </div>` : `
      <div class="e-footer">
        <div class="e-footer-label">Conditions de paiement</div>
        <div class="e-footer-editable" contenteditable="true" name="conditions_paiement" data-placeholder="Paiement à 30 jours…">${doc?.conditions_paiement||''}</div>
        <div class="e-footer-label" style="margin-top:12px">Notes</div>
        <div class="e-footer-editable" contenteditable="true" name="notes" data-placeholder="Notes complémentaires…">${doc?.notes||''}</div>
      </div>`;

    return `
    <div class="e-toolbar">
      <div class="e-tb-left">
        <button class="btn btn-outline btn-sm e-close-btn">← Retour</button>
        <span class="e-tb-title">${numero==='—'?`Nouveau ${label.toLowerCase()}`:`${label} ${numero}`}</span>
      </div>
      <div class="e-tb-right">
        ${doc?.id?`<button class="btn btn-outline btn-sm e-preview-btn">👁 Aperçu PDF</button>`:''}
        <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
        <button class="btn btn-primary btn-sm e-save-btn">Enregistrer</button>
      </div>
    </div>
    <div class="e-canvas">
      <div class="a4-page">
        ${buildCompanyHeader(entreprise)}
        <div class="e-client-block">
          <div class="e-client-label">Destinataire</div>
          <div class="ss-wrap" data-init-client="${doc?.client_id||''}"></div>
          <div class="e-client-preview"></div>
        </div>
        <div class="e-separator" style="border-top-color:${bc}"></div>
        <div class="e-dochead">
          <div class="e-dochead-left">
            <div class="e-doc-type" style="color:${bc}">${label}</div>
            <div class="e-doc-numero">N° ${numero}</div>
            ${dateFields}
          </div>
          <div class="e-dochead-right">${metaFields}</div>
        </div>
        <table class="e-lignes-table">
          <thead><tr style="background:${bc};color:#fff">${thCols}</tr></thead>
          <tbody class="e-lignes-body"></tbody>
        </table>
        <button class="e-add-btn">+ Ajouter une ligne</button>
        ${footer}
        <div class="e-doc-bottom">
          <div class="e-doc-bottom-left">${bottomLeft}</div>
          <div class="e-doc-bottom-right">${bottomRight}</div>
        </div>

      </div>
    </div>`;
  }

  // ── Init unifié ────────────────────────────────────────────────────────────

  function initDoc(type, id, el, doc) {
    const isBL   = type === 'bl';
    const page   = el.querySelector('.a4-page');
    const tbody  = el.querySelector('.e-lignes-body');
    const docKey = el.dataset.docKey;








    // Client search
    initClientSearch(el.querySelector('.ss-wrap'), el.querySelector('.e-client-preview'));

    // Auto-save brouillons
    if (!id && docKey) {
      const autoSave = debounce(() => saveDraft(docKey, el, type), 600);
      page.addEventListener('input', autoSave);
      page.addEventListener('change', autoSave);
      const flush = () => saveDraft(docKey, el, type);
      window.addEventListener('beforeunload', flush);
      el.querySelector('.e-close-btn')?.addEventListener('click', () => window.removeEventListener('beforeunload', flush), { once: true });
    }

    // Lignes
    const readonly = !!(doc?.locked || (type==='bl' && doc?.statut==='livre'));
    const lignes   = doc?.lignes?.length ? doc.lignes : (readonly ? [] : [{}]);
    const makeRow  = isBL ? l => makeBLRow(l, page) : l => makeLigneRow(l, page, { showSerie: type==='facture'||type==='avoir' });
    lignes.forEach(l => {
      const row = makeRow(l);
      tbody.appendChild(row);
      if (!isBL) calcLigne(row); // met à jour la cellule Total HT de chaque ligne
    });
    if (!isBL) calcTotaux(page);

    if (readonly) {
      // Mode lecture
      page.classList.add('e-readonly');
      page.querySelectorAll('input,select,textarea').forEach(e=>{e.disabled=true;e.style.pointerEvents='none';});
      page.querySelectorAll('.e-del-btn').forEach(b=>{b.onclick=null;b.disabled=true;});
      page.querySelectorAll('[contenteditable]').forEach(e=>e.setAttribute('contenteditable','false'));
      el.querySelector('.e-add-btn').style.display='none';
      el.querySelector('.e-save-btn').style.display='none';
      buildReadonlyToolbar(type, id, doc, el);
    } else {
      // Mode édition
      el.querySelector('.e-add-btn').onclick = () => {
        const row = makeRow({});
        tbody.appendChild(row);
        calcLigne(row); calcTotaux(page);
        row.querySelector('.e-desig').focus();
      };

      const previewBtn = el.querySelector('.e-preview-btn');
      if (previewBtn && id) previewBtn.onclick = () => openPdf(`/api/${ROUTES[type]}/${id}/apercu`);

      buildEditToolbar(type, id, doc, el, page);
    }

    el.querySelector('.e-close-btn').onclick = () => tabMgr.closeTab(el.dataset.tid);
  }

  function buildReadonlyToolbar(type, id, doc, el) {
    const toolbar  = el.querySelector('.e-tb-right');
    const isFac    = type==='facture'||type==='avoir';
    const isAvoir  = doc?.type_facture==='avoir';
    const route    = ROUTES[type];
    toolbar.innerHTML = `
      <button class="btn btn-outline btn-sm e-preview-btn">👁 Aperçu PDF</button>
      <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
      ${type==='devis'?`
        <button class="btn btn-outline btn-sm e-send-btn">✉ Envoyer</button>
        ${doc?.statut==='signe'?`<button class="btn btn-warning btn-sm" onclick="showAvenantForm(${id})">📝 Avenant</button><button class="btn btn-outline btn-sm" onclick="showFactureFromDevisForm(${id})">🧾 Facturer</button><button class="btn btn-outline btn-sm" onclick="showBLFromDevisForm(${id})">🚚 BL</button>`:''}
      `:type==='bl'?`
        <button class="btn btn-outline btn-sm e-send-btn">✉ Envoyer</button>
        <button class="btn btn-outline btn-sm" onclick="factureFromBL(${id})">🧾 → Facture</button>
      `:`
        ${['emise','payee'].includes(doc?.statut)?`<button class="btn btn-success btn-sm" disabled style="cursor:default;opacity:1">✓ Émis</button>`:''}
        <button class="btn btn-outline btn-sm e-send-btn">✉ Envoyer</button>
        ${doc?.statut==='emise'?`<button class="btn btn-primary btn-sm" onclick="payerFacture(${id})">💳 Payer</button>`:''}
        ${['emise','payee'].includes(doc?.statut)&&!isAvoir?`<button class="btn btn-outline btn-sm" onclick="DocEditor.openAvoir(${id})">Avoir</button>`:''}
      `}`;
    toolbar.querySelector('.e-preview-btn').onclick = () => openPdf(`/api/${route}/${id}/apercu`);
    toolbar.querySelector('.e-send-btn')?.addEventListener('click', () => isFac ? envoyerFacture(id) : (type==='bl' ? null : envoyerDevis(id)));
  }

  function buildEditToolbar(type, id, doc, el, page) {
    const tbRight = el.querySelector('.e-tb-right');
    const saveBtn = tbRight.querySelector('.e-save-btn');
    const ins = b => tbRight.insertBefore(b, saveBtn);
    const mkBtn = (label, cls, fn, disabled=false) => {
      const b = document.createElement('button');
      b.className = `btn ${cls} btn-sm`;
      b.textContent = label;
      if (disabled) { b.disabled=true; b.style.cursor='default'; b.style.opacity='1'; }
      else b.onclick = fn;
      return b;
    };

    if (type==='devis' && id) {
      const s = doc?.statut;
      if (s==='accepte') {
        ins(mkBtn('✓ Accepté','btn-success',null,true));
        ins(mkBtn('🚚 → BL','btn-primary',()=>showBLFromDevisForm(id)));
        ins(mkBtn('🧾 Facturer','btn-outline',()=>showFactureFromDevisForm(id)));
        ins(mkBtn('Signer','btn-outline',async()=>{if(!confirm('Signer ce devis ?'))return;await api.post(`/api/devis/${id}/signer`);tabMgr.closeTab(el.dataset.tid);tabMgr.openViewTab('devis');}));
      } else if (s==='signe') {
        ins(mkBtn('✓ Accepté','btn-success',null,true));
        ins(mkBtn('📝 Avenant','btn-warning',()=>showAvenantForm(id)));
        ins(mkBtn('🧾 Facturer','btn-outline',()=>showFactureFromDevisForm(id)));
        ins(mkBtn('🚚 BL','btn-outline',()=>showBLFromDevisForm(id)));
      } else {
        const accepterBtn = mkBtn('Accepter','btn-outline',async()=>{
          accepterBtn.disabled=true; accepterBtn.textContent='…';
          const r=await api.post(`/api/devis/${id}/accepter`);
          if(r?.error){alert(r.error);accepterBtn.disabled=false;accepterBtn.textContent='Accepter';return;}
          accepterBtn.textContent='✓ Accepté';accepterBtn.className='btn btn-success btn-sm';accepterBtn.disabled=true;accepterBtn.style.cursor='default';accepterBtn.style.opacity='1';
          tbRight.insertBefore(mkBtn('🚚 → BL','btn-primary',()=>showBLFromDevisForm(id)),accepterBtn.nextSibling);
          tbRight.insertBefore(mkBtn('🧾 Facturer','btn-outline',()=>showFactureFromDevisForm(id)),accepterBtn.nextSibling.nextSibling);
        });
        ins(accepterBtn);
        if(s==='envoye') ins(mkBtn('Signer','btn-outline',async()=>{if(!confirm('Signer ce devis ?'))return;await api.post(`/api/devis/${id}/signer`);tabMgr.closeTab(el.dataset.tid);tabMgr.openViewTab('devis');}));
        ins(mkBtn('✉ Envoyer','btn-outline',()=>envoyerDevis(id)));
      }
    }

    // Boutons contextuels factures/avoirs en mode édition (brouillon)
    if ((type === 'facture' || type === 'avoir') && id && doc?.statut === 'brouillon') {
      ins(mkBtn('Émettre & Envoyer', 'btn-outline', async () => {
        if (!confirm('Émettre cette facture ? Elle sera verrouillée définitivement.')) return;
        const r = await api.post(`/api/factures/${id}/emettre`);
        if (r?.error) { alert(r.error); return; }
        tabMgr.closeTab(el.dataset.tid);
        tabMgr.openViewTab(type === 'avoir' ? 'avoirs' : 'factures');
        setTimeout(() => envoyerFacture(id), 400);
      }));
    }

    // Bouton → Facture pour les BL émis en mode édition
    if (type === 'bl' && id) {
      ins(mkBtn('🧾 → Facture', 'btn-outline', () => factureFromBL(id)));
    }

    // Document existant : commencer en état "sauvegardé" jusqu'à la 1ère modification
    if (id) {
      saveBtn.textContent = '✓ Enregistré';
      saveBtn.className   = 'btn btn-success btn-sm e-save-btn';
      saveBtn.disabled    = true;
      saveBtn.style.cursor  = 'default';
      saveBtn.style.opacity = '1';
    }

    // Dirty state + save
    const markDirty = () => { saveBtn.textContent='Enregistrer'; saveBtn.className='btn btn-primary btn-sm e-save-btn'; saveBtn.disabled=false; saveBtn.style.cursor=''; saveBtn.style.opacity=''; };
    page.addEventListener('input', markDirty);
    page.addEventListener('change', markDirty);
    // currentId peut évoluer après le premier save (nouveau doc → id attribué)
    let currentId = id;
    if (page.dataset.docId) currentId = parseInt(page.dataset.docId);
    saveBtn.onclick = async () => {
      saveBtn.disabled=true; saveBtn.textContent='Enregistrement…';
      const ok = await saveDoc(type, currentId, el, page);
      if (ok) {
        currentId = parseInt(page.dataset.docId || currentId); // maj si nouveau doc
        saveBtn.textContent='✓ Enregistré'; saveBtn.className='btn btn-success btn-sm e-save-btn'; saveBtn.disabled=true; saveBtn.style.cursor='default'; saveBtn.style.opacity='1';
      } else { saveBtn.disabled=false; saveBtn.textContent='Enregistrer'; }
    };
  }

  // ── Save unifié ────────────────────────────────────────────────────────────

  async function saveDoc(type, id, el, page) {
    const isBL  = type === 'bl';
    const route = ROUTES[type];
    const lignes = [];

    page.querySelectorAll('.e-ligne-row').forEach(row => {
      const desig = row.querySelector('.e-desig')?.value.trim(); if (!desig) return;
      lignes.push(isBL ? {
        designation:  desig,
        description:  row.querySelector('.e-description-inp')?.innerText.trim()||undefined,
        quantite:     parseFloat(row.querySelector('.e-qty').value)||1,
        unite:        row.querySelector('.e-unite')?.value.trim()||undefined,
        numero_serie: row.querySelector('.e-serie')?.value.trim()||undefined,
      } : {
        designation:      desig,
        description:      row.querySelector('.e-description-inp')?.innerText.trim()||undefined,
        quantite:         parseFloat(row.querySelector('.e-qty').value)||1,
        prix_unitaire_ht: parseFloat(row.querySelector('.e-pu').value)||0,
        taux_tva_id:      parseInt(row.querySelector('.e-tva-sel').value)||1,
        remise_pct:       parseFloat(row.querySelector('.e-remise').value)||0,
        numero_serie:     row.querySelector('.e-serie')?.value.trim()||undefined,
      });
    });

    const clientId = parseInt(page.querySelector('[name=client_id]')?.value);
    if (!clientId)      { alert('Veuillez sélectionner un client.'); return false; }
    if (!lignes.length) { alert('Ajoutez au moins une ligne.'); return false; }

    const data = { client_id: clientId, lignes };

    if (isBL) {
      data.date_livraison = undefined;
      data.lieu_livraison = page.querySelector('[name=lieu_livraison]')?.value.trim()||undefined;
      data.notes          = page.querySelector('[name=notes]')?.innerText.trim()||undefined;
      if (page.dataset.factureOrigineId) data.facture_id = parseInt(page.dataset.factureOrigineId);
    } else if (type==='devis') {
      data.objet               = page.querySelector('[name=objet]')?.value.trim()||undefined;
      data.date_validite       = page.querySelector('[name=date_validite]')?.value||undefined;
      data.is_free             = page.querySelector('[name=is_free]')?.checked||false;
      data.conditions_paiement = page.querySelector('[name=conditions_paiement]')?.innerText.trim()||undefined;
      data.notes               = page.querySelector('[name=notes]')?.innerText.trim()||undefined;
    } else {
      data.objet               = page.querySelector('[name=objet]')?.value.trim()||undefined;
      data.date_emission       = page.querySelector('[name=date_emission]')?.value||undefined;
      data.date_echeance       = page.querySelector('[name=date_echeance]')?.value||undefined;
      data.tva_mode            = page.querySelector('[name=tva_mode]')?.value||'normal';
      data.mode_paiement       = page.querySelector('[name=mode_paiement]')?.value||undefined;
      data.conditions_paiement = page.querySelector('[name=conditions_paiement]')?.innerText.trim()||undefined;
      data.notes               = page.querySelector('[name=notes]')?.innerText.trim()||undefined;
      if (type==='avoir') { data.type_facture='avoir'; data.facture_origine_id=page.dataset.factureOrigineId?parseInt(page.dataset.factureOrigineId):undefined; }
    }

    try {
      const result = id
        ? await api.put(`/api/${route}/${id}`, data)
        : await api.post(`/api/${route}`, { ...data, entreprise_id: _entreprise.id });
      if (result?.error) { alert(result.error); return false; }
      if (el.dataset.docKey) clearDraft(el.dataset.docKey);
      if (result?.id) {
        page.dataset.docId = result.id;
        // Promouvoir le tab : remplace le docKey 'new-...' par le vrai ID
        // pour que la restauration de session retrouve le bon document
        if (el.dataset.docKey?.startsWith('new-')) {
          el.dataset.docKey = String(result.id);
          const label = result.numero || `${DOC_LABELS[type]} ${result.id}`;
          tabMgr.promoteTab(el.dataset.tid, result.id, label);
        }
      }
      if (result?.numero) {
        const titleEl = el.querySelector('.e-tb-title');
        const numEl   = page.querySelector('.e-doc-numero');
        if (titleEl) titleEl.textContent = `${DOC_LABELS[type]||type.toUpperCase()} ${result.numero}`;
        if (numEl)   numEl.textContent   = `N° ${result.numero}`;
        document.querySelectorAll(`.tab-btn[data-tid="${el.dataset.tid}"] .tab-title`).forEach(t => { t.textContent = result.numero; });
      }
      return true;
    } catch(e) { alert('Erreur lors de l\'enregistrement'); return false; }
  }

  // ── Entrée unique ─────────────────────────────────────────────────────────

  async function open(type, id=null, prefill={}) {
    const [entreprise, doc] = await Promise.all([
      api.get('/api/entreprise'),
      id ? api.get(`/api/${ROUTES[type]}/${id}`) : Promise.resolve(null),
    ]);

    _entreprise = entreprise;
    if (entreprise.logo_path) _brandColor = await extractBrandColor('/storage/logo/logo_pdf.png');

    // Résolution du document effectif (avoir, draft, prefill)
    let effectiveDoc = doc;
    if (!id) {
      if (prefill.factureOrigine) {
        effectiveDoc = { ...prefill.factureOrigine, id:null, numero:null, statut:'brouillon', locked:0,
          facture_origine_id:prefill.factureOrigine.id, facture_origine_numero:prefill.factureOrigine.numero };
      } else if (prefill.draft) {
        effectiveDoc = { ...prefill.draft, id:null, numero:null, locked:0 };
      } else if (prefill.client_id) {
        effectiveDoc = { client_id: prefill.client_id, lignes: prefill.lignes||[] };
      }
    }

    const docKey   = id ? String(id) : (prefill.docKey || `new-${type}-${Date.now()}`);
    const tabLabel = id ? (doc?.numero||`${type} ${id}`) : `Nouveau ${(DOC_LABELS[type]||type).toLowerCase()}`;

    tabMgr.openDocTab(type, docKey, tabLabel, async el => {
      el.classList.add('e-editor-panel');
      el.dataset.docKey = docKey;
      el.innerHTML = buildDocHTML(type, entreprise, effectiveDoc);
      if (prefill.factureOrigine) el.querySelector('.a4-page').dataset.factureOrigineId = prefill.factureOrigine.id;
      initDoc(type, id, el, effectiveDoc);
    });
  }

  // ── Viewer acompte (lecture seule spécifique) ─────────────────────────────

  async function openAcompte(id) {
    const [entreprise, ac] = await Promise.all([api.get('/api/entreprise'), api.get(`/api/acomptes/${id}`)]);
    if (!ac?.id) return;
    _entreprise = entreprise;
    if (entreprise.logo_path) _brandColor = await extractBrandColor('/storage/logo/logo_pdf.png');
    const bc = _brandColor;

    tabMgr.openDocTab('acompte', id, ac.numero, async el => {
      el.classList.add('e-editor-panel');
      el.innerHTML = `
        <div class="e-toolbar">
          <div class="e-tb-left"><button class="btn btn-outline btn-sm e-close-btn">← Retour</button><span class="e-tb-title">ACOMPTE ${ac.numero}</span></div>
          <div class="e-tb-right">
            <button class="btn btn-outline btn-sm" onclick="openPdf('/api/acomptes/${id}/apercu')">👁 Aperçu PDF</button>
            <button class="btn btn-outline btn-sm" onclick="window.print()" title="Imprimer">🖨️</button>
            ${ac.statut==='en_attente'?`<button class="btn btn-success btn-sm" onclick="encaisserAcompte(${id})">Encaisser</button>`:''}
          </div>
        </div>
        <div class="e-canvas"><div class="a4-page">
          ${buildCompanyHeader(entreprise)}
          <div class="e-client-block"><div class="e-client-label">Destinataire</div><div class="ss-wrap" data-init-client="${ac.client_id||''}"></div><div class="e-client-preview"></div></div>
          <div class="e-separator" style="border-top-color:${bc}"></div>
          <div class="e-dochead">
            <div class="e-dochead-left">
              <div class="e-doc-type" style="color:${bc}">ACOMPTE</div>
              <div class="e-doc-numero">N° ${ac.numero}</div>
              <div class="e-date-row"><span class="e-date-label">Date</span><span style="font-size:9pt">${ac.created_at?new Date(ac.created_at).toLocaleDateString('fr-FR'):'—'}</span></div>
              ${ac.date_encaissement?`<div class="e-date-row"><span class="e-date-label">Encaissé le</span><span style="font-size:9pt">${new Date(ac.date_encaissement).toLocaleDateString('fr-FR')}</span></div>`:''}
            </div>
            <div class="e-dochead-right">
              ${ac.mode_paiement?`<div class="e-meta-row"><span class="e-meta-label">Mode</span><span style="font-size:9pt">${ac.mode_paiement}</span></div>`:''}
              ${ac.pourcentage?`<div class="e-meta-row"><span class="e-meta-label">Pourcentage</span><span style="font-size:9pt">${ac.pourcentage} %</span></div>`:''}
            </div>
          </div>
          <div class="e-doc-bottom">
            <div class="e-doc-bottom-left"></div>
            <div class="e-doc-bottom-right"><div class="e-totaux-inner">
              <div class="e-total-row"><span>Montant HT</span><span>${fmt(ac.montant_ht)}</span></div>
              <div class="e-total-row"><span>TVA ${ac.taux_tva_valeur||0} %</span><span>${fmt(ac.montant_tva)}</span></div>
              <div class="e-total-row e-total-ttc-row" style="color:${bc}"><span>Total TTC</span><span>${fmt(ac.montant_ttc)}</span></div>
            </div></div>
          </div>
        </div></div>`;

      initClientSearch(el.querySelector('.ss-wrap'), el.querySelector('.e-client-preview'));
      el.querySelector('.a4-page').classList.add('e-readonly');
      el.querySelector('.e-close-btn').onclick = () => tabMgr.closeTab(el.dataset.tid);
    });
  }

  // ── API publique ──────────────────────────────────────────────────────────

  return {
    openDevis:   (id=null)         => open('devis',   id||null),
    openFacture: (id=null, prefill={}) => open('facture', id||null, prefill),
    openAvoir:   async factureId   => { const fo=await api.get(`/api/factures/${factureId}`); return open('avoir',null,{factureOrigine:fo}); },
    openBL:      (id=null,p={})    => open('bl', id||null, p),
    openAcompte: id                => openAcompte(id),
    restoreDraft:(type,docKey)     => { const d=loadDraft(docKey); if(!d)return; open(type,null,{docKey,draft:d}); },
  };
})();
