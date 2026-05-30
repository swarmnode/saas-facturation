# Architecture — SaaS Devis & Facturation France

## Conformité légale ciblée
- **Loi anti-fraude TVA (2018)** — Inaltérabilité, Sécurisation, Conservation, Archivage (ISCA)
- **Factur-X** — PDF standard avec XML structuré embarqué (profil EN 16931)
- **RGPD** — Anonymisation prospects après 3 ans, clients après 10 ans
- **FEC** — Export Fichier des Écritures Comptables (contrôle fiscal)

---

## Stack technique

| Couche        | Technologie                              |
|---------------|------------------------------------------|
| Frontend      | HTML5 / CSS3 / JavaScript (Vanilla)      |
| Backend       | TypeScript / Node.js / Express           |
| Base de données | **SQLite** — `better-sqlite3`          |
| PDF / Factur-X | PDFKit + XML ZUGFeRD embedé            |
| Scellement    | Node.js `crypto` — SHA-256, chaînage     |
| Stockage PDF  | Système de fichiers local `/storage/pdf` |

### Pourquoi SQLite
- Stockage 100 % local, zéro dépendance réseau
- Transactions ACID + triggers SQL natifs → inaltérabilité sans ORM
- Portabilité maximale (1 fichier `database/app.db`)
- Suffisant pour un SaaS mono-tenant ou PME

---

## Arborescence

```
saas-facturation/
├── ARCHITECTURE.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── server/
│   │   ├── index.ts                     ← Point d'entrée Express
│   │   ├── db/
│   │   │   ├── database.ts              ← Connexion SQLite (better-sqlite3)
│   │   │   └── schema.sql               ← Schéma complet (tables + triggers)
│   │   ├── routes/
│   │   │   ├── devis.ts
│   │   │   ├── factures.ts
│   │   │   ├── clients.ts
│   │   │   ├── entreprise.ts
│   │   │   └── acomptes.ts
│   │   ├── services/
│   │   │   ├── NumerotationService.ts   ← Séquence continue et unique
│   │   │   ├── DevisService.ts          ← Machine à états + verrouillage
│   │   │   ├── AvenantService.ts        ← Avenant + calcul écarts financiers
│   │   │   ├── AcompteService.ts        ← TVA exigible à l'encaissement
│   │   │   ├── FactureService.ts        ← Facturation + écriture FEC
│   │   │   ├── FacturXService.ts        ← Génération PDF + XML Factur-X
│   │   │   ├── ScelleService.ts         ← Chaînage SHA-256 (ISCA)
│   │   │   ├── FecExportService.ts      ← Export FEC comptable
│   │   │   └── ArchiveService.ts        ← Base Active/Archive + RGPD
│   │   └── middleware/
│   │       └── errorHandler.ts
│   │
│   └── client/
│       ├── index.html
│       ├── css/
│       │   └── styles.css
│       └── js/
│           └── app.js
│
├── storage/
│   ├── pdf/                             ← PDFs Factur-X générés (servis en statique)
│   └── archive/                         ← Snapshots JSON longue durée (10 ans)
│
└── database/
    └── app.db                           ← Créé automatiquement au 1er démarrage
```

---

## Mécanismes de conformité

### 1. Inaltérabilité — SQL Triggers
Chaque table critique (`devis`, `factures`, `acomptes`, `avenants`, `journal_scellement`)
possède un trigger `BEFORE UPDATE` qui lève une exception `RAISE(ABORT, ...)` dès que
`locked = 1`. Le verrouillage est déclenché automatiquement :
- Devis → à la signature (`statut = 'signe'`)
- Facture → à l'émission (`statut = 'emise'`)
- Acompte → à l'encaissement (`statut = 'encaisse'`)

### 2. Scellement cryptographique — ISCA
Chaque document émis génère une entrée dans `journal_scellement` :
```
hash_document  = SHA-256(JSON complet du document)
hash_cumule    = SHA-256(hash_document + hash_precedent)
```
Le chaînage rend toute falsification rétroactive détectable.
Le trigger interdit toute `UPDATE` ou `DELETE` sur cette table.

### 3. Séparation Base Active / Base Archive
- **Base Active** : tables opérationnelles (devis, factures, clients…)
- **`archive_factures`** : snapshot JSON immuable de chaque facture émise,
  conservé 10 ans (obligation légale comptable)
- **RGPD** : champ `statut_rgpd` sur `clients` + `date_anonymisation` ;
  un job planifié anonymise les prospects inactifs depuis 3 ans

### 4. Numérotation continue (art. L. 441-3 CGI)
La table `sequence_numerotation` garantit une numérotation sans rupture,
sans doublon, par type (`DEVIS`, `FACTURE`, `ACOMPTE`, `AVOIR`) et par année.
Format : `FAC-2025-0001`, `DEV-2025-0042`, etc.

### 5. TVA — Cas spéciaux
| Cas                   | Taux | Mention générée automatiquement                         |
|-----------------------|------|---------------------------------------------------------|
| Standard              | 20 % | `TVA 20 %`                                             |
| Taux intermédiaire    | 10 % | `TVA 10 %`                                             |
| Taux réduit           | 5,5 %| `TVA 5,5 %`                                            |
| Franchise en base     |  0 % | `TVA non applicable, art. 293 B du CGI`                |
| Autoliquidation       |  0 % | `Autoliquidation — TVA due par le preneur`             |

### 6. Entrepreneur Individuel (EI)
Si `entreprise.is_EI = true`, la mention **"EI"** est automatiquement
insérée après la raison sociale sur tous les documents générés.

### 7. Acomptes — TVA exigible à l'encaissement
Chaque acompte encaissé déclenche l'exigibilité immédiate de la TVA
correspondante, conformément à l'article 269-2-b du CGI.
Le flag `tva_exigible_encaissement` trace cet événement.
