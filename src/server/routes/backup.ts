import { Router } from 'express';
import { spawn } from 'child_process';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { requireSuperAdmin } from '../middleware/auth';
import { query } from '../db/database';
import { runBackup, listBackups, loadAndSchedule } from '../services/BackupScheduler';

const router = Router();
router.use(requireSuperAdmin);

function pgConn() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://facturation:facturation@localhost:5432/facturation');
  return {
    user: url.username,
    pass: decodeURIComponent(url.password),
    host: url.hostname,
    port: url.port || '5432',
    db:   url.pathname.slice(1),
  };
}

function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  return path.join('C:\\Program Files\\PostgreSQL\\17\\bin');
}

// Téléchargement manuel (stream)
router.get('/telecharger', (_req, res, next) => {
  const { user, pass, host, port, db } = pgConn();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="sauvegarde_${date}.sql"`);

  const proc = spawn(path.join(pgBin(), 'pg_dump.exe'), [
    '-U', user, '-h', host, '-p', port,
    '--clean', '--if-exists', '--no-owner', '--no-acl', db,
  ], { env: { ...process.env, PGPASSWORD: pass } });

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[pg_dump]', d.toString()));
  proc.on('error', next);
  proc.on('close', code => { if (code !== 0) console.error(`[pg_dump] code ${code}`); });
});

// Restauration
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 100 * 1024 * 1024 } });
router.post('/restaurer', upload.single('backup'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const tmpPath = req.file.path;
  try {
    const { user, pass, host, port, db } = pgConn();
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(path.join(pgBin(), 'psql.exe'), [
        '-U', user, '-h', host, '-p', port, db,
        '-v', 'ON_ERROR_STOP=0', '-f', tmpPath,
      ], { env: { ...process.env, PGPASSWORD: pass } });
      proc.stderr.on('data', d => console.error('[psql restore]', d.toString()));
      proc.on('error', reject);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`psql code ${code}`)));
    });
    res.json({ ok: true });
  } catch (e: any) {
    next(e);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

// Lire la config de sauvegarde automatique
router.get('/config', async (_req, res, next) => {
  try {
    const r = await query('SELECT * FROM backup_config WHERE id=1');
    res.json(r.rows[0] ?? {});
  } catch (e) { next(e); }
});

// Enregistrer la config et replanifier
router.post('/config', async (req, res, next) => {
  try {
    const { actif, destination, periodicite, heure, jour_semaine, jour_mois, taille_max_mo } = req.body;
    await query(`
      UPDATE backup_config SET actif=$1, destination=$2, periodicite=$3, heure=$4,
        jour_semaine=$5, jour_mois=$6, taille_max_mo=$7, updated_at=NOW() WHERE id=1
    `, [actif ? 1 : 0, destination ?? '', periodicite ?? 'quotidienne', heure ?? '02:00',
        jour_semaine ?? 1, jour_mois ?? 1, taille_max_mo ?? 500]);
    await loadAndSchedule();
    const r = await query('SELECT * FROM backup_config WHERE id=1');
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// Liste des fichiers dans le dossier destination
router.get('/liste', async (req, res, next) => {
  try {
    const r = await query('SELECT destination, taille_max_mo FROM backup_config WHERE id=1');
    const cfg = r.rows[0];
    const files = listBackups(cfg?.destination ?? '');
    const totalMo = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024 * 10) / 10;
    res.json({ files, totalMo, taille_max_mo: cfg?.taille_max_mo ?? 500 });
  } catch (e) { next(e); }
});

// Déclencher une sauvegarde manuelle vers le dossier configuré
router.post('/lancer', async (_req, res, next) => {
  try {
    const r = await query('SELECT destination, taille_max_mo FROM backup_config WHERE id=1');
    const cfg = r.rows[0];
    if (!cfg?.destination) return res.status(400).json({ error: 'Destination non configurée' });
    const fp = await runBackup(cfg.destination);
    const files = listBackups(cfg.destination);
    const maxBytes = cfg.taille_max_mo * 1024 * 1024;
    let total = files.reduce((s: number, f) => s + f.size, 0);
    for (const f of files) {
      if (total <= maxBytes) break;
      try { fs.unlinkSync(path.join(cfg.destination, f.name)); } catch {}
      total -= f.size;
    }
    res.json({ ok: true, fichier: path.basename(fp) });
  } catch (e) { next(e); }
});

// Supprimer un fichier de sauvegarde
router.delete('/fichier/:nom', async (req, res, next) => {
  try {
    const r = await query('SELECT destination FROM backup_config WHERE id=1');
    const destination = r.rows[0]?.destination;
    if (!destination) return res.status(400).json({ error: 'Destination non configurée' });
    const nom = path.basename(req.params.nom); // sécurité : interdit les traversées
    if (!nom.startsWith('sauvegarde_') || !nom.endsWith('.sql'))
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    const fp = path.join(destination, nom);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Fichier introuvable' });
    fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
