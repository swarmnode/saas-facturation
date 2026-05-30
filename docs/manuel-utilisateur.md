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
- **SEPA** — génération de fichiers de prélèvements bancaires au format pain.008.001.02.

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

# Interface

## Navigation

La barre de navigation verticale à gauche donne accès aux rubriques principales : **Tableau de bord**, **Clients**, **Devis**, **Factures**, **Avoirs**, **Acomptes**, **Bons de livraison**, **Articles**, et **Paramètres**. Les icônes et libellés sont dimensionnés pour une lecture facile.

## Onglets de travail

FacturPro fonctionne par **onglets** : chaque document ouvert (devis, facture, client…) s'affiche dans un onglet persistent en haut de l'écran.

- Les onglets sont conservés lors d'un rechargement de page — vous retrouvez exactement votre contexte de travail.
- Un onglet **non encore sauvegardé** (nouveau document) est également restauré après rechargement.
- L'ordre des onglets est fixe : il ne change pas entre les rechargements.
- Pour fermer un onglet, cliquer la croix à droite de son libellé.

## Tableau de bord

La page d'accueil affiche :

- Un résumé des **chiffres du mois** (devis en cours, factures émises, encaissements).
- La liste chronologique de **tous les documents récents** toutes catégories confondues (devis, factures, avoirs, acomptes, BL), avec le statut et le montant, cliquables directement.

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

## Coordonnées bancaires et SEPA

Pour pouvoir générer des fichiers de prélèvement SEPA, renseignez les coordonnées bancaires de votre entreprise dans l'onglet **Banque** :

| Champ | Remarque |
|---|---|
| IBAN | IBAN de votre compte créditeur (receveur des prélèvements) |
| BIC | BIC/SWIFT de votre banque |
| ICS | Identifiant Créancier SEPA (obtenu auprès de votre banque) — **obligatoire** pour générer un fichier SEPA |

Sans ICS valide, la génération de fichiers SEPA est bloquée.

---

# Gestion des clients

## Créer un client

Accédez à **Clients > Nouveau client**. Deux types sont disponibles :

- **Professionnel** — renseignez la raison sociale, SIRET et numéro de TVA intracommunautaire si applicable.
- **Particulier** — civilité, prénom, nom.

Les champs adresse, code postal et ville sont obligatoires (ils figurent sur les documents). Un champ **Adresse (complément)** est disponible pour les boîtes postales, bâtiments, étages, etc.

## Mode TVA client

Le champ **Mode TVA** permet de forcer un régime particulier pour ce client indépendamment du régime de l'entreprise :

| Valeur | Effet sur les documents |
|---|---|
| Normal | TVA au taux de la ligne |
| Franchise 293 B | Mention légale automatique, montant TVA = 0 |
| Autoliquidation | Mention légale art. 283-2 CGI |

## Mode de règlement par défaut

Le champ **Mode de règlement par défaut** pré-sélectionne automatiquement le mode de paiement lors de la création d'une facture pour ce client (virement, chèque, prélèvement SEPA…). Cela évite de ressaisir le même choix à chaque facture.

## Coordonnées bancaires SEPA

Pour les clients payant par prélèvement SEPA, renseignez l'onglet **SEPA** de la fiche client :

| Champ | Remarque |
|---|---|
| IBAN | IBAN du compte à débiter |
| BIC | BIC/SWIFT de la banque du client |
| Titulaire du compte | Nom du titulaire (peut différer de la raison sociale) |
| Référence mandat (RUM) | Référence unique du mandat de prélèvement |
| Date de signature du mandat | Date à laquelle le client a signé le mandat |
| Type de mandat | CORE (particuliers/entreprises) ou B2B (interentreprises) |

Ces informations sont nécessaires pour inclure le client dans un fichier de prélèvement SEPA.

## RGPD

Chaque client possède un **statut RGPD** :

| Statut | Signification |
|---|---|
| Prospect | Contact initial, aucun document signé |
| Client actif | Au moins un devis accepté ou document envoyé |
| Inactif | Aucune activité récente |
| Anonymisé | Données personnelles effacées (conservation légale 10 ans) |

