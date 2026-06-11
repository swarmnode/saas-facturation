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
    topbar:   () => `<button class="btn btn-primary" onclick="showAcompteForm()">+ Nouvel acompte</button>`,
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
      return `<button class="btn btn-primary" onclick="DocEditor.openBL()">+ Nouveau BL</button><span class="help-icon" data-tooltip="${helpTexts.bl_statut.replace(/"/g,'&quot;')}" style="margin-left:14px">?</span><button id="btnFacturerSelBL" class="btn btn-success" style="margin-left:10px;opacity:0.5;pointer-events:none" disabled onclick="facturerSelectionBL()">🧾 Facturer la sélection (<span id="selCountBL">0</span>)</button>`;
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

// ── Clients ───────────────────────────────────────────────────────────────
async function renderClients(el) {
  const clients = await api.get('/api/clients');
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="showClientForm()">+ Nouveau client</button>
    <button class="btn btn-outline" onclick="exportCSV('/api/clients/export','clients')">⬇ Exporter CSV</button>
    <label class="btn btn-outline" style="cursor:pointer;margin:0;text-transform:none">⬆ Importer CSV
      <input type="file" accept=".csv" style="display:none" onchange="importCSV('/api/clients/import',this,()=>renderClients(el))">
    </label>`;

  el.innerHTML = `<div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nom / Raison sociale</th><th>Type</th><th>Email</th>
          <th>Téléphone</th><th>SIRET</th><th>Statut</th><th></th>
        </tr></thead>
        <tbody>${clients.length ? clients.map(c => `
          <tr>
            <td><strong style="cursor:pointer;color:var(--primary)" onclick="showClientMouvements(${c.id})">${c.raison_sociale || [c.civilite, c.prenom, c.nom].filter(Boolean).join(' ')}</strong></td>
            <td>${c.type_client}</td>
            <td>${c.email || '—'}</td>
            <td>${c.telephone || '—'}</td>
            <td><code>${c.siret || '—'}</code></td>
            <td>${fmt.badge(c.statut_rgpd)}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="showClientMouvements(${c.id})">Fiche</button>
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
      <div class="form-row">
        <div class="form-group"><label>TVA Intracom <small style="font-weight:normal;color:var(--text-muted)">— calculé depuis le SIRET</small></label><input name="tva_intracom" placeholder="FR00 000000000"/></div>
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
    const qSiret = body.querySelector('[name="siret"]');
    const qTva   = body.querySelector('[name="tva_intracom"]');
    if (qSiret && qTva) {
      qSiret.addEventListener('blur', () => {
        if (qSiret.value.trim() && !qTva.value.trim()) {
          const tva = tvaFromSiret(qSiret.value);
          if (tva) { qTva.value = tva; qTva.style.background = '#f0fdf4'; setTimeout(() => qTva.style.background = '', 1500); }
        }
      });
    }
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
          <label>Statut RGPD <span class="help-icon" data-tooltip="${helpTexts.client_statut_rgpd.replace(/"/g,'&quot;')}">?</span></label>
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
      <div class="form-group"><label>Complément d'adresse</label><input name="adresse2" value="${client.adresse2 || ''}" placeholder="Bâtiment, étage, BP…"/></div>
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
      <div class="form-row">
        <div class="form-group"><label>Mode TVA <span class="help-icon" data-tooltip="${helpTexts.client_tva_mode.replace(/"/g,'&quot;')}">?</span></label>
          <select name="tva_mode">
            <option value="normal"          ${client.tva_mode === 'normal'          ? 'selected' : ''}>Normal</option>
            <option value="autoliquidation" ${client.tva_mode === 'autoliquidation' ? 'selected' : ''}>Autoliquidation</option>
            <option value="exonere"         ${client.tva_mode === 'exonere'         ? 'selected' : ''}>Exonéré</option>
          </select>
        </div>
        <div class="form-group"><label>Mode de règlement par défaut <span class="help-icon" data-tooltip="${helpTexts.client_mode_reglement.replace(/"/g,'&quot;')}">?</span></label>
          <select name="mode_reglement_defaut">
            <option value="">— Non précisé —</option>
            <option value="virement"          ${client.mode_reglement_defaut==='virement'         ?'selected':''}>Virement bancaire</option>
            <option value="virement_sepa"     ${client.mode_reglement_defaut==='virement_sepa'    ?'selected':''}>Virement SEPA</option>
            <option value="prelevement_sepa"  ${client.mode_reglement_defaut==='prelevement_sepa' ?'selected':''}>Prélèvement SEPA ★</option>
            <option value="cheque"            ${client.mode_reglement_defaut==='cheque'           ?'selected':''}>Chèque</option>
            <option value="carte"             ${client.mode_reglement_defaut==='carte'            ?'selected':''}>Carte bancaire</option>
            <option value="especes"           ${client.mode_reglement_defaut==='especes'          ?'selected':''}>Espèces</option>
            <option value="paypal"            ${client.mode_reglement_defaut==='paypal'           ?'selected':''}>PayPal</option>
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label>Conditions de paiement <small style="font-weight:normal;color:var(--text-muted)">(pré-remplies sur les devis et factures)</small></label>
        <input name="conditions_paiement" list="cond-paiement-list" value="${client.conditions_paiement || ''}" placeholder="Ex : Paiement à 30 jours fin de mois"/>
        <datalist id="cond-paiement-list">
          <option value="Paiement comptant à réception de facture"/>
          <option value="Paiement à 15 jours"/>
          <option value="Paiement à 30 jours"/>
          <option value="Paiement à 30 jours fin de mois"/>
          <option value="Paiement à 45 jours fin de mois"/>
          <option value="Paiement à 60 jours"/>
          <option value="Acompte de 30 % à la commande, solde à la livraison"/>
          <option value="Acompte de 50 % à la commande, solde à la livraison"/>
        </datalist>
      </div>
      <details style="margin-top:16px;border:1px solid var(--border);border-radius:6px;padding:12px">
        <summary style="font-weight:600;cursor:pointer;font-size:13px">🏦 Mandat SEPA (prélèvement automatique) <span class="help-icon" data-tooltip="${helpTexts.client_mandat_sepa.replace(/"/g,'&quot;')}">?</span></summary>
        <div style="margin-top:12px">
          <div class="form-row">
            <div class="form-group"><label>IBAN</label><input name="iban" value="${client.iban || ''}" placeholder="FR76 0000 0000 0000 0000 0000 000" style="font-family:monospace"/></div>
            <div class="form-group"><label>BIC</label><input name="bic" value="${client.bic || ''}" placeholder="BNPAFRPPXXX" style="text-transform:uppercase"/></div>
          </div>
          <div class="form-group"><label>Titulaire du compte <small style="font-weight:normal;color:var(--text-muted)">(si différent du client)</small></label><input name="titulaire_compte" value="${client.titulaire_compte || ''}"/></div>
          <div class="form-row">
            <div class="form-group"><label>Référence mandat (RUM)</label><input name="mandat_rum" value="${client.mandat_rum || ''}" placeholder="Générée automatiquement"/></div>
            <div class="form-group"><label>Date de signature</label><input name="mandat_date" type="date" value="${client.mandat_date || ''}"/></div>
          </div>
          <div class="form-group"><label>Type de mandat</label><select name="mandat_type">
            <option value="CORE" ${(client.mandat_type||'CORE')==='CORE'?'selected':''}>CORE — Particuliers et entreprises (standard)</option>
            <option value="B2B"  ${client.mandat_type==='B2B'?'selected':''}>B2B — Entreprises uniquement (irrévocable)</option>
          </select></div>
        </div>
      </details>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`;

  modal.show(id ? 'Modifier le client' : 'Nouveau client', html, body => {
    attachSireneAutocomplete(body.querySelector('[name="raison_sociale"]'), body);
    attachNominatimAutocomplete(body.querySelector('[name="adresse"]'), body);

    // Auto-calcul TVA intracommunautaire depuis le SIRET
    const siretInp = body.querySelector('[name="siret"]');
    const tvaInp   = body.querySelector('[name="tva_intracom"]');
    if (siretInp && tvaInp) {
      siretInp.addEventListener('blur', () => {
        if (siretInp.value.trim() && !tvaInp.value.trim()) {
          const tva = tvaFromSiret(siretInp.value);
          if (tva) { tvaInp.value = tva; tvaInp.style.background = '#f0fdf4'; setTimeout(() => tvaInp.style.background = '', 1500); }
        }
      });
    }
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

async function showClientMouvements(id) {
  const [client, data] = await Promise.all([
    api.get(`/api/clients/${id}`),
    api.get(`/api/clients/${id}/mouvements`),
  ]);
  if (!client || client.error || !data || data.error) return;

  const nom = client.raison_sociale || [client.civilite, client.prenom, client.nom].filter(Boolean).join(' ') || `Client #${id}`;
  const { annee_n, annee_n1, kpis_n, kpis_n1, kpis_all, documents } = data;

  function kpiBox(label, val, sub, color) {
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 18px;flex:1;min-width:130px">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${color}">${val}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${sub}</div>
    </div>`;
  }

  function renderKpis(k) {
    return `
      ${kpiBox('CA net HT', fmt.money(k.net_ht), k.avoirs_ht > 0 ? `avoirs : −${fmt.money(k.avoirs_ht)}` : 'factures émises + payées', 'var(--primary)')}
      ${kpiBox('Encours TTC', fmt.money(k.encours_ttc), 'factures émises non payées', '#f59e0b')}
      ${kpiBox('En retard TTC', fmt.money(k.retard_ttc), 'échéance dépassée', k.retard_ttc > 0 ? '#ef4444' : '#22c55e')}`;
  }

  const typeLabel = { devis: 'Devis', facture: 'Facture', acompte: 'Acompte', bl: 'Bon de livraison' };
  const now = new Date();

  const rows = documents.map(doc => {
    const isRetard = doc.type === 'facture' && doc.statut === 'emise' && doc.date_echeance && new Date(doc.date_echeance) < now;
    const montantCell = doc.type === 'bl' ? '—'
      : `<span style="color:${doc.type_facture === 'avoir' ? '#ef4444' : 'inherit'}">${doc.type_facture === 'avoir' ? '−' : ''}${fmt.money(doc.montant_ttc)}</span>`;
    let openFn = '';
    if (doc.type === 'devis')   openFn = `modal.hide();DocEditor.openDevis(${doc.id})`;
    if (doc.type === 'facture') openFn = `modal.hide();showFactureDetail(${doc.id})`;
    if (doc.type === 'acompte') openFn = `modal.hide();showAcompteDetail(${doc.id})`;
    if (doc.type === 'bl')      openFn = `modal.hide();showBLDetail(${doc.id})`;
    return `<tr style="cursor:pointer" onclick="${openFn}">
      <td>${fmt.date(doc.date_doc)}</td>
      <td style="color:var(--text-muted);font-size:12px">${typeLabel[doc.type] || doc.type}</td>
      <td><strong>${doc.numero}</strong></td>
      <td>${fmt.badge(doc.statut)}${isRetard ? ' <span style="color:#ef4444;font-size:11px;font-weight:600">⚠ retard</span>' : ''}</td>
      <td style="text-align:right">${montantCell}</td>
    </tr>`;
  }).join('');

  const html = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text-muted);margin-right:2px">Période :</span>
      <button data-kpi-tab="n"   class="btn btn-sm btn-primary">${annee_n}</button>
      <button data-kpi-tab="n1"  class="btn btn-sm btn-outline">${annee_n1}</button>
      <button data-kpi-tab="all" class="btn btn-sm btn-outline">Tout</button>
    </div>
    <div id="kpiCards" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${renderKpis(kpis_n)}
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Type</th><th>Numéro</th><th>Statut</th><th style="text-align:right">Montant TTC</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="empty">Aucun document</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="modal.hide();DocEditor.openDevis()">+ Nouveau devis</button>
      <button class="btn btn-outline" onclick="modal.hide();showClientForm(${id})">Modifier la fiche</button>
    </div>`;

  modal.show(`Fiche client — ${nom}`, html, body => {
    const kpisMap = { n: kpis_n, n1: kpis_n1, all: kpis_all };
    body.querySelectorAll('[data-kpi-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('[data-kpi-tab]').forEach(b => {
          b.className = b === btn ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
        });
        body.querySelector('#kpiCards').innerHTML = renderKpis(kpisMap[btn.dataset.kpiTab]);
      });
    });
  });
}

// ── Devis ─────────────────────────────────────────────────────────────────
async function openPdf(url) {
  const w = window.open('', '_blank');
  if (!w) { alert('Autorisez les pop-ups pour ce site afin de visualiser les PDFs.'); return; }
  const token = localStorage.getItem('jwt');
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { w.close(); const e = await res.json().catch(() => ({})); alert(e.error || 'Erreur PDF'); return; }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    w.location.href = objUrl;
  } catch(e) { w.close(); alert('Erreur lors du chargement du PDF.'); }
}

