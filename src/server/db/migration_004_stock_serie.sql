-- ============================================================
-- MIGRATION 004 — Stock articles + N° de série sur les lignes
-- ============================================================

-- Stock sur les articles (nullable : non géré si NULL)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS quantite_stock FLOAT8;

-- N° de série sur les lignes de facture
ALTER TABLE factures_lignes
  ADD COLUMN IF NOT EXISTS numero_serie TEXT;

-- N° de série sur les lignes de BL
ALTER TABLE bons_livraison_lignes
  ADD COLUMN IF NOT EXISTS numero_serie TEXT;
