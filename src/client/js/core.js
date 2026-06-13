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
  badge:  s  => { const labels = { en_attente:'En attente', encaisse:'Encaissé', emis:'Émis', livre:'Livré', brouillon:'Brouillon', envoye:'Envoyé', signe:'Signé', accepte:'Accepté', refuse:'Refusé', emise:'Émise', payee:'Payée' }; return `<span class="badge badge-${s}">${labels[s]||s}</span>`; },
  modePaiement: m => ({
    virement: 'Virement bancaire', virement_sepa: 'Virement SEPA',
    cheque: 'Chèque', especes: 'Espèces', carte: 'Carte bancaire',
    prelevement: 'Prélèvement', prelevement_sepa: 'Prélèvement SEPA',
    paypal: 'PayPal', autre: 'Autre',
  })[m] || m,
};

// ── Formatage SIRET ────────────────────────────────────────────────────────
const formatSiret = s => {
  if (!s) return s || '—';
  const d = String(s).replace(/s/g, '');
  return d.length === 14 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}` : s;
};

// Calcule le numéro de TVA intracommunautaire français depuis un SIRET/SIREN.
// Formule : clé = (12 + 3 × (SIREN mod 97)) mod 97 → "FR" + clé(2 chiffres) + SIREN
function tvaFromSiret(siret) {
  const siren = String(siret).replace(/\s/g, '').slice(0, 9);
  if (siren.length !== 9 || !/^\d{9}$/.test(siren)) return '';
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return 'FR' + String(cle).padStart(2, '0') + siren;
}

// ── Helpers boutons ───────────────────────────────────────────────────────
const btn = {
  outline: (onclick, label, title='') => `<button class="btn btn-outline btn-sm" onclick="${onclick}"${title?` title="${title}"`:''}>${label}</button>`,
  success: (onclick, label)           => `<button class="btn btn-success btn-sm" onclick="${onclick}">${label}</button>`,
  primary: (onclick, label)           => `<button class="btn btn-primary btn-sm" onclick="${onclick}">${label}</button>`,
  warning: (onclick, label)           => `<button class="btn btn-warning btn-sm" onclick="${onclick}">${label}</button>`,
  trash:   (onclick, title='Supprimer') => `<button class="btn-trash" onclick="${onclick}" title="${title}">🗑️</button>`,
};

// ── Aide contextuelle ──────────────────────────────────────────────────────
// Le dictionnaire des textes (helpTexts) vit dans helpTexts.js, chargé avant ce
// script. Ici, seule la fonction de rendu (consommant ce dictionnaire) : elle pose
// data-tooltip directement sur l'élément concerné — bulle au survol, sans icône visible.
// Pour les éléments qui ne peuvent pas contenir de bulle (ex. <select>) : data-tooltip
// sur l'élément lui-même, capté par le mécanisme générique ci-dessous.
function helpAttr(key) {
  const txt = helpTexts[key];
  return txt ? ` data-tooltip="${txt.replace(/"/g, '&quot;')}"` : '';
}

// Bulle d'aide générique au survol : un seul élément flottant partagé, affiché
// au-dessus de tout élément portant un attribut data-tooltip (icônes "?", <select>
// de filtre, boutons…). Positionné en JS pour ne jamais être recouvert par le
// curseur ni rogné par un conteneur avec overflow.
let _appTooltipEl = null;
function _appTooltip() {
  if (!_appTooltipEl) {
    _appTooltipEl = document.createElement('div');
    _appTooltipEl.className = 'app-tooltip';
    document.body.appendChild(_appTooltipEl);
  }
  return _appTooltipEl;
}
document.addEventListener('mouseover', e => {
  if (!aideContextuelleActive()) return;
  const el = e.target.closest('[data-tooltip]');
  if (!el) return;
  const txt = el.getAttribute('data-tooltip');
  if (!txt) return;
  const tt = _appTooltip();
  tt.textContent = txt;
  tt.style.display = 'block';
  const r = el.getBoundingClientRect();
  const tr = tt.getBoundingClientRect();
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
  let top = r.top - tr.height - 12;
  if (top < 8) top = r.bottom + 12; // pas assez de place au-dessus : afficher en-dessous
  tt.style.left = `${left}px`;
  tt.style.top = `${top}px`;
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el || !_appTooltipEl) return;
  if (el.contains(e.relatedTarget)) return;
  _appTooltipEl.style.display = 'none';
});

