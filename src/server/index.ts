import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import { initDb } from './db/database';
import { ensureJwtSecret } from './utils/secret';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import authRouter         from './routes/auth';
import entrepriseRouter   from './routes/entreprise';
import clientsRouter      from './routes/clients';
import devisRouter        from './routes/devis';
import { query as dbQuery } from './db/database';
import facturesRouter     from './routes/factures';
import acomptesRouter     from './routes/acomptes';
import archivesRouter     from './routes/archives';
import articlesRouter     from './routes/articles';
import bonLivraisonRouter from './routes/bons-livraison';
import backupRouter       from './routes/backup';
import utilisateursRouter from './routes/utilisateurs';
import { loadAndSchedule } from './services/BackupScheduler';
import { initRelanceScheduler } from './services/RelanceScheduler';
import searchRouter        from './routes/search';
import sepaRouter          from './routes/sepa';
import lettrageRouter      from './routes/lettrage';
import statsRouter         from './routes/stats';
import auditRouter         from './routes/audit';
import exercicesRouter          from './routes/exercices';
import facturesFournisseursRouter from './routes/factures-fournisseurs';
import fournisseursRouter         from './routes/fournisseurs';
import commandesFournisseursRouter from './routes/commandes-fournisseurs';
import updateRouter               from './routes/update';
import commentairesRouter         from './routes/commentaires';
import maintenanceRouter          from './routes/maintenance';

dotenv.config();
ensureJwtSecret();

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(helmet({ contentSecurityPolicy: false })); // CSP désactivé : SPA inline scripts
// SPA servie par ce même serveur : pas de cross-origin par défaut.
// Définir CORS_ORIGIN (liste séparée par des virgules) pour autoriser d'autres origines.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()) }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  skip: (req) => {
    const ip = req.ip ?? '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
});

app.use(express.static(path.resolve(__dirname, '../client')));
app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));

// Routes publiques (pas de JWT requis)
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);

// Routes publiques signature devis — montées avant le middleware JWT.
// GET = page de confirmation uniquement : les préchargeurs de liens (antivirus,
// Outlook SafeLinks) suivent les GET, la signature ne doit donc se faire qu'en POST.
const SIGNATURE_STYLE = `body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4}
.box{background:#fff;border:1px solid #a7f3d0;border-radius:12px;padding:40px;max-width:480px;text-align:center}
h2{color:#065f46;margin:0 0 12px}p{color:#374151;margin:4px 0}
input{width:100%;box-sizing:border-box;padding:10px;margin:16px 0 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}
button{background:#059669;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:15px;cursor:pointer}
button:hover{background:#047857}`;

async function getDevisParToken(token: string) {
  const dr = await dbQuery(
    `SELECT d.*, e.raison_sociale AS e_nom FROM devis d
     JOIN entreprise e ON e.id = d.entreprise_id
     WHERE d.signature_token = $1`,
    [token]
  );
  return dr.rows[0];
}

app.get('/api/devis/signer/:token', async (req, res, next) => {
  try {
    const devis = await getDevisParToken(req.params.token);
    if (!devis) return res.status(404).send('<p>Lien de signature invalide ou expiré.</p>');
    if (devis.statut === 'signe')
      return res.send(`<p>Ce devis (${devis.numero}) a déjà été signé le ${new Date(devis.signature_date).toLocaleString('fr-FR')}.</p>`);

    const nom = (req.query.nom as string) || '';
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Signature du devis</title>
<style>${SIGNATURE_STYLE}</style></head>
<body><div class="box"><h2>Signature électronique</h2>
<p><strong>${devis.numero}</strong> — ${devis.e_nom}</p>
<p>Montant TTC : ${Number(devis.montant_ttc).toFixed(2)} €</p>
<form method="POST">
  <input type="text" name="nom" placeholder="Votre nom (optionnel)" value="${nom.replace(/"/g, '&quot;')}" maxlength="120">
  <button type="submit">Signer ce devis</button>
</form>
<p style="margin-top:16px;color:#6b7280;font-size:12px">En cliquant sur « Signer ce devis », vous acceptez les termes du devis. Cette signature a valeur d'engagement.</p>
</div></body></html>`);
  } catch(e) { next(e); }
});

app.post('/api/devis/signer/:token', async (req, res, next) => {
  try {
    const devis = await getDevisParToken(req.params.token);
    if (!devis) return res.status(404).send('<p>Lien de signature invalide ou expiré.</p>');
    if (devis.statut === 'signe')
      return res.send(`<p>Ce devis (${devis.numero}) a déjà été signé le ${new Date(devis.signature_date).toLocaleString('fr-FR')}.</p>`);

    const nom = typeof req.body?.nom === 'string' ? req.body.nom.slice(0, 120) : '';
    const ip  = req.ip ?? (req.socket as any)?.remoteAddress ?? '';

    await dbQuery(`
      UPDATE devis SET statut='signe', signature_date=NOW(), signature_ip=$2, signature_nom=$3, updated_at=NOW()
      WHERE id=$1
    `, [devis.id, ip, nom || null]);

    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis signé</title>
<style>${SIGNATURE_STYLE}</style></head>
<body><div class="box"><h2>✓ Devis signé électroniquement</h2>
<p><strong>${devis.numero}</strong> — ${devis.e_nom}</p>
<p style="margin-top:16px;color:#6b7280;font-size:13px">Signé le ${new Date().toLocaleString('fr-FR')}</p></div></body></html>`);
  } catch(e) { next(e); }
});

// Middleware JWT global pour toutes les routes /api/* sauf /api/auth
app.use('/api', authenticate);

app.use('/api/entreprise',      entrepriseRouter);
app.use('/api/clients',         clientsRouter);
app.use('/api/devis',           devisRouter);
app.use('/api/factures',        facturesRouter);
app.use('/api/acomptes',        acomptesRouter);
app.use('/api/archives',        archivesRouter);
app.use('/api/articles',        articlesRouter);
app.use('/api/bons-livraison',  bonLivraisonRouter);
app.use('/api/backup',          backupRouter);
app.use('/api/utilisateurs',    utilisateursRouter);
app.use('/api/search',          searchRouter);
app.use('/api/sepa',            sepaRouter);
app.use('/api/lettrage',        lettrageRouter);
app.use('/api/stats',           statsRouter);
app.use('/api/audit',           auditRouter);
app.use('/api/exercices',              exercicesRouter);
app.use('/api/factures-fournisseurs', facturesFournisseursRouter);
app.use('/api/fournisseurs',          fournisseursRouter);
app.use('/api/commandes-fournisseurs', commandesFournisseursRouter);
app.use('/api/update',               updateRouter);
app.use('/api/commentaires',         commentairesRouter);
app.use('/api/maintenance',           maintenanceRouter);

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/index.html'));
});

app.use(errorHandler);

initDb()
  .then(async () => {
    await loadAndSchedule();
    await initRelanceScheduler();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Serveur démarré sur http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erreur initialisation base de données :', err);
    process.exit(1);
  });
