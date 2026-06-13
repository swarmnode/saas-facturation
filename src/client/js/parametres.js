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
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>

    <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Vérification de restauration</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">
      Restaure la dernière sauvegarde dans une base temporaire (<code>facturation_verify</code>) et compte
      les factures, pour garantir qu'elle est réellement utilisable en cas de besoin. Exécutée
      automatiquement le 1er de chaque mois à 3h.
    </p>
    <div id="backupVerifResult" style="margin-bottom:10px">
      ${cfg.derniere_verif_date
        ? `<p style="font-size:13px">Dernière vérification : ${new Date(cfg.derniere_verif_date).toLocaleString('fr-FR')} — `
          + (cfg.derniere_verif_ok
            ? `<span style="color:#16a34a">OK (${cfg.derniere_verif_nb_factures ?? 0} facture(s))</span>`
            : `<span style="color:#e74c3c">Échec<span id="backupVerifErreur"></span></span>`)
          + `</p>`
        : `<p style="color:var(--text-muted);font-size:13px">Aucune vérification effectuée.</p>`}
    </div>
    <button type="button" class="btn btn-secondary" id="backupVerifBtn">🔎 Vérifier la dernière sauvegarde</button>`;

  const verifErreurEl = el.querySelector('#backupVerifErreur');
  if (verifErreurEl && cfg.derniere_verif_erreur) verifErreurEl.textContent = ' : ' + cfg.derniere_verif_erreur;

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

  el.querySelector('#backupVerifBtn').onclick = async () => {
    const btn = el.querySelector('#backupVerifBtn');
    btn.disabled = true; btn.textContent = 'Vérification en cours…';
    const r = await api.post('/api/backup/verifier', {});
    if (r?.error) {
      btn.disabled = false; btn.textContent = '🔎 Vérifier la dernière sauvegarde';
      el.querySelector('#backupVerifResult').innerHTML = `<div class="alert alert-danger">${r.error}</div>`;
    } else {
      renderBackupAuto(el);
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

