import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/auth';
import { getPool, query } from '../db/database';
import { logAudit } from './audit';

const router = Router();

// VACUUM et ANALYZE doivent s'exécuter hors transaction — on prend un client dédié du pool.
async function runMaintenance(sql: string) {
  const client = await getPool().connect();
  try {
    const start = Date.now();
    await client.query(sql);
    return Date.now() - start;
  } finally {
    client.release();
  }
}

// Récupère l'espace disque laissé par les lignes supprimées/modifiées (MVCC).
// `full: true` (mode "forcer") réécrit entièrement les tables — verrouillage exclusif, plus efficace mais plus lourd.
router.post('/vacuum', requireSuperAdmin, async (req, res, next) => {
  try {
    const full = req.body?.full === true;
    const dureeMs = await runMaintenance(full ? 'VACUUM (FULL)' : 'VACUUM');
    await logAudit(req, 'maintenance_vacuum', 'database', undefined, { duree_ms: dureeMs, full });
    res.json({ ok: true, duree_ms: dureeMs, full });
  } catch (e) { next(e); }
});

// Recalcule les statistiques utilisées par le planificateur de requêtes pour choisir le meilleur plan d'exécution
router.post('/analyze', requireSuperAdmin, async (req, res, next) => {
  try {
    const dureeMs = await runMaintenance('ANALYZE');
    await logAudit(req, 'maintenance_analyze', 'database', undefined, { duree_ms: dureeMs });
    res.json({ ok: true, duree_ms: dureeMs });
  } catch (e) { next(e); }
});

// Reconstruit tous les index de la base — verrouillage exclusif des tables concernées pendant l'opération
router.post('/reindex', requireSuperAdmin, async (req, res, next) => {
  try {
    const dbRes = await query('SELECT current_database() AS db');
    const dbName: string = dbRes.rows[0].db;
    const dureeMs = await runMaintenance(`REINDEX DATABASE "${dbName.replace(/"/g, '""')}"`);
    await logAudit(req, 'maintenance_reindex', 'database', undefined, { duree_ms: dureeMs });
    res.json({ ok: true, duree_ms: dureeMs });
  } catch (e) { next(e); }
});

export default router;
