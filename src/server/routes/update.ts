import { Router } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { requirePerm } from '../middleware/auth';

const router = Router();

const GITHUB_REPO  = process.env.UPDATE_GITHUB_REPO ?? '';
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'FacturPro';
const INSTALL_DIR  = process.cwd();

let currentVersion = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(INSTALL_DIR, 'package.json'), 'utf-8'));
  currentVersion = pkg.version ?? '0.0.0';
} catch {}

type UpdateType = 'light' | 'heavy';

// ── Helpers ───────────────────────────────────────────────────────────────

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'FacturPro-Updater', 'Accept': 'application/vnd.github.v3+json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`GitHub API HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(url: string, redirects = 0) {
      if (redirects > 5) { reject(new Error('Trop de redirections')); return; }
      const mod: typeof https | typeof http = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'FacturPro-Updater' } } as any, (res: any) => {
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          get(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Téléchargement HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (err: Error) => { fs.unlink(dest, () => {}); reject(err); });
        res.on('error', (err: Error) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', reject);
    }
    get(url);
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Préférence : patch léger si disponible, sinon installeur complet
function getUpdateAsset(assets: any[]): { type: UpdateType; asset: any } | null {
  const zip = assets?.find((a: any) => a.name === 'FacturPro-Patch.zip');
  if (zip) return { type: 'light', asset: zip };
  const exe = assets?.find((a: any) => a.name === 'FacturPro-Setup.exe');
  if (exe) return { type: 'heavy', asset: exe };
  return null;
}

const UPDATES_DIR = path.join(INSTALL_DIR, 'updates');

// Mise à jour lourde : Inno Setup via schtasks (30 s)
function scheduleHeavyInstaller(installerPath: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const d = new Date(Date.now() + 30_000);
    const st = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join(':');

    const logPath = path.join(INSTALL_DIR, 'logs', 'update-install.log');
    const archivedPath = path.join(UPDATES_DIR, `FacturPro-Setup-${version}.exe`);
    const esc = (s: string) => s.replace(/'/g, "''");
    const tr = `powershell.exe -ExecutionPolicy Bypass -NonInteractive -Command "& '${esc(installerPath)}' /VERYSILENT /NORESTART /LOG='${esc(logPath)}'; New-Item -ItemType Directory -Force -Path '${esc(UPDATES_DIR)}' | Out-Null; Move-Item -Path '${esc(installerPath)}' -Destination '${esc(archivedPath)}' -ErrorAction SilentlyContinue"`;

    execFile('schtasks', ['/create', '/sc', 'ONCE', '/st', st, '/ru', 'SYSTEM',
      '/tn', 'FacturProUpdate', '/tr', tr, '/f'],
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`schtasks: ${stderr || err.message}`));
        else resolve();
      });
  });
}

