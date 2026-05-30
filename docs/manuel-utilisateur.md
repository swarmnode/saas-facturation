---
title: "FacturPro — Manuel utilisateur"
author: "Équipe FacturPro"
date: "2026"
lang: fr
toc: true
toc-depth: 3
numbersections: true
geometry: margin=2.5cm
fontsize: 11pt
linestretch: 1.3
header-includes:
  - \usepackage{fancyhdr}
  - \pagestyle{fancy}
  - \fancyhead[L]{FacturPro}
  - \fancyhead[R]{Manuel utilisateur}
---

# Présentation

FacturPro est un logiciel de devis et facturation conforme au droit français :

- **Loi anti-fraude TVA 2018** — inaltérabilité des documents fiscaux garantie par des verrous de base de données et une chaîne de scellement SHA-256.
- **Factur-X / EN 16931** — chaque facture émise embarque un fichier XML ZUGFeRD lisible par les systèmes comptables.
- **FEC (Fichier des Écritures Comptables)** — export DGFiP à tout moment, prêt pour un contrôle fiscal.
- **RGPD** — gestion du statut et de la durée de conservation des données clients.

Le logiciel est accessible depuis un navigateur à l'adresse `http://localhost:3000` (installation locale) ou à l'adresse fournie par votre administrateur.

---

# Première connexion

## Compte administrateur

Lors du premier démarrage, le système crée automatiquement un compte super-administrateur :

| Champ | Valeur par défaut |
|---|---|
| Email | `admin@localhost` |
| Mot de passe | `Admin1234!` |

**Changez ce mot de passe immédiatement** après la première connexion (menu *Mon compte > Modifier le mot de passe*).

## Changer son mot de passe

Toute session ouverte peut modifier son propre mot de passe depuis le menu utilisateur en haut à droite. L'ancien mot de passe est requis pour valider la modification.

---

# Configuration de l'entreprise

Avant de créer le premier document, renseignez les informations de votre société dans **Paramètres > Entreprise**.

## Informations légales obligatoires

| Champ | Remarque |
|---|---|
| Raison sociale | Dénomination exacte (SIRET) |
| Forme juridique | SAS, SARL, EI, etc. |
| SIRET | 14 chiffres, contrôlé à l'enregistrement |
| N° TVA intracommunautaire | FR + 2 chiffres + SIREN |
| Adresse complète | Figurera sur tous les documents |
| Régime TVA | Normal, franchise art. 293 B, ou autoliquidation |

Pour les **entreprises individuelles** (`is_EI = oui`), la mention légale sur les documents est adaptée automatiquement (pas de capital social ni de RCS).

## Logo

Déposez votre logo (PNG, JPEG, WebP, SVG — 2 Mo max) via le bouton **Importer un logo**. Il sera intégré en haut de tous les PDFs et sa couleur dominante sera extraite pour adapter l'habillage graphique automatiquement.

## Email / SMTP

Configurez le serveur SMTP dans l'onglet **Email** pour envoyer les devis et factures directement depuis FacturPro. Sans configuration, le système utilise un compte Ethereal (emails de test visibles dans la console, non délivrés).

| Champ | Exemple |
|---|---|
| Hôte SMTP | `smtp.mondomaine.fr` |
| Port | `587` (STARTTLS) ou `465` (SSL) |
| Utilisateur / Mot de passe | Identifiants du compte d'envoi |
| Adresse expéditeur | `facturation@mondomaine.fr` |

---

# Gestion des clients

## Créer un client

Accédez à **Clients > Nouveau client**. Deux types sont disponibles :

- **Professionnel** — renseignez la raison sociale, SIRET et numéro de TVA intracommunautaire si applicable.
- **Particulier** — civilité, prénom, nom.

Les champs adresse, code postal et ville sont obligatoires (ils figurent sur les documents).

## Mode TVA client

Le champ **Mode TVA** permet de forcer un régime particulier pour ce client indépendamment du régime de l'entreprise :

| Valeur | Effet sur les documents |
|---|---|
| Normal | TVA au taux de la ligne |
| Franchise 293 B | Mention légale automatique, montant TVA = 0 |
| Autoliquidation | Mention légale art. 283-2 CGI |

## RGPD

Chaque client possède un **statut RGPD** :

| Statut | Signification |
|---|---|
| Prospect | Contact initial, aucun document émis |
| Client actif | Au moins un document envoyé/signé |
| Inactif | Aucune activité récente |
| Anonymisé | Données personnelles effacées (conservation légale 10 ans) |

La date de dernière activité et la date de consentement sont tracées automatiquement.

---

# Catalogue d'articles

Le catalogue (**Articles**) vous permet de pré-renseigner vos produits et prestations pour les insérer rapidement dans les lignes de devis et factures.

