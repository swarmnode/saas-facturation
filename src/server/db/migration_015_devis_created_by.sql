-- Migration 015 — Auteur des devis (pour filtrage par commercial)
ALTER TABLE devis
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id);
