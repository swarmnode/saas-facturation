-- Migration 007 — Informations SEPA de l'entreprise créancière
ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic  TEXT,
  ADD COLUMN IF NOT EXISTS ics  TEXT; -- Identifiant Créancier SEPA (ex: FR12ZZZ123456)