| Champ | Remarque |
|---|---|
| Référence | Optionnel, libre |
| Désignation | Affiché sur les documents |
| Description | Texte long, imprimé sous la désignation |
| Unité | heure, jour, forfait, pièce… |
| Prix unitaire HT | Valeur par défaut à l'insertion |
| Taux TVA | Taux pré-sélectionné dans les lignes |

Un article peut être désactivé (**Actif = Non**) pour le masquer des listes de sélection sans le supprimer.

---

# Devis

## Cycle de vie

```
brouillon → envoyé → signé (verrouillé définitivement)
                   ↘ refusé
```

Un devis **signé** est verrouillé au niveau de la base de données — aucune modification n'est possible. Pour corriger un devis signé, créez un **avenant**.

## Créer un devis

1. **Clients > Devis > Nouveau devis**
2. Sélectionnez le client.
3. Renseignez l'objet, la date de validité et les conditions de paiement.
4. Ajoutez les lignes : désignation, quantité, prix HT, taux TVA, remise (%).
5. Cliquez **Enregistrer** — le numéro `DEV-YYYY-NNNN` est attribué automatiquement.

## Envoyer un devis

Bouton **Envoyer** :

- Passe le statut à `envoyé`.
- Si un email client est renseigné, propose l'envoi direct par email avec le PDF en pièce jointe.

## Signer / Refuser

- **Signer** : confirme l'acceptation du client. Le document est verrouillé.
- **Refuser** : archive le devis sans le verrouiller (il reste modifiable pour être dupliqué).

## Dupliquer

Le bouton **Dupliquer** crée un nouveau devis `brouillon` avec les mêmes lignes, ce qui permet de repartir d'un modèle.

## Aperçu PDF

Le bouton **Aperçu** génère un PDF à la volée sans le sauvegarder. Utile pour vérifier la mise en page avant envoi.

## Convertir en facture

Depuis un devis signé, le bouton **Créer la facture** génère une facture pré-remplie à partir des lignes du devis.

---

# Avenants

Un avenant modifie un devis signé sans altérer l'original (exigence d'inaltérabilité).

## Créer un avenant

Depuis la fiche d'un devis signé : **Nouvel avenant**.

| Champ | Remarque |
|---|---|
| Motif | Obligatoire — justification de la modification |
| Lignes | Modifications / ajouts / suppressions par rapport au devis initial |
| Delta montant | Calculé automatiquement (positif = surcoût, négatif = déduction) |

L'avenant suit le même cycle que le devis : `brouillon → envoyé → signé (verrouillé)`.

Le PDF de l'avenant récapitule le montant initial du devis, les modifications et le nouveau montant total.

---

# Factures

## Cycle de vie

```
brouillon → émise (verrouillée) → payée
```

Une fois **émise**, la facture est verrouillée. La seule transition possible est de la passer à **payée**.

## Types de factures

| Type | Usage |
|---|---|
| Standard | Facture classique |
| Avoir | Note de crédit (montants négatifs) |
| Acompte | Facture d'acompte (voir section dédiée) |

## Créer une facture

Soit depuis un devis signé (bouton **Créer la facture**), soit directement depuis **Factures > Nouvelle facture**.

Les champs suivants sont importants :

| Champ | Remarque |
|---|---|
| Date d'émission | Date légale de la facture |
| Date d'échéance | Délai de paiement convenu |
| Conditions de paiement | Texte libre (virement, chèque…) |
| Mode de paiement | Sélection prédéfinie |

## Émettre une facture

Le bouton **Émettre** :

1. Verrouille la facture.
2. Génère le PDF Factur-X (PDF + XML ZUGFeRD embarqué) et le sauvegarde dans `storage/pdf/`.
3. Inscrit les écritures comptables dans la table FEC.
4. Inscrit un scellement SHA-256 dans `journal_scellement`.

**Une facture émise ne peut pas être supprimée ni modifiée.** Pour annuler, créez un avoir.

## Marquer comme payée

Bouton **Enregistrer le paiement** : renseignez la date de paiement et le mode. Le statut passe à `payée`.

## Télécharger le PDF Factur-X

Le bouton **Télécharger PDF** livre le fichier PDF avec le fichier XML EN 16931 embarqué, compatible avec les logiciels comptables (Sage, EBP, Cegid…).

---

# Acomptes

Les acomptes permettent de facturer une partie du montant avant la livraison.

## Cycle de vie

```
en_attente → encaissé (verrouillé définitivement)
```

## Créer un acompte

Depuis un devis signé ou une facture : **Nouvel acompte**.

| Champ | Remarque |
|---|---|
| Pourcentage | Optionnel — calcule automatiquement le montant |
| Montant HT | Peut être saisi directement |
| Taux TVA | Appliqué à la totalité de l'acompte |
| TVA exigible à l'encaissement | Cocher si vous êtes en TVA sur encaissements |

## Encaisser un acompte

Bouton **Encaisser** : renseignez la date et le mode de paiement. L'acompte est verrouillé et un PDF est généré.

---

# Bons de livraison

Les bons de livraison (BL) documentent la remise physique des biens ou la réalisation des prestations.

