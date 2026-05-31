import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/database';
import { authenticate, requirePerm, requireSuperAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/utilisateurs  — admin: tous les utilisateurs; super_admin: idem
router.get('/', requirePerm('users:r'), async (req, res, next) => {
  try {
    const user = req.user!;
    let rows: any[];
    if (user.is_super_admin) {
      const r = await query(`
        SELECT u.id, u.email, u.nom, u.prenom, u.is_super_admin, u.actif, u.created_at,
          json_agg(json_build_object('entreprise_id', ue.entreprise_id, 'raison_sociale', e.raison_sociale, 'role', ue.role, 'voir_tout', ue.voir_tout)
            ORDER BY e.raison_sociale) FILTER (WHERE ue.id IS NOT NULL) AS entreprises
        FROM utilisateurs u
        LEFT JOIN user_entreprises ue ON ue.user_id = u.id
        LEFT JOIN entreprise e ON e.id = ue.entreprise_id
        GROUP BY u.id ORDER BY u.nom, u.prenom
      `);
      rows = r.rows;
    } else {
      // Admin d'une société : voit uniquement les utilisateurs de sa société
      const r = await query(`
        SELECT u.id, u.email, u.nom, u.prenom, u.is_super_admin, u.actif, u.created_at, ue.role
        FROM utilisateurs u
        JOIN user_entreprises ue ON ue.user_id = u.id
        WHERE ue.entreprise_id = $1
        ORDER BY u.nom, u.prenom
      `, [user.entreprise_id]);
      rows = r.rows;
    }
    res.json(rows);
  } catch(e) { next(e); }
});

// GET /api/utilisateurs/me/password — route statique avant /:id
// PUT /api/utilisateurs/me/password — change son propre mot de passe (déclaré avant /:id)
router.put('/me/password', async (req, res, next) => {
  try {
    const { ancien, nouveau } = req.body;
    if (!ancien || !nouveau) return res.status(400).json({ error: 'Champs manquants' });
    const ur = await query('SELECT password_hash FROM utilisateurs WHERE id=$1', [req.user!.id]);
    const ok = await bcrypt.compare(String(ancien), ur.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    const hash = await bcrypt.hash(String(nouveau), 10);
    await query('UPDATE utilisateurs SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user!.id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// GET /api/utilisateurs/:id — récupère un utilisateur
router.get('/:id', requirePerm('users:r'), async (req, res, next) => {
  try {
    const id     = Number(req.params.id);
    const caller = req.user!;
    // Vérif accès
    if (!caller.is_super_admin) {
      const access = await query('SELECT 1 FROM user_entreprises WHERE user_id=$1 AND entreprise_id=$2', [id, caller.entreprise_id]);
      if (!access.rows[0] && id !== caller.id) return res.status(403).json({ error: 'Accès interdit' });
    }
    const r = await query(`
      SELECT u.id, u.email, u.nom, u.prenom, u.is_super_admin, u.actif,
        json_agg(json_build_object('entreprise_id', ue.entreprise_id, 'raison_sociale', e.raison_sociale, 'role', ue.role)
          ORDER BY e.raison_sociale) FILTER (WHERE ue.id IS NOT NULL) AS entreprises
      FROM utilisateurs u
      LEFT JOIN user_entreprises ue ON ue.user_id = u.id
      LEFT JOIN entreprise e ON e.id = ue.entreprise_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

// POST /api/utilisateurs — crée un utilisateur
router.post('/', requirePerm('users:w'), async (req, res, next) => {
  try {
    const { email, password, nom, prenom, is_super_admin, actif, entreprises } = req.body;
    if (!email || !password || !nom) return res.status(400).json({ error: 'Email, mot de passe et nom requis' });

    const caller = req.user!;
    // Seul un super_admin peut créer un super_admin
    const isSA = caller.is_super_admin && !!is_super_admin ? 1 : 0;

    const hash = await bcrypt.hash(String(password), 10);
    const r = await query(`
      INSERT INTO utilisateurs (email, password_hash, nom, prenom, is_super_admin, actif)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, nom, prenom, is_super_admin, actif
    `, [email, hash, nom, prenom ?? '', isSA, actif !== false ? 1 : 0]);

    const newUser = r.rows[0];

    // Affectation aux sociétés
    const ents: { entreprise_id: number; role: string; voir_tout?: boolean }[] = Array.isArray(entreprises) ? entreprises : [];
    for (const ue of ents) {
      if (!caller.is_super_admin && ue.entreprise_id !== caller.entreprise_id) continue;
      await query(
        'INSERT INTO user_entreprises (user_id, entreprise_id, role, voir_tout) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [newUser.id, ue.entreprise_id, ue.role ?? 'lecteur', !!ue.voir_tout]
      );
    }

    res.status(201).json(newUser);
  } catch(e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    next(e);
  }
});

// PUT /api/utilisateurs/:id  — modifiable par soi-même ou un admin
router.put('/:id', async (req, res, next) => {
  try {
    const caller = req.user!;
    const id = Number(req.params.id);
    const isSelf = id === caller.id;
    const { nom, prenom, email, password, actif, is_super_admin, entreprises } = req.body;

    const existing = (await query('SELECT * FROM utilisateurs WHERE id=$1', [id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Introuvable' });

    // Vérif accès : soi-même, super_admin, ou admin de la société
    if (!isSelf && !caller.is_super_admin) {
      const access = await query('SELECT 1 FROM user_entreprises WHERE user_id=$1 AND entreprise_id=$2', [id, caller.entreprise_id]);
      if (!access.rows[0]) return res.status(403).json({ error: 'Accès interdit' });
    }

    const isSA = caller.is_super_admin && is_super_admin !== undefined
      ? (is_super_admin ? 1 : 0) : existing.is_super_admin;

    let hash = existing.password_hash;
    if (password) hash = await bcrypt.hash(String(password), 10);

    await query(`
      UPDATE utilisateurs SET email=$1, password_hash=$2, nom=$3, prenom=$4,
        is_super_admin=$5, actif=$6, updated_at=NOW() WHERE id=$7
    `, [email ?? existing.email, hash, nom ?? existing.nom, prenom ?? existing.prenom,
        isSA, actif !== undefined ? (actif ? 1 : 0) : existing.actif, id]);

    // Mise à jour des affectations sociétés
    if (Array.isArray(entreprises)) {
      if (caller.is_super_admin) {
        // Super admin reécrit complètement les affectations
        await query('DELETE FROM user_entreprises WHERE user_id=$1', [id]);
      } else {
        // Admin d'une société : met à jour uniquement son affectation
        await query('DELETE FROM user_entreprises WHERE user_id=$1 AND entreprise_id=$2', [id, caller.entreprise_id]);
      }
      for (const ue of entreprises) {
        if (!caller.is_super_admin && ue.entreprise_id !== caller.entreprise_id) continue;
        await query(
          'INSERT INTO user_entreprises (user_id, entreprise_id, role, voir_tout) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, entreprise_id) DO UPDATE SET role=$3, voir_tout=$4',
          [id, ue.entreprise_id, ue.role ?? 'lecteur', !!ue.voir_tout]
        );
      }
    }

    const updated = (await query('SELECT id, email, nom, prenom, is_super_admin, actif FROM utilisateurs WHERE id=$1', [id])).rows[0];
    res.json(updated);
  } catch(e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    next(e);
  }
});

// DELETE /api/utilisateurs/:id — super_admin seulement
router.delete('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user!.id) return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
    await query('DELETE FROM utilisateurs WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

export default router;
