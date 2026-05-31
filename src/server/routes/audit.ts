import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/database';
import { requirePerm } from '../middleware/auth';

const router = Router();

// Helper pour logger une action — importable par d'autres routes
export async function logAudit(req: Request, action: string, ressource?: string, ressourceId?: number, details?: any) {
  try {
    await query(`
      INSERT INTO audit_log (entreprise_id, user_id, user_email, action, ressource, ressource_id, details, ip)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      req.user?.entreprise_id ?? null,
      req.user?.id ?? null,
      req.user?.email ?? null,
      action,
      ressource ?? null,
      ressourceId ?? null,
      details ? JSON.stringify(details) : null,
      req.ip ?? null,
    ]);
  } catch {} // Ne pas bloquer si l'audit échoue
}

// GET /api/audit — liste les 200 dernières entrées (admin only)
router.get('/', requirePerm('settings:r'), async (req, res, next) => {
  try {
    const r = await query(`
      SELECT a.*, u.email AS user_email_join
      FROM audit_log a
      LEFT JOIN utilisateurs u ON u.id = a.user_id
      WHERE a.entreprise_id = $1
      ORDER BY a.created_at DESC LIMIT 200
    `, [req.user!.entreprise_id]);
    res.json(r.rows);
  } catch(e) { next(e); }
});

export default router;
