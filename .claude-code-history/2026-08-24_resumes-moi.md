# Point d'étape — 24 août 2026

## 1. Ce qui vient d'être livré

### A. Lot 8 — Portabilité, Réversibilité & Recette (ENF-POR-01 à ENF-POR-08, LIV-9)
1. **Adaptateur de stockage S3 standard (`lib/storage/s3-adapter.ts`)** :
   - Implémentation complète du contrat `StorageAdapter` (`put`, `signedUrl`, `signedUrls`, `delete`, `list`, `download`).
   - Signature AWS SigV4 native en TypeScript pur avec `node:crypto` et `fetch` (zéro dépendance externe propriétaire).
   - Supporte AWS S3, MinIO, Cloudflare R2, Scaleway, Wasabi.
   - Enregistré dans `lib/storage/index.ts` sous `STORAGE_PROVIDER=s3`.
   - Tests unitaires complets dans `tests/unit/storage-s3.test.ts` (5 tests).

2. **Module d'Export Intégral & Manifeste (`lib/domain/portabilite.ts`, `lib/data/portabilite.ts`, `scripts/export-integral.ts`)** :
   - Dénombrement exact des tables et génération d'un dump SQL PostgreSQL standard (`database.sql`).
   - Inventaire et extraction de l'intégralité des fichiers stockés (`storage/`).
   - Génération de `manifest.json` avec horodatage, comptages par table et empreintes SHA-256 certifiant l'intégrité de la sauvegarde.
   - Script CLI `pnpm export:integral` et Route Handler API `/api/administration/portabilite/export`.
   - Tests unitaires dans `tests/unit/portabilite.test.ts` (4 tests).

3. **Écran d'Administration `/administration/portabilite`** :
   - Tableau de bord de souveraineté des données : état du schéma PostgreSQL standard, adaptateur de stockage actif, garanties de réversibilité.
   - Action en un clic pour télécharger le package d'export intégral.
   - Commandes pas-à-pas de restauration en ligne de commande.

4. **Guide de Restauration (`RESTORE.md`)** :
   - Guide exhaustif de déploiement et de restauration chez un hébergeur tiers (PostgreSQL 15+ nu + stockage compatible S3).

5. **Benchmark de Volume & Performance (`scripts/benchmark-volume.ts`)** :
   - Validation algorithmique du tracé d'organigramme vectoriel SVG (100 postes en < 5 ms) et des index PostgreSQL (`ltree`, `pg_trgm`).

### B. Organigramme — Raccordements latéraux & Rendu PDF
1. **Connecteurs bidirectionnels sur les 4 côtés** (`components/bureaux/bureau-node.tsx`) :
   - Haut, Bas, Gauche, Droite émetteurs et récepteurs.
   - Application stricte des 5 règles de tracé (Bas ➔ Haut, Bas ➔ Gauche, Bas ➔ Droit, Droit ➔ Gauche, Gauche ➔ Droit).
   - Résolution du sens hiérarchique préservant l'intégrité des autres liaisons.
2. **Alignement SVG de boîte à boîte (`lib/domain/organigramme-svg.ts`)** :
   - Alignement horizontal direct sur le même rang pour les adjoints sans sous-arbre (`y = parent.y`).
   - Tracé horizontal direct `M ... H ...` identique entre l'écran interactif et l'aperçu PDF.

---

## 2. Validation & Tests
- `pnpm check:secrets` : 0 secret détecté.
- `pnpm lint` : 0 erreur, 0 warning.
- `pnpm typecheck` : 0 erreur TypeScript.
- `pnpm test` : **899 tests unitaires validés avec succès** (46 suites de test Vitest).
- `pnpm build` : Build de production Next.js 16 (Turbopack) validé avec 33 routes générées.

---

## 3. Ce qui attend une décision de l'utilisateur
- Autorisation pour effectuer le `git push` vers le dépôt distant.
