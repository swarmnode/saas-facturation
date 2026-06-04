-- Migration 022 — Notifications avant échéance
-- Permet d'envoyer un rappel automatique N jours AVANT la date d'échéance d'une facture.

ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS notif_echeance_active INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notif_echeance_jours  INTEGER DEFAULT 3;

ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS notif_echeance_envoyee TIMESTAMPTZ;
