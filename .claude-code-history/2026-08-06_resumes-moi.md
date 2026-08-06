# Résumé — 6 août 2026

> Point d'étape destiné à la reprise de session.
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local` (voir
> `.gitignore`).

---

## Où en est le projet

**SYNOD** — plateforme de gestion d'église. **Lots 0 et 1 livrés**, Lot 2 à démarrer.

L'application tourne : vous êtes connecté, le Siège existe, les quatre référentiels
sont amorcés (5 grades, 13 nationalités, 12 fonctions, 13 catégories financières).

---

## Ce qui fonctionne aujourd'hui

| Module | État |
|---|---|
| Authentification, session, habilitations avec portée | ✅ |
| Structure — organigramme éditable, CRUD, rattachement, corbeille | ✅ |
| Référentiels — les quatre tables, CRUD complet | ✅ |
| Tableau de bord | Coquille seulement — le moteur configurable est le Lot 5 |
| Croyants, Bureaux, Finances, Rapports | À venir |

**L'organigramme est un éditeur** : glisser une entité sur une autre la rattache,
tirer un trait depuis le point bas d'une entité mère aussi, et le menu ⋮ ouvre
création / fiche / modification / suppression — le tout en pop-up, sans quitter la vue.

---

## Trois décisions qui structurent la suite

**Le Siège est un niveau de la hiérarchie.** Conséquence non évidente d'ARB-2 : puisque
le Siège enregistre ses propres recettes et dépenses, il lui faut une entité pour les
porter. La hiérarchie compte donc **6 niveaux**. Bénéfice collatéral : le SuperAdmin y
est rattaché, son périmètre couvre tout l'arbre par construction, et il n'y a plus de
cas particulier dans les politiques de sécurité.

**Une habilitation est un couple (droit, portée).** Détenir `finance.create` ne signifie
pas pouvoir saisir pour n'importe quelle paroisse. Tout contrôle passe par
`can(permission, entityId)`, jamais par la seule clé.

**La portabilité est une contrainte d'architecture, pas une procédure d'export.**
`profiles` a sa propre clé primaire, la base ne stocke que des clés d'objet relatives,
et une règle ESLint interdit d'importer le SDK Supabase hors des adaptateurs.

---

## Ce qui vous attend

**Une seule action de votre part : la rotation de la clé `service_role`**
(Supabase > Project Settings > API). Elle a figuré en clair dans un transcript
local ; celui-ci a depuis été remplacé et le dossier est exclu du dépôt, mais la
clé a existé hors du coffre. Procédure détaillée dans `README.md`.

Le reste est fait :

- Le glisser-déposer persiste — la re-disposition se cale désormais sur
  l'identité du graphe et non sur une signature d'identifiants.
- **ERG-1 tranché** : le rattachement s'applique immédiatement, avec une action
  « Annuler » dans la notification. Une confirmation systématique cassait la
  fluidité pour une opération entièrement réversible et journalisée.
- **ARB-6** ne fait plus l'objet d'un rappel : la question sera posée au moment
  de développer un import, pas avant.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
pnpm dev          # http://localhost:3000
pnpm verify       # secrets + lint + types + 90 tests + build
```

Lire avant toute tâche : `CLAUDE.md`, puis `notes/cdg.md` et `notes/plan.md`.