La date de dernière activité et la date de consentement sont tracées automatiquement. Lorsqu'un devis est **accepté**, le statut du client passe automatiquement de *Prospect* à *Client actif*.

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
| Stock | Quantité disponible (optionnel) |
| N° de série | Numéro de série ou lot (optionnel, saisi par ligne dans les documents) |

Un article peut être désactivé (**Actif = Non**) pour le masquer des listes de sélection sans le supprimer.

---

# Éditeur de documents (WYSIWYG)

Tous les documents (devis, factures, avoirs, bons de livraison) s'ouvrent dans un **éditeur visuel page A4** qui reproduit l'aspect exact du document imprimé.

## Mise en page

- La page A4 est affichée à l'échelle, avec les marges, l'en-tête, le bloc client, les lignes et les totaux positionnés comme sur le PDF final.
- Vous pouvez faire défiler le contenu vers le bas pour atteindre le bas de page (signatures, mentions, totaux).

## Saisie des lignes

| Colonne | Remarque |
|---|---|
| Désignation | Texte de la prestation ou produit |
| Description | Détail optionnel sous la désignation |
| Qté | Quantité (alignée à droite) |
| P.U. HT | Prix unitaire hors taxe (aligné à droite) |
| Remise | Remise en % (alignée à droite) |
| TVA | Taux de TVA applicable (aligné à droite) |
| Montant HT | Calculé automatiquement (aligné à droite) |

Les totaux (HT, TVA ventilée par taux, TTC) sont recalculés en temps réel à chaque modification de ligne.

## Sélection du client

Le champ **Client** est un filtre de recherche : commencez à saisir le nom ou la raison sociale pour filtrer la liste. En bas de la liste déroulante, l'option **+ Nouveau client** permet de créer un client à la volée sans quitter le document.

## Enregistrement

- Le bouton **Enregistrer** (ou **Enregistré** en vert lorsqu'aucune modification n'est en attente) sauvegarde le document.
- Un document nouveau reçoit son numéro (ex. `DEV-2026-0001`) dès le premier enregistrement — le numéro apparaît alors dans l'en-tête de la page et dans l'onglet.
- Sur un document verrouillé (émis, signé), les champs sont en lecture seule et le bouton d'enregistrement est absent.

## Impression

Le bouton **Imprimer** (icône imprimante) génère un aperçu d'impression navigateur de la page A4 actuelle. Utilisez-le pour une impression rapide sans passer par le PDF.

## Barre d'actions

La barre d'outils au-dessus de la page affiche les actions disponibles selon le type et le statut du document (voir les sections par type de document ci-dessous).

---

# Devis

## Cycle de vie

```
brouillon → envoyé → accepté → bon de livraison (optionnel)
                              → facture
                   ↘ refusé
brouillon (signé = verrouillé définitivement)
```

Un devis **accepté** est verrouillé au niveau de la base de données — aucune modification n'est possible. Pour corriger un devis accepté, créez un **avenant**.

## Créer un devis

1. **Devis > Nouveau devis**
2. Sélectionnez le client via le champ de recherche filtrée.
3. Renseignez l'objet, la date de validité et les conditions de paiement.
4. Ajoutez les lignes : désignation, quantité, prix HT, taux TVA, remise (%).
5. Les lignes sont gratuites par défaut (case **Gratuit** cochée) — décochez pour activer la tarification.
6. Cliquez **Enregistrer** — le numéro `DEV-YYYY-NNNN` est attribué automatiquement.

## Envoyer un devis

Bouton **Envoyer** :

- Passe le statut à `envoyé`.
- Si un email client est renseigné, propose l'envoi direct par email avec le PDF en pièce jointe.

## Accepter un devis

Bouton **Accepter** (affiché en blanc sur fond coloré lorsque le devis est `envoyé`) :

- Verrouille le devis (statut `signé`).
- Fait passer le statut RGPD du client de *Prospect* à *Client actif* si ce n'est pas déjà le cas.
- Le bouton passe en vert avec le libellé **Accepté** (non cliquable).
- Les boutons **Créer un BL** et **Créer la facture** apparaissent dans la barre d'actions.

