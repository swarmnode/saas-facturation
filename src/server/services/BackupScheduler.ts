import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import { createWriteStream } from 'fs';
import path from 'path';
import fs from 'fs';
import { query } from '../db/database';

let currentTask: ScheduledTask | null = null;
let verifyTask: ScheduledTask | null = null;

// Base temporaire utilisée pour la vérification de restauration mensuelle.
const VERIFY_DB = 'facturation_verify';
// Base de maintenance pour les commandes CREATE/DROP DATABASE.
const ADMIN_DB = 'postgres';

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
  const filename = `sauvegarde_${date}.sql.gz`;
  const filePath = path.join(destination, filename);

  const { user, pass, host, port, db } = pgConn();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(path.join(pgBin(), 'pg_dump.exe'), [
      '-U', user, '-h', host, '-p', port,
      '--clean', '--if-exists', '--no-owner', '--no-acl', db,
    ], { env: { ...process.env, PGPASSWORD: pass } });

    const gzip = createGzip({ level: 6 });
    const out  = createWriteStream(filePath);
    proc.stdout.pipe(gzip).pipe(out);

    proc.stderr.on('data', d => console.error('[backup auto]', d.toString()));
    proc.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    proc.on('close', code => { if (code !== 0) reject(new Error(`pg_dump code ${code}`)); });
  });

  // Copie des PDFs Factur-X (preuve légale 10 ans)
  const pdfSrc = path.resolve(process.cwd(), 'storage', 'pdf');
  if (fs.existsSync(pdfSrc)) {
    const pdfDest = path.join(destination, `pdfs_${date}`);
    fs.cpSync(pdfSrc, pdfDest, { recursive: true });
    console.log(`[backup] PDFs copiés → ${pdfDest}`);
  }

  // Copie du secret JWT : sans lui, une restauration sur une nouvelle machine
  // invalide tous les tokens existants (simple reconnexion, mais autant l'éviter).
  const jwtSecretSrc = path.resolve(process.cwd(), 'storage', 'jwt_secret.key');
  if (fs.existsSync(jwtSecretSrc)) {
    const secretsDest = path.join(destination, `secrets_${date}`);
    fs.mkdirSync(secretsDest, { recursive: true });
    fs.copyFileSync(jwtSecretSrc, path.join(secretsDest, 'jwt_secret.key'));
    console.log(`[backup] jwt_secret.key copié → ${secretsDest}`);
  }

  return filePath;
}

export function listBackups(destination: string): { name: string; size: number; date: string }[] {
  if (!destination || !fs.existsSync(destination)) return [];
  return fs.readdirSync(destination)
    .filter(f => f.startsWith('sauvegarde_') && (f.endsWith('.sql.gz') || f.endsWith('.sql')))
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

// Exécute une commande SQL unique via psql sur la base indiquée, renvoie stdout (trim).
function runPsqlCommand(targetDb: string, sql: string): Promise<string> {
  const { user, pass, host, port } = pgConn();
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const proc = spawn(path.join(pgBin(), 'psql.exe'), [
      '-U', user, '-h', host, '-p', port, '-d', targetDb,
      '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { env: { ...process.env, PGPASSWORD: pass } });

    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `psql code ${code}`)));
  });
}

// Restaure un dump .sql.gz dans la base indiquée via psql.
function restoreDumpInto(targetDb: string, filePath: string): Promise<void> {
  const { user, pass, host, port } = pgConn();
  return new Promise((resolve, reject) => {
    let err = '';
    const proc = spawn(path.join(pgBin(), 'psql.exe'), [
      '-U', user, '-h', host, '-p', port, '-d', targetDb, '-v', 'ON_ERROR_STOP=1', '-q',
    ], { env: { ...process.env, PGPASSWORD: pass } });

    const src = fs.createReadStream(filePath);
    src.pipe(createGunzip()).pipe(proc.stdin);
    src.on('error', reject);

    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(err.trim() || `psql code ${code}`)));
  });
}

export interface VerifyResult {
  ok: boolean;
  fichier?: string;
  nbFactures?: number;
  erreur?: string;
}

// Restaure la dernière sauvegarde dans une base temporaire (facturation_verify)
// et compte les factures pour s'assurer que le dump est réellement restaurable.
export async function verifyLastBackup(destination: string): Promise<VerifyResult> {
  const files = listBackups(destination);
  if (files.length === 0) return { ok: false, erreur: 'Aucune sauvegarde disponible dans ce dossier.' };

  const last = files[files.length - 1];
  const filePath = path.join(destination, last.name);

  const cleanup = async () => {
    try {
      await runPsqlCommand(ADMIN_DB, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${VERIFY_DB}' AND pid <> pg_backend_pid();`);
      await runPsqlCommand(ADMIN_DB, `DROP DATABASE IF EXISTS ${VERIFY_DB};`);
    } catch (e) {
      console.error('[backup verif] nettoyage :', e);
    }
  };

  try {
    await cleanup();

    try {
      await runPsqlCommand(ADMIN_DB, `CREATE DATABASE ${VERIFY_DB};`);
    } catch (e: any) {
      if (/permission denied/i.test(e.message)) {
        throw new Error(`Vérification impossible : le rôle PostgreSQL "${pgConn().user}" n'a pas le privilège CREATEDB. Exécutez "ALTER ROLE ${pgConn().user} CREATEDB;" avec un compte superutilisateur, puis relancez la vérification.`);
      }
      throw e;
    }

    await restoreDumpInto(VERIFY_DB, filePath);

    const out = await runPsqlCommand(VERIFY_DB, 'SELECT COUNT(*) FROM factures;');
    const nbFactures = parseInt(out, 10) || 0;

    return { ok: true, fichier: last.name, nbFactures };
  } catch (e: any) {
    return { ok: false, fichier: last.name, erreur: e.message };
  } finally {
    await cleanup();
  }
}

export async function loadAndSchedule() {
  const r = await query('SELECT * FROM backup_config WHERE id=1');
  const cfg: BackupConfig = r.rows[0];
  if (!cfg) return;

  if (currentTask) { currentTask.stop(); currentTask = null; }
  if (verifyTask) { verifyTask.stop(); verifyTask = null; }
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

  // Vérification mensuelle (1er du mois à 3h) : restaure la dernière sauvegarde
  // dans facturation_verify et compte les factures pour valider qu'elle est utilisable.
  verifyTask = cron.schedule('0 3 1 * *', async () => {
    console.log('[backup] vérification mensuelle de la dernière sauvegarde…');
    const result = await verifyLastBackup(cfg.destination);
    await query(`
      UPDATE backup_config SET derniere_verif_date=NOW(), derniere_verif_ok=$1,
        derniere_verif_nb_factures=$2, derniere_verif_erreur=$3 WHERE id=1
    `, [result.ok ? 1 : 0, result.nbFactures ?? null, result.erreur ?? null]);
    if (result.ok) console.log(`[backup] vérification OK : ${result.fichier} (${result.nbFactures} factures)`);
    else console.error(`[backup] vérification échouée : ${result.erreur}`);
  });
  console.log(`[backup] vérification planifiée : 1er du mois à 03:00`);
}
