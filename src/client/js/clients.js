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