## Refuser

Bouton **Refuser** : archive le devis sans le verrouiller (il reste modifiable pour être dupliqué).

## Dupliquer

Le bouton **Dupliquer** crée un nouveau devis `brouillon` avec les mêmes lignes, ce qui permet de repartir d'un modèle.

## Aperçu PDF

Le bouton **Aperçu PDF** génère un PDF à la volée sans le sauvegarder.

## Convertir en bon de livraison

Depuis un devis accepté, le bouton **Créer un BL** génère un bon de livraison pré-rempli à partir des lignes du devis.

## Convertir en facture

Depuis un devis accepté, le bouton **Créer la facture** génère une facture pré-remplie à partir des lignes du devis.

---

# Avenants

Un avenant modifie un devis accepté sans altérer l'original (exigence d'inaltérabilité).

## Créer un avenant

Depuis la fiche d'un devis accepté : **Nouvel avenant**.

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

Une fois **émise**, la facture est verrouillée. La seule transition possible est de la passer à **payée**. Pour annuler une facture émise, créez un **avoir**.

## Types de factures

| Type | Usage |
|---|---|
| Standard | Facture classique |
| Avoir | Note de crédit (voir section dédiée) |
| Acompte | Facture d'acompte (voir section dédiée) |

## Créer une facture

Soit depuis un devis accepté (bouton **Créer la facture**), soit depuis un bon de livraison (bouton **Créer la facture**), soit directement depuis **Factures > Nouvelle facture**.

Les champs suivants sont importants :

| Champ | Remarque |
|---|---|
| Date d'émission | Date légale de la facture |
| Date d'échéance | Délai de paiement convenu (omis sur le PDF si non renseigné) |
| Conditions de paiement | Texte libre (virement, chèque…) |
| Mode de paiement | Pré-rempli si un mode par défaut est défini sur le client |

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

## Envoi groupé

Dans la liste des factures, cochez plusieurs factures via les cases à cocher, puis cliquez **Envoyer la sélection** : un email est envoyé à chaque client avec sa facture en pièce jointe. Le bouton n'est disponible que pour les factures au statut `emise`.

## Créer une facture depuis un bon de livraison

Depuis la fiche d'un bon de livraison, le bouton **Créer la facture** génère une facture pré-remplie avec les lignes du BL et le client associé.

---

# Avoirs

Un avoir est une note de crédit qui annule partiellement ou totalement une facture émise.

## Créer un avoir

Deux façons :

1. **Depuis une facture émise** : bouton **Créer un avoir** — le système pré-remplit l'avoir avec les lignes de la facture d'origine (montants négatifs) et lie les deux documents.
2. **Directement** : **Avoirs > Nouvel avoir** — saisissez manuellement les lignes.

| Champ | Remarque |
|---|---|
| Facture d'origine | Lien vers la facture annulée (optionnel mais recommandé) |
| Lignes | Montants positifs seulement — les montants sont affichés négativement sur le PDF |

## Émettre un avoir

Même processus qu'une facture : bouton **Émettre**. L'avoir est verrouillé, un PDF Factur-X est généré et les écritures comptables sont inscrites en FEC.

## Règles comptables

Un avoir annule tout ou partie d'une facture. Le rapprochement comptable (imputation de l'avoir sur la facture) est à réaliser dans votre logiciel comptable à partir des exports FEC.

---

# Acomptes

Les acomptes permettent de facturer une partie du montant avant la livraison.

## Cycle de vie

```
en_attente → encaissé (verrouillé définitivement)
```

## Créer un acompte

Depuis un devis accepté ou une facture : **Nouvel acompte**.

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

**Bons de livraison > Nouveau BL**, ou depuis un devis accepté via le bouton **Créer un BL**. Un BL peut être lié à un devis et/ou une facture.

| Champ | Remarque |
|---|---|
| Lieu de livraison | Adresse si différente de la fiche client |
| Lignes | Désignation + quantité + article (optionnel) + N° de série |

La **date de livraison** n'est pas saisie dans le système — elle est apposée manuellement à la main dans le cadre prévu à cet effet en bas du document imprimé.