// Mise à jour légère : stop service → Expand-Archive → déplacement ZIP versionné → start service (15 s)
function scheduleLightPatch(zipPath: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(INSTALL_DIR, 'logs', 'patch.ps1');
    const logPath    = path.join(INSTALL_DIR, 'logs', 'patch-apply.log');
    const archivedPath = path.join(UPDATES_DIR, `FacturPro-Patch-${version}.zip`);
    const esc = (s: string) => s.replace(/'/g, "''");
    const log = (msg: string) => `Add-Content -Path '${esc(logPath)}' -Value "[$(Get-Date -Format 'HH:mm:ss')] ${msg}"`;
    const script = [
      `$ErrorActionPreference = 'Continue'`,
      log(`=== Patch ${version} START ===`),
      log(`INSTALL_DIR: ${esc(INSTALL_DIR)}`),
      log(`ZIP: ${esc(zipPath)}`),
      log(`ZIP exists: $(Test-Path '${esc(zipPath)}')`),
      `Start-Sleep -Seconds 5`,
      log(`Stopping service ${esc(SERVICE_NAME)}...`),
      `try { Stop-Service -Name '${esc(SERVICE_NAME)}' -Force -ErrorAction Stop; ${log('Service stopped OK')} } catch { ${log('Stop-Service error: $_')} }`,
      `Start-Sleep -Seconds 3`,
      log(`Extracting archive to: ${esc(INSTALL_DIR)}`),
      `try { Expand-Archive -Path '${esc(zipPath)}' -DestinationPath '${esc(INSTALL_DIR)}' -Force -ErrorAction Stop; ${log('Expand-Archive OK')} } catch { ${log('Expand-Archive error: $_')} }`,
      log(`package.json version after: $(if (Test-Path '${esc(path.join(INSTALL_DIR, 'package.json'))}') { (Get-Content '${esc(path.join(INSTALL_DIR, 'package.json'))}' | ConvertFrom-Json).version } else { 'FILE NOT FOUND' })`),
      `New-Item -ItemType Directory -Force -Path '${esc(UPDATES_DIR)}' | Out-Null`,
      `Move-Item -Path '${esc(zipPath)}' -Destination '${esc(archivedPath)}' -ErrorAction SilentlyContinue`,
      `Start-Sleep -Seconds 2`,
      log(`Starting service...`),
      `try { Start-Service -Name '${esc(SERVICE_NAME)}' -ErrorAction Stop; ${log('Service started OK')} } catch { ${log('Start-Service error: $_')} }`,
      log(`=== Patch ${version} END ===`),
    ].join('\r\n');

    fs.writeFileSync(scriptPath, script, 'utf8');

    const d = new Date(Date.now() + 15_000);
    const st = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join(':');

    const tr = `powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "${scriptPath}"`;

    execFile('schtasks', ['/create', '/sc', 'ONCE', '/st', st, '/ru', 'SYSTEM',
      '/tn', 'FacturProPatch', '/tr', tr, '/f'],
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`schtasks: ${stderr || err.message}`));
        else resolve();
      });
  });
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get('/check', requirePerm('settings:r'), async (req, res, next) => {
  try {
    if (!GITHUB_REPO) {
      return res.json({ update_available: false, current_version: currentVersion });
    }
    const release = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const latestVersion = (release.tag_name as string).replace(/^v/, '');
    const found = getUpdateAsset(release.assets);
    res.json({
      update_available: compareVersions(latestVersion, currentVersion) > 0,
      current_version: currentVersion,
      latest_version: latestVersion,
      update_type: found?.type ?? null,
      asset_available: !!found,
      release_notes: (release.body as string | null) ?? '',
      published_at: (release.published_at as string | null) ?? null,
      install_dir: INSTALL_DIR,
    });
  } catch (e) { next(e); }
});

router.post('/apply', async (req, res, next) => {
  try {
    if (!req.user?.is_super_admin) {
      return res.status(403).json({ error: 'Réservé au super administrateur.' });
    }
    if (!GITHUB_REPO) {
      return res.status(400).json({ error: 'UPDATE_GITHUB_REPO non configuré dans .env.' });
    }

    const release = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const latestVersion = (release.tag_name as string).replace(/^v/, '');
    const found = getUpdateAsset(release.assets);
    if (!found) {
      return res.status(404).json({ error: 'Aucun asset de mise à jour trouvé dans la release GitHub.' });
    }

    if (found.type === 'light') {
      const zipPath = path.join(os.tmpdir(), `FacturPro-Patch-${Date.now()}.zip`);
      await downloadFile(found.asset.browser_download_url, zipPath);
      await scheduleLightPatch(zipPath, latestVersion);
      return res.json({
        update_type: 'light',
        message: 'Patch en cours d\'installation. Le service redémarre dans quelques secondes.',
      });
    }

    const installerPath = path.join(os.tmpdir(), `FacturPro-Setup-${Date.now()}.exe`);
    await downloadFile(found.asset.browser_download_url, installerPath);
    await scheduleHeavyInstaller(installerPath, latestVersion);
    return res.json({
      update_type: 'heavy',
      message: 'Mise à jour planifiée. Le serveur va redémarrer dans 30 secondes.',
    });
  } catch (e) { next(e); }
});

export default router;
