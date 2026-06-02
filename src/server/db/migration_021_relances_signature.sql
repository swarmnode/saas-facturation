-- Migration 021 — Relances automatiques + Signature électronique des devis

-- Relances auto sur l'entreprise
ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS relance_auto_active  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relance_auto_jours   INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS relance_auto_heure   TEXT    DEFAULT '08:00';

-- Suivi relances sur les factures
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS derniere_relance TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nb_relances      INTEGER DEFAULT 0;

-- Signature électronique des devis
ALTER TABLE devis
  ADD COLUMN IF NOT EXISTS signature_token TEXT    DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS signature_ip    TEXT,
  ADD COLUMN IF NOT EXISTS signature_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_nom   TEXT;

-- Index pour lookup rapide par token
CREATE UNIQUE INDEX IF NOT EXISTS idx_devis_signature_token ON devis(signature_token);
