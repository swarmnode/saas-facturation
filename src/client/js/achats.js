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

// Envoi du bon de commande au fournisseur — modale partagée liste + éditeur,
// email pré-rempli depuis la fiche fournisseur si la commande y est liée
window.envoyerCommande = async (id) => {
  const commande = await api.get(`/api/commandes-fournisseurs/${id}`);
  if (!commande?.id) return;
  let emailDefaut = '';
  if (commande.fournisseur_id) {
    const fournisseurs = await api.get('/api/fournisseurs') ?? [];
    emailDefaut = fournisseurs.find(f => f.id === commande.fournisseur_id)?.email || '';
  }
  modal.show(`Envoyer ${commande.numero}`, `
    <div class="form-group"><label>Email du fournisseur</label>
      <input id="cmdEmailDest" type="email" value="${emailDefaut.replace(/"/g,'&quot;')}" placeholder="contact@fournisseur.fr"/></div>
    <p style="color:var(--text-muted);font-size:13px">Le bon de commande PDF sera joint à l'email.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="modal.hide()">Annuler</button>
      <button class="btn btn-primary" id="btnCmdEnvoyer">✉ Envoyer</button>
    </div>`, body => {
    body.querySelector('#btnCmdEnvoyer').onclick = async () => {
      const email = body.querySelector('#cmdEmailDest').value.trim();
      if (!email) { alert('Email requis'); return; }
      const btn = body.querySelector('#btnCmdEnvoyer');
      btn.disabled = true; btn.textContent = 'Envoi…';
      const r = await api.post(`/api/commandes-fournisseurs/${id}/envoyer-email`, { email_client: email });
      if (r?.error) { alert(r.error); btn.disabled = false; btn.textContent = '✉ Envoyer'; return; }
      modal.hide();
      if (r.preview_url) window.open(r.preview_url, '_blank'); // compte de test Ethereal
    };
  });
};

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
          <button class="btn-sm btn-outline" onclick="envoyerCommande(${c.id})" title="Envoyer le bon de commande au fournisseur">✉</button>
          ${!c.facture_fournisseur_id ? `<button class="btn-sm btn-outline" onclick="DocEditor.openFactureAchatDepuisCommande(${c.id})" title="Créer la facture d'achat depuis cette commande">🧾</button>` : ''}
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

