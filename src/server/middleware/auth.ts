import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: number;
  email: string;
  entreprise_id: number;
  role: string;
  is_super_admin: boolean;
  voir_tout: boolean;
}

// Permission par rôle : ressource:r = lecture, ressource:w = écriture/suppression
const ROLE_PERMS: Record<string, string[]> = {
  admin: [
    'clients:r','clients:w',
    'devis:r','devis:w',
    'factures:r','factures:w',
    'acomptes:r','acomptes:w',
    'bl:r','bl:w',
    'articles:r','articles:w',
    'settings:r','settings:w',
    'users:r','users:w',
    'backup',
  ],
  comptable: [
    'clients:r','clients:w',
    'devis:r','devis:w',
    'factures:r','factures:w',
    'acomptes:r','acomptes:w',
    'bl:r','bl:w',
    'articles:r','articles:w',
  ],
  commercial: [
    'clients:r','clients:w',
    'devis:r','devis:w',
    'factures:r',
    'acomptes:r',
    'bl:r','bl:w',
    'articles:r','articles:w',
  ],
  lecteur: [
    'clients:r',
    'devis:r',
    'factures:r',
    'acomptes:r',
    'bl:r',
    'articles:r',
  ],
};

const PERM_SETS: Record<string, Set<string>> = {};
for (const [role, perms] of Object.entries(ROLE_PERMS)) {
  PERM_SETS[role] = new Set(perms);
}

export function canDo(role: string, is_super_admin: boolean, perm: string): boolean {
  if (is_super_admin) return true;
  return PERM_SETS[role]?.has(perm) ?? false;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'change_me') as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function requirePerm(perm: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!canDo(req.user.role, req.user.is_super_admin, perm)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_super_admin) {
    return res.status(403).json({ error: 'Réservé au super-administrateur' });
  }
  next();
}
