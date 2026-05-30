-- ============================================================
-- MIGRATION 003 — Avoirs : lien facture d'origine
-- ============================================================

ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS facture_origine_id INTEGER REFERENCES factures(id);

CREATE INDEX IF NOT EXISTS idx_factures_origine ON factures(facture_origine_id);
