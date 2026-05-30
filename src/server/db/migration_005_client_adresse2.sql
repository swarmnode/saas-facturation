-- Migration 005 — Complément d'adresse sur les clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS adresse2 TEXT;
