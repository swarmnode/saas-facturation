// ── Composants réutilisables ──────────────────────────────────────────────

/**
 * SearchSelect — champ de recherche filtrant avec dropdown et option "Créer"
 *
 * Usage :
 *   const sel = SearchSelect(containerEl, {
 *     items:       tableau d'objets,
 *     labelFn:     item => string  (texte affiché dans la liste),
 *     valueFn:     item => any     (valeur retournée à la sélection),
 *     placeholder: 'Rechercher…',
 *     initialValue: valeur pré-selectionnée (optionnel),
 *     onSelect:    (item, value) => void,
 *     createLabel: '+ Nouveau…'  (optionnel, si omis pas d'option de création),
 *     onCreate:    () => void    (appelé si l'utilisateur clique sur "Créer"),
 *     align:       'left' | 'right'  (alignement du dropdown, défaut 'left'),
 *     maxItems:    30,           (nombre max dans la liste, défaut 50),
 *   });
 *
 *   sel.getValue()        → valeur sélectionnée
 *   sel.getItem()         → objet sélectionné
 *   sel.setValue(val)     → sélectionner par valeur
 *   sel.setItems(items)   → mettre à jour la liste
 *   sel.clear()           → vider la sélection
 *   sel.input             → l'élément <input> de saisie
 */
function SearchSelect(container, opts = {}) {
  const {
    items       = [],
    labelFn     = x => String(x),
    valueFn     = x => x,
    placeholder = 'Rechercher…',
    initialValue,
    onSelect,
    createLabel,
    onCreate,
    align    = 'left',
    maxItems = 50,
  } = opts;

  let _items    = items;
  let _selected = null; // { item, value, label }

  // ── DOM ──────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <input  class="ss-input"  type="text" placeholder="${placeholder}" autocomplete="off">
    <input  class="ss-value"  type="hidden">
    <div    class="ss-drop ss-drop-${align}" style="display:none"></div>`;

  const input = container.querySelector('.ss-input');
  const hidden = container.querySelector('.ss-value');
  const drop   = container.querySelector('.ss-drop');

  // ── Helpers ──────────────────────────────────────────────────────────────
  function filter(q) {
    const lq = q.toLowerCase();
    return lq.length === 0
      ? _items.slice(0, maxItems)
      : _items.filter(it => labelFn(it).toLowerCase().includes(lq)).slice(0, maxItems);
  }

  function select(item) {
    _selected = { item, value: valueFn(item), label: labelFn(item) };
    input.value  = _selected.label;
    hidden.value = _selected.value;
    drop.style.display = 'none';
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    if (onSelect) onSelect(item, _selected.value);
  }

  function renderDrop(q = '') {
    const matched = filter(q);
    drop.innerHTML = '';

    if (matched.length === 0 && !createLabel) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'Aucun résultat';
      drop.appendChild(empty);
    }

    matched.forEach(item => {
      const d = document.createElement('div');
      d.className = 'ss-item';
      d.textContent = labelFn(item);
      if (_selected && valueFn(item) == _selected.value) d.classList.add('ss-item-active');
      d.addEventListener('mousedown', (e) => { e.preventDefault(); select(item); });
      drop.appendChild(d);
    });

    if (createLabel) {
      const sep = document.createElement('div');
      sep.className = 'ss-sep';
      drop.appendChild(sep);
      const cr = document.createElement('div');
      cr.className = 'ss-create';
      cr.textContent = createLabel;
      cr.addEventListener('mousedown', (e) => {
        e.preventDefault();
        drop.style.display = 'none';
        if (onCreate) onCreate();
      });
      drop.appendChild(cr);
    }

    drop.style.display = 'block';
  }

  // ── Events ───────────────────────────────────────────────────────────────
  input.addEventListener('focus', () => renderDrop(input.value));
  input.addEventListener('input', () => {
    _selected = null;
    hidden.value = '';
    renderDrop(input.value);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { drop.style.display = 'none'; }, 150);
    // Si l'utilisateur a tapé mais n'a rien sélectionné, remettre le label précédent
    if (!hidden.value && _selected) {
      input.value  = _selected.label;
      hidden.value = _selected.value;
    }
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { drop.style.display = 'none'; input.blur(); }
    if (e.key === 'Enter') {
      const first = drop.querySelector('.ss-item');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
      e.preventDefault();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  if (initialValue !== undefined && initialValue !== null && initialValue !== '') {
    const found = _items.find(it => valueFn(it) == initialValue);
    if (found) select(found);
  }

  // ── API publique ─────────────────────────────────────────────────────────
  return {
    getValue:  ()       => hidden.value,
    getItem:   ()       => _selected?.item ?? null,
    setValue:  (val)    => {
      const found = _items.find(it => valueFn(it) == val);
      if (found) select(found); else { input.value = ''; hidden.value = ''; _selected = null; }
    },
    setItems:  (newItems) => { _items = newItems; },
    clear:     ()       => { input.value = ''; hidden.value = ''; _selected = null; },
    input,
    hidden,
  };
}