function aideContextuelleActive() {
  return localStorage.getItem('aide_contextuelle') !== '0';
}

function appliquerAideContextuelle() {
  document.body.classList.toggle('aide-masquee', !aideContextuelleActive());
}

function toggleAideContextuelle(actif) {
  localStorage.setItem('aide_contextuelle', actif ? '1' : '0');
  appliquerAideContextuelle();
}

// ── Configuration par type de document ────────────────────────────────────
const DOC_CONFIGS = {
  devis: {
    api:      '/api/devis',
    topbar:   () => {
      const s = _listFilters['devis']?.statut ? '' : '';
      const alerteActive = !!_listFilters['devis']?.alerte;
      return `
        <select class="btn btn-outline" style="padding:5px 8px"${helpAttr('devis_statut')} onchange="setDocStatutFilter('devis',this.value)">
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="envoye">Envoyé</option>
          <option value="signe">Signé</option>
          <option value="accepte">Accepté</option>
          <option value="refuse">Refusé</option>
        </select>
        <button id="btnDevisExpires" class="btn ${alerteActive?'btn-danger':'btn-outline'}" onclick="toggleDevisExpiresFilter()"${helpAttr('devis_expires')}>${alerteActive?'✕ Voir tout':'⏰ Expirés'}</button>
        <button class="btn btn-primary" onclick="DocEditor.openDevis()">+ Nouveau devis</button>`;
    },
    headers:  ['N°','Client','Objet','HT','TTC','Statut','Créé le','Validité'],
    sortKeys: ['numero','client_nom','objet','montant_ht','montant_ttc','statut','created_at','date_validite'],
    rowOpen:  d => `DocEditor.openDevis(${d.id})`,
    cells:    d => {
      const expire = d.statut === 'envoye' && d.date_validite && new Date(d.date_validite) < new Date()
        ? Math.floor((Date.now() - new Date(d.date_validite)) / 864e5) : null;
      return [
        `<strong>${d.numero}</strong>`,
        d.client_nom||d.client_nom_part||'—',
        d.objet||'—',
        `<span class="text-right">${fmt.money(d.montant_ht)}</span>`,
        `<strong>${fmt.money(d.montant_ttc)}</strong>`,
        fmt.badge(d.statut),
        fmt.date(d.created_at),
        expire !== null
          ? `<span style="color:#ef4444;font-weight:700;font-size:12px;white-space:nowrap">⏰ ${expire}j</span>`
          : d.date_validite ? `<span style="font-size:12px;color:var(--text-muted)">${fmt.date(d.date_validite)}</span>` : '',
      ];
    },
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
      <button class="btn btn-outline" onclick="exportFEC()"${helpAttr('facture_fec')}>Export FEC</button>
      <button class="btn btn-outline" onclick="verifierScellement()"${helpAttr('facture_scellement')}>Vérifier scellement</button>
      <button class="btn btn-outline" onclick="ouvrirAttestation()"${helpAttr('facture_attestation')}>📋 Attestation</button>
      <button id="btnEnvoiGroupe" class="btn btn-outline" onclick="envoyerGroupeFactures()" disabled>✉ Envoyer la sélection (<span id="selCount" style="display:inline-block;min-width:1.4em;text-align:center">0</span>)</button>
      <select class="btn btn-outline" style="padding:5px 8px"${helpAttr('facture_statut')} onchange="setDocStatutFilter('factures',this.value)">
        <option value="">Tous les statuts</option>
        <option value="brouillon">Brouillon</option>
        <option value="emise">Émise</option>
        <option value="payee">Payée</option>
      </select>
      <button id="btnSelectSepa" class="btn btn-outline" onclick="selectionnerClientsSepa()"${helpAttr('facture_sepa_select')}>🏦 Sélect. SEPA</button>
      <button id="btnSepaGroupe" class="btn btn-outline" onclick="genererSepa()" disabled${helpAttr('facture_sepa')}>🏦 Prélèvement SEPA (<span id="selCountSepa" style="display:inline-block;min-width:1.4em;text-align:center">0</span>)</button>
      <button id="btnRetardFilter" class="btn btn-outline" onclick="toggleFacRetardFilter()"${helpAttr('facture_retard')}>⚠️ En retard</button>
      <button class="btn btn-primary" onclick="DocEditor.openFacture()">+ Nouvelle facture</button>`,
    headers:  ['','N°','Client','HT','TTC','Statut','Émise le','Règlement','Retard'],
    sortKeys: [null,'numero','client_nom','montant_ht','montant_ttc','statut','date_emission',null,'date_echeance'],
    rowOpen:  f => `DocEditor.openFacture(${f.id})`,
    cells:    f => {
      const retardJours = f.statut === 'emise' && f.date_echeance && new Date(f.date_echeance) < new Date()
        ? Math.floor((Date.now() - new Date(f.date_echeance)) / 864e5) : null;
      return [
        ['emise','payee'].includes(f.statut) ? `<input type="checkbox" class="fac-sel" data-id="${f.id}" data-num="${f.numero}" data-mode="${f.mode_reglement_defaut||''}" onclick="event.stopPropagation();updateSelCount()">` : '',
        `<strong>${f.numero}</strong>${f.type_facture==='avoir'?' <span class="badge badge-avoir">Avoir</span>':''}`,
        f.client_nom||f.client_nom_part||'—',
        `<span class="text-right">${fmt.money(f.montant_ht)}</span>`,
        `<strong>${fmt.money(f.montant_ttc)}</strong>`,
        fmt.badge(f.statut),
        fmt.date(f.date_emission),
        f.mode_paiement?`${fmt.modePaiement(f.mode_paiement)}<br><small>${fmt.date(f.date_paiement)}</small>`:'—',
        retardJours !== null ? `<span style="color:#ef4444;font-weight:700;font-size:12px;white-space:nowrap">⚠ ${retardJours}j</span>` : '',
      ];
    },
    actions: f => [
      ['emise','payee'].includes(f.statut) ? `<button class="btn btn-success btn-sm" disabled style="cursor:default;opacity:1">✓ Émis</button>` : '',
      (f.statut==='emise' && f.date_echeance && new Date(f.date_echeance) < new Date()) ? btn.warning(`relancerFacture(${f.id})`, '📨 Relancer') : '',
      (f.statut==='emise' && f.date_echeance && new Date(f.date_echeance) < new Date()) ? btn.outline(`telechargerRelanceCourrier(${f.id},'${f.numero}')`, '✉ Courrier') : '',
      f.statut==='emise'     ? btn.primary(`payerFacture(${f.id})`, '💳 Payer') : '',
      btn.outline(`DocEditor.openFacture(${f.id})`, 'Voir/Modifier'),
      btn.outline(`previewFacture(${f.id})`, '👁 PDF'),
      f.statut==='brouillon' ? btn.outline(`emettreEtEnvoyer(${f.id})`, 'Émettre & Envoyer') : btn.outline(`envoyerFacture(${f.id})`, '✉ Envoyer'),
      ['emise','payee'].includes(f.statut)&&f.type_facture!=='avoir' ? btn.outline(`showBLFromFactureForm(${f.id})`, '🚚 BL') : '',
      ['emise','payee'].includes(f.statut)&&f.type_facture!=='avoir' ? `<button class="btn btn-outline btn-sm" onclick="DocEditor.openAvoir(${f.id})"${helpAttr('doc_avoir')}>Avoir</button>` : '',
    ],
  },
  avoirs: {
    api:      '/api/factures/avoirs/liste',
    topbar:   () => '',
    headers:  ['N°','Facture d\'origine','Client','HT','TTC','Statut','Date'],
    sortKeys: ['numero','facture_origine_numero','client_nom','montant_ht','montant_ttc','statut','date_emission'],
    rowOpen:  a => `DocEditor.openAvoirById(${a.id})`,
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
      btn.outline(`DocEditor.openAvoirById(${a.id})`, 'Voir/Modifier'),
      btn.outline(`previewFacture(${a.id})`, '👁 PDF'),
      btn.outline(`envoyerFacture(${a.id})`, '✉ Envoyer'),
      !a.locked ? btn.trash(`deleteAvoir(${a.id})`) : '',
    ],
  },
  acomptes: {
    api:      '/api/acomptes',
    topbar:   () => `
      <select class="btn btn-outline" style="padding:5px 8px" onchange="setDocStatutFilter('acomptes',this.value)">
        <option value="">Tous les statuts</option>
        <option value="en_attente">En attente</option>
        <option value="encaisse">Encaissé</option>
      </select>
      <button class="btn btn-primary" onclick="showAcompteForm()">+ Nouvel acompte</button>`,
    headers:  ['N°','Client','HT','TVA','TTC','Statut','Encaissé le'],
    sortKeys: ['numero','client_nom','montant_ht','montant_tva','montant_ttc','statut','date_encaissement'],
    rowOpen:  a => `DocEditor.openAcompte(${a.id})`,
    cells:    a => [
      `<strong>${a.numero}</strong>${a.notes ? `<br><small style="color:#888;font-size:0.78em">${a.notes}</small>` : ''}`,
      a.client_nom||a.client_nom_part||'—',
      `<span class="text-right">${fmt.money(a.montant_ht)}</span>`,
      `<span class="text-right">${fmt.money(a.montant_tva)}</span>`,
      `<strong>${fmt.money(a.montant_ttc)}</strong>`,
      `${fmt.badge(a.statut)}${a.facture_utilisee_numero ? `<br><small style="color:#1a5c38;font-size:0.78em">→ ${a.facture_utilisee_numero}</small>` : ''}`,
      fmt.date(a.date_encaissement),
    ],
    actions: a => [
      a.statut==='en_attente' ? `<button class="btn btn-success btn-sm" onclick="encaisserAcompte(${a.id})"${helpAttr('acompte_encaisser')}>Encaisser</button>` : '',
      btn.outline(`DocEditor.openAcompte(${a.id})`, 'Voir'),
      btn.outline(`openPdf('/api/acomptes/${a.id}/apercu')`, '👁 PDF'),
      btn.outline(`envoyerAcompte(${a.id})`, '✉ Envoyer'),
      !a.locked ? btn.trash(`deleteAcompte(${a.id})`) : '',
    ],
  },
  'bons-livraison': {
    api:      '/api/bons-livraison',
    topbar:   () => {
      _selBL.clear();
      return `<select class="btn btn-outline" style="padding:5px 8px"${helpAttr('bl_statut')} onchange="setDocStatutFilter('bons-livraison',this.value)">
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="emis">Émis</option>
          <option value="livre">Livré</option>
        </select><button class="btn btn-primary" onclick="DocEditor.openBL()">+ Nouveau BL</button><span class="help-icon" data-tooltip="${helpTexts.bl_statut.replace(/"/g,'&quot;')}" style="margin-left:14px">?</span><button id="btnFacturerSelBL" class="btn btn-success" style="margin-left:10px;opacity:0.5;pointer-events:none" disabled onclick="facturerSelectionBL()">🧾 Facturer la sélection (<span id="selCountBL">0</span>)</button>`;
    },
    headers:  ['','N°','Client','Date émission','Lieu','Statut'],
    sortKeys: ['','numero','client_nom','date_emission','lieu_livraison','statut'],
    rowOpen:  b => `DocEditor.openBL(${b.id})`,
    cells:    b => [
      `<input type="checkbox" class="bl-sel" data-id="${b.id}" onclick="event.stopPropagation();updateBLSelCount()" style="cursor:pointer;width:16px;height:16px">`,
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
      b.statut==='brouillon'&&(b.devis_id||b.facture_id) ? '' : (b.statut!=='livre' ? `<button class="btn btn-success btn-sm" onclick="livrerBL(${b.id})"${helpAttr('bl_livrer')}>✓ Livré</button>` : ''),
      btn.outline(`factureFromBL(${b.id})`,'🧾 → Facture'),
      b.statut==='brouillon' ? btn.trash(`supprimerBL(${b.id})`) : '',
    ],
  },
};