## Créer une facture depuis un BL

Depuis un bon de livraison validé, le bouton **Créer la facture** génère une facture pré-remplie avec les lignes du BL.

## Suppression

Un BL peut être supprimé tant qu'il n'est pas lié à une facture émise ou à un chaînage documentaire (devis → BL → facture).

---

# Prélèvements SEPA

FacturPro génère des fichiers de prélèvement bancaire au format **pain.008.001.02** (norme SEPA) directement importables dans votre logiciel bancaire.

## Prérequis

Avant de générer un fichier SEPA, vérifiez que :

1. L'**ICS** (Identifiant Créancier SEPA) est renseigné dans **Paramètres > Entreprise > Banque**.
2. L'**IBAN** et le **BIC** de l'entreprise sont renseignés.
3. Chaque client à prélever possède un **IBAN**, un **BIC**, une **RUM** (référence mandat) et une **date de mandat** dans sa fiche.

## Générer un fichier SEPA

1. Allez dans **Factures** (liste).
2. Cochez les factures à prélever via les cases à cocher (seules les factures `emise` avec mode de règlement SEPA sont sélectionnables).
3. Cliquez **Générer SEPA**.
4. Le système valide chaque facture :
   - Vérifie que le client a un IBAN, BIC, RUM et une date de mandat.
   - Affiche un message d'erreur par facture si une information est manquante.
5. Un fichier XML `sepa_YYYY-MM-DD.xml` est téléchargé. Importez-le dans votre interface bancaire.

## Structure du fichier

Le fichier suit le schéma ISO 20022 pain.008.001.02 (prélèvement CORE ou B2B selon le type de mandat). Chaque transaction correspond à une facture. La date de règlement demandée est le lendemain de la génération (D+1 ouvré à paramétrer dans votre banque).

---

# Gestion des utilisateurs

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Toutes les fonctions : clients, devis, factures, acomptes, BL, avoirs, articles, paramètres, utilisateurs, sauvegardes |
| `comptable` | Clients, devis, factures, acomptes, BL, avoirs, articles — pas de gestion des utilisateurs ni des sauvegardes |
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

Le **Fichier des Écritures Comptables** (FEC) est généré automatiquement à chaque émission de facture ou d'avoir. Pour l'exporter :

**Factures > Exporter FEC** — télécharge un fichier texte tabulé au format DGFiP, nommé `FEC_YYYY-MM-DD.txt`.

Ce fichier est directement utilisable lors d'un contrôle fiscal (article L. 47 A du Livre des Procédures Fiscales).

## Vérification de la chaîne de scellement

Chaque document fiscal (facture, avoir, acompte, avenant signé) est chaîné par un hash SHA-256 cumulatif. Pour vérifier l'intégrité :

**Factures > Vérifier le scellement** — retourne `{ valide: true }` si la chaîne est intacte, ou identifie le premier document altéré.

Cette vérification peut être demandée par l'administration fiscale pour prouver que les documents n'ont pas été modifiés après émission.

## Pourquoi les documents sont-ils verrouillés ?

La **loi anti-fraude TVA 2018** (article 88 de la loi de finances 2016) impose que les logiciels de facturation garantissent l'**inaltérabilité**, la **sécurisation**, la **conservation** et l'**archivage** des données. FacturPro satisfait à cette obligation via :

1. Des verrous de base de données (triggers `BEFORE UPDATE`) qui bloquent toute modification d'un document émis.
2. Une chaîne de hachage SHA-256 (`journal_scellement`) qui détecte toute altération, même directement dans la base.
3. Un archivage automatique des snapshots JSON des documents avec conservation de 10 ans.

## Format Factur-X

Les PDFs générés par FacturPro sont au format **Factur-X** (profil EN 16931 / ZUGFeRD) : le fichier XML structuré conforme à la norme européenne est embarqué dans le PDF comme pièce jointe. Les logiciels comptables compatibles (Sage, EBP, Cegid, QuadraFact…) peuvent lire ce XML directement pour importer les écritures sans ressaisie.
