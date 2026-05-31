-- Migration 014 — Conditions de paiement par client
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS conditions_paiement TEXT;
