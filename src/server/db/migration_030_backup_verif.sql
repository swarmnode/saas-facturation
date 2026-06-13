-- Migration 030 : vérification de restauration des sauvegardes
-- Trace le résultat de la dernière restauration de test (base temporaire
-- facturation_verify), exécutée mensuellement par BackupScheduler ou à la
-- demande via POST /api/backup/verifier.

ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS derniere_verif_date TIMESTAMPTZ;
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS derniere_verif_ok INTEGER;
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS derniere_verif_nb_factures INTEGER;
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS derniere_verif_erreur TEXT;
