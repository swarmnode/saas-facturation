-- Migration 020 — Saisie TVA déductible (section B de la CA3)
CREATE TABLE IF NOT EXISTS tva_deductible (
  id              SERIAL       PRIMARY KEY,
  entreprise_id   INTEGER      NOT NULL REFERENCES entreprise(id),
  periode         TEXT         NOT NULL,   -- ex. '2025-01', '2025-T1', '2025'
  montant         FLOAT8       NOT NULL DEFAULT 0,
  notes           TEXT,
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (entreprise_id, periode)
);
