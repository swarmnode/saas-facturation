-- Migration 012 — CGV et mentions légales sur les documents
ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS cgv_texte TEXT,
  ADD COLUMN IF NOT EXISTS mention_legale TEXT;
