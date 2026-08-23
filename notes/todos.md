# TODO — Demandes en cours de planification

> Liste réinitialisée et tenue à jour au **23 août 2026**.
>
> **À lire avant de commencer** : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
> puis `CLAUDE.md`, [`cdg.md`](cdg.md) et [`plan.md`](plan.md).

---

## ⚠ État de la base

**Appliquées : `0001` à `0074`**, confirmé par l'utilisateur.

| N° | Ce qu'elle apporte | Sans elle |
|---|---|---|
| `0075` *(À appliquer)* | `grades.sexe_autorise` (`TOUS`, `M`, `F` avec check constraint) — restriction des sexes assignables à un grade ecclésial | Les grades acceptent indifféremment tout sexe sans contrôle ecclésial |
| `0074` | Table `evenements_dime` (`niveau_hote`, `ordre`, RLS), conversion de `finance_entries.dime_evenement` en `text` + FK, mise à jour de `fn_saisir_collecte_dime` et `fn_reordonner_referentiel` | Les événements de collecte de dîmes restent figés dans un enum PostgreSQL et du code TypeScript, sans écran d'administration |
| `0073` | `entities.logo_key` — l'en-tête propre à chaque entité, source du bloc Image d'un rapport (EF-RAP-02) ; à défaut, le logo de l'organisation le remplace | Un seul logo pour toute l'organisation, alors que certaines entités ont leur propre en-tête |
| `0072` | Élargit `dime_rapprochements` à l'**église résolue** (`select`/`write` RLS, `fn_resoudre_rapprochement`, nouvelle `fn_marquer_enveloppe_anonyme`) en plus de l'entité collectrice | Une église qui n'a rien collecté ne peut ni rapprocher, ni créer une fiche, ni déclarer anonyme une ligne que le fichier lui attribue |

---

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

- [x] **7. Dîmes — Action "Remettre au Siège" directe avec entité verrouillée**
      Dans `/finances/dimes`, le menu `⋮` déclenche directement `RemiseDialog` avec `entiteImposeeId` et `collecteImposeeId` pré-sélectionnés et verrouillés.
