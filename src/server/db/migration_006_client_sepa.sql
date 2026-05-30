-- Migration 006 — Informations SEPA sur les clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS iban            TEXT,
  ADD COLUMN IF NOT EXISTS bic             TEXT,
  ADD COLUMN IF NOT EXISTS titulaire_compte TEXT,
  ADD COLUMN IF NOT EXISTS mandat_rum       TEXT,
  ADD COLUMN IF NOT EXISTS mandat_date      TEXT,
  ADD COLUMN IF NOT EXISTS mandat_type      TEXT DEFAULT 'CORE';
