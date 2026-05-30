-- ============================================================
-- SCHÉMA BASE DE DONNÉES — SaaS Devis/Facturation France
-- Base     : PostgreSQL 17
-- Conformité : Loi anti-fraude TVA, Factur-X, RGPD, FEC
-- ============================================================

-- ============================================================
-- TAUX TVA (référentiel)
-- ============================================================
CREATE TABLE IF NOT EXISTS taux_tva (
    id      SERIAL PRIMARY KEY,
    taux    FLOAT8  NOT NULL,
    libelle TEXT    NOT NULL,
    mention_legale TEXT,
    actif   INTEGER NOT NULL DEFAULT 1
);

INSERT INTO taux_tva (id, taux, libelle, mention_legale) VALUES
    (1, 20.0, 'TVA normale 20 %',          'TVA 20 %'),
    (2, 10.0, 'TVA intermédiaire 10 %',    'TVA 10 %'),
    (3,  5.5, 'TVA réduite 5,5 %',         'TVA 5,5 %'),
    (4,  0.0, 'Franchise art. 293 B CGI',  'TVA non applicable, art. 293 B du CGI'),
    (5,  0.0, 'Autoliquidation',           'Autoliquidation — TVA due par le preneur art. 283-2 du CGI')
ON CONFLICT (id) DO NOTHING;

SELECT setval('taux_tva_id_seq', 10);

