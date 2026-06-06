-- Migration 025 — Catalogue de commentaires prédéfinis par entreprise
CREATE TABLE IF NOT EXISTS commentaires_predefinis (
  id            SERIAL PRIMARY KEY,
  texte         TEXT NOT NULL,
  entreprise_id INTEGER NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commentaires_predefinis_entreprise ON commentaires_predefinis(entreprise_id);
