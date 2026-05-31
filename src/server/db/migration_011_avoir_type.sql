-- Migration 011 — Type d'avoir (à valoir / remboursement)
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS type_avoir TEXT DEFAULT 'valoir';
-- 'valoir'        : avoir à valoir sur prochaine commande (default)
-- 'remboursement' : remboursement effectif au client
