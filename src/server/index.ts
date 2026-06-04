import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initDb } from './db/database';
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

dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.resolve(__dirname, '../client')));
app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));

// Routes publiques (pas de JWT requis)
app.use('/api/auth', authRouter);

// Route publique signature devis — doit être montée avant le middleware JWT
app.get('/api/devis/signer/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const nom = (req.query.nom as string) || '';
    const ip  = req.ip ?? (req.socket as any)?.remoteAddress ?? '';

    const dr = await dbQuery(
      `SELECT d.*, e.raison_sociale AS e_nom FROM devis d
       JOIN entreprise e ON e.id = d.entreprise_id
       WHERE d.signature_token = $1`,
      [token]
    );
    const devis = dr.rows[0];
    if (!devis) return res.status(404).send('<p>Lien de signature invalide ou expiré.</p>');
    if (devis.statut === 'signe')
      return res.send(`<p>Ce devis (${devis.numero}) a déjà été signé le ${new Date(devis.signature_date).toLocaleString('fr-FR')}.</p>`);

    await dbQuery(`
      UPDATE devis SET statut='signe', signature_date=NOW(), signature_ip=$2, signature_nom=$3, updated_at=NOW()
      WHERE id=$1
    `, [devis.id, ip, nom || null]);

    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis signé</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4}
.box{background:#fff;border:1px solid #a7f3d0;border-radius:12px;padding:40px;max-width:480px;text-align:center}
h2{color:#065f46;margin:0 0 12px}p{color:#374151;margin:4px 0}</style></head>
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
