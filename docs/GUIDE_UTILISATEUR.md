# SYNOD — Guide d'Utilisation
### Plateforme de pilotage et de gestion de l'organisation ecclésiale

Bienvenue dans le manuel d'utilisation de **SYNOD**. Ce guide s'adresse à tous les membres de bureaux, responsables d'entités, trésoriers, secrétaires et gestionnaires.

---

## Sommaire

1. [Prise en main et Navigation](#1-prise-en-main-et-navigation)
2. [Structure Ecclésiale & Organigrammes](#2-structure-ecclésiale--organigrammes)
3. [Gestion des Croyants](#3-gestion-des-croyants)
4. [Transferts & Mobilité](#4-transferts--mobilité)
5. [Cérémonies & Baptêmes en Lot](#5-cérémonies--baptêmes-en-lot)
6. [Bureaux & Mandats](#6-bureaux--mandats)
7. [Finances Générales & Validation](#7-finances-générales--validation)
8. [Module des Dîmes](#8-module-des-dîmes)
9. [Tableaux de Bord Personnalisés](#9-tableaux-de-bord-personnalisés)
10. [Générateur de Rapports](#10-générateur-de-rapports)

---

## 1. Prise en main et Navigation

### Connexion et Sécurité
* Connectez-vous avec vos identifiants remis par votre administrateur.
* Lors de la première connexion avec un mot de passe provisoire, l'application vous invite automatiquement à définir un mot de passe personnel sécurisé.

### Périmètre d'action
* L'application applique strictement le principe de **portée hiérarchique** : vous n'accédez qu'aux données de votre entité de rattachement et de ses entités subordonnées.

---

## 2. Structure Ecclésiale & Organigrammes

* **Hiérarchie à 6 niveaux** : Siège National ➔ Régional ➔ District ➔ Paroisse ➔ Église locale ➔ Cellule de prière.
* **Navigation interactive** : visualisez l'arborescence des entités, consultez la fiche de chaque structure avec ses 6 onglets (Chiffres clés, Croyants, Bureau, Finances, Rapports, Statistiques).
* **Indicateur « Sans accès à l'application »** : signale les entités reculées dont la gestion est opérée en saisie déléguée par l'échelon supérieur.

---

## 3. Gestion des Croyants

### Fiche croyant et Création
* **Matricule unique** : généré automatiquement selon l'église et l'année (ex: `EGL-2026-0001`).
* **Informations civiles et ecclésiales** : nom, prénoms, sexe, date de naissance, situation matrimoniale (liens conjugaux), grade ecclésial (respectant le genre autorisé), cellule de rattachement.
* **Photo de profil** : téléversement avec recadrage automatique carré.
* **Export PDF** : bouton « Imprimer » permettant de sélectionner à la carte les colonnes à inclure avant d'éditer le document.

---

## 4. Transferts & Mobilité

* **Demande de transfert** : initiée par l'église de départ ou d'arrivée.
* **Workflow d'approbation** :
  * Si le transfert reste dans le même district/paroisse, l'approbation est automatique.
  * Si le transfert change de juridiction, il remonte automatiquement dans la file d'approbation de l'ancêtre commun compétent.
* **Attestation de transfert** : génération du document officiel certifié avec signature.
* **Clôture automatique de mandat** : si le croyant occupait un poste dans un bureau de son église d'origine, son mandat est automatiquement clôturé à la date d'effet du transfert.

---

## 5. Cérémonies & Baptêmes en Lot

* **Saisie en série** : saisie rapide de sessions de baptême (date, lieu, célébrants pasteurs/diacres habilités, liste de baptisés).
* L'attribution du grade initial « Croyant » est automatique.
* Génération des certificats de baptême officiels.

---

## 6. Bureaux & Mandats

* **Composition tabulaire** : constitution du bureau par rang protocolaire avec affichage des postes vacants.
* **Organigramme visuel interactif** :
  * Déplacement libre des blocs sur le canevas.
  * Liaison directionnelle entre les boîtes (vertical direct ou raccordement latéral pour les postes en dérivation / adjoints).
* **Impression PDF haute fidélité** : rendu vectoriel SVG à l'échelle A4 paysage reproduisant fidèlement les liaisons hiérarchiques et les dérivations de boîte à boîte.

---

## 7. Finances Générales & Validation

* **Triptyque comptable** : Recettes propres, Dépenses, Solde disponible, et vue consolidée du sous-arbre.
* **Circuit de validation** (activable par entité) :
  * `Brouillon` ➔ `Soumis` ➔ `Validé` (ou `Rejeté` avec motif obligatoire).
  * Les fonds ne sont comptabilisés dans le solde qu'une fois le mouvement `Validé`.
* **Pièces justificatives** : téléversement de PDF ou photos associés à chaque écriture.

---

## 8. Module des Dîmes

* **Règle fondamentale** : La dîme collectée en église locale appartient au **Siège National**. Elle ne gonfle pas le solde propre de l'église.
* **Enveloppes numérotées** : chaque croyant dispose d'un numéro d'enveloppe personnel.
* **Deux modes de collecte** :
  * *Mode détaillé* : saisie ligne à ligne par croyant/enveloppe avec émission de reçu papier ou thermique 80 mm.
  * *Mode global* : saisie d'un montant total lors des grands rassemblements.
* **Remise au Siège** : génération du bordereau de remise officiel groupant les collectes.

---

## 9. Tableaux de Bord Personnalisés

* **Catalogue de widgets** : 18 indicateurs de gestion, 4 répartitions graphiques, 1 jauge de solde.
* **Personnalisation glisser-déposer** : réordonnez et dimensionnez vos cartes selon vos priorités.
* **Drill-down** : chaque indicateur est cliquable pour afficher le détail sous-jacent.

---

## 10. Générateur de Rapports

* **Modèles officiels et personnalisés** : bibliothèque de gabarits réutilisables.
* **Éditeur de blocs** : assemblage sans code de 11 types de blocs (tableaux, chiffres clés, graphiques, organigrammes, photos, textes libres).
* **Règles d'intégrité** :
  * *Omission RG-26* : un bloc financier est masqué si l'utilisateur qui génère le rapport n'a pas le droit de consultation financière.
  * *Gel RG-27* : une fois généré, le rapport est figé dans le temps et ne change plus même si les données sous-jacentes évoluent.
* **Export PDF A4 paginé**.
