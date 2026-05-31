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
import facturesRouter     from './routes/factures';
import acomptesRouter     from './routes/acomptes';
import archivesRouter     from './routes/archives';
import articlesRouter     from './routes/articles';
import bonLivraisonRouter from './routes/bons-livraison';
import backupRouter       from './routes/backup';
import utilisateursRouter from './routes/utilisateurs';
import { loadAndSchedule } from './services/BackupScheduler';
import searchRouter        from './routes/search';
import sepaRouter          from './routes/sepa';
import lettrageRouter      from './routes/lettrage';
import statsRouter         from './routes/stats';

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

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/index.html'));
});

app.use(errorHandler);

initDb()
  .then(async () => {
    await loadAndSchedule();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Serveur démarré sur http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erreur initialisation base de données :', err);
    process.exit(1);
  });
