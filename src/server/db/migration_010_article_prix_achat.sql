-- Migration 010 — Prix d'achat HT sur les articles (calcul de marge)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS prix_achat_ht FLOAT8;