// ── Import / Export CSV générique ─────────────────────────────────────────
async function exportCSV(url, name) {
  const token = localStorage.getItem('jwt');
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Erreur export'); return; }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importCSV(url, input, onSuccess) {
  const file = input.files?.[0]; if (!file) return;
  const fd   = new FormData(); fd.append('file', file);
  const token= localStorage.getItem('jwt');
  input.value = ''; // reset pour permettre re-import du même fichier

  const res  = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json();
  if (data.error) { alert('Erreur : ' + data.error); return; }

  let msg = `Import terminé :\n✓ ${data.inserted} enregistrement(s) importé(s)`;
  if (data.skipped) msg += `\n✗ ${data.skipped} ignoré(s)`;
  if (data.errors?.length) msg += '\n\nDétails :\n' + data.errors.slice(0, 10).join('\n');
  alert(msg);
  if (data.inserted > 0 && onSuccess) onSuccess();
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

async function relancerFacture(id) {
  const [facture, client, entreprise] = await Promise.all([
    api.get(`/api/factures/${id}`),
    null, // sera récupéré via facture.client_id
    api.get('/api/entreprise'),
  ]);
  const clientData = await api.get(`/api/clients/${facture.client_id}`);
  const emailDest  = clientData?.email || '';
  const retardJours = facture.date_echeance
    ? Math.max(0, Math.floor((Date.now() - new Date(facture.date_echeance)) / 864e5))
    : 0;

  const sujetDefaut = `Relance — Facture ${facture.numero} en attente de règlement`;
  const corpsDefaut = `Madame, Monsieur,

Sauf erreur ou omission de notre part, la facture ${facture.numero} d'un montant de ${facture.montant_ttc} € TTC émise le ${new Date(facture.date_emission).toLocaleDateString('fr-FR')} demeure impayée${retardJours > 0 ? ` (${retardJours} jour(s) de retard)` : ''}.

Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais.

Cordialement,
${entreprise?.raison_sociale || ''}`;

  modal.open('Relance client — ' + facture.numero, `
    <form id="relanceForm">
      <div class="form-group"><label>Destinataire *</label>
        <input name="email" type="email" value="${emailDest}" required/>
      </div>
      <div class="form-group"><label>Objet</label>
        <input name="sujet" value="${sujetDefaut.replace(/"/g,'&quot;')}"/>
      </div>
      <div class="form-group"><label>Message</label>
        <textarea name="corps" rows="10">${corpsDefaut}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button type="submit" class="btn btn-primary">📨 Envoyer la relance</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>`);

  document.getElementById('relanceForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';
    try {
      const fd = new FormData(e.target);
      const r  = await api.post(`/api/factures/${id}/relancer`, {
        email:  fd.get('email'),
        sujet:  fd.get('sujet'),
        corps:  fd.get('corps'),
      });
      if (r?.error) { alert('Erreur : ' + r.error); btn.disabled = false; btn.textContent = 'Envoyer'; return; }
      modal.close();
      if (r?.preview_url) {
        if (confirm('Email envoyé (mode test Ethereal — aucun SMTP configuré).\nOuvrir la prévisualisation ?'))
          window.open(r.preview_url, '_blank');
      } else {
        alert(`Relance envoyée à ${fd.get('email')}`);
      }
    } catch(err) {
      alert('Erreur inattendue : ' + err.message);
      btn.disabled = false; btn.textContent = 'Envoyer';
    }
  };
}

function telechargerRelanceCourrier(id, numero) {
  const token = localStorage.getItem('jwt');
  const a = document.createElement('a');
  a.href = `/api/factures/${id}/relance-courrier`;
  a.download = `relance_${numero}.pdf`;
  a.style.display = 'none';
  // Passer le token via fetch et créer un blob URL
  fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
}

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

function updateSelCount() {
  const checked = document.querySelectorAll('.fac-sel:checked');
  const n = checked.length;
  const btn  = document.getElementById('btnEnvoiGroupe');
  const span = document.getElementById('selCount');
  const btnS = document.getElementById('btnSepaGroupe');
  const spanS = document.getElementById('selCountSepa');
  if (btn)  btn.disabled  = n === 0;
  if (span) span.textContent   = n;
  if (btnS)  btnS.disabled  = n === 0;
  if (spanS) spanS.textContent   = n;
}

function selectionnerClientsSepa() {
  const btn = document.getElementById('btnSelectSepa');
  const active = btn && btn.dataset.active === '1';

  if (active) {
    // Désélectionner : revenir à l'état initial
    document.querySelectorAll('.fac-sel').forEach(cb => { cb.checked = false; });
    updateSelCount();
    if (btn) { btn.dataset.active = '0'; btn.innerHTML = '🏦 Sélect. SEPA'; }
    return;
  }

  // Cocher uniquement les factures des clients avec prélèvement SEPA par défaut
  let found = 0;
  document.querySelectorAll('.fac-sel').forEach(cb => {
    cb.checked = cb.dataset.mode === 'prelevement_sepa';
    if (cb.checked) found++;
  });
  updateSelCount();
  if (!found) {
    alert('Aucune facture dont le client a "Prélèvement SEPA" comme mode de règlement par défaut.\nVérifiez les fiches clients.');
    return;
  }
  if (btn) { btn.dataset.active = '1'; btn.innerHTML = '🏦 Désélect. SEPA'; }
}

async function genererSepa() {
  const checked = [...document.querySelectorAll('.fac-sel:checked')];
  if (!checked.length) return;
  const ids = checked.map(cb => parseInt(cb.dataset.id));
  const nums = checked.map(cb => cb.dataset.num).join(', ');
  const today = new Date(Date.now() + 2*86400000).toISOString().slice(0,10); // J+2 par défaut

  modal.show('Générer un fichier SEPA', `
    <p style="margin-bottom:12px">Prélèvement de <strong>${ids.length}</strong> facture(s) :</p>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${nums}</p>
    <div class="form-row">
      <div class="form-group"><label>Date d'exécution</label>
        <input id="sepaDate" type="date" value="${today}"/>
        <small style="color:var(--text-muted)">J+1 min pour B2B, J+1 pour CORE (RCUR), J+5 pour CORE (FRST)</small>
      </div>
      <div class="form-group"><label>Séquence</label>
        <select id="sepaSeq">
          <option value="FRST">FRST — Premier prélèvement</option>
          <option value="RCUR" selected>RCUR — Récurrent</option>
          <option value="FNAL">FNAL — Dernier de la série</option>
          <option value="OOFF">OOFF — Unique (ponctuel)</option>
        </select>
      </div>
    </div>
    <div id="sepaError" style="color:var(--danger);font-size:13px;margin-top:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="modal.hide()">Annuler</button>
      <button class="btn btn-primary" id="btnSepaGenerer">⬇ Générer pain.008</button>
    </div>`, body => {
    body.querySelector('#btnSepaGenerer').onclick = async () => {
      const date_execution = body.querySelector('#sepaDate').value;
      const sequence       = body.querySelector('#sepaSeq').value;
      const errEl          = body.querySelector('#sepaError');
      if (!date_execution) { errEl.textContent = 'Date requise'; return; }
      errEl.textContent = '';
      try {
        const token = localStorage.getItem('jwt');
        const r = await fetch('/api/sepa/generer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ facture_ids: ids, date_execution, sequence }),
        });
        if (!r.ok) { const e = await r.json(); errEl.textContent = e.error || 'Erreur'; return; }
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `SEPA_${date_execution}_${ids.length}tx.xml`;
        a.click();
        URL.revokeObjectURL(url);
        modal.hide();
      } catch(e) { errEl.textContent = 'Erreur réseau'; }
    };
  });
}

