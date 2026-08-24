# SYNOD — Manuel d'Administration
### Guide d'exploitation, de gouvernance et de souveraineté des données

Ce guide s'adresse aux **Super-Administrateurs**, **Responsables Informatiques** et **Délégués d'Administration**.

---

## Sommaire

1. [Gestion des Comptes et des Accès](#1-gestion-des-comptes-et-des-accès)
2. [Modèle d'Habilitations Fines & Délégation](#2-modèle-dhabilitations-fines--délégation)
3. [Administration des Référentiels](#3-administration-des-référentiels)
4. [Journal d'Audit & Conformité](#4-journal-daudit--conformité)
5. [Corbeille & Rétention des Données](#5-corbeille--rétention-des-données)
6. [Paramètres Généraux & Serveur SMTP](#6-paramètres-généraux--serveur-smtp)
7. [Portabilité, Sauvegardes & Restauration (Lot 8)](#7-portabilité-sauvegardes--restauration-lot-8)

---

## 1. Gestion des Comptes et des Accès

* **Ouverture de compte sans invitation email non sécurisée** :
  * L'administrateur crée le compte, renseigne l'entité de rattachement et attribue le rôle (`SUPERADMIN`, `ENTITE_ADMIN`, `ENTITE_OPERATEUR`, `LECTEUR`).
  * Un **mot de passe provisoire** est généré à l'écran et remis en main propre. L'utilisateur doit le changer à sa première connexion.
* **Suspension et Déverrouillage** : blocage immédiat d'un compte sans suppression de l'historique d'audit.

---

## 2. Modèle d'Habilitations Fines & Délégation

* **Principe clé : Droit + Portée** :
  * Un privilège s'exprime toujours par le couple `(permission, entite_portee)`.
  * La délégation (`permission.delegate`) est strictement bornée : un délégant ne peut accorder que des droits qu'il détient lui-même et sur son propre sous-arbre hiérarchique.
* **Profils d'habilitations réutilisables** :
  * Modèles préconfigurés : *Responsable d'Entité*, *Secrétaire*, *Trésorier Principal*, *Commissaire aux Comptes*, *Gestionnaire de Données*.

---

## 3. Administration des Référentiels

Accessibles depuis `/referentiels` et `/administration` :
1. **Grades Ecclésiaux** : intitulé, ordre protocolaire, droit de célébrer les baptêmes (`peut_celebrer`), restriction de sexe autorisé (`TOUS`, `M`, `F`).
2. **Fonctions de Bureau** : intitulé, rang dans l'organigramme, flag `est_financiere` (RG-31).
3. **Catégories Financières** : recettes et dépenses avec sens comptable strict dénormalisé.
4. **Nationalités** : code ISO et libellé officiel.
5. **Événements de Dîmes** : types de rassemblements et niveau hôte associé.

---

## 4. Journal d'Audit & Conformité

* Écran inaltérable `/administration/audit`.
* **Lisibilité sans jargon** :
  * Enregistre l'auteur réel, l'adresse IP, l'horodatage précis, l'entité concernée et la description en langage naturel des différences (*« Changement du montant de 50 000 Ar à 75 000 Ar »*).
  * Consigne également les tentatives d'accès refusées (`DENIED`).

---

## 5. Corbeille & Rétention des Données

* Écran `/administration/corbeille` :
  * Multi-entités : regroupe les croyants et structures supprimés sous *soft-delete*.
  * Restauration en un clic avec intégrité référentielle vérifiée.
  * Purge définitive réservée au Super-Administrateur.

---

## 6. Paramètres Généraux & Serveur SMTP

* Configuration centralisée (`/administration/parametres`) :
  * Identité de l'organisation et logo national.
  * Fuseau horaire et devise de référence.
  * Délais de grâce de correction des écritures financières.
  * **Serveur de messagerie (SMTP)** : hôte, port, chiffrement TLS/STARTTLS, nom d'expéditeur et bouton de test d'envoi immédiat. Le mot de passe SMTP reste sécurisé hors base dans `.env.local` (`SMTP_PASS`).

---

## 7. Portabilité, Sauvegardes & Restauration (Lot 8)

### Principes de Souveraineté (ENF-POR-01 à 08)
* **Zéro verrouillage hébergeur** : 100 % du schéma repose sur du SQL standard PostgreSQL 15+.
* **Clés relatives** : aucune URL absolue stockée en base.
* **Support S3 universel** : adaptateur nativement compatible avec AWS S3, MinIO, Cloudflare R2, Scaleway, Wasabi.

### Commandes d'Exploitation
```bash
# 1. Export intégral (dump SQL + arborescence storage + manifest.json SHA-256)
pnpm export:integral

# 2. Restauration chez un hébergeur tiers
psql -h $HOTE_PG -U $USER -d synod_prod -f supabase/install.sql
psql -h $HOTE_PG -U $USER -d synod_prod -f database.sql
aws s3 sync ./storage s3://mon-bucket/ --endpoint-url $S3_ENDPOINT

# 3. Vérification de l'intégrité
pnpm test
```
*Consultez le fichier `RESTORE.md` à la racine pour la procédure détaillée de reprise d'activité.*
