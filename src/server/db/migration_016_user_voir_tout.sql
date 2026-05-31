-- Migration 016 — Accès complet pour les commerciaux (voir tous les documents)
ALTER TABLE user_entreprises
  ADD COLUMN IF NOT EXISTS voir_tout BOOLEAN NOT NULL DEFAULT FALSE;
