# Point d'étape — 26 août 2026

## 1. Ce qui vient d'être livré

### 1. Statistiques d'évolution temporelle et Vue Graphique des Effectifs (Migration 0077)
1. **Évolution comparative temporelle multi-jalons sur les cartes KPI (`/tableau-de-bord`)** :
   - Ajout d'une barre discrète d'évolution temporelle au bas de chaque carte KPI de groupe EFFECTIFS (*Nouveaux baptisés*, *Croyants*, *Femmes*, *Hommes*, *En cellule*).
   - Sélecteur popover discret (`SlidersHorizontal`) permettant de basculer entre 5 périodes de comparaison :
     * **La semaine passée** (S-1)
     * **Le mois dernier** (M-1 — par défaut)
     * **Le trimestre dernier** (T-1)
     * **Le semestre dernier** (Sem-1)
     * **L'année dernière** (A-1)
   - Affichage de la valeur passée et badge de variation en pourcentage (`↗ +X %` / `↘ -X %` / `= 0 %`).
2. **Vue Graphique interactive en Aire (`CourbeEffectifs`, SVG sans dépendance)** :
   - Bouton de bascule en haut à droite des cartes d'effectifs pour afficher l'évolution des effectifs depuis un instant T (12 mois glissants).
   - Sélecteur de série (*Total croyants*, *Femmes*, *Hommes*, *En cellule*, *Nouveaux baptisés*).
   - Graphique en aire avec dégradé subtil, axe temporel, repères horizontaux et infobulles interactives.
3. **Backend & Base de données** :
   - Migration `supabase/migrations/0077_evolution_effectifs.sql` : fonction SQL `fn_evolution_effectifs` calculant les 5 jalons comparatifs et la série 12 mois en un aller-retour unique (`SECURITY INVOKER`).
   - Bundle `supabase/install.sql` régénéré avec les 77 migrations.

### 2. Évolution des Finances — Tous les types de finances dans le sélecteur
- Dans le graphique d'évolution financière (`components/tableau-de-bord/courbe-finances.tsx`) et la page `/tableau-de-bord` :
  - Intégration de toutes les catégories financières du référentiel (`listerCategoriesFinance`).
  - Sélecteur regroupé (`<SelectGroup>` / `<SelectLabel>`) :
    * *Toutes les recettes* et *Toutes les dépenses*
    * *Types de recettes* (Dîmes, Quêtes, Offrandes, Dons, Cotisations...)
    * *Types de dépenses* (Fonctionnement, Travaux, Aide sociale...)
  - Détection dynamique de la couleur et du dégradé (recette / dépense) avec calcul mois par mois.

### 3. Consolidation des menus d'en-tête en menus « Hamburger »
1. **Tableau de bord (`/tableau-de-bord`)** :
   - Consolidation des boutons (*Imprimer*, *Exporter Excel*, *Exporter CSV*, *Personnaliser*, *Rétablir l'ordre*) dans un menu déroulant Hamburger (`Menu`).
2. **Finances (`/finances`)** :
   - Maintien visible des boutons d'alertes prioritaires : **« À valider »** (avec décompte) et **« Accès à l'application »** (avec décompte).
   - Consolidation de toutes les autres actions dans un menu Hamburger (`FinancesActionsMenu`) :
     * **Dîmes** (*Relevé des collectes et versements par fidèle*)
     * **Synthèse** (*Bilan périodique et répartition par catégorie*)
     * **Vue consolidée** (*Comparaison des soldes de tout le périmètre*)
     * **Clôture** (*Arrêter et verrouiller les écritures d'un mois*, avec badge des périodes closes)
     * **Workflow de validation** (*Circuit d'approbation des écritures par entité*)
   - Sous-titres explicatifs intégrés sous chaque élément pour une clarté maximale.

### 4. Harmonisation visuelle & Design High-Density Minimalist
1. **Cartes KPI du Tableau de bord** :
   - Uniformisation stricte de la hauteur et alignement horizontal des dividers et barres d'évolution sur le modèle compact des cartes *Femmes* et *Hommes*.
2. **Harmonisation des couleurs dans le module Finances** :
   - Montants positifs (recettes) et bordures supérieures des cartes positives en **noir** (`text-foreground` / `bg-foreground`).
   - Dépenses, montants négatifs et bordures des cartes déficitaires en **rouge** (`text-rose-700` / `from-rose-400 to-orange-500`).

---

## 2. Validation & Tests
- `pnpm check:secrets` : 0 secret détecté.
- `pnpm lint` : 0 erreur, 0 warning.
- `pnpm typecheck` : 0 erreur TypeScript.
- `pnpm test` : **914 tests unitaires validés avec succès** (49 suites de tests Vitest).
- `pnpm build` : Build de production Next.js 16 (Turbopack) validé sans aucune erreur.