-- ============================================================
-- ENTREPRISE
-- ============================================================
CREATE TABLE IF NOT EXISTS entreprise (
    id               SERIAL PRIMARY KEY,
    raison_sociale   TEXT    NOT NULL,
    forme_juridique  TEXT    NOT NULL,
    is_EI            INTEGER NOT NULL DEFAULT 0,
    siret            TEXT    NOT NULL UNIQUE,
    tva_intracom     TEXT,
    adresse          TEXT    NOT NULL,
    adresse2         TEXT,
    code_postal      TEXT    NOT NULL,
    ville            TEXT    NOT NULL,
    pays             TEXT    NOT NULL DEFAULT 'France',
    telephone        TEXT,
    email            TEXT    NOT NULL,
    site_web         TEXT,
    regime_tva       TEXT    NOT NULL DEFAULT 'normal',
    capital_social   FLOAT8,
    rcs_ville        TEXT,
    logo_path        TEXT,
    smtp_host        TEXT,
    smtp_port        INTEGER DEFAULT 587,
    smtp_secure      INTEGER DEFAULT 0,
    smtp_user        TEXT,
    smtp_pass        TEXT,
    smtp_from        TEXT,
    email_mode       TEXT    DEFAULT 'mapi',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
    id               SERIAL PRIMARY KEY,
    type_client      TEXT    NOT NULL DEFAULT 'professionnel',
    raison_sociale   TEXT,
    civilite         TEXT,
    prenom           TEXT,
    nom              TEXT,
    adresse          TEXT    NOT NULL,
    code_postal      TEXT    NOT NULL,
    ville            TEXT    NOT NULL,
    pays             TEXT    NOT NULL DEFAULT 'France',
    email            TEXT,
    telephone        TEXT,
    siret            TEXT,
    tva_intracom     TEXT,
    tva_mode         TEXT    NOT NULL DEFAULT 'normal',
    statut_rgpd          TEXT    NOT NULL DEFAULT 'prospect',
    date_derniere_activite TEXT,
    date_anonymisation   TEXT,
    consentement_date    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SÉQUENCE DE NUMÉROTATION
-- ============================================================
CREATE TABLE IF NOT EXISTS sequence_numerotation (
    id              SERIAL PRIMARY KEY,
    type_document   TEXT    NOT NULL,
    annee           INTEGER NOT NULL,
    dernier_numero  INTEGER NOT NULL DEFAULT 0,
    prefixe         TEXT    NOT NULL,
    UNIQUE(type_document, annee)
);

INSERT INTO sequence_numerotation (type_document, annee, prefixe) VALUES
    ('DEVIS',   EXTRACT(YEAR FROM NOW())::INTEGER, 'DEV'),
    ('FACTURE', EXTRACT(YEAR FROM NOW())::INTEGER, 'FAC'),
    ('AVOIR',   EXTRACT(YEAR FROM NOW())::INTEGER, 'AV'),
    ('ACOMPTE', EXTRACT(YEAR FROM NOW())::INTEGER, 'AC'),
    ('AVENANT', EXTRACT(YEAR FROM NOW())::INTEGER, 'AVN'),
    ('BL',      EXTRACT(YEAR FROM NOW())::INTEGER, 'BL')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DEVIS
-- ============================================================
CREATE TABLE IF NOT EXISTS devis (
    id               SERIAL PRIMARY KEY,
    numero           TEXT    NOT NULL UNIQUE,
    client_id        INTEGER NOT NULL REFERENCES clients(id),
    entreprise_id    INTEGER NOT NULL REFERENCES entreprise(id),
    statut           TEXT    NOT NULL DEFAULT 'brouillon',
    date_creation    TEXT    NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    date_envoi       TEXT,
    date_signature   TEXT,
    date_validite    TEXT,
    montant_ht       FLOAT8  NOT NULL DEFAULT 0,
    montant_tva      FLOAT8  NOT NULL DEFAULT 0,
    montant_ttc      FLOAT8  NOT NULL DEFAULT 0,
    is_free          INTEGER NOT NULL DEFAULT 0,
    objet            TEXT,
    conditions_paiement TEXT,
    notes            TEXT,
    locked           INTEGER NOT NULL DEFAULT 0,
    hash_scellement  TEXT,
    pdf_path         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION check_devis_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.locked = 1 THEN
    RAISE EXCEPTION 'INALTÉRABILITÉ : ce devis est verrouillé (statut signé).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_devis_immutable ON devis;
CREATE TRIGGER trg_devis_immutable
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION check_devis_immutable();

CREATE OR REPLACE FUNCTION lock_devis_on_sign() RETURNS trigger AS $$
BEGIN
  IF NEW.statut = 'signe' AND OLD.locked = 0 THEN
    NEW.locked = 1;
    NEW.date_signature = COALESCE(NEW.date_signature, to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_devis_lock_on_sign ON devis;
CREATE TRIGGER trg_devis_lock_on_sign
  BEFORE UPDATE OF statut ON devis
  FOR EACH ROW EXECUTE FUNCTION lock_devis_on_sign();

-- ============================================================
-- LIGNES DE DEVIS
-- ============================================================
CREATE TABLE IF NOT EXISTS devis_lignes (
    id               SERIAL PRIMARY KEY,
    devis_id         INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    designation      TEXT    NOT NULL,
    description      TEXT,
    quantite         FLOAT8  NOT NULL DEFAULT 1,
    unite            TEXT,
    prix_unitaire_ht FLOAT8  NOT NULL,
    taux_tva_id      INTEGER NOT NULL REFERENCES taux_tva(id),
    taux_tva_valeur  FLOAT8  NOT NULL,
    remise_pct       FLOAT8  NOT NULL DEFAULT 0,
    montant_ht       FLOAT8  NOT NULL,
    montant_tva      FLOAT8  NOT NULL,
    montant_ttc      FLOAT8  NOT NULL
);

-- ============================================================
-- AVENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS avenants (
    id                   SERIAL PRIMARY KEY,
    numero               TEXT    NOT NULL UNIQUE,
    devis_initial_id     INTEGER NOT NULL REFERENCES devis(id),
    statut               TEXT    NOT NULL DEFAULT 'brouillon',
    date_creation        TEXT    NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    date_envoi           TEXT,
    date_signature       TEXT,
    delta_montant_ht     FLOAT8  NOT NULL DEFAULT 0,
    delta_montant_tva    FLOAT8  NOT NULL DEFAULT 0,
    delta_montant_ttc    FLOAT8  NOT NULL DEFAULT 0,
    nouveau_montant_ht   FLOAT8  NOT NULL DEFAULT 0,
    nouveau_montant_ttc  FLOAT8  NOT NULL DEFAULT 0,
    motif                TEXT    NOT NULL,
    locked               INTEGER NOT NULL DEFAULT 0,
    hash_scellement      TEXT,
    pdf_path             TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION check_avenant_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.locked = 1 THEN
    RAISE EXCEPTION 'INALTÉRABILITÉ : cet avenant est verrouillé.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avenant_immutable ON avenants;
CREATE TRIGGER trg_avenant_immutable
  BEFORE UPDATE ON avenants
  FOR EACH ROW EXECUTE FUNCTION check_avenant_immutable();

CREATE OR REPLACE FUNCTION lock_avenant_on_sign() RETURNS trigger AS $$
BEGIN
  IF NEW.statut = 'signe' AND OLD.locked = 0 THEN
    NEW.locked = 1;
    NEW.date_signature = COALESCE(NEW.date_signature, to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_avenant_lock_on_sign ON avenants;
CREATE TRIGGER trg_avenant_lock_on_sign
  BEFORE UPDATE OF statut ON avenants
  FOR EACH ROW EXECUTE FUNCTION lock_avenant_on_sign();

-- ============================================================
-- LIGNES D'AVENANT
-- ============================================================
CREATE TABLE IF NOT EXISTS avenants_lignes (
    id               SERIAL PRIMARY KEY,
    avenant_id       INTEGER NOT NULL REFERENCES avenants(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    type_ligne       TEXT    NOT NULL DEFAULT 'modification',
    designation      TEXT    NOT NULL,
    description      TEXT,
    quantite         FLOAT8  NOT NULL DEFAULT 1,
    unite            TEXT,
    prix_unitaire_ht FLOAT8  NOT NULL,
    taux_tva_id      INTEGER NOT NULL REFERENCES taux_tva(id),
    taux_tva_valeur  FLOAT8  NOT NULL,
    remise_pct       FLOAT8  NOT NULL DEFAULT 0,
    montant_ht       FLOAT8  NOT NULL,
    montant_tva      FLOAT8  NOT NULL,
    montant_ttc      FLOAT8  NOT NULL
);

-- ============================================================
-- FACTURES
-- ============================================================
CREATE TABLE IF NOT EXISTS factures (
    id                   SERIAL PRIMARY KEY,
    numero               TEXT    NOT NULL UNIQUE,
    devis_id             INTEGER REFERENCES devis(id),
    client_id            INTEGER NOT NULL REFERENCES clients(id),
    entreprise_id        INTEGER NOT NULL REFERENCES entreprise(id),
    type_facture         TEXT    NOT NULL DEFAULT 'standard',
    statut               TEXT    NOT NULL DEFAULT 'brouillon',
    date_emission        TEXT    NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    date_echeance        TEXT,
    date_paiement        TEXT,
    montant_ht           FLOAT8  NOT NULL DEFAULT 0,
    montant_tva          FLOAT8  NOT NULL DEFAULT 0,
    montant_ttc          FLOAT8  NOT NULL DEFAULT 0,
    tva_mode             TEXT    NOT NULL DEFAULT 'normal',
    conditions_paiement  TEXT,
    mode_paiement        TEXT,
    notes                TEXT,
    locked               INTEGER NOT NULL DEFAULT 0,
    hash_scellement      TEXT    NOT NULL DEFAULT '',
    hash_precedent       TEXT,
    pdf_path             TEXT,
    facturx_xml_path     TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION check_facture_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.locked = 1 AND NOT (OLD.statut = 'emise' AND NEW.statut = 'payee') THEN
    RAISE EXCEPTION 'INALTÉRABILITÉ : cette facture est verrouillée (Loi anti-fraude TVA 2018).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_facture_immutable ON factures;
CREATE TRIGGER trg_facture_immutable
  BEFORE UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION check_facture_immutable();

CREATE OR REPLACE FUNCTION lock_facture_on_emit() RETURNS trigger AS $$
BEGIN
  IF NEW.statut = 'emise' AND OLD.locked = 0 THEN
    NEW.locked = 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_facture_lock_on_emit ON factures;
CREATE TRIGGER trg_facture_lock_on_emit
  BEFORE UPDATE OF statut ON factures
  FOR EACH ROW EXECUTE FUNCTION lock_facture_on_emit();

-- ============================================================
-- LIGNES DE FACTURE
-- ============================================================
CREATE TABLE IF NOT EXISTS factures_lignes (
    id               SERIAL PRIMARY KEY,
    facture_id       INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    designation      TEXT    NOT NULL,
    description      TEXT,
    quantite         FLOAT8  NOT NULL DEFAULT 1,
    unite            TEXT,
    prix_unitaire_ht FLOAT8  NOT NULL,
    taux_tva_id      INTEGER NOT NULL REFERENCES taux_tva(id),
    taux_tva_valeur  FLOAT8  NOT NULL,
    remise_pct       FLOAT8  NOT NULL DEFAULT 0,
    montant_ht       FLOAT8  NOT NULL,
    montant_tva      FLOAT8  NOT NULL,
    montant_ttc      FLOAT8  NOT NULL
);

-- ============================================================
-- ACOMPTES
-- ============================================================
CREATE TABLE IF NOT EXISTS acomptes (
    id                           SERIAL PRIMARY KEY,
    numero                       TEXT    NOT NULL UNIQUE,
    facture_id                   INTEGER REFERENCES factures(id),
    devis_id                     INTEGER REFERENCES devis(id),
    client_id                    INTEGER NOT NULL REFERENCES clients(id),
    pourcentage                  FLOAT8,
    montant_ht                   FLOAT8  NOT NULL,
    montant_tva                  FLOAT8  NOT NULL,
    montant_ttc                  FLOAT8  NOT NULL,
    taux_tva_valeur              FLOAT8  NOT NULL,
    tva_exigible_encaissement    INTEGER NOT NULL DEFAULT 1,
    date_encaissement            TEXT,
    mode_paiement                TEXT,
    statut                       TEXT    NOT NULL DEFAULT 'en_attente',
    locked                       INTEGER NOT NULL DEFAULT 0,
    hash_scellement              TEXT,
    pdf_path                     TEXT,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION check_acompte_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.locked = 1 THEN
    RAISE EXCEPTION 'INALTÉRABILITÉ : cet acompte est verrouillé.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acompte_immutable ON acomptes;
CREATE TRIGGER trg_acompte_immutable
  BEFORE UPDATE ON acomptes
  FOR EACH ROW EXECUTE FUNCTION check_acompte_immutable();

CREATE OR REPLACE FUNCTION lock_acompte_on_encaissement() RETURNS trigger AS $$
BEGIN
  IF NEW.statut = 'encaisse' AND OLD.locked = 0 THEN
    NEW.locked = 1;
    NEW.date_encaissement = COALESCE(NEW.date_encaissement, to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acompte_lock_on_encaissement ON acomptes;
CREATE TRIGGER trg_acompte_lock_on_encaissement
  BEFORE UPDATE OF statut ON acomptes
  FOR EACH ROW EXECUTE FUNCTION lock_acompte_on_encaissement();

-- ============================================================
-- JOURNAL DE SCELLEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_scellement (
    id               SERIAL PRIMARY KEY,
    type_document    TEXT    NOT NULL,
    document_id      INTEGER NOT NULL,
    document_numero  TEXT    NOT NULL,
    hash_document    TEXT    NOT NULL,
    hash_precedent   TEXT,
    hash_cumule      TEXT    NOT NULL,
    algorithme       TEXT    NOT NULL DEFAULT 'SHA-256',
    date_scellement  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version_logiciel TEXT    NOT NULL DEFAULT '1.0.0',
    UNIQUE(type_document, document_id)
);

CREATE OR REPLACE FUNCTION check_scellement_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ISCA : le journal de scellement est inaltérable (UPDATE interdit).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scellement_no_update ON journal_scellement;
CREATE TRIGGER trg_scellement_no_update
  BEFORE UPDATE ON journal_scellement
  FOR EACH ROW EXECUTE FUNCTION check_scellement_no_update();

CREATE OR REPLACE FUNCTION check_scellement_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ISCA : le journal de scellement est inaltérable (DELETE interdit).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scellement_no_delete ON journal_scellement;
CREATE TRIGGER trg_scellement_no_delete
  BEFORE DELETE ON journal_scellement
  FOR EACH ROW EXECUTE FUNCTION check_scellement_no_delete();

-- ============================================================
-- ARCHIVE
-- ============================================================
CREATE TABLE IF NOT EXISTS archive_documents (
    id                    SERIAL PRIMARY KEY,
    type_document         TEXT    NOT NULL,
    document_id_original  INTEGER NOT NULL,
    numero                TEXT    NOT NULL,
    json_snapshot         TEXT    NOT NULL,
    hash_archive          TEXT    NOT NULL,
    date_archivage        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    annee_archivage       INTEGER NOT NULL,
    conservation_jusqu_au TEXT    NOT NULL,
    UNIQUE(type_document, document_id_original)
);

CREATE OR REPLACE FUNCTION check_archive_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ISCA : les archives sont inaltérables.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_immutable ON archive_documents;
CREATE TRIGGER trg_archive_immutable
  BEFORE UPDATE ON archive_documents
  FOR EACH ROW EXECUTE FUNCTION check_archive_immutable();

CREATE OR REPLACE FUNCTION check_archive_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ISCA : suppression interdite dans les archives (conservation 10 ans).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_no_delete ON archive_documents;
CREATE TRIGGER trg_archive_no_delete
  BEFORE DELETE ON archive_documents
  FOR EACH ROW EXECUTE FUNCTION check_archive_no_delete();

-- ============================================================
-- FEC
-- ============================================================
CREATE TABLE IF NOT EXISTS fec_ecritures (
    id            SERIAL PRIMARY KEY,
    journal_code  TEXT    NOT NULL,
    journal_lib   TEXT    NOT NULL,
    ecriture_num  TEXT    NOT NULL UNIQUE,
    ecriture_date TEXT    NOT NULL,
    compte_num    TEXT    NOT NULL,
    compte_lib    TEXT    NOT NULL,
    comp_aux_num  TEXT,
    comp_aux_lib  TEXT,
    piece_ref     TEXT,
    piece_date    TEXT,
    ecriture_lib  TEXT    NOT NULL,
    debit         FLOAT8  NOT NULL DEFAULT 0,
    credit        FLOAT8  NOT NULL DEFAULT 0,
    ecriture_let  TEXT,
    date_let      TEXT,
    valid_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    montant_devise FLOAT8,
    idevise       TEXT,
    facture_id    INTEGER REFERENCES factures(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ARTICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
    id               SERIAL PRIMARY KEY,
    reference        TEXT,
    designation      TEXT    NOT NULL,
    description      TEXT,
    unite            TEXT,
    prix_unitaire_ht FLOAT8  NOT NULL DEFAULT 0,
    taux_tva_id      INTEGER NOT NULL DEFAULT 1 REFERENCES taux_tva(id),
    actif            INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BONS DE LIVRAISON
-- ============================================================
CREATE TABLE IF NOT EXISTS bons_livraison (
    id               SERIAL PRIMARY KEY,
    numero           TEXT    NOT NULL UNIQUE,
    client_id        INTEGER NOT NULL REFERENCES clients(id),
    entreprise_id    INTEGER NOT NULL REFERENCES entreprise(id),
    devis_id         INTEGER REFERENCES devis(id),
    facture_id       INTEGER REFERENCES factures(id),
    statut           TEXT    NOT NULL DEFAULT 'brouillon',
    date_emission    TEXT    NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    date_livraison   TEXT,
    lieu_livraison   TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bons_livraison_lignes (
    id               SERIAL PRIMARY KEY,
    bl_id            INTEGER NOT NULL REFERENCES bons_livraison(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    designation      TEXT    NOT NULL,
    description      TEXT,
    quantite         FLOAT8  NOT NULL DEFAULT 1,
    unite            TEXT,
    article_id       INTEGER REFERENCES articles(id)
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_devis_client      ON devis(client_id);
CREATE INDEX IF NOT EXISTS idx_devis_statut      ON devis(statut);
CREATE INDEX IF NOT EXISTS idx_factures_client   ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut   ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_date     ON factures(date_emission);
CREATE INDEX IF NOT EXISTS idx_acomptes_client   ON acomptes(client_id);
CREATE INDEX IF NOT EXISTS idx_acomptes_statut   ON acomptes(statut);
CREATE INDEX IF NOT EXISTS idx_journal_document  ON journal_scellement(type_document, document_id);
CREATE INDEX IF NOT EXISTS idx_fec_date          ON fec_ecritures(ecriture_date);
CREATE INDEX IF NOT EXISTS idx_clients_rgpd      ON clients(statut_rgpd, date_anonymisation);