async function envoyerGroupeFactures() {
  const checked = [...document.querySelectorAll('.fac-sel:checked')];
  if (!checked.length) return;

  const factures = checked.map(cb => ({ id: parseInt(cb.dataset.id), numero: cb.dataset.num }));
  const list = factures.map(f => `<li><strong>${f.numero}</strong></li>`).join('');

  modal.show('Envoi groupé', `
    <p style="margin-bottom:12px">Envoi de <strong>${factures.length}</strong> facture(s) :</p>
    <ul style="margin-bottom:16px;padding-left:20px;font-size:13px">${list}</ul>
    <div class="form-group"><label>Mode d'envoi</label>
      <select id="groupeMode">
        <option value="smtp">SMTP — Envoi automatique (recommandé)</option>
        <option value="mapi">MAPI — Client mail Windows</option>
        <option value="mailto">mailto: — Application mail</option>
      </select>
    </div>
    <div id="groupeProgress" style="margin-top:12px;font-size:13px;color:var(--text-muted)"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="modal.hide()">Annuler</button>
      <button class="btn btn-primary" id="btnGroupeEnvoyer">✉ Envoyer tout</button>
    </div>`, body => {
    body.querySelector('#btnGroupeEnvoyer').onclick = async () => {
      const mode = body.querySelector('#groupeMode').value;
      const progress = body.querySelector('#groupeProgress');
      const envoyerBtn = body.querySelector('#btnGroupeEnvoyer');
      envoyerBtn.disabled = true;
      let ok = 0, err = 0;
      for (const f of factures) {
        progress.textContent = `Envoi en cours : ${f.numero}…`;
        try {
          const r = await api.post(`/api/factures/${f.id}/envoyer`, { mode });
          if (r?.error) { err++; progress.textContent += ` ❌`; }
          else { ok++; }
        } catch(e) { err++; }
        await new Promise(r => setTimeout(r, 200));
      }
      progress.innerHTML = `✅ ${ok} envoyée(s)${err ? ` — ❌ ${err} erreur(s)` : ''}`;
      envoyerBtn.textContent = 'Terminé';
      setTimeout(() => { modal.hide(); tabMgr.openViewTab('factures'); }, 1500);
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

async function emettreEtEnvoyer(id) {
  if (!confirm('Émettre cette facture ? Elle sera verrouillée définitivement.')) return;
  const r = await api.post(`/api/factures/${id}/emettre`);
  if (r?.error) { alert(r.error); return; }
  tabMgr.openViewTab('factures');
  setTimeout(() => envoyerFacture(id), 400);
}

async function payerFacture(id) {
  const today = new Date().toISOString().slice(0, 10);
  const [facture, acomptes] = await Promise.all([
    api.get(`/api/factures/${id}`),
    api.get(`/api/factures/${id}/acomptes-disponibles`),
  ]);
  if (!facture) return;

  const fmtE = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const montantFac = Number(facture.montant_ttc || 0);

  const acompteOptions = (acomptes && acomptes.length)
    ? `<div class="form-group" style="margin-top:12px">
        <label>Acompte à déduire</label>
        <select id="payerAcompteSelect" name="acompte_id" onchange="updateSoldePayer(${montantFac})">
          <option value="">— Aucun acompte —</option>
          ${acomptes.map(a => `<option value="${a.id}" data-montant="${a.montant_ttc}">${a.numero} — ${fmtE(a.montant_ttc)}${a.notes ? ' (' + a.notes + ')' : ''}</option>`).join('')}
        </select>
      </div>
      <div id="soldePayer" style="display:none;margin-top:8px;padding:10px;background:#f0f7ff;border-radius:6px;font-size:0.9rem">
        <div style="display:flex;justify-content:space-between"><span>Total TTC facture</span><span>${fmtE(montantFac)}</span></div>
        <div style="display:flex;justify-content:space-between;color:#666"><span id="soldeAcompteLabel">Acompte versé</span><span id="soldeAcompteMontant"></span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;border-top:1px solid #ddd;margin-top:6px;padding-top:6px"><span>Solde à payer</span><span id="soldeRestant"></span></div>
      </div>`
    : '';

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
      ${acompteOptions}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="submit" class="btn btn-primary">Confirmer</button>
        <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('payerForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const acompte_id = fd.get('acompte_id') ? Number(fd.get('acompte_id')) : null;
    await api.post(`/api/factures/${id}/payer`, {
      date_paiement:  fd.get('date_paiement'),
      mode_paiement:  fd.get('mode_paiement') || null,
      acompte_id,
    });
    modal.close();
    tabMgr.openViewTab('factures');
  };
}

function updateSoldePayer(montantFac) {
  const sel = document.getElementById('payerAcompteSelect');
  const box = document.getElementById('soldePayer');
  if (!sel || !box) return;
  const opt = sel.selectedOptions[0];
  const acompteId = sel.value;
  if (!acompteId) { box.style.display = 'none'; return; }
  const acompteMontant = Number(opt.dataset.montant || 0);
  const applique = Math.min(acompteMontant, montantFac);
  const solde    = Math.max(0, montantFac - applique);
  const fmtE = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  document.getElementById('soldeAcompteLabel').textContent = `Acompte ${opt.text.split(' — ')[0]}`;
  document.getElementById('soldeAcompteMontant').textContent = `− ${fmtE(applique)}`;
  document.getElementById('soldeRestant').textContent = fmtE(solde);
  box.style.display = 'block';
  if (acompteMontant > montantFac) {
    const reliquat = acompteMontant - applique;
    const note = document.getElementById('soldeRestant').parentElement;
    let reliquatEl = document.getElementById('soldeReliquat');
    if (!reliquatEl) {
      reliquatEl = document.createElement('div');
      reliquatEl.id = 'soldeReliquat';
      reliquatEl.style.cssText = 'display:flex;justify-content:space-between;color:#1a7a40;margin-top:4px;font-size:0.85rem';
      note.after(reliquatEl);
    }
    reliquatEl.innerHTML = `<span>Reliquat → nouvel acompte</span><span>${fmtE(reliquat)}</span>`;
  } else {
    const old = document.getElementById('soldeReliquat');
    if (old) old.remove();
  }
}

async function ouvrirAttestation() {
  const token = localStorage.getItem('jwt');
  const res   = await fetch('/api/stats/attestation', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Erreur lors de la génération'); return; }
  const html  = await res.text();
  const blob  = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function exportFEC(annee) {
  const token = localStorage.getItem('jwt');
  const url = annee ? `/api/factures/export/fec?annee=${annee}` : '/api/factures/export/fec';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Erreur export FEC'); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl; a.download = annee ? `FEC_${annee}.txt` : 'FEC.txt'; a.click();
  URL.revokeObjectURL(objUrl);
}

async function renderExercices(el) {
  const anneeActuelle = new Date().getFullYear();
  async function load() {
    const exercices = await api.get('/api/exercices') ?? [];
    const anneesExistantes = new Set(exercices.map(e => e.annee));
    const anneeMax = exercices.length ? Math.max(...exercices.map(e => e.annee)) : anneeActuelle - 1;
    const anneesDispos = [];
    for (let a = anneeMax + 1; a >= anneeActuelle - 1; a--) {
      if (!anneesExistantes.has(a)) anneesDispos.push(a);
    }

    el.innerHTML = `
      <div class="card" style="max-width:760px">
        <h2 style="margin-bottom:4px;color:var(--primary)">Exercices comptables</h2>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">
          Clôture annuelle obligatoire — loi anti-fraude TVA 2018 (art. 88 loi 2015-1785)
        </p>

        ${anneesDispos.length ? `
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">Année</label>
            <select id="selNouvelAnnee" class="form-control" style="width:100px">
              ${anneesDispos.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px">Début d'exercice</label>
            <input type="date" id="inputDateOuv" class="form-control" style="width:150px"
              value="${anneesDispos[0] ?? anneeActuelle}-01-01"/>
          </div>
          <button class="btn btn-outline" onclick="ouvrirExercice()"${helpAttr('exercice_ouvrir')}>+ Ouvrir cet exercice</button>
        </div>` : ''}

        ${exercices.length === 0 ? `<p style="color:var(--text-muted)">Aucun exercice ouvert.</p>` : `
        <table class="list-table" style="width:100%">
          <thead><tr>
            <th>Année</th><th>Ouverture</th><th>Clôture</th><th>Écritures</th><th>Statut</th><th>Actions</th>
          </tr></thead>
          <tbody>
          ${exercices.map(e => `
            <tr>
              <td><strong>${e.annee}</strong></td>
              <td>${e.date_ouverture ? new Date(e.date_ouverture).toLocaleDateString('fr-FR') : '-'}</td>
              <td>${e.date_cloture  ? new Date(e.date_cloture).toLocaleDateString('fr-FR')  : '-'}</td>
              <td>${e.nb_ecritures ?? '-'}</td>
              <td>
                <span style="padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600;
                  background:${e.statut === 'clos' ? '#d1fae5' : '#fef3c7'};
                  color:${e.statut === 'clos' ? '#065f46' : '#92400e'}">
                  ${e.statut === 'clos' ? '✓ Clôturé' : '⏳ Ouvert'}
                </span>
              </td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-outline" style="font-size:12px"
                  onclick="exportFEC(${e.annee})">⬇ FEC ${e.annee}</button>
                ${e.statut === 'clos' ? `
                  <button class="btn btn-outline" style="font-size:12px"
                    onclick="ouvrirPV(${e.annee})">📄 PV</button>
                ` : `
                  <button class="btn btn-primary" style="font-size:12px" data-tooltip="${helpTexts.exercice_cloturer.replace(/"/g,'&quot;')}"
                    onclick="cloturer(${e.annee}, '${e.date_ouverture}')">🔒 Clôturer</button>
                `}
              </td>
            </tr>
          `).join('')}
          </tbody>
        </table>`}

        <div id="exResult" style="margin-top:16px"></div>
      </div>
    `;
  }

  window.ouvrirExercice = async function() {
    const annee = Number(document.getElementById('selNouvelAnnee').value);
    const date_ouverture = document.getElementById('inputDateOuv')?.value || undefined;
    const r = await api.post('/api/exercices', { annee, date_ouverture });
    if (r?.id) { load(); } else { alert(r?.error ?? 'Erreur'); }
  };

  window.cloturer = async function(annee, dateOuvStr) {
    // Déduit la date de clôture par défaut = dernier jour de l'exercice
    // Si l'exercice commence le 01/04/N il se termine le 31/03/N+1
    let dateCloDefault;
    if (dateOuvStr) {
      const d = new Date(dateOuvStr);
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(d.getDate() - 1);
      dateCloDefault = d.toISOString().slice(0, 10);
    } else {
      dateCloDefault = `${annee}-12-31`;
    }
    const dateClo = prompt(
      `Date de clôture de l'exercice ${annee} (dernier jour inclus) :`,
      dateCloDefault
    );
    if (!dateClo) return;
    if (!confirm(`Clôturer l'exercice ${annee} au ${dateClo} ? Cette opération est irréversible.`)) return;
    const r = await api.post(`/api/exercices/${annee}/cloturer`, { date_cloture: dateClo });
    if (r?.exercice) {
      document.getElementById('exResult').innerHTML =
        `<div class="alert alert-success" style="background:#d1fae5;border:1px solid #a7f3d0;border-radius:6px;padding:12px;font-size:13px">
          ✓ Exercice ${annee} clôturé — ${r.nb_ecritures} écritures —
          Hash SHA-256 : <code style="font-size:11px">${r.hash_cloture}</code>
        </div>`;
      load();
    } else { alert(r?.error ?? 'Erreur lors de la clôture'); }
  };

  window.ouvrirPV = async function(annee) {
    const token = localStorage.getItem('jwt');
    const res = await fetch(`/api/exercices/${annee}/pv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert('Erreur génération PV'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  await load();
}

async function verifierScellement() {
  const r = await api.get('/api/factures/scellement/verifier');
  alert(r.valide ? '✓ Chaîne de scellement intègre.' : `⚠ Rupture détectée à l'entrée ${r.premierEcartId}`);
}

async function deposerChorusPro(id) {
  if (!confirm(`Déposer la facture sur Chorus Pro / Portail Public de Facturation ?\n\nCette action soumet la facture aux services de l'État.`)) return;
  const r = await api.post(`/api/factures/${id}/chorus-pro/deposer`, {});
  if (r?.idFactureCPP) {
    alert(`✓ Déposée sur Chorus Pro\nID CPP : ${r.idFactureCPP}\nStatut : ${r.statut}`);
  } else {
    alert(r?.error ?? 'Erreur lors du dépôt Chorus Pro');
  }
}

async function envoyerLienSignature(id) {
  const r = await api.post(`/api/devis/${id}/envoyer-lien-signature`, {});
  if (r?.ok) {
    alert(`✓ Lien de signature envoyé au client.\n\nLien : ${r.lien}`);
  } else {
    alert(r?.error ?? 'Erreur lors de l\'envoi du lien de signature');
  }
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

async function factureFromBL(blId) {
  const bl = await api.get(`/api/bons-livraison/${blId}`);
  if (!bl?.id) return;
  // Ouvre l'éditeur facture pré-rempli avec les lignes du BL
  // Les prix sont vides — l'utilisateur les complète avant d'émettre
  DocEditor.openFacture(null, {
    client_id:  bl.client_id,
    bl_id:      blId,
    bl_numero:  bl.numero,
    lignes: (bl.lignes || []).map(l => ({
      designation:      l.designation,
      description:      l.description,
      quantite:         l.quantite,
      unite:            l.unite,
      prix_unitaire_ht: 0,
      taux_tva_id:      1,
      remise_pct:       0,
    })),
  });
}

function updateBLSelCount() {
  const checked = [...document.querySelectorAll('.bl-sel:checked')];
  _selBL = new Set(checked.map(c => Number(c.dataset.id)));
  const btn = document.getElementById('btnFacturerSelBL');
  const span = document.getElementById('selCountBL');
  if (!btn) return;
  if (span) span.textContent = _selBL.size;
  const enabled = _selBL.size >= 1;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '0.5';
  btn.style.pointerEvents = enabled ? '' : 'none';
}

async function facturerSelectionBL() {
  const ids = [..._selBL];
  if (!ids.length) return;

  const bls = await Promise.all(ids.map(id => api.get(`/api/bons-livraison/${id}`)));
  const valid = bls.filter(b => b?.id);
  if (!valid.length) return;

  const clientIds = [...new Set(valid.map(b => b.client_id))];
  if (clientIds.length > 1) {
    alert('Les bons de livraison sélectionnés appartiennent à des clients différents.\nVeuillez sélectionner uniquement des BL du même client.');
    return;
  }

  const allLignes = valid.flatMap(bl =>
    (bl.lignes || []).map(l => ({
      designation:      l.designation,
      description:      l.description,
      quantite:         l.quantite,
      unite:            l.unite,
      prix_unitaire_ht: 0,
      taux_tva_id:      1,
      remise_pct:       0,
    }))
  );

  DocEditor.openFacture(null, {
    client_id:  clientIds[0],
    bl_numeros: valid.map(b => b.numero).join(', '),
    lignes:     allLignes,
  });
}

async function supprimerBL(id) {
  if (!confirm('Supprimer ce bon de livraison ?')) return;
  const r = await api.delete(`/api/bons-livraison/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('bons-livraison');
}

async function deleteDevis(id) {
  if (!confirm('Supprimer ce devis ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/devis/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('devis');
}

async function deleteAcompte(id) {
  if (!confirm('Supprimer cet acompte ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/acomptes/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('acomptes');
}

async function deleteAvoir(id) {
  if (!confirm('Supprimer cet avoir ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/factures/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('avoirs');
}

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/clients/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.closeTabByDocId(id);
  tabMgr.openViewTab('clients');
}

// ── Articles ──────────────────────────────────────────────────────────────
let _articlesData   = [];
let _articlesSortCol = null;
let _articlesSortDir = 1; // 1 = asc, -1 = desc

let _selBL = new Set();

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

async function renderFournisseurs(el) {
  let filtreStatut = 'all';

  async function reload() {
    const url = filtreStatut === 'all' ? '/api/factures-fournisseurs' : `/api/factures-fournisseurs?statut=${filtreStatut}`;
    const factures = await api.get(url) ?? [];

    const totalHT  = factures.reduce((s, f) => s + Number(f.montant_ht),  0);
    const totalTVA = factures.reduce((s, f) => s + Number(f.montant_tva), 0);
    const totalTTC = factures.reduce((s, f) => s + Number(f.montant_ttc), 0);
    const nbAPayer = factures.filter(f => f.statut === 'recue').length;

    const rows = factures.map(f => {
      const ech = f.date_echeance ? new Date(f.date_echeance).toLocaleDateString('fr-FR') : '—';
      const enRetard = f.statut === 'recue' && f.date_echeance && new Date(f.date_echeance) < new Date();
      const statutBadge = f.statut === 'payee'
        ? `<span class="badge badge-success">Payée</span>`
        : enRetard
          ? `<span class="badge badge-danger">En retard</span>`
          : `<span class="badge badge-warning">À payer</span>`;
      const actions = `<button class="btn-sm btn-outline" onclick="DocEditor.openFactureAchat(${f.id})">${f.statut === 'payee' ? 'Voir' : 'Éditer'}</button>`
        + (f.statut === 'recue'
          ? ` <button class="btn-sm btn-primary" onclick="payerFournisseur(${f.id})">Payer</button>
              <button class="btn-sm btn-danger"  onclick="supprimerFournisseur(${f.id})">Supprimer</button>`
          : '');
      return `<tr>
        <td>${new Date(f.date_facture).toLocaleDateString('fr-FR')}</td>
        <td><strong>${f.fournisseur_nom}</strong>${f.fournisseur_siret ? `<br><small style="color:var(--text-muted)">${f.fournisseur_siret}</small>` : ''}</td>
        <td>${f.numero}</td>
        <td style="color:var(--text-muted);font-size:13px">${f.description ?? ''}</td>
        <td style="text-align:right">${Number(f.montant_ht).toFixed(2)} €</td>
        <td style="text-align:right">${Number(f.taux_tva).toFixed(0)}% — ${Number(f.montant_tva).toFixed(2)} €</td>
        <td style="text-align:right"><strong>${Number(f.montant_ttc).toFixed(2)} €</strong></td>
        <td style="color:${enRetard ? 'var(--danger)' : 'inherit'}">${ech}</td>
        <td>${statutBadge}</td>
        <td style="white-space:nowrap">${actions}</td>
      </tr>`;
    }).join('');

    const emptyRow = factures.length === 0
      ? `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px">Aucune facture fournisseur</td></tr>`
      : '';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">Factures d'achats <span class="help-icon" data-tooltip="${helpTexts.facture_fournisseur_statut.replace(/"/g,'&quot;')}">?</span></h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="btnNouveauFF">+ Nouvelle facture</button>
          <label class="btn btn-outline" style="cursor:pointer;margin:0" title="Importer un CSV">
            ⬆ Import CSV
            <input type="file" id="ffCsvInput" accept=".csv,text/csv" style="display:none"/>
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn ${filtreStatut==='all'   ? 'btn-primary' : 'btn-outline'}" onclick="window._ffFiltre('all')">Toutes</button>
        <button class="btn ${filtreStatut==='recue' ? 'btn-primary' : 'btn-outline'}" onclick="window._ffFiltre('recue')">À payer${nbAPayer ? ` (${nbAPayer})` : ''}</button>
        <button class="btn ${filtreStatut==='payee' ? 'btn-primary' : 'btn-outline'}" onclick="window._ffFiltre('payee')">Payées</button>
      </div>
      <div class="card" style="overflow-x:auto">
        <table class="table">
          <thead><tr>
            <th>Date</th><th>Fournisseur</th><th>N° facture</th><th>Description</th>
            <th style="text-align:right">HT</th><th style="text-align:right">TVA</th>
            <th style="text-align:right">TTC</th><th>Échéance</th><th>Statut</th><th></th>
          </tr></thead>
          <tbody>${rows}${emptyRow}</tbody>
          ${factures.length > 0 ? `<tfoot><tr style="background:var(--bg-alt);font-weight:600">
            <td colspan="4" style="text-align:right">Totaux</td>
            <td style="text-align:right">${totalHT.toFixed(2)} €</td>
            <td style="text-align:right">${totalTVA.toFixed(2)} €</td>
            <td style="text-align:right">${totalTTC.toFixed(2)} €</td>
            <td colspan="3"></td>
          </tr></tfoot>` : ''}
        </table>
      </div>`;

    el.querySelector('#btnNouveauFF').onclick = () => DocEditor.openFactureAchat();

    el.querySelector('#ffCsvInput').onchange = async function() {
      const file = this.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('csv', file);
      const token = localStorage.getItem('jwt');
      const r = await fetch('/api/factures-fournisseurs/import-csv', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      }).then(res => res.json());
      this.value = '';
      if (r.error) { alert('Erreur : ' + r.error); return; }
      const msg = `Import terminé : ${r.ok} ligne${r.ok > 1 ? 's' : ''} importée${r.ok > 1 ? 's' : ''}.` +
        (r.errors?.length ? `\n\nErreurs :\n${r.errors.join('\n')}` : '');
      alert(msg);
      reload();
    };
  }

  window._ffFiltre = (s) => { filtreStatut = s; reload(); };

  window.payerFournisseur = (id) => window.payerFactureAchat(id, reload);

  window.supprimerFournisseur = async (id) => {
    if (!confirm('Supprimer cette facture fournisseur ? Les écritures FEC associées seront également supprimées.')) return;
    await api.delete(`/api/factures-fournisseurs/${id}`);
    reload();
  };

  await reload();
}

// ── Fournisseurs (fiche entité, sur le modèle de Clients) ────────────────
async function renderFournisseursEntites(el) {
  const fournisseurs = await api.get('/api/fournisseurs') ?? [];
  document.getElementById('topbarActions').innerHTML = `
    <button class="btn btn-primary" onclick="showFournisseurForm()">+ Nouveau fournisseur</button>
    <button class="btn btn-outline" onclick="exportCSV('/api/fournisseurs/export','fournisseurs')">⬇ Exporter CSV</button>
    <label class="btn btn-outline" style="cursor:pointer;margin:0;text-transform:none">⬆ Importer CSV
      <input type="file" accept=".csv" style="display:none" onchange="importCSV('/api/fournisseurs/import',this,()=>renderFournisseursEntites(el))">
    </label>`;

  el.innerHTML = `<div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Raison sociale</th><th>Email</th><th>Téléphone</th>
          <th>SIRET</th><th>Conditions de paiement</th><th></th>
        </tr></thead>
        <tbody>${fournisseurs.length ? fournisseurs.map(f => `
          <tr>
            <td><strong>${f.raison_sociale}</strong></td>
            <td>${f.email || '—'}</td>
            <td>${f.telephone || '—'}</td>
            <td><code>${f.siret || '—'}</code></td>
            <td>${f.conditions_paiement || '—'}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="showFournisseurForm(${f.id})">Éditer</button>
              <button class="btn-trash" onclick="deleteFournisseurEntite(${f.id})" title="Supprimer ce fournisseur">🗑️</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" class="empty">Aucun fournisseur</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

async function showFournisseurForm(id) {
  const fournisseur = id ? (await api.get('/api/fournisseurs')).find(x => x.id === id) : {};
  const html = `
    <form id="fournisseurForm">
      <div class="form-group"><label>Raison sociale *</label>
        <input name="raison_sociale" value="${fournisseur.raison_sociale || ''}" required/>
      </div>
      <div class="form-group"><label>Adresse</label><input name="adresse" value="${fournisseur.adresse || ''}"/></div>
      <div class="form-group"><label>Complément d'adresse</label><input name="adresse2" value="${fournisseur.adresse2 || ''}" placeholder="Bâtiment, étage, BP…"/></div>
      <div class="form-row">
        <div class="form-group"><label>Code postal</label><input name="code_postal" value="${fournisseur.code_postal || ''}"/></div>
        <div class="form-group"><label>Ville</label><input name="ville" value="${fournisseur.ville || ''}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email</label><input name="email" type="email" value="${fournisseur.email || ''}"/></div>
        <div class="form-group"><label>Téléphone</label><input name="telephone" value="${fournisseur.telephone || ''}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>SIRET</label><input name="siret" value="${fournisseur.siret || ''}"/></div>
        <div class="form-group"><label>TVA Intracom</label><input name="tva_intracom" value="${fournisseur.tva_intracom || ''}"/></div>
      </div>
      <div class="form-group">
        <label>Conditions de paiement <small style="font-weight:normal;color:var(--text-muted)">(pour information)</small></label>
        <input name="conditions_paiement" list="cond-paiement-list-fourn" value="${fournisseur.conditions_paiement || ''}" placeholder="Ex : Paiement à 30 jours fin de mois"/>
        <datalist id="cond-paiement-list-fourn">
          <option value="Paiement comptant à réception de facture"/>
          <option value="Paiement à 30 jours"/>
          <option value="Paiement à 30 jours fin de mois"/>
          <option value="Paiement à 45 jours fin de mois"/>
          <option value="Paiement à 60 jours"/>
        </datalist>
      </div>
      <details style="margin-top:8px;border:1px solid var(--border);border-radius:6px;padding:12px">
        <summary style="font-weight:600;cursor:pointer;font-size:13px">🏦 Coordonnées bancaires (pour vos virements)</summary>
        <div style="margin-top:12px" class="form-row">
          <div class="form-group"><label>IBAN</label><input name="iban" value="${fournisseur.iban || ''}" placeholder="FR76 0000 0000 0000 0000 0000 000" style="font-family:monospace"/></div>
          <div class="form-group"><label>BIC</label><input name="bic" value="${fournisseur.bic || ''}" placeholder="BNPAFRPPXXX" style="text-transform:uppercase"/></div>
        </div>
      </details>
      <div class="form-group" style="margin-top:8px"><label>Notes</label>
        <textarea name="notes" rows="2" style="width:100%;resize:vertical">${fournisseur.notes || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button type="submit" class="btn btn-primary">${id ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`;

  modal.show(id ? 'Modifier le fournisseur' : 'Nouveau fournisseur', html, body => {
    attachSireneAutocomplete(body.querySelector('[name="raison_sociale"]'), body);
    attachNominatimAutocomplete(body.querySelector('[name="adresse"]'), body);

    const siretInp = body.querySelector('[name="siret"]');
    const tvaInp   = body.querySelector('[name="tva_intracom"]');
    if (siretInp && tvaInp) {
      siretInp.addEventListener('blur', () => {
        if (siretInp.value.trim() && !tvaInp.value.trim()) {
          const tva = tvaFromSiret(siretInp.value);
          if (tva) { tvaInp.value = tva; tvaInp.style.background = '#f0fdf4'; setTimeout(() => tvaInp.style.background = '', 1500); }
        }
      });
    }
    body.querySelector('#fournisseurForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const r = id ? await api.put(`/api/fournisseurs/${id}`, data) : await api.post('/api/fournisseurs', data);
      if (r?.error) return alert(r.error);
      modal.hide();
      tabMgr.openViewTab('fournisseurs');
    };
  });
}

async function deleteFournisseurEntite(id) {
  if (!confirm('Supprimer ce fournisseur ? Cette action est irréversible.')) return;
  const r = await api.delete(`/api/fournisseurs/${id}`);
  if (r?.error) return alert(r.error);
  tabMgr.openViewTab('fournisseurs');
}

// ── Commandes fournisseurs (chaînage non bloquant avec les factures d'achats)
async function renderCommandes(el) {
  let filtreStatut = 'all';
  const STATUTS = {
    en_cours:     { label: 'En cours',      badge: 'badge-warning' },
    receptionnee: { label: 'Réceptionnée',  badge: 'badge-success' },
    annulee:      { label: 'Annulée',       badge: 'badge-danger'  },
  };

  async function reload() {
    const url = filtreStatut === 'all' ? '/api/commandes-fournisseurs' : `/api/commandes-fournisseurs?statut=${filtreStatut}`;
    const commandes = await api.get(url) ?? [];

    const rows = commandes.map(c => {
      const livr = c.date_livraison_prevue ? new Date(c.date_livraison_prevue).toLocaleDateString('fr-FR') : '—';
      const st = STATUTS[c.statut] || STATUTS.en_cours;
      const lien = c.facture_fournisseur_id
        ? `<span class="badge badge-info" title="Chaînage non bloquant — modifiable à tout moment">${c.facture_numero}</span>`
        : `<span style="color:var(--text-muted)">— non liée —</span>`;
      return `<tr>
        <td>${new Date(c.date_commande).toLocaleDateString('fr-FR')}</td>
        <td><strong>${c.fournisseur_nom}</strong></td>
        <td>${c.numero}</td>
        <td style="color:var(--text-muted);font-size:13px">${c.description ?? ''}</td>
        <td style="text-align:right">${Number(c.montant_ht).toFixed(2)} €</td>
        <td>${livr}</td>
        <td><span class="badge ${st.badge}">${st.label}</span></td>
        <td>${lien}</td>
        <td style="white-space:nowrap">
          <button class="btn-sm btn-outline" onclick="DocEditor.openCommande(${c.id})">Éditer</button>
          <button class="btn-sm btn-outline" onclick="lierCommandeFacture(${c.id})" title="Facture d'achat liée (chaînage non bloquant)">🔗</button>
          <button class="btn-sm btn-danger" onclick="deleteCommande(${c.id})">Supprimer</button>
        </td>
      </tr>`;
    }).join('');

    const emptyRow = commandes.length === 0
      ? `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px">Aucune commande fournisseur</td></tr>`
      : '';

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">Commandes fournisseurs <span class="help-icon" data-tooltip="${helpTexts.commande_chainage.replace(/"/g,'&quot;')}">?</span></h2>
        <button class="btn btn-primary" id="btnNouvelleCmd">+ Nouvelle commande</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn ${filtreStatut==='all'          ? 'btn-primary' : 'btn-outline'}" onclick="window._cmdFiltre('all')">Toutes</button>
        <button class="btn ${filtreStatut==='en_cours'     ? 'btn-primary' : 'btn-outline'}" onclick="window._cmdFiltre('en_cours')">En cours</button>
        <button class="btn ${filtreStatut==='receptionnee' ? 'btn-primary' : 'btn-outline'}" onclick="window._cmdFiltre('receptionnee')">Réceptionnées</button>
        <button class="btn ${filtreStatut==='annulee'      ? 'btn-primary' : 'btn-outline'}" onclick="window._cmdFiltre('annulee')">Annulées</button>
      </div>
      <div class="card" style="overflow-x:auto">
        <table class="table">
          <thead><tr>
            <th>Date</th><th>Fournisseur</th><th>N° commande</th><th>Description</th>
            <th style="text-align:right">Montant HT</th><th>Livraison prévue</th>
            <th>Statut</th><th>Facture d'achat liée</th><th></th>
          </tr></thead>
          <tbody>${rows}${emptyRow}</tbody>
        </table>
      </div>`;

    el.querySelector('#btnNouvelleCmd').onclick = () => DocEditor.openCommande();
  }

  window._cmdFiltre = (s) => { filtreStatut = s; reload(); };

  window.deleteCommande = async (id) => {
    if (!confirm('Supprimer cette commande ? Cette action est irréversible (le chaînage non bloquant avec une éventuelle facture d\'achat sera également retiré).')) return;
    await api.delete(`/api/commandes-fournisseurs/${id}`);
    reload();
  };

  // Chaînage non bloquant commande ↔ facture d'achat (le contenu de la
  // commande s'édite dans l'éditeur WYSIWYG, DocEditor.openCommande)
  window.lierCommandeFacture = async (id) => {
    const [commande, facturesAchat] = await Promise.all([
      api.get(`/api/commandes-fournisseurs/${id}`),
      api.get('/api/factures-fournisseurs'),
    ]);
    const factureOpts = (facturesAchat || []).map(f =>
      `<option value="${f.id}" ${commande.facture_fournisseur_id === f.id ? 'selected' : ''}>${f.numero} — ${f.fournisseur_nom} (${Number(f.montant_ttc).toFixed(2)} €)</option>`).join('');

    modal.show(`Facture d'achat liée — ${commande.numero}`, `
      <p style="color:var(--text-muted);font-size:13px;margin-top:0">Chaînage non bloquant : facultatif, modifiable à tout moment, sans incidence sur le scellement.</p>
      <div class="form-group">
        <select id="cmdLienFF">
          <option value="">— Aucune —</option>
          ${factureOpts}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-outline" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" id="btnLienOk">Enregistrer</button>
      </div>`, body => {
      body.querySelector('#btnLienOk').onclick = async () => {
        const v = body.querySelector('#cmdLienFF').value;
        const r = await api.put(`/api/commandes-fournisseurs/${id}`, { facture_fournisseur_id: v || null });
        if (r?.error) return alert(r.error);
        modal.hide();
        reload();
      };
    });
  };

  await reload();
}

// ── Lettrage ──────────────────────────────────────────────────────────────
async function renderLettrage(el) {
  el.innerHTML = `<div class="card"><p style="color:var(--text-muted)">Chargement…</p></div>`;

  const ecritures = await api.get('/api/lettrage') ?? [];

  // Grouper par client
  const byClient = {};
  for (const e of ecritures) {
    const key = e.client_nom ?? 'Sans client';
    if (!byClient[key]) byClient[key] = { nom: key, client_id: e.client_id, rows: [] };
    byClient[key].rows.push(e);
  }

  // Filtre client
  const clientNames = Object.keys(byClient).sort();
  let filtreClient = clientNames[0] ?? '';

  function renderTable() {
    const clients = byClient[filtreClient]?.rows ?? [];
    const nonLett = clients.filter(e => !e.ecriture_let);
    const lett    = clients.filter(e =>  e.ecriture_let);

    // Grouper les lettrées par lettre
    const byLet = {};
    for (const e of lett) {
      if (!byLet[e.ecriture_let]) byLet[e.ecriture_let] = [];
      byLet[e.ecriture_let].push(e);
    }

    const balNonLett = nonLett.reduce((s, e) => s + (+e.debit) - (+e.credit), 0);

    const rowNonLett = nonLett.map(e => `
      <tr>
        <td><input type="checkbox" class="let-chk" data-id="${e.id}"></td>
        <td>${e.ecriture_date}</td>
        <td>${e.journal_code}</td>
        <td>${e.ecriture_num}</td>
        <td>${e.facture_numero ?? ''}</td>
        <td>${e.ecriture_lib}</td>
        <td style="text-align:right">${(+e.debit).toFixed(2)}</td>
        <td style="text-align:right">${(+e.credit).toFixed(2)}</td>
      </tr>`).join('');

    const rowLett = Object.entries(byLet).map(([lettre, rows]) => {
      const rowsHtml = rows.map(e => `
        <tr>
          <td></td>
          <td>${e.ecriture_date}</td>
          <td>${e.journal_code}</td>
          <td>${e.ecriture_num}</td>
          <td>${e.facture_numero ?? ''}</td>
          <td>${e.ecriture_lib}</td>
          <td style="text-align:right">${(+e.debit).toFixed(2)}</td>
          <td style="text-align:right">${(+e.credit).toFixed(2)}</td>
        </tr>`).join('');
      return `
        <tr style="background:var(--primary-light)">
          <td colspan="8">
            <strong>Lettre ${lettre}</strong>
            — ${rows[0].date_let ?? ''}
            <button class="btn-sm" style="margin-left:8px;background:var(--danger);color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer"
              onclick="deLettrageAction('${lettre}')">Délettrer</button>
          </td>
        </tr>
        ${rowsHtml}`;
    }).join('');

    const thead = `<tr>
      <th style="width:32px"></th>
      <th>Date</th><th>Journal</th><th>N° écriture</th><th>Pièce</th>
      <th>Libellé</th><th style="text-align:right">Débit</th><th style="text-align:right">Crédit</th>
    </tr>`;

    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <h3 style="margin:0;flex:1">Lettrage — compte 411 Clients <span class="help-icon" data-tooltip="${helpTexts.lettrage.replace(/"/g,'&quot;')}">?</span></h3>
          <select id="letClientFilter" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px">
            ${clientNames.map(n => `<option value="${n}" ${n === filtreClient ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>

        ${nonLett.length ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <strong>Non lettrées</strong>
            <span style="color:var(--text-muted);font-size:13px">
              Solde non lettré : <strong style="color:${balNonLett > 0.005 ? 'var(--danger)' : 'var(--success)'}">${balNonLett.toFixed(2)} €</strong>
            </span>
          </div>
          <div style="overflow-x:auto;margin-bottom:8px">
            <table class="data-table" style="width:100%">
              <thead>${thead}</thead>
              <tbody id="letNonLettBody">${rowNonLett}</tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <button id="btnLettreSel" class="btn-primary" style="padding:6px 16px">
              ⚖️ Lettrer la sélection
            </button>
            <button id="btnLettreAll" class="btn-outline" style="padding:6px 16px">
              ✓ Tout lettrer (si équilibré)
            </button>
          </div>
        ` : `<p style="color:var(--success);font-weight:600;margin-bottom:20px">✓ Toutes les écritures sont lettrées</p>`}

        ${lett.length ? `
          <strong>Lettrées</strong>
          <div style="overflow-x:auto;margin-top:8px">
            <table class="data-table" style="width:100%">
              <thead>${thead}</thead>
              <tbody>${rowLett}</tbody>
            </table>
          </div>
        ` : ''}
      </div>`;
  }

  function refresh() { renderLettrage(el); }

  window.deLettrageAction = async (lettre) => {
    if (!confirm(`Délettrer la lettre ${lettre} ?`)) return;
    const ok = await api.delete(`/api/lettrage/${lettre}`);
    if (ok) refresh();
  };

  el.innerHTML = renderTable();

  // Filtre client
  el.querySelector('#letClientFilter')?.addEventListener('change', e => {
    filtreClient = e.target.value;
    el.innerHTML = renderTable();
    bindActions();
  });

  function bindActions() {
    el.querySelector('#letClientFilter')?.addEventListener('change', e => {
      filtreClient = e.target.value;
      el.innerHTML = renderTable();
      bindActions();
    });

    el.querySelector('#btnLettreSel')?.addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.let-chk:checked')].map(c => +c.dataset.id);
      if (!ids.length) return alert('Sélectionnez au moins deux écritures à lettrer.');
      const res = await api.post('/api/lettrage/lettrer', { ecriture_ids: ids });
      if (res?.lettre) { alert(`Lettre ${res.lettre} attribuée.`); refresh(); }
    });

    el.querySelector('#btnLettreAll')?.addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.let-chk')].map(c => +c.dataset.id);
      if (!ids.length) return;
      const res = await api.post('/api/lettrage/lettrer', { ecriture_ids: ids });
      if (res?.lettre) { alert(`Lettre ${res.lettre} attribuée.`); refresh(); }
    });
  }

  bindActions();
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

  const TABS = [
    { id: 'entreprise', label: 'Entreprise' },
    { id: 'documents',  label: 'Documents' },
    { id: 'email',      label: 'Email' },
    { id: 'auto',       label: 'Automatisations' },
    { id: 'sepa',       label: 'SEPA' },
    ...(currentUser?.is_super_admin ? [{ id: 'backup', label: 'Sauvegarde' }] : []),
    ...(can('users:r')              ? [{ id: 'users',   label: 'Utilisateurs' }] : []),
    ...(currentUser?.is_super_admin ? [{ id: 'societes', label: 'Sociétés' }] : []),
    ...(currentUser?.is_super_admin ? [{ id: 'maintenance', label: 'Maintenance BDD' }] : []),
    ...(currentUser?.is_super_admin ? [{ id: 'update',  label: 'Mises à jour' }] : []),
  ];

  let activeTab = localStorage.getItem('params_tab') ?? 'entreprise';
  if (!TABS.find(t => t.id === activeTab)) activeTab = 'entreprise';

  el.innerHTML = `
    <div style="display:flex;gap:0;flex-wrap:wrap;border-bottom:2px solid var(--border);margin-bottom:24px" id="paramsTabBar"></div>
    <div id="paramsContent"></div>`;

  function renderTabBar() {
    el.querySelector('#paramsTabBar').innerHTML = TABS.map(t => `
      <button data-tab="${t.id}" style="
        padding:9px 18px;border:none;background:none;cursor:pointer;font-size:14px;
        border-bottom:2px solid ${t.id === activeTab ? 'var(--primary)' : 'transparent'};
        margin-bottom:-2px;font-weight:${t.id === activeTab ? '600' : 'normal'};
        color:${t.id === activeTab ? 'var(--primary)' : 'var(--text-muted)'}">
        ${t.label}
      </button>`).join('');
  }

  function switchTab(id) {
    activeTab = id;
    localStorage.setItem('params_tab', id);
    renderTabBar();
    renderContent();
  }

  el.querySelector('#paramsTabBar').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  function save(extra = {}) {
    const base = {
      raison_sociale: entreprise.raison_sociale, forme_juridique: entreprise.forme_juridique,
      is_EI: entreprise.is_EI, siret: entreprise.siret, tva_intracom: entreprise.tva_intracom,
      adresse: entreprise.adresse, adresse2: entreprise.adresse2, code_postal: entreprise.code_postal,
      ville: entreprise.ville, pays: entreprise.pays, telephone: entreprise.telephone,
      email: entreprise.email, site_web: entreprise.site_web, regime_tva: entreprise.regime_tva,
      capital_social: entreprise.capital_social, rcs_ville: entreprise.rcs_ville,
      iban: entreprise.iban, bic: entreprise.bic, ics: entreprise.ics,
      cgv_texte: entreprise.cgv_texte, mention_legale: entreprise.mention_legale,
    };
    return api.post('/api/entreprise', { ...base, ...extra });
  }

  function alert2(el, msg, type = 'success') {
    el.innerHTML = `<div class="alert alert-${type}" style="margin-top:8px">${msg}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 2500);
  }

  // ── Onglet Entreprise ──────────────────────────────────────────────────
  function renderTabEntreprise(c) {
    c.innerHTML = `
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
          <label for="isEI" style="text-transform:none;margin:0">Entrepreneur individuel (mention "EI" automatique) <span class="help-icon" data-tooltip="${helpTexts.entreprise_forme_ei.replace(/"/g,'&quot;')}">?</span></label>
        </div>
        <div class="form-row">
          <div class="form-group"><label>SIRET *</label><input name="siret" value="${entreprise.siret || ''}" required/></div>
          <div class="form-group"><label>N° TVA Intracom</label><input name="tva_intracom" value="${entreprise.tva_intracom || ''}"/></div>
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
          <div class="form-group"><label>Régime TVA <span class="help-icon" data-tooltip="${helpTexts.entreprise_regime_tva.replace(/"/g,'&quot;')}">?</span></label>
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
        <div id="entAlert"></div>
        <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
      </form>
      <hr style="border:none;border-top:1px solid var(--border);margin:24px 0"/>
      <h3 style="margin-bottom:12px;color:var(--primary);font-size:15px">Logo</h3>
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
    </div>`;

    const entForm = c.querySelector('#entrepriseForm');
    attachSireneAutocomplete(entForm.querySelector('[name="raison_sociale"]'), entForm);
    attachNominatimAutocomplete(entForm.querySelector('[name="adresse"]'), entForm);
    entForm.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      data.is_EI = fd.has('is_EI');
      const updated = await api.post('/api/entreprise', data);
      if (updated) Object.assign(entreprise, updated);
      alert2(c.querySelector('#entAlert'), 'Paramètres enregistrés.');
    };

    c.querySelector('#logoBtn').onclick = () => c.querySelector('#logoInput').click();
    c.querySelector('#logoInput').onchange = async () => {
      const file = c.querySelector('#logoInput').files[0];
      if (!file) return;
      const fd = new FormData(); fd.append('logo', file);
      const data = await api.upload('/api/entreprise/logo', fd);
      if (data.logo_path) {
        entreprise.logo_path = data.logo_path;
        c.querySelector('#logoPreview').innerHTML =
          `<img src="${data.logo_path}?t=${Date.now()}" style="max-height:80px;max-width:220px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:8px;background:#fff"/>`;
        updateSidebarLogo(data.logo_path);
      }
    };
    const delBtn = c.querySelector('#logoDelBtn');
    if (delBtn) delBtn.onclick = async () => {
      await api.delete('/api/entreprise/logo');
      entreprise.logo_path = null;
      c.querySelector('#logoPreview').innerHTML = '<span style="color:var(--text-muted);font-size:13px">Aucun logo configuré</span>';
      delBtn.remove();
      updateSidebarLogo(null);
    };
  }

  // ── Onglet Documents ──────────────────────────────────────────────────
  function renderTabDocuments(c) {
    c.innerHTML = `
      <div class="card" style="max-width:680px">
        <h3 style="margin-bottom:8px;color:var(--primary)">CGV et mentions légales</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Ces textes apparaissent en bas de chaque devis et facture.</p>
        <form id="cgvForm">
          <div class="form-group"><label>Mention légale (ligne de titre)</label>
            <input name="mention_legale" value="${(entreprise.mention_legale||'').replace(/"/g,'&quot;')}" placeholder="Ex : Membre de la Chambre des Métiers — RCS Toulon B 000 000 000"/>
          </div>
          <div class="form-group"><label>CGV — Conditions Générales de Vente</label>
            <textarea name="cgv_texte" rows="6" placeholder="Article 1 — Sauf accord particulier…">${entreprise.cgv_texte||''}</textarea>
          </div>
          <div id="cgvAlert"></div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
        </form>
      </div>
      <div class="card" style="max-width:680px;margin-top:20px">
        <h3 style="margin-bottom:8px;color:var(--primary)">Mentions légales obligatoires (art. L441-9 et L441-10 CCom) <span class="help-icon" data-tooltip="${helpTexts.mentions_legales_paiement.replace(/"/g,'&quot;')}">?</span></h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Pré-remplies sur chaque nouvelle facture.</p>
        <form id="mentForm">
          <div class="form-row">
            <div class="form-group"><label>Pénalités de retard par défaut</label>
              <input name="penalites_defaut" value="${(entreprise.penalites_defaut||'Taux directeur BCE majoré de 10 points').replace(/"/g,'&quot;')}"/>
            </div>
            <div class="form-group"><label>Indemnité forfaitaire recouvrement (€)</label>
              <input name="indemnite_defaut" type="number" min="0" step="1" value="${entreprise.indemnite_defaut??40}" style="width:120px"/>
            </div>
          </div>
          <div class="form-group"><label>Escompte par défaut (%)</label>
            <input name="escompte_defaut" type="number" min="0" max="100" step="0.1" value="${entreprise.escompte_defaut??0}" style="width:120px"/>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">0 = "Pas d'escompte pour paiement anticipé"</span>
          </div>
          <div id="mentAlert"></div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
        </form>
      </div>`;
    c.querySelector('#cgvForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const updated = await save(data);
      if (updated) Object.assign(entreprise, updated);
      alert2(c.querySelector('#cgvAlert'), 'CGV enregistrées.');
    };
    c.querySelector('#mentForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const updated = await save(data);
      if (updated) Object.assign(entreprise, updated);
      alert2(c.querySelector('#mentAlert'), 'Enregistré.');
    };
  }

  // ── Onglet Email ──────────────────────────────────────────────────────
  function renderTabEmail(c) {
    const mode = entreprise.email_mode || 'mapi';
    c.innerHTML = `
      <div class="card" style="max-width:680px">
        <h3 style="margin-bottom:4px;color:var(--primary)">Configuration email</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Choisissez comment les emails sont envoyés.</p>
        <form id="smtpForm">
          <div class="form-group"><label>Mode d'envoi</label>
            <select name="email_mode" id="emailModeSelect">
              <option value="mapi"   ${mode === 'mapi'   ? 'selected' : ''}>MAPI — Ouvrir le client mail (Outlook, Thunderbird…)</option>
              <option value="mailto" ${mode === 'mailto' ? 'selected' : ''}>mailto: — Application mail (mobile, Gmail…)</option>
              <option value="smtp"   ${mode === 'smtp'   ? 'selected' : ''}>SMTP — Envoi automatique via serveur mail</option>
            </select>
          </div>
          <div id="smtpFields" style="${mode === 'smtp' ? '' : 'display:none'}">
            <div class="form-row">
              <div class="form-group"><label>Serveur SMTP</label>
                <input name="smtp_host" value="${entreprise.smtp_host || ''}" placeholder="smtp.gmail.com"/>
              </div>
              <div class="form-group"><label>Port</label>
                <input name="smtp_port" type="number" value="${entreprise.smtp_port || 587}"/>
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
          </div>
          <div id="smtpAlert"></div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
        </form>
      </div>`;
    c.querySelector('#emailModeSelect').onchange = function() {
      c.querySelector('#smtpFields').style.display = this.value === 'smtp' ? '' : 'none';
    };
    c.querySelector('#smtpForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      data.smtp_secure = fd.has('smtp_secure') ? 1 : 0;
      await api.post('/api/entreprise/smtp', data);
      alert2(c.querySelector('#smtpAlert'), 'Configuration enregistrée.');
    };
  }

  // ── Onglet Automatisations ────────────────────────────────────────────
  function renderTabAuto(c) {
    c.innerHTML = `
      <div class="card" style="max-width:680px">
        <h3 style="margin-bottom:8px;color:var(--primary)">Relances et notifications automatiques</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Envois automatiques par email liés aux échéances de factures.</p>
        <form id="relanceForm">
          <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px 16px;margin-bottom:16px">
            <legend style="font-weight:600;padding:0 6px;font-size:13px">Relances après échéance</legend>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
              <input type="checkbox" name="relance_auto_active" id="relanceActif" ${entreprise.relance_auto_active ? 'checked' : ''}/>
              Activer les relances automatiques
            </label>
            <div class="form-row">
              <div class="form-group"><label>Relancer après (jours de retard)</label>
                <input name="relance_auto_jours" type="number" min="1" max="365" value="${entreprise.relance_auto_jours ?? 15}" style="width:100px"/>
              </div>
              <div class="form-group"><label>Heure d'envoi quotidien</label>
                <input name="relance_auto_heure" type="time" value="${entreprise.relance_auto_heure || '08:00'}" style="width:120px"/>
              </div>
            </div>
          </fieldset>
          <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px 16px;margin-bottom:16px">
            <legend style="font-weight:600;padding:0 6px;font-size:13px">Rappels avant échéance</legend>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
              <input type="checkbox" name="notif_echeance_active" id="notifEcheanceActif" ${entreprise.notif_echeance_active ? 'checked' : ''}/>
              Envoyer un rappel avant la date d'échéance
            </label>
            <div class="form-row">
              <div class="form-group"><label>Rappeler (jours avant échéance)</label>
                <input name="notif_echeance_jours" type="number" min="1" max="30" value="${entreprise.notif_echeance_jours ?? 3}" style="width:100px"/>
              </div>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">Le rappel est envoyé une seule fois par facture, à l'heure configurée ci-dessus.</p>
          </fieldset>
          <div id="relanceAlert"></div>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </form>
      </div>`;
    c.querySelector('#relanceForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      data.relance_auto_active   = c.querySelector('#relanceActif')?.checked ? 1 : 0;
      data.notif_echeance_active = c.querySelector('#notifEcheanceActif')?.checked ? 1 : 0;
      await api.post('/api/entreprise/relances', data);
      alert2(c.querySelector('#relanceAlert'), 'Enregistré.');
    };
  }

  // ── Onglet SEPA ───────────────────────────────────────────────────────
  function renderTabSepa(c) {
    c.innerHTML = `
      <div class="card" style="max-width:680px">
        <h3 style="margin-bottom:8px;color:var(--primary)">Prélèvement SEPA</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
          Informations de votre société en tant que créancier SEPA. L'ICS vous est fourni par votre banque.
        </p>
        <form id="sepaForm">
          <div class="form-row">
            <div class="form-group"><label>IBAN de votre société</label>
              <input name="iban" value="${entreprise.iban || ''}" placeholder="FR76 0000 0000 0000 0000 0000 000" style="font-family:monospace"/>
            </div>
            <div class="form-group"><label>BIC de votre banque</label>
              <input name="bic" value="${entreprise.bic || ''}" placeholder="BNPAFRPPXXX"/>
            </div>
          </div>
          <div class="form-group"><label>ICS — Identifiant Créancier SEPA</label>
            <input name="ics" value="${entreprise.ics || ''}" placeholder="FR12ZZZ123456" style="font-family:monospace"/>
            <small style="color:var(--text-muted)">Fourni par votre banque. Format : 2 lettres pays + 2 chiffres + 3 lettres + 6 chiffres</small>
          </div>
          <div id="sepaAlert"></div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Enregistrer</button>
        </form>
      </div>`;
    c.querySelector('#sepaForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const updated = await save(data);
      if (updated) Object.assign(entreprise, updated);
      alert2(c.querySelector('#sepaAlert'), 'Informations SEPA enregistrées.');
    };
  }

  // ── Onglet Sauvegarde ─────────────────────────────────────────────────
  function renderTabBackup(c) {
    const isSA = currentUser?.is_super_admin;
    c.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px;max-width:680px">

        <!-- Sauvegarde par société -->
        <div class="card">
          <h3 style="margin-bottom:8px;color:var(--primary)">Sauvegarde de ma société</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
            Exporte uniquement les données de votre société (clients, devis, factures, articles,
            écritures FEC, journal de scellement…) au format JSON compressé.
          </p>
          <button id="backupSocieteBtn" class="btn btn-primary">⬇ Sauvegarder la société</button>
          ${isSA ? `
          <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">
            <strong>Restaurer sur la même instance</strong> — Les lignes déjà présentes (même ID) sont conservées,
            les données manquantes sont insérées. Idéal après perte partielle de données.
          </p>
          <label class="btn btn-secondary" style="margin-top:6px;cursor:pointer">
            ⬆ Restaurer (même instance)
            <input type="file" id="restoreSocieteInput" accept=".json.gz,.gz" style="display:none" data-mode="skip"/>
          </label>
          <p style="font-size:13px;color:var(--text-muted);margin-top:12px;margin-bottom:4px">
            <strong>Importer depuis une autre instance</strong> — Tous les IDs sont réattribués pour
            éviter toute collision avec les sociétés existantes. Utiliser pour migrer une société
            d'un autre serveur FacturPro.
          </p>
          <label class="btn btn-secondary" style="margin-top:6px;cursor:pointer">
            ⬆ Importer (cross-instance)
            <input type="file" id="restoreSocieteRemapInput" accept=".json.gz,.gz" style="display:none" data-mode="remap"/>
          </label>
          <div id="restoreSocieteAlert"></div>` : ''}
        </div>

        <!-- Sauvegarde complète (super_admin) -->
        ${isSA ? `
        <div class="card">
          <h3 style="margin-bottom:8px;color:var(--primary)">Sauvegarde complète</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
            Sauvegarde intégrale de la base de données (toutes sociétés) au format SQL compressé (.sql.gz).
          </p>
          <button id="backupBtn" class="btn btn-secondary">⬇ Sauvegarder toutes les sociétés (sauvegarde complète)</button>
          <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">
            Restaurer à partir d'un fichier (.sql ou .sql.gz).<br/>
            <strong style="color:#c0392b">⚠ Toutes les données actuelles seront remplacées.</strong>
          </p>
          <label class="btn btn-secondary" style="margin-top:8px;cursor:pointer">
            ⬆ Restaurer une sauvegarde complète
            <input type="file" id="restoreInput" accept=".sql,.sql.gz,.gz" style="display:none"/>
          </label>
          <div id="restoreAlert"></div>
        </div>` : ''}

      </div>
      <div id="backupAutoSection" style="margin-top:20px"></div>`;

    // ── Sauvegarde société ──
    c.querySelector('#backupSocieteBtn').onclick = async () => {
      const token = localStorage.getItem('jwt');
      const r = await fetch('/api/backup/societe/telecharger', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { alert('Erreur lors du téléchargement'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `societe_${new Date().toISOString().slice(0,10)}.json.gz`;
      a.click(); URL.revokeObjectURL(url);
    };

    // ── Restauration société (super_admin) ──
    if (isSA) {
      const doRestoreSociete = async function(inputEl, mode) {
        const file = inputEl.files[0]; if (!file) return;
        const alertEl = c.querySelector('#restoreSocieteAlert');
        const modeLabel = mode === 'remap'
          ? 'Importer depuis une autre instance : tous les IDs seront réassignés.\nLes données de votre instance ne seront pas écrasées.'
          : 'Restaurer sur la même instance : les données déjà présentes (même ID) seront conservées.\nLes données manquantes seront insérées.';
        if (!confirm(`${modeLabel}\n\nFichier : "${file.name}"\n\nContinuer ?`)) { inputEl.value = ''; return; }
        alertEl.innerHTML = '<div class="alert" style="margin-top:8px">Restauration en cours…</div>';
        try {
          const fd = new FormData(); fd.append('backup', file);
          const data = await api.upload(`/api/backup/societe/restaurer?mode=${mode}`, fd);
          if (data.ok) {
            const modeInfo = data.mode === 'remap' ? ' (IDs réattribués)' : '';
            alertEl.innerHTML = `<div class="alert alert-success" style="margin-top:8px">
              Restauration réussie${modeInfo} — <strong>${data.raison_sociale}</strong><br/>
              ${data.inserted} lignes insérées, ${data.skipped} ignorées (déjà présentes).
            </div>`;
          } else {
            alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur : ${data.error}</div>`;
          }
        } catch(e) { alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur réseau.</div>`; }
        inputEl.value = '';
      };
      c.querySelector('#restoreSocieteInput').onchange = function() { doRestoreSociete(this, 'skip'); };
      c.querySelector('#restoreSocieteRemapInput').onchange = function() { doRestoreSociete(this, 'remap'); };

      // ── Sauvegarde complète ──
      c.querySelector('#backupBtn').onclick = async () => {
        const token = localStorage.getItem('jwt');
        const r = await fetch('/api/backup/telecharger', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) { alert('Erreur lors du téléchargement'); return; }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `sauvegarde_${new Date().toISOString().slice(0,10)}.sql.gz`;
        a.click(); URL.revokeObjectURL(url);
      };

      // ── Restauration complète ──
      c.querySelector('#restoreInput').onchange = async function() {
        const file = this.files[0]; if (!file) return;
        const alertEl = c.querySelector('#restoreAlert');
        if (!confirm(`Restaurer "${file.name}" ?\n\nToutes les données actuelles seront écrasées.`)) { this.value = ''; return; }
        alertEl.innerHTML = '<div class="alert" style="margin-top:8px">Restauration en cours…</div>';
        try {
          const fd = new FormData(); fd.append('backup', file);
          const data = await api.upload('/api/backup/restaurer', fd);
          if (data.ok) {
            alertEl.innerHTML = '<div class="alert alert-success" style="margin-top:8px">Restauration réussie. Rechargement…</div>';
            setTimeout(() => location.reload(), 1500);
          } else {
            alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur : ${data.error}</div>`;
          }
        } catch(e) { alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">Erreur réseau.</div>`; }
        this.value = '';
      };
    }

    renderBackupAuto(c.querySelector('#backupAutoSection'));
  }

  // ── Dispatch ──────────────────────────────────────────────────────────
  function renderContent() {
    const c = el.querySelector('#paramsContent');
    switch(activeTab) {
      case 'entreprise': renderTabEntreprise(c); break;
      case 'documents':  renderTabDocuments(c);  break;
      case 'email':      renderTabEmail(c);       break;
      case 'auto':       renderTabAuto(c);        break;
      case 'sepa':       renderTabSepa(c);        break;
      case 'backup':     renderTabBackup(c);      break;
      case 'users':      renderUtilisateurs(c);   break;
      case 'societes':   renderSocietes(c);       break;
      case 'maintenance': renderTabMaintenance(c); break;
      case 'update':     renderTabUpdate(c);      break;
    }
  }

  renderTabBar();
  renderContent();
}

// ── Maintenance base de données (super_admin) ────────────────────────────
function renderTabMaintenance(c) {
  c.innerHTML = `
    <div class="card" style="max-width:680px">
      <h3 style="margin-bottom:8px;color:var(--primary)">Maintenance de la base de données</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">
        Ces opérations sont normalement exécutées automatiquement en arrière-plan par PostgreSQL
        (processus <code>autovacuum</code>). Les lancer manuellement ne présente aucun risque pour
        vos données — elles ne modifient ni ne suppriment aucune donnée métier — mais peuvent
        ralentir temporairement l'application, voire la rendre indisponible quelques instants pour
        certaines options. À privilégier en dehors des heures d'utilisation.
      </p>

      <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
        <h4 style="margin:0 0 6px">VACUUM — Nettoyage de l'espace disque</h4>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">
          Récupère l'espace disque laissé par les lignes supprimées ou modifiées au fil du temps
          (PostgreSQL ne les efface pas immédiatement, par conception). Utile après une grosse
          suppression de données pour limiter le « gonflement » (bloat) des tables.
        </p>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:13px;margin:0 0 12px;font-weight:normal;text-transform:none">
          <input type="checkbox" id="vacuumFull" style="width:auto;margin-top:2px"/>
          <span>
            <strong>Mode complet — FULL</strong> (option « forcer ») : réécrit entièrement les
            tables pour récupérer le maximum d'espace possible (au lieu d'un nettoyage léger en
            arrière-plan). <strong>Beaucoup plus efficace mais beaucoup plus lourd</strong> : verrouille
            les tables concernées pendant toute la durée de l'opération — l'application sera
            indisponible le temps du traitement. À réserver aux cas où l'espace disque devient
            réellement critique, en dehors des heures d'utilisation.
          </span>
        </label>
        <button id="btnVacuum" class="btn btn-outline">Lancer le nettoyage (VACUUM)</button>
        <span id="vacuumResult" style="margin-left:10px;font-size:13px"></span>
      </div>

      <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
        <h4 style="margin:0 0 6px">ANALYZE — Mise à jour des statistiques</h4>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px">
          Recalcule les statistiques que PostgreSQL utilise pour choisir le plan d'exécution le
          plus rapide pour vos requêtes. Utile après un import ou une suppression importante de
          données pour que l'application reste réactive. Opération légère, sans verrouillage notable.
        </p>
        <button id="btnAnalyze" class="btn btn-outline">Lancer la mise à jour des statistiques (ANALYZE)</button>
        <span id="analyzeResult" style="margin-left:10px;font-size:13px"></span>
      </div>

      <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
        <h4 style="margin:0 0 6px">REINDEX — Reconstruction des index</h4>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px">
          Reconstruit tous les index de la base à neuf. Utile si une recherche ou un tri devient
          anormalement lent (signe d'un index « boursouflé » ou abîmé), ou après une suppression
          massive de données. <strong>Opération lourde</strong> : verrouille les tables concernées
          pendant la reconstruction — l'application sera indisponible le temps du traitement. À
          réserver à un usage ponctuel, en dehors des heures d'utilisation.
        </p>
        <button id="btnReindex" class="btn btn-outline">Lancer la reconstruction des index (REINDEX)</button>
        <span id="reindexResult" style="margin-left:10px;font-size:13px"></span>
      </div>
    </div>`;

  const wire = (btnId, resultId, run, label, getConfirmMsg) => {
    const btn = c.querySelector(`#${btnId}`);
    const result = c.querySelector(`#${resultId}`);
    btn.onclick = async () => {
      const confirmMsg = getConfirmMsg ? getConfirmMsg() : null;
      if (confirmMsg && !confirm(confirmMsg)) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = `${label} en cours…`;
      result.textContent = '';
      try {
        const r = await run();
        if (r?.error) {
          result.innerHTML = `<span style="color:#DC2626">Erreur : ${r.error}</span>`;
        } else {
          const secondes = (r.duree_ms / 1000).toFixed(1);
          result.innerHTML = `<span style="color:#16a34a">✓ Terminé en ${secondes} s</span>`;
        }
      } catch (e) {
        result.innerHTML = `<span style="color:#DC2626">Erreur réseau.</span>`;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };
  };

  const fullCheckbox = c.querySelector('#vacuumFull');

  wire('btnVacuum', 'vacuumResult',
    () => api.post('/api/maintenance/vacuum', { full: fullCheckbox.checked }),
    'Nettoyage',
    () => fullCheckbox.checked
      ? 'Le mode complet (FULL) va verrouiller les tables et rendre l\'application indisponible le temps du traitement. Continuer ?'
      : null);

  wire('btnAnalyze', 'analyzeResult',
    () => api.post('/api/maintenance/analyze', {}),
    'Mise à jour des statistiques', null);

  wire('btnReindex', 'reindexResult',
    () => api.post('/api/maintenance/reindex', {}),
    'Reconstruction des index',
    () => 'La reconstruction des index va verrouiller les tables et rendre l\'application indisponible le temps du traitement. Continuer ?');
}

// ── Mises à jour (super_admin) ────────────────────────────────────────────
async function renderTabUpdate(c) {
  c.innerHTML = `
    <div class="card" style="max-width:580px">
      <h3 style="margin-bottom:8px;color:var(--primary)">Mises à jour</h3>
      <p id="updateStatus" style="font-size:13px;color:var(--text-muted)">Vérification en cours…</p>
      <div id="updateContent"></div>
    </div>`;

  const info = await api.get('/api/update/check');
  const status = c.querySelector('#updateStatus');
  const content = c.querySelector('#updateContent');

  if (!info || info.error) {
    status.textContent = info?.error ?? 'Impossible de vérifier les mises à jour.';
    return;
  }

  if (!info.update_available) {
    status.innerHTML = `<span style="color:var(--success,#16a34a)">✓ FacturPro est à jour</span> — version ${info.current_version}`;
    return;
  }

  const isLight = info.update_type === 'light';
  const typeLabel = isLight
    ? `<span style="background:#dcfce7;color:#166534;font-size:11px;padding:2px 7px;border-radius:10px;font-weight:600;vertical-align:middle">Patch léger</span>`
    : `<span style="background:#dbeafe;color:#1e40af;font-size:11px;padding:2px 7px;border-radius:10px;font-weight:600;vertical-align:middle">Mise à jour complète</span>`;
  const typeHint = isLight
    ? 'Mise à jour du code uniquement — redémarrage en quelques secondes.'
    : 'Mise à jour complète (dépendances, migrations) — redémarrage en ~30 secondes.';
  const countdownStart = isLight ? 22 : 36;

  status.innerHTML = `Version actuelle : <strong>${info.current_version}</strong>${info.install_dir ? ` <span style="font-size:11px;color:var(--text-muted)">(${info.install_dir})</span>` : ''}`;
  content.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:12px">
      <p style="font-size:14px;margin:0 0 8px">
        Nouvelle version disponible : <strong style="color:var(--primary)">${info.latest_version}</strong>
        ${typeLabel}
        ${info.published_at ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px">${fmt.date(info.published_at)}</span>` : ''}
      </p>
      ${info.release_notes ? `<pre style="font-size:12px;white-space:pre-wrap;color:var(--text-muted);max-height:180px;overflow-y:auto;margin:8px 0 0;padding:0">${info.release_notes.substring(0, 1000)}</pre>` : ''}
    </div>
    ${!info.asset_available ? `<div class="alert alert-warning" style="margin-top:12px">Aucun asset de mise à jour disponible dans la release GitHub.</div>` : `
    <div style="margin-top:16px">
      <button id="applyUpdateBtn" class="btn btn-primary">⬆ Installer v${info.latest_version}</button>
      <p style="font-size:12px;color:var(--text-muted);margin-top:6px">${typeHint}</p>
    </div>`}
    <div id="updateApplyAlert"></div>`;

  const applyBtn = content.querySelector('#applyUpdateBtn');
  if (!applyBtn) return;

  applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Téléchargement en cours…';
    const r = await api.post('/api/update/apply', {});
    const alertEl = content.querySelector('#updateApplyAlert');
    if (r.error) {
      applyBtn.disabled = false;
      applyBtn.textContent = `⬆ Installer v${info.latest_version}`;
      alertEl.innerHTML = `<div class="alert alert-danger" style="margin-top:8px">${r.error}</div>`;
      return;
    }
    applyBtn.textContent = 'Installation en cours…';
    alertEl.innerHTML = `<div class="alert alert-success" style="margin-top:8px">${r.message}</div>`;
    let s = countdownStart;
    const iv = setInterval(() => {
      s--;
      applyBtn.textContent = `Reconnexion dans ${s}s…`;
      if (s <= 0) { clearInterval(iv); location.reload(); }
    }, 1000);
  };
}

async function checkUpdateBadge() {
  if (!currentUser?.is_super_admin) return;
  try {
    const info = await api.get('/api/update/check');
    if (info?.update_available) {
      const badge = document.getElementById('badge-update');
      if (badge) badge.style.display = '';
    }
  } catch {}
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
              ${s.id === currentUser.entreprise_id ? '' : `<button class="btn btn-outline btn-sm" style="color:#e74c3c;border-color:#e74c3c" onclick="confirmerSuppressionSociete(${s.id})">Supprimer</button>`}
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

// ── Suppression d'une société (super_admin, assistant à étapes) ──────────
async function confirmerSuppressionSociete(societeId) {
  const all = await api.get('/api/entreprise/all');
  const societe = Array.isArray(all) ? all.find(x => x.id === societeId) : null;
  if (!societe) return;
  let etape = 1;

  const render = () => {
    let html = '';
    if (etape === 1) {
      html = `
        <div class="alert alert-danger" style="font-weight:600">
          Vous vous apprêtez à supprimer définitivement la société <u>${societe.raison_sociale}</u>.
        </div>
        <p>Cette opération supprimera <strong>irréversiblement</strong> toutes les données associées :
        clients, articles, devis, factures, acomptes, bons de livraison, écritures comptables, etc.</p>
        <p>Si cette société a déjà émis ou scellé des documents fiscaux, la suppression sera
        <strong>refusée</strong> par la base de données afin de respecter l'obligation légale de
        conservation pendant 10 ans (cette protection ne peut pas être contournée).</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
          <button type="button" class="btn btn-danger" id="suppEtapeSuivante1">Continuer</button>
        </div>`;
    } else if (etape === 2) {
      html = `
        <p>Avant toute suppression, le serveur génère <strong>automatiquement et obligatoirement</strong>
        une sauvegarde complète de la société (toutes ses tables, son journal de scellement, ses archives,
        son logo) au format gzip, enregistrée dans <code>storage/backups_societes/</code> sur le serveur.</p>
        <p>Cette sauvegarde est créée systématiquement, même en cas d'échec ultérieur de la suppression —
        elle ne peut pas être ignorée.</p>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin-top:10px">
          <input type="checkbox" id="suppAckBackup"/>
          <span>Je comprends qu'une sauvegarde sera créée automatiquement avant toute suppression et je
          souhaite continuer.</span>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
          <button type="button" class="btn btn-danger" id="suppEtapeSuivante2" disabled>Continuer</button>
        </div>`;
    } else {
      html = `
        <p>Confirmation finale — saisissez exactement la raison sociale <strong>${societe.raison_sociale}</strong>
        pour valider la suppression définitive :</p>
        <div class="form-group"><input type="text" id="suppNomSaisi" autocomplete="off" placeholder="${societe.raison_sociale}"/></div>
        <div id="suppFinalAlert"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn btn-outline" onclick="modal.close()">Annuler</button>
          <button type="button" class="btn btn-danger" id="suppValiderFinal" disabled>Supprimer définitivement</button>
        </div>`;
    }

    modal.show('Suppression d\'une société', html, body => {
      if (etape === 1) {
        body.querySelector('#suppEtapeSuivante1').onclick = () => { etape = 2; render(); };
      } else if (etape === 2) {
        const ack = body.querySelector('#suppAckBackup');
        const next = body.querySelector('#suppEtapeSuivante2');
        ack.onchange = () => { next.disabled = !ack.checked; };
        next.onclick = () => { etape = 3; render(); };
      } else {
        const input = body.querySelector('#suppNomSaisi');
        const btn   = body.querySelector('#suppValiderFinal');
        input.oninput = () => { btn.disabled = input.value !== societe.raison_sociale; };
        btn.onclick = async () => {
          btn.disabled = true;
          btn.textContent = 'Suppression en cours…';
          try {
            const resp = await fetch(`/api/entreprise/${societe.id}`, {
              method: 'DELETE',
              headers: api._headers(),
              body: JSON.stringify({ confirmation_nom: input.value }),
            });
            const r = await resp.json();
            if (r?.error) {
              body.querySelector('#suppFinalAlert').innerHTML = `<div class="alert alert-danger">${r.error}</div>`;
              btn.disabled = false;
              btn.textContent = 'Supprimer définitivement';
            } else {
              modal.close();
              tabMgr.openViewTab('parametres');
            }
          } catch (e) {
            body.querySelector('#suppFinalAlert').innerHTML = `<div class="alert alert-danger">Erreur réseau lors de la suppression.</div>`;
            btn.disabled = false;
            btn.textContent = 'Supprimer définitivement';
          }
        };
      }
    });
  };

  render();
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
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.75);margin-bottom:8px;cursor:pointer">
      <input type="checkbox" ${aideContextuelleActive()?'checked':''} onchange="toggleAideContextuelle(this.checked)">
      Afficher les bulles d'aide (?)
    </label>
    <button class="btn btn-outline btn-sm" style="width:100%" onclick="logout()">Déconnexion</button>
  `;

  // Masquer les éléments de navigation sans permission
  document.querySelectorAll('.nav-item[data-perm]').forEach(el => {
    el.style.display = can(el.dataset.perm) ? '' : 'none';
  });
  // Masquer un groupe entier si plus aucun de ses éléments n'est visible
  document.querySelectorAll('.nav-group').forEach(grp => {
    const hasVisible = [...grp.querySelectorAll('.nav-item')].some(el => el.style.display !== 'none');
    grp.style.display = hasVisible ? '' : 'none';
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
        const role = ue?.role ?? 'lecteur';
        const voirTout = !!ue?.voir_tout;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <input type="checkbox" name="ent_${e.id}" id="ent_${e.id}" ${ue ? 'checked' : ''}
            onchange="document.getElementById('role_${e.id}').disabled=!this.checked;document.getElementById('vt_${e.id}').disabled=!this.checked||document.getElementById('role_${e.id}').value!=='commercial'"/>
          <label for="ent_${e.id}" style="flex:1">${e.raison_sociale}</label>
          <select name="role_${e.id}" id="role_${e.id}" ${ue ? '' : 'disabled'} style="width:120px"
            onchange="document.getElementById('vt_${e.id}').disabled=this.value!=='commercial';if(this.value!=='commercial')document.getElementById('vt_${e.id}').checked=false">${
            roleOptions.replace(`"${role}"`, `"${role}" selected`)
          }</select>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;color:var(--text-muted)"${helpAttr('user_voir_tout')}>
            <input type="checkbox" name="vt_${e.id}" id="vt_${e.id}" ${voirTout ? 'checked' : ''} ${(!ue || role !== 'commercial') ? 'disabled' : ''}/>
            Accès complet
          </label>
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
          .map(e => ({ entreprise_id: e.id, role: fd.get(`role_${e.id}`) || 'lecteur', voir_tout: fd.has(`vt_${e.id}`) })),
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
  appliquerAideContextuelle();
  updateUserUI();
  api.get('/api/entreprise').then(e => { if (e?.logo_path) updateSidebarLogo(e.logo_path); });
  checkUpdateBadge();
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
    case 'devis':                 await DocEditor.openDevis(id);        break;
    case 'facture': case 'avoir': await DocEditor.openFacture(id);      break;
    case 'bl':                    await DocEditor.openBL(id);           break;
    case 'acompte':               await DocEditor.openAcompte(id);      break;
    case 'commande':              await DocEditor.openCommande(id);     break;
    case 'facture-achat':         await DocEditor.openFactureAchat(id); break;
    default: break;
  }
}

initApp();