// Rendu unifié des listes de documents
// État de tri par type de liste
const _listSort = {};
const _listFilter = {};
const _listRerender = {};
const _listFilters = {}; // { type: { statut: fn|null, alerte: fn|null } }

function _rebuildFilter(type) {
  const fns = Object.values(_listFilters[type] || {}).filter(Boolean);
  _listFilter[type] = fns.length ? doc => fns.every(fn => fn(doc)) : null;
  _listRerender[type]?.();
}

function setDocStatutFilter(type, statut) {
  if (!_listFilters[type]) _listFilters[type] = {};
  _listFilters[type].statut = statut ? d => d.statut === statut : null;
  _rebuildFilter(type);
}

function toggleDevisExpiresFilter() {
  if (!_listFilters['devis']) _listFilters['devis'] = {};
  const active = !!_listFilters['devis'].alerte;
  _listFilters['devis'].alerte = active ? null : d => d.statut === 'envoye' && d.date_validite && new Date(d.date_validite) < new Date();
  const btn = document.getElementById('btnDevisExpires');
  if (btn) { btn.className = active ? 'btn btn-outline' : 'btn btn-danger'; btn.textContent = active ? '⏰ Expirés' : '✕ Voir tout'; }
  _rebuildFilter('devis');
}

const _listPage = {};

