import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { query } from '../db/database';

let currentTask: ScheduledTask | null = null;

function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  return path.join('C:\\Program Files\\PostgreSQL\\17\\bin');
}

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

export interface BackupConfig {
  actif: number;
  destination: string;
  periodicite: string;   // 'quotidienne' | 'hebdomadaire' | 'mensuelle'
  heure: string;         // 'HH:MM'
  jour_semaine: number;  // 0-6, pour hebdomadaire
  jour_mois: number;     // 1-31, pour mensuelle
  taille_max_mo: number;
}

function buildCronExpr(cfg: BackupConfig): string {
  const [hh, mm] = cfg.heure.split(':').map(Number);
  const h = isNaN(hh) ? 2 : hh;
  const m = isNaN(mm) ? 0 : mm;
  switch (cfg.periodicite) {
    case 'hebdomadaire': return `${m} ${h} * * ${cfg.jour_semaine}`;
    case 'mensuelle':    return `${m} ${h} ${cfg.jour_mois} * *`;
    default:             return `${m} ${h} * * *`; // quotidienne
  }
}

export async function runBackup(destination: string): Promise<string> {
  if (!destination) throw new Error('Destination non configurée');
  if (!fs.existsSync(destination)) fs.mkdirSync(destination, { recursive: true });

  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `sauvegarde_${date}.sql`;
  const filePath = path.join(destination, filename);

  const { user, pass, host, port, db } = pgConn();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(path.join(pgBin(), 'pg_dump.exe'), [
      '-U', user, '-h', host, '-p', port,
      '--clean', '--if-exists', '--no-owner', '--no-acl',
      '-f', filePath, db,
    ], { env: { ...process.env, PGPASSWORD: pass } });
    proc.stderr.on('data', d => console.error('[backup auto]', d.toString()));
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`pg_dump code ${code}`)));
  });

  return filePath;
}

export function listBackups(destination: string): { name: string; size: number; date: string }[] {
  if (!destination || !fs.existsSync(destination)) return [];
  return fs.readdirSync(destination)
    .filter(f => f.startsWith('sauvegarde_') && f.endsWith('.sql'))
    .map(f => {
      const stat = fs.statSync(path.join(destination, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function pruneBackups(destination: string, maxMo: number) {
  const files = listBackups(destination);
  const maxBytes = maxMo * 1024 * 1024;
  let total = files.reduce((s, f) => s + f.size, 0);
  for (const f of files) {
    if (total <= maxBytes) break;
    const fp = path.join(destination, f.name);
    try { fs.unlinkSync(fp); } catch {}
    total -= f.size;
    console.log(`[backup] supprimé (quota dépassé) : ${f.name}`);
  }
}

export async function loadAndSchedule() {
  const r = await query('SELECT * FROM backup_config WHERE id=1');
  const cfg: BackupConfig = r.rows[0];
  if (!cfg) return;

  if (currentTask) { currentTask.stop(); currentTask = null; }
  if (!cfg.actif || !cfg.destination) return;

  const expr = buildCronExpr(cfg);
  console.log(`[backup] planifié : ${expr} → ${cfg.destination}`);

  currentTask = cron.schedule(expr, async () => {
    try {
      console.log('[backup] démarrage sauvegarde automatique…');
      const fp = await runBackup(cfg.destination);
      console.log(`[backup] OK : ${fp}`);
      pruneBackups(cfg.destination, cfg.taille_max_mo);
    } catch (e) {
      console.error('[backup] erreur :', e);
    }
  });
}
