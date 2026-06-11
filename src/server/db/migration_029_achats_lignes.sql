-- Migration 029 : lignes détaillées pour les documents d'achat
-- Aligne les commandes fournisseurs et factures d'achats sur le modèle des
-- documents de vente (lignes + totaux calculés) pour l'éditeur WYSIWYG.
-- Côté achats, aucun verrou/scellement (voir migration 026) : ON DELETE CASCADE.

CREATE TABLE IF NOT EXISTS commandes_fournisseurs_lignes (
    id               SERIAL  PRIMARY KEY,
    commande_id      INTEGER NOT NULL REFERENCES commandes_fournisseurs(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    type             TEXT    NOT NULL DEFAULT 'ligne',
    designation      TEXT    NOT NULL,
    description      TEXT,
    quantite         NUMERIC(12,3) NOT NULL DEFAULT 1,
    unite            TEXT,
    prix_unitaire_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
    taux_tva_id      INTEGER REFERENCES taux_tva(id),
    taux_tva_valeur  FLOAT8  NOT NULL DEFAULT 0,
    remise_pct       FLOAT8  NOT NULL DEFAULT 0,
    montant_ht       FLOAT8  NOT NULL DEFAULT 0,
    montant_tva      FLOAT8  NOT NULL DEFAULT 0,
    montant_ttc      FLOAT8  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cmd_fourn_lignes_commande ON commandes_fournisseurs_lignes(commande_id);

ALTER TABLE commandes_fournisseurs ADD COLUMN IF NOT EXISTS montant_tva NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE commandes_fournisseurs ADD COLUMN IF NOT EXISTS montant_ttc NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE commandes_fournisseurs ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS factures_fournisseurs_lignes (
    id                     SERIAL  PRIMARY KEY,
    facture_fournisseur_id INTEGER NOT NULL REFERENCES factures_fournisseurs(id) ON DELETE CASCADE,
    position               INTEGER NOT NULL,
    type                   TEXT    NOT NULL DEFAULT 'ligne',
    designation            TEXT    NOT NULL,
    description            TEXT,
    quantite               NUMERIC(12,3) NOT NULL DEFAULT 1,
    unite                  TEXT,
    prix_unitaire_ht       NUMERIC(12,2) NOT NULL DEFAULT 0,
    taux_tva_id            INTEGER REFERENCES taux_tva(id),
    taux_tva_valeur        FLOAT8  NOT NULL DEFAULT 0,
    remise_pct             FLOAT8  NOT NULL DEFAULT 0,
    montant_ht             FLOAT8  NOT NULL DEFAULT 0,
    montant_tva            FLOAT8  NOT NULL DEFAULT 0,
    montant_ttc            FLOAT8  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ff_lignes_facture ON factures_fournisseurs_lignes(facture_fournisseur_id);