async function renderDocList(type, el, page = 1) {
  const cfg = DOC_CONFIGS[type];
  const sep = cfg.api.includes('?') ? '&' : '?';
  const resp = await api.get(`${cfg.api}${sep}page=${page}&limit=50`);

  // Support réponse paginée { data, total, page, pages } ou tableau brut (fallback)
  const docs  = Array.isArray(resp) ? resp : (resp?.data ?? []);
  const total = Array.isArray(resp) ? docs.length : (resp?.total ?? docs.length);
  const pages = Array.isArray(resp) ? 1 : (resp?.pages ?? 1);
  _listPage[type] = page;

  document.getElementById('topbarActions').innerHTML = cfg.topbar();

  if (!docs.length && page === 1) {
    el.innerHTML = `<div class="card"><div class="empty">Aucun document</div></div>`;
    return;
  }

  if (!_listSort[type]) _listSort[type] = { col: null, dir: -1 };
  const colSpan = cfg.headers.length + 1;
  const keys = cfg.sortKeys || [];

  function sortedDocs(list) {
    const { col, dir } = _listSort[type];
    if (!col) return list;
    return [...list].sort((a, b) => {
      const va = (a[col] ?? '') + '', vb = (b[col] ?? '') + '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }

  _listRerender[type] = () => renderTbody(docs);

  function renderTbody(list) {
    const tbody = el.querySelector('tbody');
    if (!tbody) return;
    const filtered = _listFilter[type] ? list.filter(_listFilter[type]) : list;
    tbody.innerHTML = sortedDocs(filtered).map(doc => {
      const cells   = cfg.cells(doc).map(c=>`<td>${c}</td>`).join('');
      const actions = cfg.actions(doc).filter(Boolean).join('');
      return `
        <tr class="data-row" onclick="${cfg.rowOpen(doc)}" style="cursor:pointer">${cells}<td></td></tr>
        <tr class="row-actions"><td colspan="${colSpan}"><div class="btn-row">${actions}</div></td></tr>`;
    }).join('');
    el.querySelectorAll('.list-th[data-key]').forEach(th => {
      const k = th.dataset.key;
      th.innerHTML = th.dataset.label + (_listSort[type].col === k ? (_listSort[type].dir > 0 ? ' ▲' : ' ▼') : '');
    });
  }

  function renderPagination() {
    if (pages <= 1) return '';
    const btns = [];
    btns.push(`<button class="btn btn-sm ${page === 1 ? 'btn-outline' : 'btn-outline'}" ${page === 1 ? 'disabled' : `onclick="renderDocList('${type}',document.getElementById('tabPanels').querySelector('.tab-panel.active'),${page-1})"`}>← Préc.</button>`);
    for (let p = Math.max(1, page-2); p <= Math.min(pages, page+2); p++) {
      btns.push(`<button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}" ${p === page ? 'disabled' : `onclick="renderDocList('${type}',document.getElementById('tabPanels').querySelector('.tab-panel.active'),${p})"`}>${p}</button>`);
    }
    btns.push(`<button class="btn btn-sm btn-outline" ${page === pages ? 'disabled' : `onclick="renderDocList('${type}',document.getElementById('tabPanels').querySelector('.tab-panel.active'),${page+1})"`}>Suiv. →</button>`);
    const start = (page - 1) * 50 + 1;
    const end   = Math.min(page * 50, total);
    return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:12px 0;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--text-muted)">${start}–${end} sur ${total}</span>
      <div style="display:flex;gap:4px">${btns.join('')}</div>
    </div>`;
  }

  const thHtml = cfg.headers.map((h, i) => {
    const k = keys[i];
    return k
      ? `<th class="list-th" data-key="${k}" data-label="${h}" style="cursor:pointer">${h}</th>`
      : `<th>${h}</th>`;
  }).join('');

  el.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr>${thHtml}<th></th></tr></thead>
    <tbody></tbody>
  </table></div>${renderPagination()}</div>`;

  renderTbody(docs);

  el.querySelectorAll('.list-th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      const s = _listSort[type];
      _listSort[type] = { col: k, dir: s.col === k ? -s.dir : -1 };
      renderTbody(docs);
    });
  });
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
    this.title.innerHTML = title;
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
    this.title.innerHTML = title;
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
    factures:                { title: 'Factures',              icon: '🧾' },
    'factures-fournisseurs': { title: 'Factures d\'achats',    icon: '🛒' },
    fournisseurs:            { title: 'Fournisseurs',          icon: '🏭' },
    'commandes-fournisseurs':{ title: 'Commandes',             icon: '📝' },
    avoirs:                  { title: 'Avoirs',                icon: '↩️' },
    acomptes:         { title: 'Acomptes',         icon: '💰' },
    'bons-livraison': { title: 'Bons de livraison', icon: '🚚' },
    articles:         { title: 'Articles',         icon: '📦' },
    archives:         { title: 'Archives',         icon: '🗄️' },
    parametres:       { title: 'Paramètres',       icon: '⚙️' },
  };
  const DOC_ICONS = { devis: '📋', facture: '🧾', acompte: '💰', bl: '🚚', commande: '📝', 'facture-achat': '🛒' };

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
    if (typeof openNavGroupForActiveView === 'function') openNavGroupForActiveView();

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

  // Après premier save d'un nouveau doc : met à jour le docId du tab
  function promoteTab(panelTid, newDocId, newTitle) {
    const t = tabs.find(t => t.id === panelTid);
    if (!t) return;
    t.docId = String(newDocId);
    if (newTitle) t.title = newTitle;
    renderStrip(); // persiste dans saveTabState
  }

  function closeTabByDocId(docId) {
    const t = tabs.find(t => t.type === 'doc' && String(t.docId) === String(docId));
    if (t) closeTab(t.id);
  }

  return { openViewTab, openDocTab, closeTab, closeTabByDocId, init, activateByKey, promoteTab };
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

