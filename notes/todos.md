# TODO — Demandes en cours de planification

> Liste réinitialisée et tenue à jour au **23 août 2026**.
>
> **À lire avant de commencer** : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
> puis `CLAUDE.md`, [`cdg.md`](cdg.md) et [`plan.md`](plan.md).

---

## ⚠ État de la base

**Appliquées : `0001` à `0075`**, confirmé par l'utilisateur.

### En attente d'application : `0076`, `0077`

| N° | Ce qu'elle apporte | Sans elle |
|---|---|---|
| `0077` | `fn_evolution_effectifs(p_entity, p_ancre)` — calcul des jalons comparatifs (S-1, M-1, T-1, Sem-1, N-1) et de la série mensuelle des effectifs sur 12 mois | Les cartes Croyants et la vue graphique en Aire ne disposent pas de l'historique d'évolution temporelle |
| `0076` | `finance_entries.annule_par` (FK profiles) et `finance_entries.annule_le` (timestamptz) avec mise à jour du trigger `fn_finance_before_write` | L'annulation d'un mouvement financier ne trace que le motif sans identifier l'opérateur ni la date précise |
| `0075` | `grades.sexe_autorise` (`TOUS`, `M`, `F` avec check constraint) — restriction des sexes assignables à un grade ecclésial | Les grades acceptent indifféremment tout sexe sans contrôle ecclésial |
| `0074` | Table `evenements_dime` (`niveau_hote`, `ordre`, RLS), conversion de `finance_entries.dime_evenement` en `text` + FK, mise à jour de `fn_saisir_collecte_dime` et `fn_reordonner_referentiel` | Les événements de collecte de dîmes restent figés dans un enum PostgreSQL et du code TypeScript, sans écran d'administration |
| `0073` | `entities.logo_key` — l'en-tête propre à chaque entité, source du bloc Image d'un rapport (EF-RAP-02) ; à défaut, le logo de l'organisation le remplace | Un seul logo pour toute l'organisation, alors que certaines entités ont leur propre en-tête |
| `0072` | Élargit `dime_rapprochements` à l'**église résolue** (`select`/`write` RLS, `fn_resoudre_rapprochement`, nouvelle `fn_marquer_enveloppe_anonyme`) en plus de l'entité collectrice | Une église qui n'a rien collecté ne peut ni rapprocher, ni créer une fiche, ni déclarer anonyme une ligne que le fichier lui attribue |

---

## Tâches Livrées (26 août 2026)

- [x] **11. Tableau de bord — Évolution temporelle des Croyants et Vue Graphique en Aire**
      - Migration `0077_evolution_effectifs.sql` et bundle `install.sql` : fonction SQL `fn_evolution_effectifs` calculant les 5 jalons de comparaison (`S-1`, `M-1`, `T-1`, `Sem-1`, `N-1`) et la série mensuelle des 12 derniers mois.
      - Sélecteur discret de période de comparaison au niveau de la section Effectifs avec « Mois dernier » par défaut.
      - Badges d'évolution sur les cartes Croyants (valeur passée de référence + badge avec flèche de tendance et pourcentage coloré).
      - Bouton bascule discret Vue Cartes / Vue Graphique en Aire (`CourbeEffectifs` en SVG pur avec dégradé fluide, sélection de série et tooltip interactive). 914 tests unitaires validés (49 fichiers).

## Tâches Livrées (23 août 2026)

- [x] **1. Organigramme PDF — Hiérarchie intermédiaire et dérivations**
      `imprimer-organigramme.ts` transmet `enDerivation: place.enDerivation` à `BlocImprime`, et `lib/domain/organigramme-svg.ts` (`disposerEnArbre`) intègre la largeur des dérivations dans le sous-arbre pour éliminer les chevauchements. Tests unitaires 35/35 vérifiés.

- [x] **2. Liste des Croyants — Sélection des colonnes avant impression PDF**
      Nouveau dialogue `SelecteurColonnesDialog` affiché au clic sur « Imprimer » dans `/croyants`, permettant de cocher/décocher les colonnes à inclure sur l'export PDF (Nom, Matricule, Sexe, Âge, Église, Cellule, Grade, Baptême, Statut).

- [x] **3. Sélecteurs de croyants — Affichage systématique des photos de profil**
      `CroyantPicker` gère `photoKey`, `photo_key` et URLs directes ; signature des photos pour `conjointsPotentiels` et injection dans `CroyantForm`.

- [x] **4. Tableau des dîmes — Clarification et actions du menu ⋮ par collecte**
      Remplacement du menu trompeur par des actions réelles : « Remettre au Siège » et « Imprimer les reçus (A4) ».

- [x] **5. Rapprochement des dîmes — Filtrage des croyants par église connue**
      Dans `/croyants` (section rapprochements), la liste des croyants est filtrée sur l'église connue/retenue de la collecte ou de l'enveloppe ; si l'église est indéterminée et que l'utilisateur est SuperAdmin, la liste complète est accessible.

- [x] **6. Référentiel des Grades — Restriction des sexes assignables**
      Migration `0075_grades_sexe_autorise.sql` (bundle `install.sql` à jour), intégration dans `REFERENTIELS.grades`, `gradeEstCompatibleSexe`, validations serveur dans `creerCroyant` / `modifierCroyant`, et filtrage dynamique dans `croyant-form.tsx`.

- [x] **8. Organigramme — Raccordements latéraux & Rendu PDF**
      4 connecteurs bidirectionnels, application stricte des 5 règles de tracé sans rupture hiérarchique, alignement horizontal de boîte à boîte sur le même rang dans l'impression PDF (`lib/domain/organigramme-svg.ts`).

- [x] **9. Lot 8 — Portabilité & Réversibilité (ENF-POR-01 à 08, LIV-9)**
      `S3StorageAdapter` (AWS SigV4 natif), module d'export intégral (`pnpm export:integral`, `manifest.json`, `database.sql`, `storage/`), Route API `/api/administration/portabilite/export`, écran `/administration/portabilite`, guide `RESTORE.md` et benchmark `scripts/benchmark-volume.ts`. 899 tests unitaires validés (46 fichiers).

- [x] **10. Centre d’Aide & Documentation Intégré (25 août 2026)**
      Manuel d'Utilisation de A à Z rédigé sans jargon (10 thèmes illustrés), Manuel d'Administration pour les SuperAdmins (7 piliers), interface ergonomique `/documentation` avec recherche en direct, et intégration globale dans la navigation (`app-sidebar.tsx`, `topbar.tsx`, hub `/administration`). 903 tests unitaires passés.
