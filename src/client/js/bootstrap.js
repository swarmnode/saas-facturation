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

// ── Recherche globale ─────────────────────────────────────────────────────
const SEARCH_TYPE_INFO = {
  devis:                   { icon: '📝', label: 'Devis' },
  factures:                { icon: '🧾', label: 'Factures' },
  'bons-livraison':        { icon: '🚚', label: 'Bons de livraison' },
  acomptes:                { icon: '💰', label: 'Acomptes' },
  clients:                 { icon: '👤', label: 'Clients' },
  articles:                { icon: '📦', label: 'Articles' },
  'commandes-fournisseurs':  { icon: '📑', label: 'Commandes fournisseurs' },
  'factures-fournisseurs':   { icon: '📥', label: "Factures d'achats" },
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function closeSearchDropdown() {
  const drop = document.getElementById('searchDropdown');
  if (!drop) return;
  drop.classList.remove('open');
  drop.innerHTML = '';
}

async function openSearchResult(type, id) {
  closeSearchDropdown();
  const input = document.getElementById('searchInput');
  if (input) input.blur();
  switch (type) {
    case 'devis':                    await DocEditor.openDevis(id);       break;
    case 'factures':                 await DocEditor.openFacture(id);     break;
    case 'bons-livraison':           await DocEditor.openBL(id);          break;
    case 'acomptes':                 await DocEditor.openAcompte(id);     break;
    case 'clients':                  await showClientMouvements(id);      break;
    case 'articles':                 await showArticleFiche(id);          break;
    case 'commandes-fournisseurs':   await DocEditor.openCommande(id);    break;
    case 'factures-fournisseurs':    await DocEditor.openFactureAchat(id); break;
  }
}
window.openSearchResult = openSearchResult;

function renderSearchDropdown(results) {
  const drop = document.getElementById('searchDropdown');
  if (!drop) return;

  if (results.length === 0) {
    drop.innerHTML = '<div class="search-empty">Aucun résultat</div>';
  } else {
    let html = '';
    let lastType = null;
    for (const r of results) {
      if (r.type !== lastType) {
        const info = SEARCH_TYPE_INFO[r.type] || { icon: '•', label: r.type };
        html += `<div class="search-group-label">${escapeHtml(info.label)}</div>`;
        lastType = r.type;
      }
      const info = SEARCH_TYPE_INFO[r.type] || { icon: '•', label: r.type };
      html += `<div class="search-item" data-type="${r.type}" data-id="${r.id}">
        <span class="search-item-icon">${info.icon}</span>
        <div class="search-item-body">
          <div class="search-item-label">${escapeHtml(r.label)}</div>
          <div class="search-item-sub">${escapeHtml(r.sub)}</div>
        </div>
      </div>`;
    }
    drop.innerHTML = html;
    drop.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        openSearchResult(el.dataset.type, Number(el.dataset.id));
      });
    });
  }
  drop.classList.add('open');
}

function initGlobalSearch() {
  const input = document.getElementById('searchInput');
  const drop  = document.getElementById('searchDropdown');
  const wrap  = document.getElementById('searchWrap');
  if (!input || !drop || !wrap) return;

  let debounce = null;
  let activeIndex = -1;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    activeIndex = -1;
    if (q.length < 2) { closeSearchDropdown(); return; }
    drop.innerHTML = '<div class="search-loading">Recherche…</div>';
    drop.classList.add('open');
    debounce = setTimeout(async () => {
      try {
        const results = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
        activeIndex = -1;
        renderSearchDropdown(Array.isArray(results) ? results : []);
      } catch (e) { closeSearchDropdown(); }
    }, 250);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2 && drop.innerHTML) drop.classList.add('open');
  });

  input.addEventListener('keydown', e => {
    const items = drop.querySelectorAll('.search-item');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      const el = items[activeIndex];
      openSearchResult(el.dataset.type, Number(el.dataset.id));
    } else if (e.key === 'Escape') {
      closeSearchDropdown();
    }
  });

  input.addEventListener('blur', () => setTimeout(closeSearchDropdown, 150));
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) closeSearchDropdown(); });
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
  initGlobalSearch();
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
