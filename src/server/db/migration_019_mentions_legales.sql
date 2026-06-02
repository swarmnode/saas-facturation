-- Migration 019 — Mentions légales obligatoires sur les factures (art. L441-9 et L441-10 CCom)

-- Champs sur les factures
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS numero_commande        TEXT,
  ADD COLUMN IF NOT EXISTS escompte_taux          FLOAT8 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalites_taux         TEXT,
  ADD COLUMN IF NOT EXISTS indemnite_recouvrement FLOAT8 DEFAULT 40,
  ADD COLUMN IF NOT EXISTS chorus_pro_id          TEXT,
  ADD COLUMN IF NOT EXISTS chorus_pro_statut      TEXT;

-- Valeurs par défaut au niveau de l'entreprise
ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS penalites_defaut       TEXT    DEFAULT 'Taux directeur BCE majoré de 10 points (art. L441-10 CCom)',
  ADD COLUMN IF NOT EXISTS escompte_defaut        FLOAT8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indemnite_defaut       FLOAT8  DEFAULT 40;
