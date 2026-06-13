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

