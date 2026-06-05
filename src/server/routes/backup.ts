import { Router } from 'express';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { authenticate, requireSuperAdmin, requirePerm } from '../middleware/auth';
import { query } from '../db/database';
import { runBackup, listBackups, loadAndSchedule } from '../services/BackupScheduler';
import { exporterSociete, restaurerSociete, RestoreMode } from '../services/SocieteBackupService';

const router = Router();

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
router.get('/telecharger', requireSuperAdmin, (_req, res, next) => {
  const { user, pass, host, port, db } = pgConn();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="sauvegarde_${date}.sql.gz"`);

  const proc = spawn(path.join(pgBin(), 'pg_dump.exe'), [
    '-U', user, '-h', host, '-p', port,
    '--clean', '--if-exists', '--no-owner', '--no-acl', db,
  ], { env: { ...process.env, PGPASSWORD: pass } });

  const gzip = createGzip({ level: 6 });
  proc.stdout.pipe(gzip).pipe(res);
  proc.stderr.on('data', d => console.error('[pg_dump]', d.toString()));
  proc.on('error', next);
  proc.on('close', code => { if (code !== 0) console.error(`[pg_dump] code ${code}`); });
});

// Restauration (.sql ou .sql.gz)
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });
router.post('/restaurer', requireSuperAdmin, upload.single('backup'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const tmpPath = req.file.path;
  const isGz = req.file.originalname?.endsWith('.gz') || req.file.mimetype === 'application/gzip';
  try {
    const { user, pass, host, port, db } = pgConn();
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(path.join(pgBin(), 'psql.exe'), [
        '-U', user, '-h', host, '-p', port, db,
        '-v', 'ON_ERROR_STOP=0',
      ], { env: { ...process.env, PGPASSWORD: pass } });

      if (isGz) {
        const src = fs.createReadStream(tmpPath);
        src.pipe(createGunzip()).pipe(proc.stdin);
        src.on('error', reject);
      } else {
        fs.createReadStream(tmpPath).pipe(proc.stdin);
      }

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
router.get('/config', requireSuperAdmin, async (_req, res, next) => {
  try {
    const r = await query('SELECT * FROM backup_config WHERE id=1');
    res.json(r.rows[0] ?? {});
  } catch (e) { next(e); }
});

// Enregistrer la config et replanifier
router.post('/config', requireSuperAdmin, async (req, res, next) => {
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
router.get('/liste', requireSuperAdmin, async (req, res, next) => {
  try {
    const r = await query('SELECT destination, taille_max_mo FROM backup_config WHERE id=1');
    const cfg = r.rows[0];
    const files = listBackups(cfg?.destination ?? '');
    const totalMo = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024 * 10) / 10;
    res.json({ files, totalMo, taille_max_mo: cfg?.taille_max_mo ?? 500 });
  } catch (e) { next(e); }
});

// Déclencher une sauvegarde manuelle vers le dossier configuré
router.post('/lancer', requireSuperAdmin, async (_req, res, next) => {
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

// ── Sauvegarde / Restauration par société ─────────────────────────────────────

const uploadSociete = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

// Télécharger la sauvegarde de SA société (admin de la société)
router.get('/societe/telecharger', requirePerm('settings:r'), async (req, res, next) => {
  try {
    const eid = req.user!.entreprise_id;
    const buf = await exporterSociete(eid);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="societe_${eid}_${date}.json.gz"`);
    res.send(buf);
  } catch (e) { next(e); }
});

// Restaurer une société depuis un fichier .json.gz (super_admin uniquement)
router.post('/societe/restaurer', requireSuperAdmin, uploadSociete.single('backup'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const tmpPath = req.file.path;
  try {
    const buf = fs.readFileSync(tmpPath);
    // mode=remap : réassigne de nouveaux IDs (import cross-instance)
    // mode=skip  : INSERT ON CONFLICT DO NOTHING (même instance, défaut)
    const mode: RestoreMode = req.query.mode === 'remap' ? 'remap' : 'skip';
    const result = await restaurerSociete(buf, mode);
    const total = result.tables.reduce((s, t) => s + t.inserted, 0);
    const skipped = result.tables.reduce((s, t) => s + t.skipped, 0);
    res.json({ ok: true, mode, entreprise_id: result.entreprise_id, raison_sociale: result.raison_sociale, inserted: total, skipped });
  } catch (e: any) {
    next(e);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

// Supprimer un fichier de sauvegarde
router.delete('/fichier/:nom', requireSuperAdmin, async (req, res, next) => {
  try {
    const r = await query('SELECT destination FROM backup_config WHERE id=1');
    const destination = r.rows[0]?.destination;
    if (!destination) return res.status(400).json({ error: 'Destination non configurée' });
    const nom = path.basename(req.params.nom as string); // sécurité : interdit les traversées
    if (!nom.startsWith('sauvegarde_') || !(nom.endsWith('.sql.gz') || nom.endsWith('.sql')))
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    const fp = path.join(destination, nom);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Fichier introuvable' });
    fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
