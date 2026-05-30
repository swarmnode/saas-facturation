-- Migration 008 — Mode de règlement par défaut sur les clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS mode_reglement_defaut TEXT;
