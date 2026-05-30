// ── Auth state ────────────────────────────────────────────────────────────
let currentUser = null;

const ROLE_PERMS = {
  admin:      new Set(['clients:r','clients:w','devis:r','devis:w','factures:r','factures:w','acomptes:r','acomptes:w','bl:r','bl:w','articles:r','articles:w','settings:r','settings:w','users:r','users:w','backup']),
  comptable:  new Set(['clients:r','clients:w','devis:r','devis:w','factures:r','factures:w','acomptes:r','acomptes:w','bl:r','bl:w','articles:r','articles:w']),
  commercial: new Set(['clients:r','clients:w','devis:r','devis:w','factures:r','acomptes:r','bl:r','bl:w','articles:r','articles:w']),
  lecteur:    new Set(['clients:r','devis:r','factures:r','acomptes:r','bl:r','articles:r']),
};

function can(perm) {
  if (!currentUser) return false;
  if (currentUser.is_super_admin) return true;
  return ROLE_PERMS[currentUser.role]?.has(perm) ?? false;
}

function logout() {
  localStorage.removeItem('jwt');
  localStorage.removeItem('facturpro_tabs');
  location.reload();
}

// ── API helpers ──────────────────────────────────────────────────────────
const api = {
  _headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const token = localStorage.getItem('jwt');
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  async _call(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { ...this._headers(false), ...(opts.headers || {}) } });
    if (r.status === 401) { logout(); return {}; }
    return r.json();
  },
  get:    url       => api._call(url, { headers: api._headers() }),
  post:   (url, b)  => api._call(url, { method: 'POST',   headers: api._headers(), body: JSON.stringify(b) }),
  put:    (url, b)  => api._call(url, { method: 'PUT',    headers: api._headers(), body: JSON.stringify(b) }),
  delete: url       => api._call(url, { method: 'DELETE', headers: api._headers(false) }),
  upload: (url, fd) => api._call(url, { method: 'POST',   headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` }, body: fd }),
};

// ── Formatters ───────────────────────────────────────────────────────────
const fmt = {
  money:  n  => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0),
  date:   d  => d ? new Date(d).toLocaleDateString('fr-FR') : '—',
  badge:  s  => `<span class="badge badge-${s}">${s}</span>`,
  modePaiement: m => ({ virement: 'Virement', cheque: 'Chèque', especes: 'Espèces',
    carte: 'Carte', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre' })[m] || m,
};

// ── Helpers boutons ───────────────────────────────────────────────────────
const btn = {
  outline: (onclick, label, title='') => `<button class="btn btn-outline btn-sm" onclick="${onclick}"${title?` title="${title}"`:''}>${label}</button>`,
  success: (onclick, label)           => `<button class="btn btn-success btn-sm" onclick="${onclick}">${label}</button>`,
  primary: (onclick, label)           => `<button class="btn btn-primary btn-sm" onclick="${onclick}">${label}</button>`,
  warning: (onclick, label)           => `<button class="btn btn-warning btn-sm" onclick="${onclick}">${label}</button>`,
  trash:   (onclick, title='Supprimer') => `<button class="btn-trash" onclick="${onclick}" title="${title}">🗑️</button>`,
};

// ── Configuration par type de document ────────────────────────────────────
const DOC_CONFIGS = {
  devis: {
    api:      '/api/devis',
    topbar:   () => `<button class="btn btn-primary" onclick="DocEditor.openDevis()">+ Nouveau devis</button>`,
    headers:  ['N°','Client','Objet','HT','TTC','Statut','Créé le'],
    rowOpen:  d => `DocEditor.openDevis(${d.id})`,
    cells:    d => [
      `<strong>${d.numero}</strong>`,
      d.client_nom||d.client_nom_part||'—',
      d.objet||'—',
      `<span class="text-right">${fmt.money(d.montant_ht)}</span>`,
      `<strong>${fmt.money(d.montant_ttc)}</strong>`,
      fmt.badge(d.statut),
      fmt.date(d.created_at),
    ],
    actions: d => [
      btn.outline(`DocEditor.openDevis(${d.id})`, d.locked?'Voir':'Voir/Modifier'),
      btn.outline(`previewDevis(${d.id})`, '👁 PDF'),
      btn.outline(`envoyerDevis(${d.id})`, '✉ Envoyer'),
      !d.locked ? btn.trash(`deleteDevis(${d.id})`) : '',
    ],
  },
  factures: {
    api:      '/api/factures',
    topbar:   () => `
      <button class="btn btn-outline" onclick="exportFEC()">Export FEC</button>
      <button class="btn btn-outline" onclick="verifierScellement()">Vérifier scellement</button>
      <button class="btn btn-primary" onclick="DocEditor.openFacture()">+ Nouvelle facture</button>`,
    headers:  ['N°','Client','HT','TTC','Statut','Émise le','Règlement'],
    rowOpen:  f => `DocEditor.openFacture(${f.id})`,
    cells:    f => [
      `<strong>${f.numero}</strong>${f.type_facture==='avoir'?' <span class="badge badge-avoir">Avoir</span>':''}`,
      f.client_nom||f.client_nom_part||'—',
      `<span class="text-right">${fmt.money(f.montant_ht)}</span>`,
      `<strong>${fmt.money(f.montant_ttc)}</strong>`,
      fmt.badge(f.statut),
      fmt.date(f.date_emission),
      f.mode_paiement?`${fmt.modePaiement(f.mode_paiement)}<br><small>${fmt.date(f.date_paiement)}</small>`:'—',
    ],
    actions: f => [
      f.statut==='brouillon' ? btn.success(`emettreFacture(${f.id})`, 'Émettre') : '',
      f.statut==='emise'     ? btn.primary(`payerFacture(${f.id})`, '💳 Payer') : '',
      btn.outline(`DocEditor.openFacture(${f.id})`, 'Voir/Modifier'),
      btn.outline(`previewFacture(${f.id})`, '👁 PDF'),
      btn.outline(`envoyerFacture(${f.id})`, '✉ Envoyer'),
      ['emise','payee'].includes(f.statut)&&f.type_facture!=='avoir' ? btn.outline(`showBLFromFactureForm(${f.id})`, '🚚 BL') : '',
      ['emise','payee'].includes(f.statut)&&f.type_facture!=='avoir' ? btn.outline(`DocEditor.openAvoir(${f.id})`, 'Avoir') : '',
    ],
  },
  avoirs: {
    api:      '/api/factures/avoirs/liste',
    topbar:   () => '',
    headers:  ['N°','Facture d\'origine','Client','HT','TTC','Statut','Date'],
    rowOpen:  a => `DocEditor.openFacture(${a.id})`,
    cells:    a => [
      `<strong>${a.numero}</strong>`,
      a.facture_origine_numero||'—',
      a.client_nom||a.client_nom_part||'—',
      `<span class="text-right">${fmt.money(a.montant_ht)}</span>`,
      `<strong>${fmt.money(a.montant_ttc)}</strong>`,
      fmt.badge(a.statut),
      fmt.date(a.date_emission),
    ],
    actions: a => [
      a.statut==='brouillon' ? btn.success(`emettreFacture(${a.id})`, 'Émettre') : '',
      btn.outline(`DocEditor.openFacture(${a.id})`, 'Voir/Modifier'),
      btn.outline(`previewFacture(${a.id})`, '👁 PDF'),
      btn.outline(`envoyerFacture(${a.id})`, '✉ Envoyer'),
      !a.locked ? btn.trash(`deleteAvoir(${a.id})`) : '',
    ],
  },
  acomptes: {
    api:      '/api/acomptes',
    topbar:   () => `<button class="btn btn-primary" onclick="showAcompteForm()">+ Nouvel acompte</button>`,
    headers:  ['N°','Client','HT','TVA','TTC','Statut','Encaissé le'],
    rowOpen:  a => `DocEditor.openAcompte(${a.id})`,
    cells:    a => [
      `<strong>${a.numero}</strong>`,
      a.client_nom||a.client_nom_part||'—',
      `<span class="text-right">${fmt.money(a.montant_ht)}</span>`,
      `<span class="text-right">${fmt.money(a.montant_tva)}</span>`,
      `<strong>${fmt.money(a.montant_ttc)}</strong>`,
      fmt.badge(a.statut),
      fmt.date(a.date_encaissement),
    ],
    actions: a => [
      a.statut==='en_attente' ? btn.success(`encaisserAcompte(${a.id})`, 'Encaisser') : '',
      btn.outline(`DocEditor.openAcompte(${a.id})`, 'Voir'),
      btn.outline(`openPdf('/api/acomptes/${a.id}/apercu')`, '👁 PDF'),
      btn.outline(`envoyerAcompte(${a.id})`, '✉ Envoyer'),
      !a.locked ? btn.trash(`deleteAcompte(${a.id})`) : '',
    ],
  },
  'bons-livraison': {
    api:      '/api/bons-livraison',
    topbar:   () => `<button class="btn btn-primary" onclick="DocEditor.openBL()">+ Nouveau BL</button>`,
    headers:  ['N°','Client','Date émission','Lieu','Statut'],
    rowOpen:  b => `DocEditor.openBL(${b.id})`,
    cells:    b => [
      `<strong>${b.numero}</strong>`,
      b.client_nom||b.client_nom_part||'—',
      fmt.date(b.date_emission),
      b.lieu_livraison||'—',
      `<span class="badge badge-${({brouillon:'brouillon',emis:'envoye',livre:'payee'})[b.statut]||''}">${({brouillon:'Brouillon',emis:'Émis',livre:'Livré'})[b.statut]||b.statut}</span>`,
    ],
    actions: b => [
      btn.outline(`DocEditor.openBL(${b.id})`, b.statut!=='livre'?'Voir/Modifier':'Voir'),
      btn.outline(`previewBL(${b.id})`, '👁 PDF'),
      btn.outline(`envoyerBL(${b.id})`, '✉ Envoyer'),
      b.statut==='brouillon'&&(b.devis_id||b.facture_id) ? '' : (b.statut!=='livre' ? btn.success(`livrerBL(${b.id})`,'✓ Livré') : ''),
      ['emis','livre'].includes(b.statut)&&(b.devis_id||b.facture_id) ? btn.outline(`showFactureFromBLForm(${b.id})`,'🧾 Facturer') : '',
      b.statut==='brouillon' ? btn.trash(`supprimerBL(${b.id})`) : '',
    ],
  },
};

// Rendu unifié des listes de documents
async function renderDocList(type, el) {
  const cfg  = DOC_CONFIGS[type];
  const docs = await api.get(cfg.api);
  document.getElementById('topbarActions').innerHTML = cfg.topbar();

  if (!docs.length) {
    el.innerHTML = `<div class="card"><div class="empty">Aucun document</div></div>`;
    return;
  }
  const colSpan = cfg.headers.length + 1;
  el.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr>${cfg.headers.map(h=>`<th>${h}</th>`).join('')}<th></th></tr></thead>
    <tbody>${docs.map(doc => {
      const cells   = cfg.cells(doc).map(c=>`<td>${c}</td>`).join('');
      const actions = cfg.actions(doc).filter(Boolean).join('');
      return `
        <tr class="data-row" onclick="${cfg.rowOpen(doc)}" style="cursor:pointer">${cells}<td></td></tr>
        <tr class="row-actions"><td colspan="${colSpan}"><div class="btn-row">${actions}</div></td></tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────
const modal = {
  overlay: null, el: null, title: null, body: null,
  init() {
    this.overlay = document.getElementById('modalOverlay');
    this.title   = document.getElementById('modalTitle');
    this.body    = document.getElementById('modalBody');
    document.getElementById('modalClose').onclick = () => this.hide();
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.hide(); });
  },
  show(title, html, onOpen) {
    this.title.textContent = title;
    this.body.innerHTML    = html;
    this.overlay.style.display = 'flex';
    if (onOpen) onOpen(this.body);
  },
  hide() { this.overlay.style.display = 'none'; },
  open(title, html, onOpen) { this.show(title, html, onOpen); },
  close() { this.hide(); },
};

const modal2 = {
  overlay: null, title: null, body: null,
  init() {
    this.overlay = document.getElementById('modal2Overlay');
    this.title   = document.getElementById('modal2Title');
    this.body    = document.getElementById('modal2Body');
    document.getElementById('modal2Close').onclick = () => this.hide();
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.hide(); });
  },
  show(title, html, onOpen) {
    this.title.textContent = title;
    this.body.innerHTML    = html;
    this.overlay.style.display = 'flex';
    if (onOpen) onOpen(this.body);
  },
  hide() { this.overlay.style.display = 'none'; },
};

// ── State ─────────────────────────────────────────────────────────────────
let tvaOptions    = [];
let clientOptions = [];
const isAndroid   = /Android/i.test(navigator.userAgent);