// ── Groupes de navigation repliables (Ventes / Achats / Comptabilité…) ────
// État (ouvert/fermé) mémorisé par l'utilisateur ; le groupe contenant la vue
// active s'ouvre toujours automatiquement, même s'il était replié.
const NAV_GROUPS_KEY = 'navGroupsOpen';
function _loadOpenGroups() {
  try { return JSON.parse(localStorage.getItem(NAV_GROUPS_KEY)) || {}; } catch { return {}; }
}
function _saveOpenGroups(state) {
  localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(state));
}
function setNavGroupOpen(name, open) {
  const grp = document.querySelector(`.nav-group[data-group="${name}"]`);
  if (grp) grp.classList.toggle('open', open);
  const state = _loadOpenGroups();
  state[name] = open;
  _saveOpenGroups(state);
}
document.querySelectorAll('.nav-group-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const grp = btn.closest('.nav-group');
    setNavGroupOpen(grp.dataset.group, !grp.classList.contains('open'));
  });
});
// Ouvre automatiquement le groupe contenant la vue actuellement active
function openNavGroupForActiveView() {
  const active = document.querySelector('.nav-item.active');
  const grp = active && active.closest('.nav-group');
  if (grp) grp.classList.add('open');
}
(function initNavGroups() {
  const state = _loadOpenGroups();
  document.querySelectorAll('.nav-group').forEach(grp => {
    if (state[grp.dataset.group]) grp.classList.add('open');
  });
  openNavGroupForActiveView();
})();

