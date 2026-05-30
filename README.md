# FacturPro — Devis & Facturation France

SaaS de devis et facturation conforme au droit français, déployable en local ou sur serveur.

## Conformité légale

| Exigence | Implémentation |
|---|---|
| Loi anti-fraude TVA 2018 | Verrous base de données + chaîne SHA-256 |
| Factur-X / EN 16931 | PDF avec XML ZUGFeRD embarqué |
| FEC DGFiP | Export tabulé prêt pour contrôle fiscal |
| RGPD | Statut & durée de conservation par client |

## Stack

- **Backend** : TypeScript · Node.js · Express
- **Base de données** : PostgreSQL 17
- **PDF** : PDFKit + sharp (logo) + XML Factur-X
- **Auth** : JWT (rôles : admin, comptable, commercial, lecteur)
- **Email** : Nodemailer (SMTP configurable, fallback Ethereal en dev)
- **Frontend** : HTML5 / CSS3 / JavaScript Vanilla (SPA)

## Prérequis

- Node.js 20+
- PostgreSQL 17
- (Optionnel) Inno Setup 6+ pour générer le `.exe` Windows

## Installation

```powershell
# 1. Cloner le dépôt
git clone https://github.com/swarmnode/saas-facturation.git
cd saas-facturation

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
Copy-Item .env.example .env
# Éditer .env : DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_DEFAULT_PASS

# 4. Créer la base de données PostgreSQL
psql -U postgres -c "CREATE USER facturation WITH PASSWORD 'facturation';"
psql -U postgres -c "CREATE DATABASE facturation OWNER facturation;"

# 5. Démarrer en développement (hot-reload)
npm run dev
```

Le schéma SQL et les migrations sont appliqués automatiquement au premier démarrage.

Interface disponible sur **http://localhost:3000**  
Compte admin par défaut : `admin@localhost` / `Admin1234!`

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://facturation:facturation@localhost:5432/facturation` | Connexion PostgreSQL |
| `JWT_SECRET` | `change_me` | Secret de signature JWT — **à changer en production** |
| `PORT` | `3000` | Port du serveur Express |
| `ADMIN_EMAIL` | `admin@localhost` | Email du super-admin créé au premier démarrage |
| `ADMIN_DEFAULT_PASS` | `Admin1234!` | Mot de passe initial — **à changer immédiatement** |
| `PG_BIN` | `C:\Program Files\PostgreSQL\17\bin` | Chemin des binaires PostgreSQL (pour les sauvegardes) |

## Commandes

```powershell
npm run dev      # Développement avec hot-reload
npm run build    # Compilation TypeScript → dist/
npm start        # Production (dist/server/index.js)
```

## Installer Windows

```powershell
.\installer\build.ps1
# Puis compiler installer\FacturPro.iss avec Inno Setup 6+
# → FacturPro-Setup.exe autonome (Node.js + PostgreSQL portable inclus)
```

## Fonctionnalités

- **Devis** : création WYSIWYG, envoi email, acceptation, avenants, conversion BL/facture
- **Factures** : standard, avoir, Factur-X EN 16931, envoi groupé, export FEC
- **Lettrage** : rapprochement comptable compte 411, automatique au paiement/avoir, manuel
- **SEPA** : génération fichiers pain.008.001.02, mandats clients, prélèvements groupés
- **Acomptes** : facturation partielle, TVA sur encaissements
- **Bons de livraison** : liés aux devis et factures, conversion en facture
- **Clients** : professionnels et particuliers, SEPA, mode règlement par défaut, suivi RGPD
- **Catalogue d'articles** : réutilisable dans tous les documents
- **Multi-société** : un utilisateur peut appartenir à plusieurs entités
- **Sauvegardes** : planification `pg_dump` depuis l'interface
- **Vérification d'intégrité** : contrôle de la chaîne de scellement SHA-256

## Architecture

Voir [CLAUDE.md](CLAUDE.md) pour le détail de l'architecture, des invariants de conformité et des conventions de développement.

## Changelog

Voir [CHANGELOG.md](CHANGELOG.md) — historique complet des versions.

Dernière version : **[v2.4.140](https://github.com/swarmnode/saas-facturation/releases/tag/v2.4.140)** — Lettrage comptable, SEPA, WYSIWYG

## Licence

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Ce logiciel est publié sous licence **GNU Affero General Public License v3.0** (AGPL-3.0).

Vous êtes libre de l'utiliser, le modifier et le redistribuer. Toute version modifiée déployée en réseau (SaaS) ou redistribuée doit être publiée sous la même licence.

Voir le fichier [LICENSE](LICENSE) pour le texte complet.