// ── Tab Manager ───────────────────────────────────────────────────────────
const tabMgr = (() => {
  const VIEW_META = {
    dashboard:        { title: 'Tableau de bord', icon: '📊', permanent: true },
    clients:          { title: 'Clients',          icon: '👥' },
    devis:            { title: 'Devis',            icon: '📋' },
    factures:         { title: 'Factures',         icon: '🧾' },
    avoirs:           { title: 'Avoirs',           icon: '↩️' },
    acomptes:         { title: 'Acomptes',         icon: '💰' },
    'bons-livraison': { title: 'Bons de livraison', icon: '🚚' },
    articles:         { title: 'Articles',         icon: '📦' },
    archives:         { title: 'Archives',         icon: '🗄️' },
    parametres:       { title: 'Paramètres',       icon: '⚙️' },
  };
  const DOC_ICONS = { devis: '📋', facture: '🧾', acompte: '💰', bl: '🚚' };

  let tabs     = [];
  let activeId = null;
  let seq      = 0;

  const strip  = () => document.getElementById('tabStrip');
  const panels = () => document.getElementById('tabPanels');

  function saveTabState() {
    try {
      localStorage.setItem('facturpro_tabs', JSON.stringify({
        tabs: tabs.map(t => ({
          type:     t.type,
          viewName: t.viewName || null,
          docType:  t.docType  || null,
          docId:    t.docId    || null,
          title:    t.title,
          active:   t.id === activeId,
        })),
      }));
    } catch(e) {}
  }

  function renderStrip() {
    strip().innerHTML = tabs.map(t => `
      <button class="tab-btn${t.id === activeId ? ' active' : ''}" data-tid="${t.id}" title="${t.title}">
        <span class="tab-icon">${t.icon}</span>
        <span class="tab-title">${t.title}</span>
        ${t.permanent ? '' : `<span class="tab-close" data-ctid="${t.id}">&#x2715;</span>`}
      </button>`).join('');
    strip().querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.closest('[data-ctid]')) return;
        activateTab(btn.dataset.tid);
      });
    });
    strip().querySelectorAll('[data-ctid]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); closeTab(btn.dataset.ctid); });
    });
    updateScrollButtons();
    saveTabState();
  }

  function updateScrollButtons() {
    const s = strip();
    const btnL = document.getElementById('tabScrollLeft');
    const btnR = document.getElementById('tabScrollRight');
    if (!btnL || !btnR) return;
    const overflows = s.scrollWidth > s.clientWidth;
    btnL.classList.toggle('visible', overflows && s.scrollLeft > 0);
    btnR.classList.toggle('visible', overflows && s.scrollLeft < s.scrollWidth - s.clientWidth - 1);
  }

  // Init scroll buttons once DOM ready
  setTimeout(() => {
    const s = strip();
    const btnL = document.getElementById('tabScrollLeft');
    const btnR = document.getElementById('tabScrollRight');
    if (!s || !btnL || !btnR) return;

    btnL.addEventListener('click', () => { s.scrollBy({ left: -160, behavior: 'smooth' }); });
    btnR.addEventListener('click', () => { s.scrollBy({ left:  160, behavior: 'smooth' }); });

    // Scroll molette
    s.addEventListener('wheel', e => {
      e.preventDefault();
      s.scrollBy({ left: e.deltaY * 1.5, behavior: 'smooth' });
    }, { passive: false });

    s.addEventListener('scroll', updateScrollButtons);
    new ResizeObserver(updateScrollButtons).observe(s);
  }, 0);

  function setActivePanel(tabId) {
    panels().querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.tid === tabId));
  }

  function activateTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const cur = panels().querySelector('.tab-panel.active');
    if (cur && activeId) {
      const prev = tabs.find(t => t.id === activeId);
      if (prev) prev.scrollTop = cur.scrollTop;
    }

    activeId = tabId;
    renderStrip();
    setActivePanel(tabId);
    // Scroller pour que l'onglet actif soit visible
    const activeBtn = strip().querySelector(`.tab-btn.active`);
    if (activeBtn) activeBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    document.getElementById('pageTitle').textContent = tab.title;
    document.querySelectorAll('.nav-item').forEach(n =>
      n.classList.toggle('active', tab.type === 'view' && n.dataset.view === tab.viewName));

    const panel = panels().querySelector(`.tab-panel[data-tid="${tabId}"]`);

    if (tab.type === 'view') {
      renderView(tab.viewName, panel);
    } else if (!tab.loaded) {
      tab.loaded = true;
      document.getElementById('topbarActions').innerHTML = '';
      tab.renderFn(panel);
    } else {
      document.getElementById('topbarActions').innerHTML = '';
    }

    // Réinitialise le filtre à chaque changement d'onglet
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = tab.type === 'view'
        ? `Filtrer — ${tab.title}…`
        : `Filtrer les lignes…`;
    }
    if (tab.type === 'doc' && tab.loaded) filterActiveTab('');

    if (tab.scrollTop) setTimeout(() => { panel.scrollTop = tab.scrollTop; }, 80);
  }

  function openViewTab(viewName) {
    const existing = tabs.find(t => t.type === 'view' && t.viewName === viewName);
    if (existing) { activateTab(existing.id); return; }

    const meta  = VIEW_META[viewName] || { title: viewName, icon: '📄' };
    const id    = 'tab_' + (++seq);
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.tid = id;
    panels().appendChild(panel);

    tabs.push({ id, type: 'view', viewName, title: meta.title, icon: meta.icon,
      permanent: meta.permanent || false, scrollTop: 0 });
    activateTab(id);
  }

  function openDocTab(docType, docId, title, renderFn) {
    const existing = tabs.find(t => t.type === 'doc' && t.docType === docType && t.docId === docId);
    if (existing) { activateTab(existing.id); return; }

    const id    = 'tab_' + (++seq);
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.tid = id;
    panels().appendChild(panel);

    tabs.push({ id, type: 'doc', docType, docId, title, icon: DOC_ICONS[docType] || '📄',
      permanent: false, loaded: false, renderFn, scrollTop: 0 });
    activateTab(id);
  }

  function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    if (tabs[idx].permanent) return;
    const panel = panels().querySelector(`.tab-panel[data-tid="${tabId}"]`);
    if (panel) panel.remove();
    tabs.splice(idx, 1);
    if (activeId === tabId) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      if (next) { activeId = null; activateTab(next.id); }
      else { activeId = null; renderStrip(); }
    } else {
      renderStrip();
    }
  }

  function init() { openViewTab('dashboard'); }

  function activateByKey(type, key) {
    const t = type === 'view'
      ? tabs.find(t => t.type === 'view' && t.viewName === key)
      : tabs.find(t => t.type === 'doc'  && String(t.docId) === String(key));
    if (t) activateTab(t.id);
  }

  return { openViewTab, openDocTab, closeTab, init, activateByKey };
})();

function updateSidebarLogo(logoPath) {
  const img      = document.getElementById('sidebarLogo');
  const icon     = document.getElementById('brandIcon');
  const brandTxt = document.getElementById('brandName');
  if (logoPath) {
    img.src = logoPath + '?t=' + Date.now();
    img.style.display = 'block';
    icon.style.display = 'none';
    if (brandTxt) brandTxt.style.display = 'none';
  } else {
    img.style.display = 'none';
    icon.style.display = '';
    if (brandTxt) brandTxt.style.display = '';
  }
}

// ── Sidebar collapse ─────────────────────────────────────────────────────
(function() {
  const app    = document.getElementById('app');
  const btn    = document.getElementById('sidebarToggle');
  if (!btn || !app) return;

  const collapsed = localStorage.getItem('sidebar-collapsed') === '1';
  if (collapsed) { app.classList.add('sidebar-collapsed'); btn.innerHTML = '&#8250;'; }

  btn.addEventListener('click', () => {
    const isNowCollapsed = app.classList.toggle('sidebar-collapsed');
    btn.innerHTML = isNowCollapsed ? '&#8250;' : '&#8249;';
    localStorage.setItem('sidebar-collapsed', isNowCollapsed ? '1' : '0');
  });
})();

// ── Sidebar mobile ────────────────────────────────────────────────────────
const sidebar        = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburger      = document.getElementById('hamburger');

function openSidebar()  {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  hamburger.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  hamburger.classList.remove('open');
}

hamburger.addEventListener('click', () =>
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar()
);
sidebarOverlay.addEventListener('click', closeSidebar);

// ── Navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    closeSidebar();
    tabMgr.openViewTab(el.dataset.view);
  });
});

async function renderView(view, el) {
  if (!el) return;
  el.innerHTML = '<div class="empty"><p>Chargement…</p></div>';
  document.getElementById('topbarActions').innerHTML = '';
  await loadGlobalData();
  switch (view) {
    case 'dashboard':       return renderDashboard(el);
    case 'clients':         return renderClients(el);
    case 'devis':           return renderDocList('devis', el);
    case 'factures':        return renderDocList('factures', el);
    case 'avoirs':          return renderDocList('avoirs', el);
    case 'acomptes':        return renderDocList('acomptes', el);
    case 'bons-livraison':  return renderDocList('bons-livraison', el);
    case 'articles':        return renderArticles(el);
    case 'archives':        return renderArchives(el);
    case 'parametres':      return renderParametres(el);
  }
}

async function loadGlobalData() {
  [tvaOptions, clientOptions] = await Promise.all([
    api.get('/api/clients/taux-tva'),
    api.get('/api/clients'),
  ]);
}

// ── Dashboard ─────────────────────────────────────────────────────────────
let _dashSort = { col: 'date', dir: -1 }; // tri par défaut : date desc

async function renderDashboard(el) {
  const [devisList, facturesList, avoirsList, acomptesList, blList] = await Promise.all([
    api.get('/api/devis'),
    api.get('/api/factures'),
    api.get('/api/factures/avoirs/liste'),
    api.get('/api/acomptes'),
    api.get('/api/bons-livraison'),
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

// ── Clients ───────────────────────────────────────────────────────────────
async function renderClients(el) {
  const clients = await api.get('/api/clients');
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-primary" onclick="showClientForm()">+ Nouveau client</button>`;

  el.innerHTML = `<div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nom / Raison sociale</th><th>Type</th><th>Email</th>
          <th>Téléphone</th><th>SIRET</th><th>Statut</th><th></th>
        </tr></thead>
        <tbody>${clients.length ? clients.map(c => `
          <tr>
            <td><strong>${c.raison_sociale || [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ')}</strong></td>
            <td>${c.type_client}</td>
            <td>${c.email || '—'}</td>
            <td>${c.telephone || '—'}</td>
            <td><code>${c.siret || '—'}</code></td>
            <td>${fmt.badge(c.statut_rgpd)}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="showClientForm(${c.id})">Éditer</button>
              <button class="btn-trash" onclick="deleteClient(${c.id})" title="Supprimer ce client">🗑️</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty">Aucun client</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

function openQuickClientCreate(btn) {
  const parentForm = btn.closest('form');
  const select = parentForm ? parentForm.querySelector('select[name="client_id"]') : null;

  const html = `
    <form id="quickClientForm">
      <div class="form-group"><label>Raison sociale / Nom *</label>
        <input name="raison_sociale" placeholder="Nom ou raison sociale" required/>
      </div>
      <div class="form-group"><label>Adresse *</label>
        <input name="adresse" placeholder="Adresse" required/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Code postal *</label><input name="code_postal" required/></div>
        <div class="form-group"><label>Ville *</label><input name="ville" required/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email</label><input name="email" type="email"/></div>
        <div class="form-group"><label>SIRET</label><input name="siret"/></div>
      </div>
      <input name="type_client" type="hidden" value="professionnel"/>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal2.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Creer le client</button>
      </div>
    </form>`;

  modal2.show('Nouveau client', html, body => {
    attachSireneAutocomplete(body.querySelector('[name="raison_sociale"]'), body);
    attachNominatimAutocomplete(body.querySelector('[name="adresse"]'), body);
    body.querySelector('#quickClientForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const client = await api.post('/api/clients', data);
      if (client?.error) { alert(client.error); return; }
      clientOptions = await api.get('/api/clients');
      if (select) {
        const opt = document.createElement('option');
        opt.value = client.id;
        opt.textContent = client.raison_sociale || client.nom || 'Client ' + client.id;
        select.appendChild(opt);
        select.value = client.id;
      }
      modal2.hide();
    };
  });
}

async function showClientForm(id) {
  const c = id ? await api.get(`/api/clients`) : {};
  const client = id ? (await api.get('/api/clients')).find(x => x.id === id) : {};
  const html = `
    <form id="clientForm">
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select name="type_client">
            <option value="professionnel" ${client.type_client === 'professionnel' ? 'selected' : ''}>Professionnel</option>
            <option value="particulier"   ${client.type_client === 'particulier'   ? 'selected' : ''}>Particulier</option>
          </select>
        </div>
        <div class="form-group">
          <label>Statut RGPD</label>
          <select name="statut_rgpd">
            <option value="prospect" ${client.statut_rgpd === 'prospect' ? 'selected' : ''}>Prospect</option>
            <option value="client"   ${client.statut_rgpd === 'client'   ? 'selected' : ''}>Client</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Raison sociale / Nom</label>
        <input name="raison_sociale" value="${client.raison_sociale || ''}" placeholder="Raison sociale (pro) ou Nom (part.)"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Prénom</label><input name="prenom" value="${client.prenom || ''}"/></div>
        <div class="form-group"><label>Nom</label><input name="nom" value="${client.nom || ''}"/></div>
      </div>
      <div class="form-group"><label>Adresse *</label><input name="adresse" value="${client.adresse || ''}" required/></div>
      <div class="form-row">
        <div class="form-group"><label>Code postal *</label><input name="code_postal" value="${client.code_postal || ''}" required/></div>
        <div class="form-group"><label>Ville *</label><input name="ville" value="${client.ville || ''}" required/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email</label><input name="email" type="email" value="${client.email || ''}"/></div>
        <div class="form-group"><label>Téléphone</label><input name="telephone" value="${client.telephone || ''}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>SIRET</label><input name="siret" value="${client.siret || ''}"/></div>
        <div class="form-group"><label>TVA Intracom</label><input name="tva_intracom" value="${client.tva_intracom || ''}"/></div>
      </div>
      <div class="form-group"><label>Mode TVA</label>
        <select name="tva_mode">
          <option value="normal"          ${client.tva_mode === 'normal'          ? 'selected' : ''}>Normal</option>
          <option value="autoliquidation" ${client.tva_mode === 'autoliquidation' ? 'selected' : ''}>Autoliquidation</option>
          <option value="exonere"         ${client.tva_mode === 'exonere'         ? 'selected' : ''}>Exonéré</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`;

  modal.show(id ? 'Modifier le client' : 'Nouveau client', html, body => {
    attachSireneAutocomplete(body.querySelector('[name="raison_sociale"]'), body);
    attachNominatimAutocomplete(body.querySelector('[name="adresse"]'), body);
    body.querySelector('#clientForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      if (id) await api.put(`/api/clients/${id}`, data);
      else    await api.post('/api/clients', data);
      modal.hide();
      tabMgr.openViewTab('clients');
    };
  });
}

// ── Devis ─────────────────────────────────────────────────────────────────
async function openPdf(url) {
  const token = localStorage.getItem('jwt');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Erreur PDF'); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  window.open(objUrl, '_blank');
}

async function downloadFile(url, filename) {
  const token = localStorage.getItem('jwt');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Erreur lors du téléchargement'); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(objUrl);
}

// Envoie par mailto avec pièce jointe PDF.
// 1) Web Share API si dispo + contexte sécurisé (HTTPS) → share sheet Android avec PDF attaché.
// 2) Sinon : télécharge le PDF sur l'appareil + ouvre mailto (l'utilisateur attache manuellement).
// Retourne true si le flux a été géré (modal à fermer par l'appelant), false si non.
async function envoyerAvecPdf(apercuUrl, filename, emailVal, titre, corps) {
  try {
    const token = localStorage.getItem('jwt');
    const r = await fetch(apercuUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const blob = await r.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: titre, text: corps });
          return true;
        } catch(err) {
          if (err.name === 'AbortError') return true;
        }
      }
      // Fallback : télécharge le PDF pour que l'utilisateur puisse l'attacher manuellement
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  } catch(e) {}
  window.location.href = `mailto:${emailVal}?subject=${encodeURIComponent(titre)}&body=${encodeURIComponent(corps)}`;
  return true;
}

function previewDevis(id)   { openPdf(`/api/devis/${id}/apercu`); }
function previewFacture(id) { openPdf(`/api/factures/${id}/apercu`); }

async function envoyerFacture(id) {
  const [facture, entreprise] = await Promise.all([
    api.get(`/api/factures/${id}`),
    api.get('/api/entreprise'),
  ]);
  const client      = await api.get(`/api/clients/${facture.client_id}`);
  const emailClient = client?.email || '';
  const modePref = isAndroid ? 'mailto' : (entreprise?.email_mode || 'mapi');

  modal.open('Envoyer la facture', `
    <form id="envoyerFactureForm">
      <div class="form-group">
        <label>Mode d'envoi</label>
        <select id="envoyerFactureMode">
          <option value="mapi"   ${modePref === 'mapi'   ? 'selected' : ''}>MAPI — Client mail Windows (Outlook, Thunderbird…)</option>
          <option value="mailto" ${modePref === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
          <option value="smtp"   ${modePref === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique</option>
        </select>
      </div>
      <div class="form-group">
        <label>Email du client</label>
        <input name="email_client" type="email" value="${emailClient}" placeholder="client@exemple.fr"/>
      </div>
      <div id="mapiFactureNote" style="${modePref === 'mapi' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Le client mail s'ouvrira avec la facture déjà attachée en PDF.
        </div>
      </div>
      <div id="mailtoFactureNote" style="${modePref === 'mailto' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Votre application mail s'ouvrira avec le sujet et le corps pré-remplis. Joignez le PDF manuellement si nécessaire.
        </div>
      </div>
      <div id="envoyerFactureError" style="color:var(--danger);font-size:13px;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Envoyer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('envoyerFactureMode').onchange = function() {
    document.getElementById('mapiFactureNote').style.display   = this.value === 'mapi'   ? '' : 'none';
    document.getElementById('mailtoFactureNote').style.display = this.value === 'mailto' ? '' : 'none';
  };

  document.getElementById('envoyerFactureForm').onsubmit = async e => {
    e.preventDefault();
    const emailVal = e.target.email_client.value.trim();
    const modeVal  = document.getElementById('envoyerFactureMode').value;
    const btn      = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';

    if (modeVal === 'mapi') {
      const mapiRes = await api.post(`/api/factures/${id}/mapi`, { email: emailVal });
      if (mapiRes?.ok) { modal.close(); return; }
      await downloadFile(`/api/factures/${id}/eml?email=${encodeURIComponent(emailVal)}`, `${facture.numero}.eml`);
      modal.close();
      return;
    }

    if (modeVal === 'mailto') {
      const nomEntreprise = entreprise?.raison_sociale || entreprise?.nom || '';
      const titre = `Facture ${facture.numero} — ${nomEntreprise}`;
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint votre facture ${facture.numero}.\n\nCordialement,\n${nomEntreprise}`;
      await envoyerAvecPdf(`/api/factures/${id}/apercu`, `${facture.numero}.pdf`, emailVal, titre, corps);
      modal.close(); return;
    }

    // Mode SMTP
    const res = await api.post(`/api/factures/${id}/envoyer-email`, { email_client: emailVal || undefined });
    if (res?.error) {
      document.getElementById('envoyerFactureError').textContent = res.error;
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

async function dupliquerDevis(id) {
  const d = await api.post(`/api/devis/${id}/dupliquer`);
  if (d.error) return alert(d.error);
  tabMgr.openViewTab('devis');
}

async function showDevisEditForm(id) {
  const d = await api.get(`/api/devis/${id}`);
  if (d.locked) return alert('Ce devis est verrouillé.');
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}" ${c.id == d.client_id ? 'selected' : ''}>${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

  const lignesHtml = (d.lignes || []).map((l, i) => {
    const n = i + 1;
    return `<tr>
      <td><input name="lig_designation_${n}" value="${l.designation}" required style="min-width:180px"/></td>
      <td><input name="lig_quantite_${n}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:70px"/></td>
      <td><input name="lig_prix_ht_${n}" type="number" value="${l.prix_unitaire_ht}" step="0.01" style="width:90px"/></td>
      <td><select name="lig_tva_${n}" style="width:120px">${tvaOptions.map(t => `<option value="${t.id}" ${t.id == l.taux_tva_id ? 'selected' : ''}>${t.libelle}</option>`).join('')}</select></td>
      <td><input name="lig_remise_${n}" type="number" value="${l.remise_pct || 0}" min="0" max="100" style="width:60px"/></td>
      <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td></tr>`;
  }).join('');

  const html = `
    <form id="devisEditForm">
      <div class="form-row">
        <div class="form-group"><label>Client *</label>
          <select name="client_id" required><option value="">Sélectionner…</option>${clientOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Objet</label><input name="objet" value="${d.objet || ''}"/></div>
        <div class="form-group"><label>Valable jusqu'au</label><input name="date_validite" type="date" value="${d.date_validite ? d.date_validite.slice(0,10) : ''}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML(d.conditions_paiement)}</div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:20px">
          <input type="checkbox" name="is_free" id="isFreeEdit" style="width:auto" ${d.is_free ? 'checked' : ''}/>
          <label for="isFreeEdit" style="text-transform:none;margin:0">Devis gratuit</label>
        </div>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addLigneEdit">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="lignesBodyEdit">${lignesHtml}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`;

  modal.show(`Modifier ${d.numero}`, html, body => {
    attachConditionsPaiement(body);
    let ligneCount = (d.lignes || []).length;
    const tvaOpts2 = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

    // Attacher autocomplete sur les lignes existantes
    (d.lignes || []).forEach((_, i) => {
      const n = i + 1;
      attachArticleAutocomplete(
        body.querySelector(`[name="lig_designation_${n}"]`),
        body.querySelector(`[name="lig_prix_ht_${n}"]`),
        body.querySelector(`[name="lig_tva_${n}"]`)
      );
    });

    body.querySelector('#addLigneEdit').onclick = () => {
      ligneCount++;
      const n = ligneCount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="lig_designation_${n}" required style="min-width:180px"/></td>
        <td><input name="lig_quantite_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="lig_prix_ht_${n}" type="number" step="0.01" style="width:90px"/></td>
        <td><select name="lig_tva_${n}" style="width:120px">${tvaOpts2}</select></td>
        <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#lignesBodyEdit').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="lig_designation_${n}"]`),
        tr.querySelector(`[name="lig_prix_ht_${n}"]`),
        tr.querySelector(`[name="lig_tva_${n}"]`)
      );
    };

    body.querySelector('#devisEditForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= ligneCount; i++) {
        if (!fd.get(`lig_designation_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`lig_designation_${i}`),
          quantite:         parseFloat(fd.get(`lig_quantite_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`lig_prix_ht_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`lig_tva_${i}`)         || '1'),
          remise_pct:       parseFloat(fd.get(`lig_remise_${i}`)    || '0'),
        });
      }
      const result = await api.put(`/api/devis/${id}`, {
        objet:               fd.get('objet') || undefined,
        date_validite:       fd.get('date_validite') || undefined,
        conditions_paiement: fd.get('conditions_paiement') || undefined,
        is_free:             fd.has('is_free'),
        lignes,
      });
      if (result?.error) return alert(result.error);
      modal.hide();
      tabMgr.openViewTab('devis');
    };
  });
}

async function envoyerDevis(id) {
  const [devis, entreprise] = await Promise.all([
    api.get(`/api/devis/${id}`),
    api.get('/api/entreprise'),
  ]);
  const client      = await api.get(`/api/clients/${devis.client_id}`);
  const emailClient = client?.email || '';
  const modePref = isAndroid ? 'mailto' : (entreprise?.email_mode || 'mapi');

  modal.open('Envoyer le devis', `
    <form id="envoyerForm">
      <div class="form-group">
        <label>Mode d'envoi</label>
        <select id="envoyerMode">
          <option value="mapi"   ${modePref === 'mapi'   ? 'selected' : ''}>MAPI — Client mail Windows (Outlook, Thunderbird…)</option>
          <option value="mailto" ${modePref === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
          <option value="smtp"   ${modePref === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique</option>
        </select>
      </div>
      <div class="form-group">
        <label>Email du client</label>
        <input name="email_client" type="email" value="${emailClient}" placeholder="client@exemple.fr"/>
      </div>
      <div id="mapiNote" style="${modePref === 'mapi' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Un fichier <strong>.eml</strong> sera téléchargé avec le PDF déjà attaché.
          Ouvrez-le pour l'envoyer depuis Outlook, Thunderbird ou tout autre client mail.
        </div>
      </div>
      <div id="mailtoNote" style="${modePref === 'mailto' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Votre application mail s'ouvrira avec le sujet et le corps pré-remplis. Joignez le PDF manuellement si nécessaire.
        </div>
      </div>
      <div id="envoyerError" style="color:var(--danger);font-size:13px;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Envoyer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('envoyerMode').onchange = function() {
    document.getElementById('mapiNote').style.display   = this.value === 'mapi'   ? '' : 'none';
    document.getElementById('mailtoNote').style.display = this.value === 'mailto' ? '' : 'none';
  };

  document.getElementById('envoyerForm').onsubmit = async e => {
    e.preventDefault();
    const emailVal  = e.target.email_client.value.trim();
    const modeVal   = document.getElementById('envoyerMode').value;
    const btn       = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';

    if (modeVal === 'mapi') {
      await api.post(`/api/devis/${id}/envoyer`, {});
      const mapiRes = await api.post(`/api/devis/${id}/mapi`, { email: emailVal });
      if (mapiRes?.ok) { modal.close(); tabMgr.openViewTab('devis'); return; }
      await downloadFile(`/api/devis/${id}/eml?email=${encodeURIComponent(emailVal)}`, `${devis.numero}.eml`);
      modal.close();
      tabMgr.openViewTab('devis');
      return;
    }

    if (modeVal === 'mailto') {
      const nomEntreprise = entreprise?.raison_sociale || entreprise?.nom || '';
      const titre = `Devis ${devis.numero} — ${nomEntreprise}`;
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint votre devis ${devis.numero}.\n\nCordialement,\n${nomEntreprise}`;
      await envoyerAvecPdf(`/api/devis/${id}/apercu`, `${devis.numero}.pdf`, emailVal, titre, corps);
      await api.post(`/api/devis/${id}/envoyer`, {});
      modal.close(); tabMgr.openViewTab('devis'); return;
    }

    // Mode SMTP
    const res = await api.post(`/api/devis/${id}/envoyer`, { email_client: emailVal || undefined });
    if (res?.error) {
      document.getElementById('envoyerError').textContent = res.error;
      btn.disabled = false; btn.textContent = 'Envoyer';
      return;
    }
    modal.close();
    if (res?.preview_url) {
      if (confirm(`Email envoyé (mode test Ethereal).\nOuvrir la prévisualisation de l'email ?`)) {
        window.open(res.preview_url, '_blank');
      }
    }
    tabMgr.openViewTab('devis');
  };
}

async function accepterDevis(id) {
  const r = await api.post(`/api/devis/${id}/accepter`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('devis');
}

async function signerDevis(id) {
  if (!confirm('Signer ce devis ? Il sera verrouillé et ne pourra plus être modifié.')) return;
  await api.post(`/api/devis/${id}/signer`);
  tabMgr.openViewTab('devis');
}

async function showDevisDetail(id) {
  const d = await api.get(`/api/devis/${id}`);
  tabMgr.openDocTab('devis', id, d.numero, panel => {
    panel.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div><span class="card-title">Numéro</span><br/><strong>${d.numero}</strong></div>
            <div><span class="card-title">Client</span><br/>${d.client_nom || d.client_nom_part || '—'}</div>
            <div><span class="card-title">Statut</span><br/>${fmt.badge(d.statut)}</div>
            <div><span class="card-title">Total TTC</span><br/><strong>${fmt.money(d.montant_ttc)}</strong></div>
            ${d.objet ? `<div><span class="card-title">Objet</span><br/>${d.objet}</div>` : ''}
            ${d.date_validite ? `<div><span class="card-title">Valable jusqu'au</span><br/>${fmt.date(d.date_validite)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="DocEditor.openDevis(${d.id})">${!d.locked ? "Voir/Modifier" : "Voir"}</button>
            <button class="btn btn-outline btn-sm" onclick="previewDevis(${d.id})">👁 PDF</button>
            <button class="btn btn-outline btn-sm" onclick="envoyerDevis(${d.id})">✉️ Envoyer</button>
          </div>
        </div>
        <table class="lignes-table">
          <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Montant HT</th></tr></thead>
          <tbody>${(d.lignes||[]).map(l => `
            <tr>
              <td>${l.designation}${l.description ? `<br/><small style="color:var(--text-muted)">${l.description}</small>` : ''}</td>
              <td>${l.quantite} ${l.unite||''}</td>
              <td>${fmt.money(l.prix_unitaire_ht)}</td>
              <td>${l.taux_tva_valeur}%</td>
              <td class="text-right">${fmt.money(l.montant_ht)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
          <div>Montant HT : <strong>${fmt.money(d.montant_ht)}</strong></div>
          <div>TVA : <strong>${fmt.money(d.montant_tva)}</strong></div>
          <div style="font-size:16px;margin-top:6px">Total TTC : <strong>${fmt.money(d.montant_ttc)}</strong></div>
        </div>
      </div>`;
  });
}

async function showFactureDetail(id) {
  const f = await api.get(`/api/factures/${id}`);
  tabMgr.openDocTab('facture', id, f.numero, panel => {
    panel.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div><span class="card-title">Numéro</span><br/><strong>${f.numero}</strong></div>
            <div><span class="card-title">Client</span><br/>${f.client_nom || f.client_nom_part || '—'}</div>
            <div><span class="card-title">Statut</span><br/>${fmt.badge(f.statut)}</div>
            <div><span class="card-title">Total TTC</span><br/><strong>${fmt.money(f.montant_ttc)}</strong></div>
            ${f.date_echeance ? `<div><span class="card-title">Échéance</span><br/>${fmt.date(f.date_echeance)}</div>` : ''}
            ${f.mode_paiement ? `<div><span class="card-title">Paiement</span><br/>${fmt.modePaiement(f.mode_paiement)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="previewFacture(${f.id})">👁 Aperçu PDF</button>
            ${f.statut === 'emise' ? `<button class="btn btn-success btn-sm" onclick="payerFacture(${f.id})">💳 Payer</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="envoyerFacture(${f.id})">✉️ Envoyer</button>
          </div>
        </div>
        <table class="lignes-table">
          <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Montant HT</th></tr></thead>
          <tbody>${(f.lignes||[]).map(l => `<tr>
            <td>${l.designation}${l.description ? `<br/><small style="color:var(--text-muted)">${l.description}</small>` : ''}</td>
            <td>${l.quantite} ${l.unite||''}</td>
            <td>${fmt.money(l.prix_unitaire_ht)}</td>
            <td>${l.taux_tva_valeur}%</td>
            <td class="text-right">${fmt.money(l.montant_ht)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div style="text-align:right;margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
          <div>Montant HT : <strong>${fmt.money(f.montant_ht)}</strong></div>
          <div>TVA : <strong>${fmt.money(f.montant_tva)}</strong></div>
          <div style="font-size:16px;margin-top:6px">Total TTC : <strong>${fmt.money(f.montant_ttc)}</strong></div>
        </div>
      </div>`;
  });
}

async function showAcompteDetail(id) {
  const a = await api.get(`/api/acomptes/${id}`);
  tabMgr.openDocTab('acompte', id, a.numero, panel => {
    panel.innerHTML = `
      <div class="card">
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px">
          <div><span class="card-title">Numéro</span><br/><strong>${a.numero}</strong></div>
          <div><span class="card-title">Client</span><br/>${a.client_nom || a.client_nom_part || '—'}</div>
          <div><span class="card-title">Statut</span><br/>${fmt.badge(a.statut)}</div>
          <div><span class="card-title">Montant TTC</span><br/><strong>${fmt.money(a.montant_ttc)}</strong></div>
        </div>
        <table class="lignes-table">
          <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Montant HT</th></tr></thead>
          <tbody>${(a.lignes||[]).map(l => `<tr>
            <td>${l.designation}</td>
            <td>${l.quantite} ${l.unite||''}</td>
            <td>${fmt.money(l.prix_unitaire_ht)}</td>
            <td>${l.taux_tva_valeur}%</td>
            <td class="text-right">${fmt.money(l.montant_ht)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div style="text-align:right;margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
          <div>Montant HT : <strong>${fmt.money(a.montant_ht)}</strong></div>
          <div>TVA : <strong>${fmt.money(a.montant_tva)}</strong></div>
          <div style="font-size:16px;margin-top:6px">Total TTC : <strong>${fmt.money(a.montant_ttc)}</strong></div>
        </div>
      </div>`;
  });
}

async function showBLDetail(id) {
  const bl = await api.get(`/api/bons-livraison/${id}`);
  tabMgr.openDocTab('bl', id, bl.numero, panel => {
    panel.innerHTML = `
      <div class="card">
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px">
          <div><span class="card-title">Numéro</span><br/><strong>${bl.numero}</strong></div>
          <div><span class="card-title">Client</span><br/>${bl.client_nom || bl.client_nom_part || '—'}</div>
          <div><span class="card-title">Statut</span><br/>${fmt.badge(bl.statut)}</div>
          <div><span class="card-title">Livraison</span><br/>${fmt.date(bl.date_livraison)}</div>
          ${bl.lieu_livraison ? `<div><span class="card-title">Lieu</span><br/>${bl.lieu_livraison}</div>` : ''}
        </div>
        <table class="lignes-table">
          <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th></tr></thead>
          <tbody>${(bl.lignes||[]).map(l => `<tr>
            <td>${l.designation}</td>
            <td>${l.quantite}</td>
            <td>${l.unite||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${bl.notes ? `<div style="margin-top:12px;color:var(--text-muted);font-size:13px;padding:12px;background:var(--bg);border-radius:6px">${bl.notes}</div>` : ''}
      </div>`;
  });
}

function showDevisForm() {
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}">${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');
  const tvaOpts = tvaOptions.map(t =>
    `<option value="${t.id}">${t.libelle}</option>`).join('');

  const html = `
    <form id="devisForm">
      <div class="form-row">
        <div class="form-group"><label>Client *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select name="client_id" required style="flex:1"><option value="">Selectionner...</option>${clientOpts}</select>
            <button type="button" class="btn btn-outline btn-sm" onclick="openQuickClientCreate(this)">+ Nouveau</button>
          </div>
        </div>
        <input name="entreprise_id" type="hidden" value="1"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Objet</label><input name="objet" placeholder="Objet du devis"/></div>
        <div class="form-group"><label>Valable jusqu'au</label><input name="date_validite" type="date" value="${new Date(Date.now()+30*86400000).toISOString().slice(0,10)}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML('')}</div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:20px">
          <input type="checkbox" name="is_free" id="isFree" style="width:auto"/>
          <label for="isFree" style="text-transform:none;margin:0">Devis gratuit</label>
        </div>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="lignesBody"></tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer le devis</button>
      </div>
    </form>`;

  modal.show('Nouveau devis', html, body => {
    attachConditionsPaiement(body);
    let ligneCount = 0;
    const addLigne = () => {
      ligneCount++;
      const n = ligneCount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="lig_designation_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="lig_quantite_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="lig_prix_ht_${n}" type="number" step="0.01" placeholder="0.00" style="width:90px"/></td>
        <td><select name="lig_tva_${n}" style="width:120px">${tvaOpts}</select></td>
        <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#lignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="lig_designation_${n}"]`),
        tr.querySelector(`[name="lig_prix_ht_${n}"]`),
        tr.querySelector(`[name="lig_tva_${n}"]`)
      );
    };
    addLigne();
    body.querySelector('#addLigne').onclick = addLigne;

    body.querySelector('#devisForm').onsubmit = async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd);
      const lignes = [];
      for (let i = 1; i <= ligneCount; i++) {
        if (!fd.get(`lig_designation_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`lig_designation_${i}`),
          quantite:         parseFloat(fd.get(`lig_quantite_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`lig_prix_ht_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`lig_tva_${i}`)         || '1'),
          remise_pct:       parseFloat(fd.get(`lig_remise_${i}`)    || '0'),
        });
      }
      await api.post('/api/devis', {
        client_id:    parseInt(data.client_id),
        entreprise_id: parseInt(data.entreprise_id),
        objet:         data.objet || undefined,
        date_validite: data.date_validite || undefined,
        conditions_paiement: data.conditions_paiement || undefined,
        is_free:       fd.has('is_free'),
        lignes,
      });
      modal.hide();
      tabMgr.openViewTab('devis');
    };
  });
}

async function showAvenantForm(devisId) {
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');
  const html = `
    <form id="avenantForm">
      <div class="form-group"><label>Motif de l'avenant *</label>
        <textarea name="motif" required placeholder="Raison de la modification…"></textarea>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes modifiées</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addAvLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Type</th><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th></th></tr></thead>
        <tbody id="avLignesBody"></tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-warning">Créer l'avenant</button>
      </div>
    </form>`;

  modal.show('Nouvel avenant', html, body => {
    let n = 0;
    const addLigne = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><select name="av_type_${n}" style="width:110px">
          <option value="ajout">Ajout</option>
          <option value="suppression">Suppression</option>
          <option value="modification">Modification</option>
        </select></td>
        <td><input name="av_des_${n}" placeholder="Désignation" required style="min-width:140px"/></td>
        <td><input name="av_qty_${n}" type="number" value="1" step="0.01" style="width:60px"/></td>
        <td><input name="av_pu_${n}"  type="number" step="0.01" placeholder="0.00" style="width:80px"/></td>
        <td><select name="av_tva_${n}" style="width:100px">${tvaOpts}</select></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#avLignesBody').appendChild(tr);
    };
    addLigne();
    body.querySelector('#addAvLigne').onclick = addLigne;
    body.querySelector('#avenantForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= n; i++) {
        if (!fd.get(`av_des_${i}`)) continue;
        lignes.push({
          type_ligne: fd.get(`av_type_${i}`),
          designation: fd.get(`av_des_${i}`),
          quantite: parseFloat(fd.get(`av_qty_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`av_pu_${i}`) || '0'),
          taux_tva_id: parseInt(fd.get(`av_tva_${i}`) || '1'),
        });
      }
      await api.post(`/api/devis/${devisId}/avenant`, { motif: fd.get('motif'), lignes });
      modal.hide();
      tabMgr.openViewTab('devis');
    };
  });
}

async function showFactureFromDevisForm(devisId) {
  const d = await api.get(`/api/devis/${devisId}`);
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

  const lignesHtml = (d.lignes || []).map((l, i) => {
    const n = i + 1;
    return `<tr>
      <td><input name="lig_designation_${n}" value="${l.designation}" required style="min-width:180px"/></td>
      <td><input name="lig_quantite_${n}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:70px"/></td>
      <td><input name="lig_prix_ht_${n}" type="number" value="${l.prix_unitaire_ht}" step="0.01" style="width:90px"/></td>
      <td><select name="lig_tva_${n}" style="width:120px">${tvaOptions.map(t => `<option value="${t.id}" ${t.id == l.taux_tva_id ? 'selected' : ''}>${t.libelle}</option>`).join('')}</select></td>
      <td><input name="lig_remise_${n}" type="number" value="${l.remise_pct || 0}" min="0" max="100" style="width:60px"/></td>
      <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`;
  }).join('');

  const html = `
    <form id="factureFromDevisForm">
      <div class="alert alert-info">Lignes pré-remplies depuis le devis <strong>${d.numero}</strong>.</div>
      <div class="form-row">
        <div class="form-group"><label>Échéance</label>
          <input name="date_echeance" type="date"/>
        </div>
        <div class="form-group"><label>Mode TVA</label>
          <select name="tva_mode">
            <option value="normal">Normal</option>
            <option value="franchise_293b">Franchise 293B</option>
            <option value="autoliquidation">Autoliquidation</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML(d.conditions_paiement)}</div>
        <div class="form-group"><label>Mode de règlement</label>
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
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addFDLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="fdLignesBody">${lignesHtml}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer la facture</button>
      </div>
    </form>`;

  modal.show(`Facturer ${d.numero}`, html, body => {
    attachConditionsPaiement(body);
    let ligneCount = (d.lignes || []).length;

    (d.lignes || []).forEach((_, i) => {
      const n = i + 1;
      attachArticleAutocomplete(
        body.querySelector(`[name="lig_designation_${n}"]`),
        body.querySelector(`[name="lig_prix_ht_${n}"]`),
        body.querySelector(`[name="lig_tva_${n}"]`)
      );
    });

    body.querySelector('#addFDLigne').onclick = () => {
      ligneCount++;
      const n = ligneCount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="lig_designation_${n}" required style="min-width:180px"/></td>
        <td><input name="lig_quantite_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="lig_prix_ht_${n}" type="number" step="0.01" style="width:90px"/></td>
        <td><select name="lig_tva_${n}" style="width:120px">${tvaOpts}</select></td>
        <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#fdLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="lig_designation_${n}"]`),
        tr.querySelector(`[name="lig_prix_ht_${n}"]`),
        tr.querySelector(`[name="lig_tva_${n}"]`)
      );
    };

    body.querySelector('#factureFromDevisForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= ligneCount; i++) {
        if (!fd.get(`lig_designation_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`lig_designation_${i}`),
          quantite:         parseFloat(fd.get(`lig_quantite_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`lig_prix_ht_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`lig_tva_${i}`)         || '1'),
          remise_pct:       parseFloat(fd.get(`lig_remise_${i}`)    || '0'),
        });
      }
      const r = await api.post('/api/factures', {
        client_id:           d.client_id,
        devis_id:            devisId,
        date_echeance:       fd.get('date_echeance') || undefined,
        tva_mode:            fd.get('tva_mode'),
        conditions_paiement: fd.get('conditions_paiement') || undefined,
        mode_paiement:       fd.get('mode_paiement') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      navigate('factures');
    };
  });
}

async function showBLFromDevisForm(devisId) {
  const d = await api.get(`/api/devis/${devisId}`);
  return DocEditor.openBL(null, {
    client_id:    d.client_id,
    devis_id:     devisId,
    devis_numero: d.numero,
    lignes: (d.lignes || []).map(l => ({ designation: l.designation, quantite: l.quantite, unite: l.unite })),
  });
}
async function _showBLFromDevisFormOld(devisId) {
  const d = await api.get(`/api/devis/${devisId}`);

  const html = `
    <form id="blFromDevisForm">
      <div class="alert alert-info">Lignes pré-remplies depuis le devis <strong>${d.numero}</strong>.</div>
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
        <button type="button" class="btn btn-outline btn-sm" id="addBLDLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th></th></tr></thead>
        <tbody id="blDLignesBody">
          ${(d.lignes || []).map((l, i) => `<tr>
            <td><input name="bl_des_${i+1}" value="${l.designation}" required style="min-width:180px"/></td>
            <td><input name="bl_qty_${i+1}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:70px"/></td>
            <td><input name="bl_unite_${i+1}" value="${l.unite || ''}" style="width:80px"/></td>
            <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
          </tr>`).join('')}
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

  modal.show(`BL depuis ${d.numero}`, html, body => {
    let n = (d.lignes || []).length;

    body.querySelector('#addBLDLigne').onclick = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="bl_des_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="bl_qty_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="bl_unite_${n}" placeholder="heure, jour…" style="width:80px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#blDLignesBody').appendChild(tr);
      attachArticleAutocomplete(tr.querySelector(`[name="bl_des_${n}"]`), null, null, tr.querySelector(`[name="bl_unite_${n}"]`));
    };

    body.querySelector('#blFromDevisForm').onsubmit = async e => {
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
        client_id:      d.client_id,
        devis_id:       devisId,
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

// ── Factures ──────────────────────────────────────────────────────────────
async function showBLFromFactureForm(factureId) {
  const f = await api.get(`/api/factures/${factureId}`);
  return DocEditor.openBL(null, {
    client_id:       f.client_id,
    facture_id:      factureId,
    facture_numero:  f.numero,
    lignes: (f.lignes || []).map(l => ({ designation: l.designation, quantite: l.quantite, unite: l.unite })),
  });
}
async function _showBLFromFactureFormOld(factureId) {
  const f = await api.get(`/api/factures/${factureId}`);

  const html = `
    <form id="blFromFactureForm">
      <div class="alert alert-info">Lignes pré-remplies depuis la facture <strong>${f.numero}</strong>.</div>
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
        <button type="button" class="btn btn-outline btn-sm" id="addBLFLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th></th></tr></thead>
        <tbody id="blFLignesBody">
          ${(f.lignes || []).map((l, i) => `<tr>
            <td><input name="bl_des_${i+1}" value="${l.designation}" required style="min-width:180px"/></td>
            <td><input name="bl_qty_${i+1}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:70px"/></td>
            <td><input name="bl_unite_${i+1}" value="${l.unite || ''}" style="width:80px"/></td>
            <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
          </tr>`).join('')}
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

  modal.show(`BL depuis ${f.numero}`, html, body => {
    let n = (f.lignes || []).length;

    (f.lignes || []).forEach((_, i) => {
      attachArticleAutocomplete(
        body.querySelector(`[name="bl_des_${i+1}"]`), null, null,
        body.querySelector(`[name="bl_unite_${i+1}"]`)
      );
    });

    body.querySelector('#addBLFLigne').onclick = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="bl_des_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="bl_qty_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="bl_unite_${n}" placeholder="heure, jour…" style="width:80px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#blFLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="bl_des_${n}"]`), null, null,
        tr.querySelector(`[name="bl_unite_${n}"]`)
      );
    };

    body.querySelector('#blFromFactureForm').onsubmit = async e => {
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
        client_id:      f.client_id,
        facture_id:     factureId,
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

async function emettreFacture(id) {
  if (!confirm('Émettre cette facture ? Elle sera verrouillée, scellée et archivée.')) return;
  const r = await fetch(`/api/factures/${id}/emettre`, { method: 'POST' });
  const d = await r.json();
  if (d.error) alert('Erreur : ' + d.error);
  tabMgr.openViewTab('factures');
}

async function payerFacture(id) {
  const today = new Date().toISOString().slice(0, 10);
  modal.open('Enregistrer le paiement', `
    <form id="payerForm">
      <div class="form-row">
        <div class="form-group">
          <label>Date de paiement *</label>
          <input name="date_paiement" type="date" value="${today}" required/>
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

  document.getElementById('payerForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api.post(`/api/factures/${id}/payer`, {
      date_paiement:  fd.get('date_paiement'),
      mode_paiement:  fd.get('mode_paiement') || null,
    });
    modal.close();
    tabMgr.openViewTab('factures');
  };
}

async function exportFEC() {
  const token = localStorage.getItem('jwt');
  const res = await fetch('/api/factures/export/fec', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Erreur export FEC'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'FEC.txt'; a.click();
  URL.revokeObjectURL(url);
}

async function verifierScellement() {
  const r = await api.get('/api/factures/scellement/verifier');
  alert(r.valide ? '✓ Chaîne de scellement intègre.' : `⚠ Rupture détectée à l'entrée ${r.premierEcartId}`);
}

function showFactureForm() {
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}">${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');
  const tvaOpts = tvaOptions.map(t =>
    `<option value="${t.id}">${t.libelle}</option>`).join('');

  const html = `
    <form id="factureForm">
      <div class="form-row">
        <div class="form-group"><label>Client *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select name="client_id" required style="flex:1"><option value="">Selectionner...</option>${clientOpts}</select>
            <button type="button" class="btn btn-outline btn-sm" onclick="openQuickClientCreate(this)">+ Nouveau</button>
          </div>
        </div>
        <input name="entreprise_id" type="hidden" value="1"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Échéance</label><input name="date_echeance" type="date"/></div>
        <div class="form-group"><label>Mode TVA</label>
          <select name="tva_mode">
            <option value="normal">Normal</option>
            <option value="franchise_293b">Franchise 293B</option>
            <option value="autoliquidation">Autoliquidation</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML('')}</div>
        <div class="form-group"><label>Mode de règlement</label>
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
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addFacLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="facLignesBody"></tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer la facture</button>
      </div>
    </form>`;

  modal.show('Nouvelle facture', html, body => {
    attachConditionsPaiement(body);
    let n = 0;
    const addLigne = () => {
      n++;
      const i = n;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="fl_des_${i}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="fl_qty_${i}" type="number" value="1" step="0.01" style="width:70px"/></td>
        <td><input name="fl_pu_${i}"  type="number" step="0.01" placeholder="0.00" style="width:90px"/></td>
        <td><select name="fl_tva_${i}" style="width:120px">${tvaOpts}</select></td>
        <td><input name="fl_rem_${i}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#facLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="fl_des_${i}"]`),
        tr.querySelector(`[name="fl_pu_${i}"]`),
        tr.querySelector(`[name="fl_tva_${i}"]`)
      );
    };
    addLigne();
    body.querySelector('#addFacLigne').onclick = addLigne;
    body.querySelector('#factureForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      const lignes = [];
      for (let i = 1; i <= n; i++) {
        if (!fd.get(`fl_des_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`fl_des_${i}`),
          quantite:         parseFloat(fd.get(`fl_qty_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`fl_pu_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`fl_tva_${i}`)   || '1'),
          remise_pct:       parseFloat(fd.get(`fl_rem_${i}`) || '0'),
        });
      }
      await api.post('/api/factures', {
        client_id:    parseInt(data.client_id),
        entreprise_id: parseInt(data.entreprise_id),
        date_echeance: data.date_echeance || undefined,
        tva_mode:      data.tva_mode,
        conditions_paiement: data.conditions_paiement || undefined,
        mode_paiement: data.mode_paiement || undefined,
        lignes,
      });
      modal.hide();
      tabMgr.openViewTab('factures');
    };
  });
}

// ── Bons de livraison ─────────────────────────────────────────────────────
function blLignesForm(lignes, tvaOpts) {
  return (lignes || [{}]).map((l, i) => {
    const n = i + 1;
    return `<tr>
      <td><input name="bl_des_${n}" value="${l.designation || ''}" placeholder="Désignation" required style="min-width:180px"/></td>
      <td><input name="bl_qty_${n}" type="number" value="${l.quantite ?? 1}" min="0.01" step="0.01" style="width:70px"/></td>
      <td><input name="bl_unite_${n}" value="${l.unite || ''}" placeholder="heure, jour…" style="width:80px"/></td>
      <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`;
  }).join('');
}

async function showBLForm() {
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}">${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');

  const html = `
    <form id="blForm">
      <div class="form-row">
        <div class="form-group"><label>Client *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select name="client_id" required style="flex:1"><option value="">Selectionner...</option>${clientOpts}</select>
            <button type="button" class="btn btn-outline btn-sm" onclick="openQuickClientCreate(this)">+ Nouveau</button>
          </div>
        </div>
        <div class="form-group"><label>Date de livraison</label>
          <input name="date_livraison" type="date"/>
        </div>
      </div>
      <div class="form-group"><label>Lieu de livraison</label>
        <input name="lieu_livraison" placeholder="Adresse ou lieu de livraison"/>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Articles à livrer</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addBLLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th></th></tr></thead>
        <tbody id="blLignesBody">${blLignesForm([{}])}</tbody>
      </table>
      <div class="form-group" style="margin-top:12px"><label>Notes</label>
        <textarea name="notes" placeholder="Remarques, instructions de livraison…"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer le BL</button>
      </div>
    </form>`;

  modal.show('Nouveau bon de livraison', html, body => {
    let n = 1;
    body.querySelector('#addBLLigne').onclick = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="bl_des_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="bl_qty_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="bl_unite_${n}" placeholder="heure, jour…" style="width:80px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#blLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="bl_des_${n}"]`), null,
        null, tr.querySelector(`[name="bl_unite_${n}"]`)
      );
    };
    // Autocomplete sur la première ligne
    attachArticleAutocomplete(
      body.querySelector('[name="bl_des_1"]'), null,
      null, body.querySelector('[name="bl_unite_1"]')
    );

    body.querySelector('#blForm').onsubmit = async e => {
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
        client_id:      parseInt(fd.get('client_id')),
        date_livraison: fd.get('date_livraison') || undefined,
        lieu_livraison: fd.get('lieu_livraison') || undefined,
        notes:          fd.get('notes') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      tabMgr.openViewTab('bons-livraison');
    };
  });
}

async function showBLEditForm(id) {
  const bl = await api.get(`/api/bons-livraison/${id}`);
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}" ${c.id == bl.client_id ? 'selected' : ''}>${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');

  const html = `
    <form id="blEditForm">
      <div class="form-row">
        <div class="form-group"><label>Client</label>
          <select name="client_id" disabled>${clientOpts}</select>
        </div>
        <div class="form-group"><label>Date de livraison</label>
          <input name="date_livraison" type="date" value="${bl.date_livraison ? bl.date_livraison.slice(0,10) : ''}"/>
        </div>
      </div>
      <div class="form-group"><label>Lieu de livraison</label>
        <input name="lieu_livraison" value="${bl.lieu_livraison || ''}"/>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Articles à livrer</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addBLLigneEdit">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th></th></tr></thead>
        <tbody id="blLignesBodyEdit">${blLignesForm(bl.lignes)}</tbody>
      </table>
      <div class="form-group" style="margin-top:12px"><label>Notes</label>
        <textarea name="notes">${bl.notes || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`;

  modal.show(`Modifier ${bl.numero}`, html, body => {
    let n = (bl.lignes || []).length;

    (bl.lignes || []).forEach((_, i) => {
      const idx = i + 1;
      attachArticleAutocomplete(
        body.querySelector(`[name="bl_des_${idx}"]`), null,
        null, body.querySelector(`[name="bl_unite_${idx}"]`)
      );
    });

    body.querySelector('#addBLLigneEdit').onclick = () => {
      n++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="bl_des_${n}" placeholder="Désignation" required style="min-width:180px"/></td>
        <td><input name="bl_qty_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="bl_unite_${n}" placeholder="heure, jour…" style="width:80px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#blLignesBodyEdit').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="bl_des_${n}"]`), null,
        null, tr.querySelector(`[name="bl_unite_${n}"]`)
      );
    };

    body.querySelector('#blEditForm').onsubmit = async e => {
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
      const r = await api.put(`/api/bons-livraison/${id}`, {
        date_livraison: fd.get('date_livraison') || undefined,
        lieu_livraison: fd.get('lieu_livraison') || undefined,
        notes:          fd.get('notes') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      tabMgr.openViewTab('bons-livraison');
    };
  });
}

function previewBL(id) { openPdf(`/api/bons-livraison/${id}/apercu`); }

async function envoyerBL(id) {
  const [bl, entreprise] = await Promise.all([
    api.get(`/api/bons-livraison/${id}`),
    api.get('/api/entreprise'),
  ]);
  const client      = await api.get(`/api/clients/${bl.client_id}`);
  const emailClient = client?.email || '';
  const modePref = isAndroid ? 'mailto' : (entreprise?.email_mode || 'mapi');

  modal.open('Envoyer le bon de livraison', `
    <form id="envoyerBLForm">
      <div class="form-group">
        <label>Mode d'envoi</label>
        <select id="envoyerBLMode">
          <option value="mapi"   ${modePref === 'mapi'   ? 'selected' : ''}>MAPI — Client mail Windows (Outlook, Thunderbird…)</option>
          <option value="mailto" ${modePref === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
          <option value="smtp"   ${modePref === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique</option>
        </select>
      </div>
      <div class="form-group">
        <label>Email du client</label>
        <input name="email_client" type="email" value="${emailClient}" placeholder="client@exemple.fr"/>
      </div>
      <div id="mapiBLNote" style="${modePref === 'mapi' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Le client mail s'ouvrira avec le bon de livraison déjà attaché en PDF.
        </div>
      </div>
      <div id="mailtoBLNote" style="${modePref === 'mailto' ? '' : 'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:0">
          Votre application mail s'ouvrira avec le sujet et le corps pré-remplis. Joignez le PDF manuellement si nécessaire.
        </div>
      </div>
      <div id="envoyerBLError" style="color:var(--danger);font-size:13px;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Envoyer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('envoyerBLMode').onchange = function() {
    document.getElementById('mapiBLNote').style.display   = this.value === 'mapi'   ? '' : 'none';
    document.getElementById('mailtoBLNote').style.display = this.value === 'mailto' ? '' : 'none';
  };

  document.getElementById('envoyerBLForm').onsubmit = async e => {
    e.preventDefault();
    const emailVal = e.target.email_client.value.trim();
    const modeVal  = document.getElementById('envoyerBLMode').value;
    const btn      = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';

    if (modeVal === 'mapi') {
      const mapiRes = await api.post(`/api/bons-livraison/${id}/mapi`, { email: emailVal });
      if (mapiRes?.ok) { modal.close(); return; }
      await downloadFile(`/api/bons-livraison/${id}/eml?email=${encodeURIComponent(emailVal)}`, `${bl.numero}.eml`);
      modal.close();
      return;
    }

    if (modeVal === 'mailto') {
      const nomEntreprise = entreprise?.raison_sociale || entreprise?.nom || '';
      const titre = `Bon de livraison ${bl.numero} — ${nomEntreprise}`;
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint votre bon de livraison ${bl.numero}.\n\nCordialement,\n${nomEntreprise}`;
      await envoyerAvecPdf(`/api/bons-livraison/${id}/apercu`, `${bl.numero}.pdf`, emailVal, titre, corps);
      modal.close(); return;
    }

    // Mode SMTP
    const res = await api.post(`/api/bons-livraison/${id}/envoyer-email`, { email_client: emailVal || undefined });
    if (res?.error) {
      document.getElementById('envoyerBLError').textContent = res.error;
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

async function showDevisFromBLForm(blId) {
  const bl = await api.get(`/api/bons-livraison/${blId}`);
  const clientOpts = clientOptions.map(c =>
    `<option value="${c.id}" ${c.id == bl.client_id ? 'selected' : ''}>${c.raison_sociale || c.nom || 'Client ' + c.id}</option>`).join('');
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

  const lignesHtml = (bl.lignes || []).map((l, i) => {
    const n = i + 1;
    return `<tr>
      <td><input name="lig_designation_${n}" value="${l.designation}" required style="min-width:180px"/></td>
      <td><input name="lig_quantite_${n}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:70px"/></td>
      <td><input name="lig_prix_ht_${n}" type="number" step="0.01" placeholder="0.00" style="width:90px" required/></td>
      <td><select name="lig_tva_${n}" style="width:120px">${tvaOpts}</select></td>
      <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
      <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`;
  }).join('');

  const html = `
    <form id="devisFromBLForm">
      <div class="alert alert-info">Lignes pré-remplies depuis le BL <strong>${bl.numero}</strong>. Renseignez les prix unitaires HT.</div>
      <div class="form-row">
        <div class="form-group"><label>Client *</label>
          <select name="client_id" required><option value="">Sélectionner…</option>${clientOpts}</select>
        </div>
        <div class="form-group"><label>Valable jusqu'au</label>
          <input name="date_validite" type="date" value="${new Date(Date.now()+30*86400000).toISOString().slice(0,10)}"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Objet</label>
          <input name="objet" placeholder="Objet du devis"/>
        </div>
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML('')}</div>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addDBLLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT *</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="dbLignesBody">${lignesHtml}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer le devis</button>
      </div>
    </form>`;

  modal.show(`Devis depuis ${bl.numero}`, html, body => {
    attachConditionsPaiement(body);
    let ligneCount = (bl.lignes || []).length;

    (bl.lignes || []).forEach((_, i) => {
      const n = i + 1;
      attachArticleAutocomplete(
        body.querySelector(`[name="lig_designation_${n}"]`),
        body.querySelector(`[name="lig_prix_ht_${n}"]`),
        body.querySelector(`[name="lig_tva_${n}"]`)
      );
    });

    body.querySelector('#addDBLLigne').onclick = () => {
      ligneCount++;
      const n = ligneCount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="lig_designation_${n}" required style="min-width:180px"/></td>
        <td><input name="lig_quantite_${n}" type="number" value="1" min="0.01" step="0.01" style="width:70px"/></td>
        <td><input name="lig_prix_ht_${n}" type="number" step="0.01" placeholder="0.00" style="width:90px"/></td>
        <td><select name="lig_tva_${n}" style="width:120px">${tvaOpts}</select></td>
        <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:60px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#dbLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="lig_designation_${n}"]`),
        tr.querySelector(`[name="lig_prix_ht_${n}"]`),
        tr.querySelector(`[name="lig_tva_${n}"]`)
      );
    };

    body.querySelector('#devisFromBLForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= ligneCount; i++) {
        if (!fd.get(`lig_designation_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`lig_designation_${i}`),
          quantite:         parseFloat(fd.get(`lig_quantite_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`lig_prix_ht_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`lig_tva_${i}`)         || '1'),
          remise_pct:       parseFloat(fd.get(`lig_remise_${i}`)    || '0'),
        });
      }
      const r = await api.post('/api/devis', {
        client_id:           parseInt(fd.get('client_id')),
        objet:               fd.get('objet') || undefined,
        date_validite:       fd.get('date_validite') || undefined,
        conditions_paiement: fd.get('conditions_paiement') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      navigate('devis');
    };
  });
}

async function showFactureFromBLForm(blId) {
  const bl = await api.get(`/api/bons-livraison/${blId}`);
  const tvaOpts = tvaOptions.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

  const lignesHtml = (bl.lignes || []).map((l, i) => {
    const n = i + 1;
    return `<tr>
      <td><input name="lig_designation_${n}" value="${l.designation}" required style="min-width:160px"/></td>
      <td><input name="lig_quantite_${n}" type="number" value="${l.quantite}" min="0.01" step="0.01" style="width:65px"/></td>
      <td><input name="lig_prix_ht_${n}" type="number" step="0.01" placeholder="0.00" style="width:85px" required/></td>
      <td><select name="lig_tva_${n}" style="width:110px">${tvaOpts}</select></td>
      <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:55px"/></td>
      <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`;
  }).join('');

  const html = `
    <form id="factureFromBLForm">
      <div class="alert alert-info">Lignes pré-remplies depuis le BL <strong>${bl.numero}</strong>. Renseignez les prix unitaires HT.</div>
      <div class="form-row">
        <div class="form-group"><label>Échéance</label>
          <input name="date_echeance" type="date"/>
        </div>
        <div class="form-group"><label>Mode TVA</label>
          <select name="tva_mode">
            <option value="normal">Normal</option>
            <option value="franchise_293b">Franchise 293B</option>
            <option value="autoliquidation">Autoliquidation</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Conditions de paiement</label>${conditionsPaiementHTML('')}</div>
        <div class="form-group"><label>Mode de règlement</label>
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
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Lignes</strong>
        <button type="button" class="btn btn-outline btn-sm" id="addFBLigne">+ Ligne</button>
      </div>
      <table class="lignes-table">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. HT *</th><th>TVA</th><th>Remise%</th><th></th></tr></thead>
        <tbody id="fbLignesBody">${lignesHtml}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">Créer la facture</button>
      </div>
    </form>`;

  modal.show(`Facturer ${bl.numero}`, html, body => {
    attachConditionsPaiement(body);
    let ligneCount = (bl.lignes || []).length;

    (bl.lignes || []).forEach((_, i) => {
      const n = i + 1;
      attachArticleAutocomplete(
        body.querySelector(`[name="lig_designation_${n}"]`),
        body.querySelector(`[name="lig_prix_ht_${n}"]`),
        body.querySelector(`[name="lig_tva_${n}"]`)
      );
    });

    body.querySelector('#addFBLigne').onclick = () => {
      ligneCount++;
      const n = ligneCount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input name="lig_designation_${n}" required style="min-width:160px"/></td>
        <td><input name="lig_quantite_${n}" type="number" value="1" min="0.01" step="0.01" style="width:65px"/></td>
        <td><input name="lig_prix_ht_${n}" type="number" step="0.01" placeholder="0.00" style="width:85px"/></td>
        <td><select name="lig_tva_${n}" style="width:110px">${tvaOpts}</select></td>
        <td><input name="lig_remise_${n}" type="number" value="0" min="0" max="100" style="width:55px"/></td>
        <td><button type="button" class="btn-remove-ligne" onclick="this.closest('tr').remove()">✕</button></td>`;
      body.querySelector('#fbLignesBody').appendChild(tr);
      attachArticleAutocomplete(
        tr.querySelector(`[name="lig_designation_${n}"]`),
        tr.querySelector(`[name="lig_prix_ht_${n}"]`),
        tr.querySelector(`[name="lig_tva_${n}"]`)
      );
    };

    body.querySelector('#factureFromBLForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lignes = [];
      for (let i = 1; i <= ligneCount; i++) {
        if (!fd.get(`lig_designation_${i}`)) continue;
        lignes.push({
          designation:      fd.get(`lig_designation_${i}`),
          quantite:         parseFloat(fd.get(`lig_quantite_${i}`) || '1'),
          prix_unitaire_ht: parseFloat(fd.get(`lig_prix_ht_${i}`)  || '0'),
          taux_tva_id:      parseInt(fd.get(`lig_tva_${i}`)         || '1'),
          remise_pct:       parseFloat(fd.get(`lig_remise_${i}`)    || '0'),
        });
      }
      const r = await api.post('/api/factures', {
        client_id:           bl.client_id,
        date_echeance:       fd.get('date_echeance') || undefined,
        tva_mode:            fd.get('tva_mode'),
        conditions_paiement: fd.get('conditions_paiement') || undefined,
        mode_paiement:       fd.get('mode_paiement') || undefined,
        lignes,
      });
      if (r?.error) return alert(r.error);
      modal.hide();
      navigate('factures');
    };
  });
}

async function emettresBL(id) {
  await api.post(`/api/bons-livraison/${id}/emettre`);
  tabMgr.openViewTab('bons-livraison');
}

async function livrerBL(id) {
  if (!confirm('Marquer ce bon de livraison comme livré ?')) return;
  await api.post(`/api/bons-livraison/${id}/livrer`);
  tabMgr.openViewTab('bons-livraison');
}

async function supprimerBL(id) {
  if (!confirm('Supprimer ce bon de livraison ?')) return;
  const r = await api.delete(`/api/bons-livraison/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('bons-livraison');
}

async function deleteDevis(id) {
  if (!confirm('Supprimer ce devis ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/devis/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('devis');
}

async function deleteAcompte(id) {
  if (!confirm('Supprimer cet acompte ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/acomptes/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('acomptes');
}

async function deleteAvoir(id) {
  if (!confirm('Supprimer cet avoir ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/factures/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('avoirs');
}

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/clients/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('clients');
}

// ── Articles ──────────────────────────────────────────────────────────────
async function renderArticles(el) {
  const articles = await api.get('/api/articles');
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-primary" onclick="showArticleForm()">+ Nouvel article</button>`;

  el.innerHTML = `<div class="card"><div class="table-wrap">
    <table>
      <thead><tr>
        <th>Réf.</th><th>Désignation</th><th>Description</th>
        <th>Unité</th><th class="text-right">Prix HT</th><th>TVA</th><th class="text-right">Stock</th><th></th>
      </tr></thead>
      <tbody>${articles.length ? articles.map(a => `
        <tr>
          <td><code>${a.reference || '—'}</code></td>
          <td><strong>${a.designation}</strong></td>
          <td style="color:var(--text-muted);font-size:12px">${a.description || '—'}</td>
          <td>${a.unite || '—'}</td>
          <td class="text-right">${fmt.money(a.prix_unitaire_ht)}</td>
          <td>${a.tva_taux}%</td>
          <td class="text-right">${a.quantite_stock != null ? `<span class="e-stock-badge">${a.quantite_stock}</span>` : '—'}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="showArticleForm(${a.id})">Éditer</button>
              <button class="btn-trash" onclick="deleteArticle(${a.id})" title="Supprimer">🗑️</button>
            </div>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="empty">Aucun article</td></tr>'}</tbody>
    </table>
  </div></div>`;
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
          <input name="prix_unitaire_ht" type="number" step="0.01" min="0"
            value="${a.prix_unitaire_ht ?? ''}" required/>
        </div>
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

    body.querySelector('#articleForm').onsubmit = async e => {
      e.preventDefault();
      const fd    = new FormData(e.target);
      const unite = sel.value === '__autre__'
        ? (custom.value.trim() || undefined)
        : (sel.value || undefined);
      const stock = fd.get('quantite_stock');
      const data = {
        reference:        fd.get('reference') || undefined,
        designation:      fd.get('designation'),
        description:      fd.get('description') || undefined,
        unite,
        prix_unitaire_ht: parseFloat(fd.get('prix_unitaire_ht') || '0'),
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
        if (puInput)    puInput.value    = a.prix_unitaire_ht;
        if (tvaSelect)  tvaSelect.value  = a.taux_tva_id;
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

// ── Archives ──────────────────────────────────────────────────────────────
async function renderArchives(el) {
  const archives = await api.get('/api/archives') ?? [];
  el.innerHTML = `<div class="card">
    <div class="alert alert-info">
      Archives conservées 10 ans (ISCA). Lecture seule — suppression et modification interdites.
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>N°</th><th>Archivé le</th><th>Conservation jusqu'au</th></tr></thead>
        <tbody>${archives.length ? archives.map(a => `
          <tr>
            <td>${fmt.badge(a.type_document.toLowerCase())}</td>
            <td><strong>${a.numero}</strong></td>
            <td>${fmt.date(a.date_archivage)}</td>
            <td>${fmt.date(a.conservation_jusqu_au)}</td>
          </tr>`).join('') : '<tr><td colspan="4" class="empty">Aucune archive</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

// ── Paramètres ────────────────────────────────────────────────────────────
async function renderParametres(el) {
  const entreprise = await api.get('/api/entreprise') ?? {};
  el.innerHTML = `
    <div class="card" style="max-width:680px">
      <h2 style="margin-bottom:20px;color:var(--primary)">Mon entreprise</h2>
      <form id="entrepriseForm">
        <div class="form-row">
          <div class="form-group"><label>Raison sociale *</label>
            <input name="raison_sociale" value="${entreprise.raison_sociale || ''}" required/>
          </div>
          <div class="form-group"><label>Forme juridique *</label>
            <select name="forme_juridique">
              ${['EI','EURL','SARL','SAS','SA','SASU','SNC','Auto-entrepreneur'].map(f =>
                `<option value="${f}" ${entreprise.forme_juridique === f ? 'selected' : ''}>${f}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="is_EI" id="isEI" style="width:auto" ${entreprise.is_EI ? 'checked' : ''}/>
          <label for="isEI" style="text-transform:none;margin:0">Entrepreneur individuel (mention "EI" automatique)</label>
        </div>
        <div class="form-row">
          <div class="form-group"><label>SIRET *</label>
            <input name="siret" value="${entreprise.siret || ''}" required/>
          </div>
          <div class="form-group"><label>N° TVA Intracom</label>
            <input name="tva_intracom" value="${entreprise.tva_intracom || ''}"/>
          </div>
        </div>
        <div class="form-group"><label>Adresse *</label><input name="adresse" value="${entreprise.adresse || ''}" required/></div>
        <div class="form-group"><label>Complément d'adresse</label><input name="adresse2" value="${entreprise.adresse2 || ''}"/></div>
        <div class="form-row">
          <div class="form-group"><label>Code postal *</label><input name="code_postal" value="${entreprise.code_postal || ''}" required/></div>
          <div class="form-group"><label>Ville *</label><input name="ville" value="${entreprise.ville || ''}" required/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Email *</label><input name="email" type="email" value="${entreprise.email || ''}" required/></div>
          <div class="form-group"><label>Téléphone</label><input name="telephone" value="${entreprise.telephone || ''}"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Site web</label><input name="site_web" value="${entreprise.site_web || ''}"/></div>
          <div class="form-group"><label>Régime TVA</label>
            <select name="regime_tva">
              <option value="normal"          ${entreprise.regime_tva === 'normal'          ? 'selected' : ''}>Normal</option>
              <option value="franchise_293b"  ${entreprise.regime_tva === 'franchise_293b'  ? 'selected' : ''}>Franchise art. 293B</option>
              <option value="autoliquidation" ${entreprise.regime_tva === 'autoliquidation' ? 'selected' : ''}>Autoliquidation</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Capital social (€)</label><input name="capital_social" type="number" value="${entreprise.capital_social || ''}"/></div>
          <div class="form-group"><label>RCS Ville</label><input name="rcs_ville" value="${entreprise.rcs_ville || ''}"/></div>
        </div>
        <div id="saveAlert"></div>
        <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
      </form>

      <hr style="border:none;border-top:1px solid var(--border);margin:24px 0"/>

      <h3 style="margin-bottom:16px;color:var(--primary);font-size:15px">Logo</h3>
      <div id="logoPreview" style="margin-bottom:12px">
        ${entreprise.logo_path
          ? `<img src="${entreprise.logo_path}?t=${Date.now()}" style="max-height:80px;max-width:220px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:8px;background:#fff"/>`
          : `<span style="color:var(--text-muted);font-size:13px">Aucun logo configuré</span>`}
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <input type="file" id="logoInput" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none"/>
        <button type="button" class="btn btn-secondary" id="logoBtn">Choisir un logo</button>
        ${entreprise.logo_path ? `<button type="button" class="btn-trash" id="logoDelBtn" title="Supprimer le logo">🗑️</button>` : ''}
        <span style="font-size:11px;color:var(--text-muted)">PNG, JPG, SVG — max 2 Mo</span>
      </div>
    </div>

    <div class="card" style="max-width:680px;margin-top:20px">
      <h2 style="margin-bottom:4px;color:var(--primary)">Configuration email</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Choisissez comment les devis sont envoyés par email.</p>
      <form id="smtpForm">
        <div class="form-group">
          <label>Mode d'envoi</label>
          <select name="email_mode" id="emailModeSelect">
            <option value="mapi"   ${(entreprise.email_mode || 'mapi') === 'mapi'   ? 'selected' : ''}>MAPI — Ouvrir le client mail (Outlook, Thunderbird…)</option>
            <option value="mailto" ${entreprise.email_mode === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
            <option value="smtp"   ${entreprise.email_mode === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique via serveur mail</option>
          </select>
        </div>
        <div id="smtpFields" style="${(entreprise.email_mode || 'mapi') === 'smtp' ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group"><label>Serveur SMTP</label>
            <input name="smtp_host" value="${entreprise.smtp_host || ''}" placeholder="smtp.gmail.com"/>
          </div>
          <div class="form-group"><label>Port</label>
            <input name="smtp_port" type="number" value="${entreprise.smtp_port || 587}" placeholder="587"/>
          </div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="smtp_secure" id="smtpSecure" style="width:auto" ${entreprise.smtp_secure ? 'checked' : ''}/>
          <label for="smtpSecure" style="text-transform:none;margin:0">SSL/TLS (port 465)</label>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Identifiant</label>
            <input name="smtp_user" value="${entreprise.smtp_user || ''}" placeholder="votre@email.com"/>
          </div>
          <div class="form-group"><label>Mot de passe</label>
            <input name="smtp_pass" type="password" value="${entreprise.smtp_pass || ''}" placeholder="••••••••"/>
          </div>
        </div>
        <div class="form-group"><label>Adresse expéditeur (From)</label>
          <input name="smtp_from" value="${entreprise.smtp_from || ''}" placeholder="Société <contact@societe.fr>"/>
        </div>
        </div><!-- /smtpFields -->
        <div id="smtpAlert"></div>
        <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
      </form>
    </div>

    ${currentUser?.is_super_admin ? `
    <div class="card" style="margin-top:24px">
      <h2 class="section-title">Sauvegarde &amp; Restauration</h2>
      <div style="margin-bottom:20px">
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">
          Télécharge une sauvegarde complète de la base de données (toutes sociétés) au format SQL.
        </p>
        <button id="backupBtn" class="btn btn-secondary">⬇ Télécharger la sauvegarde</button>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
      <div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:4px">
          Restaurer à partir d'un fichier de sauvegarde SQL.<br/>
          <strong style="color:#c0392b">⚠ Attention : toutes les données actuelles seront remplacées.</strong>
        </p>
        <label class="btn btn-secondary" style="margin-top:8px;cursor:pointer">
          ⬆ Restaurer une sauvegarde
          <input type="file" id="restoreInput" accept=".sql" style="display:none"/>
        </label>
        <div id="restoreAlert"></div>
      </div>
    </div>
    <div class="card" style="margin-top:24px" id="backupAutoSection"></div>
    ` : ''}

    ${can('users:r') ? `<div class="card" style="margin-top:24px" id="usersSection"></div>` : ''}
    ${currentUser?.is_super_admin ? `<div class="card" style="margin-top:24px" id="societesSection"></div>` : ''}`;

  const entForm = el.querySelector('#entrepriseForm');
  attachSireneAutocomplete(entForm.querySelector('[name="raison_sociale"]'), entForm);
  attachNominatimAutocomplete(entForm.querySelector('[name="adresse"]'), entForm);

  el.querySelector('#entrepriseForm').onsubmit = async e => {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.is_EI = fd.has('is_EI');
    await api.post('/api/entreprise', data);
    el.querySelector('#saveAlert').innerHTML =
      '<div class="alert alert-success" style="margin-top:12px">Paramètres enregistrés.</div>';
    setTimeout(() => { el.querySelector('#saveAlert').innerHTML = ''; }, 3000);
  };

  el.querySelector('#logoBtn').onclick = () => el.querySelector('#logoInput').click();

  el.querySelector('#logoInput').onchange = async () => {
    const file = el.querySelector('#logoInput').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    const data = await api.upload('/api/entreprise/logo', fd);
    if (data.logo_path) {
      const src = `${data.logo_path}?t=${Date.now()}`;
      el.querySelector('#logoPreview').innerHTML =
        `<img src="${src}" style="max-height:80px;max-width:220px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:8px;background:#fff"/>`;
      updateSidebarLogo(data.logo_path);
    }
  };

  const delBtn = el.querySelector('#logoDelBtn');
  if (delBtn) {
    delBtn.onclick = async () => {
      await api.delete('/api/entreprise/logo');
      el.querySelector('#logoPreview').innerHTML =
        '<span style="color:var(--text-muted);font-size:13px">Aucun logo configuré</span>';
      delBtn.remove();
      updateSidebarLogo(null);
    };
  }

  el.querySelector('#emailModeSelect').onchange = function() {
    el.querySelector('#smtpFields').style.display = this.value === 'smtp' ? '' : 'none';
  };

  el.querySelector('#smtpForm').onsubmit = async e => {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.smtp_secure = fd.has('smtp_secure') ? 1 : 0;
    await api.post('/api/entreprise/smtp', data);
    el.querySelector('#smtpAlert').innerHTML =
      '<div class="alert alert-success" style="margin-top:12px">Configuration enregistrée.</div>';
    setTimeout(() => { el.querySelector('#smtpAlert').innerHTML = ''; }, 3000);
  };

  // ── Sauvegarde (super_admin uniquement) ──
  if (!currentUser?.is_super_admin) return; // les sections suivantes sont SA only

  el.querySelector('#backupBtn').onclick = async () => {
    const token = localStorage.getItem('jwt');
    const r = await fetch('/api/backup/telecharger', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { alert('Erreur lors du téléchargement'); return; }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `sauvegarde_${new Date().toISOString().slice(0,10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  el.querySelector('#restoreInput').onchange = async function() {
    const file = this.files[0];
    if (!file) return;
    const alertEl = el.querySelector('#restoreAlert');
    if (!confirm(`Restaurer la sauvegarde "${file.name}" ?\n\nToutes les données actuelles seront écrasées.`)) {
      this.value = '';
      return;
    }
    alertEl.innerHTML = '<div class="alert" style="margin-top:8px">Restauration en cours…</div>';
    try {
      const fd = new FormData();
      fd.append('backup', file);
      const data = await api.upload('/api/backup/restaurer', fd);
      if (data.ok) {
        alertEl.innerHTML = '<div class="alert alert-success" style="margin-top:8px">Restauration réussie. Rechargement…</div>';
        setTimeout(() => location.reload(), 1500);
      } else {
        alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur : ${data.error}</div>`;
      }
    } catch (e) {
      alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur réseau.</div>`;
    }
    this.value = '';
  };

  // Charger la section utilisateurs si accessible
  const usersSection = el.querySelector('#usersSection');
  if (usersSection) renderUtilisateurs(usersSection);

  // Charger les sections super_admin
  const backupAutoSection = el.querySelector('#backupAutoSection');
  if (backupAutoSection) renderBackupAuto(backupAutoSection);

  const societesSection = el.querySelector('#societesSection');
  if (societesSection) renderSocietes(societesSection);
}

// ── Gestion des sociétés (super_admin) ───────────────────────────────────
async function renderSocietes(el) {
  const societes = await api.get('/api/entreprise/all');
  el.innerHTML = `
    <div class="section-header">
      <h2>Sociétés</h2>
      <button class="btn btn-primary" onclick="showSocieteForm(null)">+ Nouvelle société</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Raison sociale</th><th>Forme</th><th>SIRET</th><th>Email</th><th>Actions</th></tr></thead>
        <tbody>
          ${Array.isArray(societes) ? societes.map(s => `<tr>
            <td><strong>${s.raison_sociale}</strong>${s.id === currentUser.entreprise_id ? ' <span class="badge badge-encaisse">Courante</span>' : ''}</td>
            <td>${s.forme_juridique}</td>
            <td style="font-size:12px">${s.siret}</td>
            <td style="font-size:12px">${s.email}</td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="switchCompany(${s.id})">Accéder</button>
              <button class="btn btn-outline btn-sm" onclick="showSocieteForm(${s.id})">Modifier</button>
            </td>
          </tr>`).join('') : ''}
        </tbody>
      </table>
    </div>`;
}

async function showSocieteForm(societeId) {
  const isNew = !societeId;
  let s = {};
  if (!isNew) s = await api.get(`/api/entreprise${societeId === currentUser.entreprise_id ? '' : '?id=' + societeId}`) ?? {};
  // Pour modifier une autre société, on switche temporairement — mais le plus simple est d'utiliser la route /all
  if (!isNew) {
    const all = await api.get('/api/entreprise/all');
    s = all.find(x => x.id === societeId) ?? {};
  }

  const formes = ['EI','EURL','SARL','SAS','SA','SASU','SNC','Auto-entrepreneur'];
  modal.open(isNew ? 'Nouvelle société' : `Modifier ${s.raison_sociale}`, `
    <form id="societeForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="form-row">
        <div class="form-group"><label>Raison sociale *</label>
          <input name="raison_sociale" value="${s.raison_sociale||''}" required/>
        </div>
        <div class="form-group"><label>Forme juridique *</label>
          <select name="forme_juridique">${formes.map(f=>`<option value="${f}"${s.forme_juridique===f?' selected':''}>${f}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>SIRET *</label>
          <input name="siret" value="${s.siret||''}" required/>
        </div>
        <div class="form-group"><label>TVA intracommunautaire</label>
          <input name="tva_intracom" value="${s.tva_intracom||''}"/>
        </div>
      </div>
      <div class="form-group"><label>Adresse *</label>
        <input name="adresse" value="${s.adresse||''}" required/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Code postal *</label>
          <input name="code_postal" value="${s.code_postal||''}" required/>
        </div>
        <div class="form-group"><label>Ville *</label>
          <input name="ville" value="${s.ville||''}" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email *</label>
          <input name="email" type="email" value="${s.email||''}" required/>
        </div>
        <div class="form-group"><label>Téléphone</label>
          <input name="telephone" value="${s.telephone||''}"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
      <div id="societeFormAlert"></div>
    </form>
  `, body => {
    body.querySelector('#societeForm').onsubmit = async ev => {
      ev.preventDefault();
      const fd   = new FormData(ev.target);
      const data = Object.fromEntries(fd);
      data.is_EI = 0; data.pays = data.pays || 'France';
      let r;
      if (isNew) {
        r = await api.post('/api/entreprise/new', data);
      } else {
        // Mise à jour via switch + POST — on passe par la route dédiée
        r = await api.post(`/api/entreprise/update/${societeId}`, data);
      }
      if (r?.error) {
        body.querySelector('#societeFormAlert').innerHTML = `<div class="alert alert-danger">${r.error}</div>`;
      } else {
        modal.close();
        tabMgr.openViewTab('parametres');
      }
    };
  });
}

// ── Sauvegarde automatique (super_admin) ─────────────────────────────────
async function renderBackupAuto(el) {
  const [cfg, liste] = await Promise.all([
    api.get('/api/backup/config'),
    api.get('/api/backup/liste'),
  ]);

  const totalMo = liste.totalMo ?? 0;
  const maxMo   = cfg.taille_max_mo ?? 500;
  const pct     = Math.min(100, Math.round(totalMo / maxMo * 100));
  const barColor = pct >= 90 ? '#e74c3c' : pct >= 70 ? '#e67e22' : 'var(--primary)';

  const joursS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  el.innerHTML = `
    <h2 class="section-title">Sauvegarde automatique</h2>

    <form id="backupAutoForm" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input type="checkbox" id="backupActif" name="actif" ${cfg.actif ? 'checked' : ''}/>
          Activer la sauvegarde automatique
        </label>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Dossier de destination</label>
          <input name="destination" id="backupDest" value="${cfg.destination || ''}" placeholder="C:\\Sauvegardes\\FacturPro" style="font-family:monospace"/>
        </div>
        <div class="form-group">
          <label>Taille max totale (Mo)</label>
          <input name="taille_max_mo" type="number" min="50" step="50" value="${cfg.taille_max_mo ?? 500}"/>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Périodicité</label>
          <select name="periodicite" id="backupPeriod" onchange="backupPeriodChange()">
            <option value="quotidienne"   ${cfg.periodicite==='quotidienne'  ? 'selected':''}>Quotidienne</option>
            <option value="hebdomadaire"  ${cfg.periodicite==='hebdomadaire' ? 'selected':''}>Hebdomadaire</option>
            <option value="mensuelle"     ${cfg.periodicite==='mensuelle'    ? 'selected':''}>Mensuelle</option>
          </select>
        </div>
        <div class="form-group">
          <label>Heure d'exécution</label>
          <input name="heure" type="time" value="${cfg.heure || '02:00'}"/>
        </div>
        <div class="form-group" id="backupJourSemaine" style="display:${cfg.periodicite==='hebdomadaire'?'':'none'}">
          <label>Jour de la semaine</label>
          <select name="jour_semaine">
            ${joursS.map((j,i) => `<option value="${i}" ${cfg.jour_semaine==i?'selected':''}>${j}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="backupJourMois" style="display:${cfg.periodicite==='mensuelle'?'':'none'}">
          <label>Jour du mois</label>
          <input name="jour_mois" type="number" min="1" max="28" value="${cfg.jour_mois ?? 1}"/>
        </div>
      </div>

      <div id="backupAutoAlert"></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button type="submit" class="btn btn-primary">Enregistrer</button>
        <button type="button" class="btn btn-secondary" id="backupLancerBtn">▶ Lancer maintenant</button>
      </div>
    </form>

    <hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>

    <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Fichiers de sauvegarde</h3>
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
        <span>Utilisé : <strong>${totalMo} Mo</strong> / ${maxMo} Mo</span>
        <span>${pct} %</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${barColor};transition:width .3s"></div>
      </div>
    </div>
    <div id="backupFilesTable">
      ${(liste.files || []).length === 0
        ? `<p style="color:var(--text-muted);font-size:13px">Aucun fichier de sauvegarde dans ce dossier.</p>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>Fichier</th><th>Taille</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${liste.files.map(f => `<tr>
                <td style="font-family:monospace;font-size:12px">${f.name}</td>
                <td style="font-size:12px">${(f.size/1024/1024).toFixed(1)} Mo</td>
                <td style="font-size:12px">${new Date(f.date).toLocaleString('fr-FR')}</td>
                <td>
                  <button class="btn-trash" onclick="deleteBackupFile('${f.name}', this)" title="Supprimer">🗑️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>`
      }
    </div>`;

  el.querySelector('#backupAutoForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.actif = fd.has('actif') ? 1 : 0;
    const alertEl = el.querySelector('#backupAutoAlert');
    const r = await api.post('/api/backup/config', data);
    if (r?.error) {
      alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">${r.error}</div>`;
    } else {
      alertEl.innerHTML = `<div class="alert alert-success" style="margin-top:8px">Configuration enregistrée.</div>`;
      setTimeout(() => { alertEl.innerHTML = ''; }, 3000);
    }
  };

  el.querySelector('#backupLancerBtn').onclick = async () => {
    const btn = el.querySelector('#backupLancerBtn');
    btn.disabled = true; btn.textContent = 'En cours…';
    const alertEl = el.querySelector('#backupAutoAlert');
    const r = await api.post('/api/backup/lancer', {});
    btn.disabled = false; btn.textContent = '▶ Lancer maintenant';
    if (r?.ok) {
      alertEl.innerHTML = `<div class="alert alert-success" style="margin-top:8px">Sauvegarde créée : ${r.fichier}</div>`;
      setTimeout(() => { alertEl.innerHTML = ''; renderBackupAuto(el); }, 3000);
    } else {
      alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">${r?.error || 'Erreur'}</div>`;
    }
  };
}

function backupPeriodChange() {
  const v = document.getElementById('backupPeriod')?.value;
  const js = document.getElementById('backupJourSemaine');
  const jm = document.getElementById('backupJourMois');
  if (js) js.style.display = v === 'hebdomadaire' ? '' : 'none';
  if (jm) jm.style.display = v === 'mensuelle' ? '' : 'none';
}

async function deleteBackupFile(nom, btn) {
  if (!confirm(`Supprimer "${nom}" ?`)) return;
  btn.disabled = true;
  const r = await api.delete(`/api/backup/fichier/${encodeURIComponent(nom)}`);
  if (r?.ok) {
    btn.closest('tr').remove();
  } else {
    alert(r?.error || 'Erreur lors de la suppression');
    btn.disabled = false;
  }
}

// ── Login / Company selector ──────────────────────────────────────────────
function showLoginPage() {
  document.getElementById('app').style.display = 'none';
  const ov = document.getElementById('loginOverlay');
  ov.style.display = 'flex';
  document.getElementById('loginForm').onsubmit = handleLogin;
  document.getElementById('loginEmail').focus();
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Connexion…';
  const errEl = document.getElementById('loginError');
  errEl.innerHTML = '';
  const email    = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());

    if (resp.require_select) {
      showCompanySelector(resp.entreprises, email, password);
      return;
    }
    if (!resp.token) {
      errEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">${resp.error || 'Identifiants incorrects'}</div>`;
      btn.disabled = false; btn.textContent = 'Se connecter';
      return;
    }
    localStorage.setItem('jwt', resp.token);
    location.reload();
  } catch {
    errEl.innerHTML = '<div class="alert alert-danger" style="margin-top:8px">Erreur réseau.</div>';
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
}

function showCompanySelector(entreprises, email, password) {
  document.getElementById('loginOverlay').style.display = 'none';
  const ov = document.getElementById('companyOverlay');
  ov.style.display = 'flex';
  document.getElementById('companyList').innerHTML = entreprises.map(e => `
    <button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;padding:12px 16px"
      onclick="selectCompany(${e.id},'${email.replace(/'/g,"\\'")}')">
      <strong>${e.raison_sociale}</strong>
      <span style="display:block;font-size:12px;color:var(--text-muted)">${e.siret || ''} — Rôle : ${e.role}</span>
    </button>
  `).join('');
  window._loginEmail = email;
  window._loginPass  = password;
}

async function selectCompany(entreprise_id, email) {
  const resp = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: window._loginEmail, password: window._loginPass, entreprise_id }),
  }).then(r => r.json());
  if (resp.token) {
    localStorage.setItem('jwt', resp.token);
    location.reload();
  }
}

function updateUserUI() {
  if (!currentUser) return;

  // Sidebar user block
  const ents  = currentUser.entreprises || [];
  const label = currentUser.is_super_admin ? 'Super Admin'
    : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

  document.getElementById('sidebarUser').innerHTML = `
    <div style="margin-bottom:8px">
      <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${currentUser.prenom} ${currentUser.nom}</div>
      <div style="color:var(--text-muted);font-size:12px">${label}</div>
      ${ents.length > 1 ? `<button class="btn btn-outline btn-sm" style="margin-top:6px;width:100%" onclick="showSwitchCompany()">Changer de société</button>` : ''}
    </div>
    <button class="btn btn-outline btn-sm" style="width:100%" onclick="logout()">Déconnexion</button>
  `;

  // Masquer les éléments de navigation sans permission
  document.querySelectorAll('.nav-item[data-perm]').forEach(el => {
    el.style.display = can(el.dataset.perm) ? '' : 'none';
  });
}

async function showSwitchCompany() {
  const me = await api.get('/api/auth/me');
  if (!me?.entreprises?.length) return;
  modal.open('Changer de société', me.entreprises.map(e => `
    <button class="btn btn-outline" style="width:100%;margin-bottom:8px;text-align:left;padding:12px 16px"
      onclick="switchCompany(${e.id})">
      <strong>${e.raison_sociale}</strong>
      <span style="display:block;font-size:12px;color:var(--text-muted)">Rôle : ${e.role}</span>
    </button>
  `).join(''));
}

async function switchCompany(entreprise_id) {
  const resp = await api.post('/api/auth/select-entreprise', { entreprise_id });
  if (resp.token) { localStorage.setItem('jwt', resp.token); location.reload(); }
}

// ── Gestion utilisateurs ──────────────────────────────────────────────────
async function renderUtilisateurs(el) {
  if (!can('users:r')) { el.innerHTML = '<p style="padding:24px;color:var(--text-muted)">Accès non autorisé.</p>'; return; }
  const users = await api.get('/api/utilisateurs');
  const entreprises = currentUser.is_super_admin ? await api.get('/api/entreprise/all') : [];

  el.innerHTML = `<div class="card">
    <div class="section-header">
      <h2>Utilisateurs</h2>
      ${can('users:w') ? `<button class="btn btn-primary" onclick="showUserForm(null)">+ Nouvel utilisateur</button>` : ''}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${Array.isArray(users) ? users.map(u => `<tr>
            <td>${u.prenom} ${u.nom} ${u.is_super_admin ? '<span class="badge badge-emis">Super Admin</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${u.role ?? (u.entreprises ? (u.entreprises[0]?.role ?? '—') : '—')}</td>
            <td>${u.actif ? '<span class="badge badge-encaisse">Actif</span>' : '<span class="badge badge-refuse">Inactif</span>'}</td>
            <td>${can('users:w') ? `<button class="btn btn-outline btn-sm" onclick="showUserForm(${u.id})">Modifier</button>
              ${currentUser.is_super_admin && u.id !== currentUser.id ? `<button class="btn-trash" onclick="deleteUser(${u.id})" title="Supprimer l'utilisateur">🗑️</button>` : ''}` : ''}
            </td>
          </tr>`).join('') : ''}
        </tbody>
      </table>
    </div>
  </div>`;
}

async function showUserForm(userId) {
  const isNew = !userId;
  let user = {};
  if (!isNew) user = await api.get(`/api/utilisateurs/${userId}`) ?? {};

  const entreprises = currentUser.is_super_admin
    ? await api.get('/api/entreprise/all') : [{ id: currentUser.entreprise_id, raison_sociale: 'Société courante' }];

  const roleOptions = ['admin','comptable','commercial','lecteur'].map(r =>
    `<option value="${r}">${r}</option>`).join('');

  const userEnts = user.entreprises ?? [];

  modal.open(isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur', `
    <form id="userForm" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-row">
        <div class="form-group"><label>Prénom</label><input name="prenom" value="${user.prenom ?? ''}" required/></div>
        <div class="form-group"><label>Nom</label><input name="nom" value="${user.nom ?? ''}" required/></div>
      </div>
      <div class="form-group"><label>Email</label><input name="email" type="email" value="${user.email ?? ''}" required/></div>
      <div class="form-group">
        <label>${isNew ? 'Mot de passe' : 'Nouveau mot de passe (vide = inchangé)'}</label>
        <input name="password" type="password" ${isNew ? 'required' : ''} placeholder="${isNew ? '' : 'Laisser vide pour ne pas changer'}"/>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="actif" ${user.actif !== false ? 'checked' : ''}/> Compte actif
        </label>
      </div>
      <h3 style="margin:4px 0 0;font-size:14px">Accès aux sociétés</h3>
      ${entreprises.map(e => {
        const ue = userEnts.find(x => x.entreprise_id === e.id);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <input type="checkbox" name="ent_${e.id}" id="ent_${e.id}" ${ue ? 'checked' : ''} onchange="document.getElementById('role_${e.id}').disabled=!this.checked"/>
          <label for="ent_${e.id}" style="flex:1">${e.raison_sociale}</label>
          <select name="role_${e.id}" id="role_${e.id}" ${ue ? '' : 'disabled'} style="width:120px">${
            roleOptions.replace(`"${ue?.role ?? 'lecteur'}"`, `"${ue?.role ?? 'lecteur'}" selected`)
          }</select>
        </div>`;
      }).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
      <div id="userFormAlert"></div>
    </form>
  `, (body) => {
    body.querySelector('#userForm').onsubmit = async ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        nom:      fd.get('nom'),
        prenom:   fd.get('prenom'),
        email:    fd.get('email'),
        actif:    fd.has('actif'),
        entreprises: entreprises
          .filter(e => fd.has(`ent_${e.id}`))
          .map(e => ({ entreprise_id: e.id, role: fd.get(`role_${e.id}`) || 'lecteur' })),
      };
      if (fd.get('password')) payload.password = fd.get('password');
      const r = isNew
        ? await api.post('/api/utilisateurs', payload)
        : await api.put(`/api/utilisateurs/${userId}`, payload);
      if (r.error) {
        body.querySelector('#userFormAlert').innerHTML = `<div class="alert alert-danger">${r.error}</div>`;
      } else {
        modal.close();
        tabMgr.openViewTab('parametres');
      }
    };
  });
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  await api.delete(`/api/utilisateurs/${userId}`);
  tabMgr.openViewTab('parametres');
}

// ── Filtre de l'onglet actif ──────────────────────────────────────────────
function filterActiveTab(term) {
  const panel = document.querySelector('.tab-panel.active');
  if (!panel) return;
  term = term.toLowerCase().trim();

  // Paires data-row + row-actions (devis, factures, acomptes, BL, articles, clients)
  const dataRows = panel.querySelectorAll('tbody tr.data-row');
  if (dataRows.length > 0) {
    let visible = 0;
    dataRows.forEach(row => {
      const actions = row.nextElementSibling;
      const match = !term || row.textContent.toLowerCase().includes(term);
      row.style.display = match ? '' : 'none';
      if (actions?.classList.contains('row-actions')) actions.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    // Message "aucun résultat"
    let empty = panel.querySelector('.filter-no-result');
    if (term && visible === 0) {
      if (!empty) {
        empty = document.createElement('tr');
        empty.className = 'filter-no-result';
        empty.innerHTML = `<td colspan="20" style="text-align:center;padding:32px;color:var(--text-muted);font-style:italic">Aucun résultat pour « ${term} »</td>`;
        dataRows[0]?.closest('tbody')?.appendChild(empty);
      } else {
        empty.querySelector('td').textContent = `Aucun résultat pour « ${term} »`;
        empty.style.display = '';
      }
    } else if (empty) {
      empty.style.display = 'none';
    }
    return;
  }

  // Fallback : lignes de tableau simples (ex. lignes-table dans détail document)
  panel.querySelectorAll('tbody tr:not(.filter-no-result)').forEach(row => {
    row.style.display = !term || row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
}

function initTabFilter() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => filterActiveTab(input.value), 150);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; filterActiveTab(''); input.blur(); }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
async function initApp() {
  const token = localStorage.getItem('jwt');
  if (!token) { showLoginPage(); return; }

  const me = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.status === 200 ? r.json() : null).catch(() => null);

  if (!me?.id) {
    localStorage.removeItem('jwt');
    showLoginPage();
    return;
  }

  currentUser = me;
  document.getElementById('app').style.display = '';
  document.getElementById('loginOverlay').style.display = 'none';

  modal.init();
  modal2.init();
  initTabFilter();
  updateUserUI();
  api.get('/api/entreprise').then(e => { if (e?.logo_path) updateSidebarLogo(e.logo_path); });
  // Lire l'état sauvegardé AVANT tabMgr.init() qui l'écrase
  const _savedTabState = (() => {
    try { return JSON.parse(localStorage.getItem('facturpro_tabs') || 'null'); } catch(e) { return null; }
  })();

  tabMgr.init();
  await restoreTabState(_savedTabState);
}

async function restoreTabState(state) {
  try {
    if (!state) return;
    const { tabs: saved } = state;
    if (!saved?.length) return;

    // Ouvrir dans l'ordre original pour conserver la position des onglets
    const actif = saved.find(t => t.active);
    for (const t of saved) {
      try { await _openSavedTab(t); } catch(e) {}
    }
    // Réactiver le bon onglet sans refaire d'appel API
    if (actif) {
      if (actif.type === 'view') {
        tabMgr.activateByKey('view', actif.viewName);
      } else {
        tabMgr.activateByKey('doc', actif.docId);
      }
    }
  } catch(e) { console.warn('Restauration session échouée', e); }
}

async function _openSavedTab(t) {
  if (t.type === 'view') {
    if (t.viewName !== 'dashboard') tabMgr.openViewTab(t.viewName);
    return;
  }
  if (t.type !== 'doc') return;
  const id    = t.docId;
  const isNew = !id || String(id).startsWith('new-');

  if (isNew) {
    // Brouillon non sauvegardé — restaurer depuis localStorage
    DocEditor.restoreDraft(t.docType, id);
    return;
  }
  switch (t.docType) {
    case 'devis':                 await DocEditor.openDevis(id);   break;
    case 'facture': case 'avoir': await DocEditor.openFacture(id); break;
    case 'bl':                    await DocEditor.openBL(id);      break;
    case 'acompte':               await DocEditor.openAcompte(id); break;
    default: break;
  }
}

initApp();
