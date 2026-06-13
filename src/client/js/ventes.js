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