## Créer un bon de livraison

**Bons de livraison > Nouveau BL**. Un BL peut être lié à un devis et/ou une facture.

| Champ | Remarque |
|---|---|
| Date de livraison | Date effective |
| Lieu de livraison | Adresse si différente de la fiche client |
| Lignes | Désignation + quantité + article (optionnel) |

Les BL ne sont pas soumis à l'obligation d'inaltérabilité fiscale — ils peuvent être modifiés tant qu'ils sont au statut `brouillon`.

---

# Gestion des utilisateurs

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Toutes les fonctions : clients, devis, factures, acomptes, BL, articles, paramètres, utilisateurs, sauvegardes |
| `comptable` | Clients, devis, factures, acomptes, BL, articles — pas de gestion des utilisateurs ni des sauvegardes |
| `commercial` | Clients, devis (lecture+écriture), factures et acomptes en lecture seule, BL, articles |
| `lecteur` | Lecture seule sur clients, devis, factures, acomptes, BL, articles |
| `super_admin` | Passe outre toutes les vérifications de permission ; gère plusieurs sociétés |

## Créer un utilisateur

**Paramètres > Utilisateurs > Nouvel utilisateur**.

Un `admin` peut créer des utilisateurs et les affecter à sa propre société. Seul un `super_admin` peut créer des comptes affectés à plusieurs sociétés.

## Multi-société

Le `super_admin` peut gérer plusieurs entreprises depuis une seule interface :

- **Paramètres > Entreprise > Nouvelle société** crée une deuxième entité.
- Un utilisateur peut être affecté à plusieurs sociétés avec des rôles différents par société.
- Le commutateur de société apparaît dans le menu de navigation si l'utilisateur a accès à plusieurs entités.

---

# Sauvegardes

## Configuration

**Paramètres > Sauvegardes** (réservé aux administrateurs).

| Paramètre | Valeur par défaut |
|---|---|
| Répertoire de destination | Chemin local ou réseau |
| Fréquence | Quotidienne, hebdomadaire, mensuelle |
| Heure | Heure locale du serveur |
| Rétention | Nombre de sauvegardes à conserver |

Les sauvegardes sont effectuées via `pg_dump` (chemin des binaires PostgreSQL configuré dans `PG_BIN`, par défaut `C:\Program Files\PostgreSQL\17\bin`).

## Déclencher une sauvegarde manuelle

Bouton **Sauvegarder maintenant** disponible sur la page de configuration.

## Restauration

La restauration n'est pas intégrée à l'interface ; elle se fait manuellement via `pg_restore` ou `psql` en ligne de commande. Contactez votre administrateur système.

---

# Conformité fiscale

## Export FEC

Le **Fichier des Écritures Comptables** (FEC) est généré automatiquement à chaque émission de facture. Pour l'exporter :

**Factures > Exporter FEC** — télécharge un fichier texte tabulé au format DGFiP, nommé `FEC_YYYY-MM-DD.txt`.

Ce fichier est directement utilisable lors d'un contrôle fiscal (article L. 47 A du Livre des Procédures Fiscales).

## Vérification de la chaîne de scellement

Chaque document fiscal (facture, acompte, avenant signé) est chaîné par un hash SHA-256 cumulatif. Pour vérifier l'intégrité :

**Factures > Vérifier le scellement** — retourne `{ valide: true }` si la chaîne est intacte, ou identifie le premier document altéré.

Cette vérification peut être demandée par l'administration fiscale pour prouver que les documents n'ont pas été modifiés après émission.

## Pourquoi les documents sont-ils verrouillés ?

La **loi anti-fraude TVA 2018** (article 88 de la loi de finances 2016) impose que les logiciels de facturation garantissent l'**inaltérabilité**, la **sécurisation**, la **conservation** et l'**archivage** des données. FacturPro satisfait à cette obligation via :

1. Des verrous de base de données (triggers `BEFORE UPDATE`) qui bloquent toute modification d'un document émis.
2. Une chaîne de hachage SHA-256 (`journal_scellement`) qui détecte toute altération, même directement dans la base.
3. Une archivage automatique des snapshots JSON des documents avec conservation de 10 ans.

---

# Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| « INALTÉRABILITÉ : ce document est verrouillé » | Tentative de modification d'un document émis/signé | Créer un avoir ou un avenant |
| « ISCA : le journal de scellement est inaltérable » | Tentative directe de modification en base | Ne jamais modifier `journal_scellement` manuellement |
| PDF non généré après émission | Répertoire `storage/pdf/` manquant ou droits insuffisants | Vérifier que le répertoire existe et que le serveur a les droits d'écriture |
| Email non reçu | SMTP non configuré ou compte Ethereal (mode test) | Configurer le SMTP dans Paramètres > Entreprise > Email |
| Sauvegarde échouée | `pg_dump.exe` introuvable | Vérifier `PG_BIN` dans `.env` |
