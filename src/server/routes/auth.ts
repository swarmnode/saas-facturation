import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db/database';
import { authenticate } from '../middleware/auth';

const router = Router();
const JWT_EXPIRY = '8h';

function jwtSecret() { return process.env.JWT_SECRET ?? 'change_me'; }

function issueToken(payload: object) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRY });
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, entreprise_id } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const ur = await query('SELECT * FROM utilisateurs WHERE email = $1 AND actif = 1', [email]);
    const user = ur.rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    // Liste des sociétés accessibles
    let entreprises: any[] = [];
    if (user.is_super_admin) {
      const er = await query('SELECT e.id, e.raison_sociale, e.siret FROM entreprise e ORDER BY e.raison_sociale');
      entreprises = er.rows.map(e => ({ ...e, role: 'admin' }));
    } else {
      const er = await query(`
        SELECT e.id, e.raison_sociale, e.siret, ue.role
        FROM user_entreprises ue JOIN entreprise e ON ue.entreprise_id = e.id
        WHERE ue.user_id = $1 ORDER BY e.raison_sociale
      `, [user.id]);
      entreprises = er.rows;
    }

    if (entreprises.length === 0) {
      return res.status(403).json({ error: 'Aucune société accessible. Contactez votre administrateur.' });
    }

    // Si une société est déjà sélectionnée ou qu'il n'y en a qu'une
    const targetId = entreprise_id ?? (entreprises.length === 1 ? entreprises[0].id : null);
    if (!targetId) {
      // Retourne la liste pour que le frontend propose le sélecteur
      return res.json({ require_select: true, entreprises, user: { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, is_super_admin: !!user.is_super_admin } });
    }

    const ent = entreprises.find(e => e.id === Number(targetId));
    if (!ent) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const token = issueToken({
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      entreprise_id: ent.id,
      role: user.is_super_admin ? 'admin' : ent.role,
      is_super_admin: !!user.is_super_admin,
    });

    res.json({ token, entreprise_id: ent.id, role: user.is_super_admin ? 'admin' : ent.role });
  } catch(e) { next(e); }
});

// POST /api/auth/select-entreprise  (token déjà émis, change de société)
router.post('/select-entreprise', authenticate, async (req, res, next) => {
  try {
    const { entreprise_id } = req.body;
    const user = req.user!;

    let role = 'admin';
    if (!user.is_super_admin) {
      const uer = await query(
        'SELECT role FROM user_entreprises WHERE user_id=$1 AND entreprise_id=$2',
        [user.id, entreprise_id]
      );
      if (!uer.rows[0]) return res.status(403).json({ error: 'Accès refusé à cette société' });
      role = uer.rows[0].role;
    }

    const ur = await query('SELECT nom, prenom FROM utilisateurs WHERE id=$1', [user.id]);
    const token = issueToken({
      id: user.id,
      email: user.email,
      nom: ur.rows[0]?.nom ?? '',
      prenom: ur.rows[0]?.prenom ?? '',
      entreprise_id: Number(entreprise_id),
      role,
      is_super_admin: user.is_super_admin,
    });

    res.json({ token, entreprise_id: Number(entreprise_id), role });
  } catch(e) { next(e); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const ur = await query('SELECT id, email, nom, prenom, is_super_admin, actif FROM utilisateurs WHERE id=$1', [user.id]);
    if (!ur.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });

    let entreprises: any[] = [];
    if (user.is_super_admin) {
      const er = await query('SELECT id, raison_sociale, siret FROM entreprise ORDER BY raison_sociale');
      entreprises = er.rows.map(e => ({ ...e, role: 'admin' }));
    } else {
      const er = await query(`
        SELECT e.id, e.raison_sociale, e.siret, ue.role
        FROM user_entreprises ue JOIN entreprise e ON ue.entreprise_id = e.id
        WHERE ue.user_id = $1 ORDER BY e.raison_sociale
      `, [user.id]);
      entreprises = er.rows;
    }

    res.json({ ...ur.rows[0], entreprise_id: user.entreprise_id, role: user.role, entreprises });
  } catch(e) { next(e); }
});

export default router;