async function renderView(view, el) {
  if (!el) return;
  el.innerHTML = '<div class="empty"><p>Chargement…</p></div>';
  document.getElementById('topbarActions').innerHTML = '';
  await loadGlobalData();
  switch (view) {
    case 'dashboard':       return renderDashboard(el);
    case 'stats':           return renderStats(el);
    case 'decl-tva':        return renderDeclTVA(el);
    case 'audit':           return renderAudit(el);
    case 'clients':         return renderClients(el);
    case 'devis':           return renderDocList('devis', el);
    case 'factures':               return renderDocList('factures', el);
    case 'factures-fournisseurs':  return renderFournisseurs(el);
    case 'fournisseurs':           return renderFournisseursEntites(el);
    case 'commandes-fournisseurs': return renderCommandes(el);
    case 'avoirs':                 return renderDocList('avoirs', el);
    case 'acomptes':        return renderDocList('acomptes', el);
    case 'bons-livraison':  return renderDocList('bons-livraison', el);
    case 'articles':        return renderArticles(el);
    case 'exercices':       return renderExercices(el);
    case 'archives':        return renderArchives(el);
    case 'lettrage':        return renderLettrage(el);
    case 'parametres':      return renderParametres(el);
  }
}

async function loadGlobalData() {
  [tvaOptions, clientOptions] = await Promise.all([
    api.get('/api/clients/taux-tva'),
    api.get('/api/clients'),
  ]);
  loadNotifications();
}

