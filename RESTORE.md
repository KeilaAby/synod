# SYNOD — Procédure de Restauration et de Réversibilité
### Exigences contractuelles : ENF-POR-01 à ENF-POR-08, LIV-9

Ce document décrit la procédure pas-à-pas pour **restaurer une instance SYNOD complète** chez n'importe quel hébergeur ou sur une infrastructure souveraine auto-hébergée (PostgreSQL 15+ standard et stockage S3 compatible).

---

## 1. Prérequis d'infrastructure

1. **Serveur PostgreSQL 15+** avec accès super-utilisateur ou habilité à activer les extensions standard :
   * `ltree` (gestion hiérarchique des périmètres)
   * `pg_trgm` (recherche textuelle et phonétique)
   * `pgcrypto` (génération d'UUID et fonctions de hachage)
2. **Stockage d'objets compatible S3 API v4** (au choix) :
   * MinIO (auto-hébergé)
   * AWS S3
   * Cloudflare R2
   * Scaleway Object Storage
   * Wasabi / OVH Object Storage
3. **Runtime Node.js 20+** et gestionnaire de paquets `pnpm`.

---

## 2. Restauration de la Base de Données

### Étape 2.1 — Création de la base et des extensions
Connectez-vous à votre instance PostgreSQL cible :

```sql
CREATE DATABASE synod_prod WITH ENCODING 'UTF8';
\c synod_prod

CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Étape 2.2 — Application du Schéma
Appliquez le schéma consolidé des migrations du projet (`supabase/install.sql`) :

```bash
psql -h <HOTE_PG> -U <UTILISATEUR> -d synod_prod -f supabase/install.sql
```

### Étape 2.3 — Injection des Données
Injectez le fichier de données `database.sql` issu de l'export intégral :

```bash
psql -h <HOTE_PG> -U <UTILISATEUR> -d synod_prod -f database.sql
```

### Étape 2.4 — Contrôle d'intégrité contre `manifest.json`
Vérifiez que le nombre de lignes par table correspond exactement aux décomptes inscrits dans `manifest.json` :

```sql
SELECT count(*) AS total_croyants FROM croyants;
SELECT count(*) AS total_entities FROM entities;
SELECT count(*) AS total_finances FROM finance_entries;
SELECT count(*) AS total_bureaux FROM bureaux;
```

---

## 3. Restauration du Stockage de Fichiers

### Étape 3.1 — Création du Bucket S3
Créez un bucket privé nommé (ex: `synod-prod`) sur votre stockage S3.

### Étape 3.2 — Copie des fichiers
Transférez l'intégralité du dossier `storage/` dans le bucket S3 en préservant strictement l'arborescence des clés relatives (`photos/`, `justificatifs/`, `logos/`, `rapports/`) :

**Avec l'outil AWS CLI / MinIO Client (`mc`) :**
```bash
# Exemple avec AWS CLI :
aws s3 sync ./storage s3://synod-prod/ --endpoint-url <ENDPOINT_S3>

# Exemple avec MinIO Client :
mc cp --recursive ./storage/ myminio/synod-prod/
```

---

## 4. Configuration de l'Application

Dans le fichier d'environnement de l'application (`.env.local` ou variables d'environnement de production) :

```env
# -----------------------------------------------------------------------------
# Base de données PostgreSQL
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# -----------------------------------------------------------------------------
# Stockage S3 (Lot 8 — Portabilité ENF-POR-03)
# -----------------------------------------------------------------------------
STORAGE_PROVIDER=s3
STORAGE_BUCKET=synod-prod
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_REGION=fr-par
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

---

## 5. Vérification et Recette

1. Lancez la suite de tests unitaires et d'intégration :
   ```bash
   pnpm test
   ```
2. Démarrez l'application :
   ```bash
   pnpm build && pnpm start
   ```
3. Connectez-vous avec un compte Administrateur, vérifiez l'affichage des organigrammes, des photos de croyants et des pièces justificatives financières.

---

*Fin de la procédure de restauration — SYNOD garantit l'indépendance technologique et l'absence totale de verrouillage fournisseur (ENF-POR-01 à ENF-POR-08).*