async function loadNotifications() {
  try {
    const notifs = await api.get('/api/stats/notifications');
    if (!notifs) return;
    const bf = document.getElementById('badge-factures');
    const bd = document.getElementById('badge-devis');
    if (bf) { bf.textContent = notifs.factures_retard; bf.style.display = notifs.factures_retard > 0 ? '' : 'none'; bf.title = `${notifs.factures_retard} facture(s) en retard`; }
    if (bd) { bd.textContent = notifs.devis_expires;   bd.style.display = notifs.devis_expires   > 0 ? '' : 'none'; bd.title = `${notifs.devis_expires} devis expiré(s)`; }
  } catch {}
  // Refresh toutes les 5 minutes
  setTimeout(loadNotifications, 5 * 60 * 1000);
}

function toggleFacRetardFilter() {
  if (!_listFilters['factures']) _listFilters['factures'] = {};
  const active = !!_listFilters['factures'].alerte;
  _listFilters['factures'].alerte = active ? null : f => f.statut === 'emise' && f.date_echeance && new Date(f.date_echeance) < new Date();
  const btn = document.getElementById('btnRetardFilter');
  if (btn) { btn.className = active ? 'btn btn-outline' : 'btn btn-danger'; btn.textContent = active ? '⚠️ En retard' : '✕ Voir tout'; }
  _rebuildFilter('factures');
}

// ── Dashboard ─────────────────────────────────────────────────────────────
let _dashSort = { col: 'date', dir: -1 }; // tri par défaut : date desc

