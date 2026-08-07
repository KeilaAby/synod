# Résumé — 7 août 2026

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

**SYNOD** — plateforme de gestion d'église. **Lots 0, 1 et 2 livrés.**

L'application tourne : vous êtes connecté, le Siège existe, les quatre référentiels
sont amorcés (5 grades, 13 nationalités, 12 fonctions, 13 catégories financières),
et les croyants s'enregistrent.

---

## Ce qui fonctionne aujourd'hui

| Module | État |
|---|---|
| Authentification, session, habilitations avec portée | ✅ |
| Structure — organigramme éditable, vue liste, CRUD en pop-up, corbeille | ✅ |
| Référentiels — les quatre tables, CRUD complet | ✅ |
| Croyants — création en 3 étapes, liste, fiche, modification, corbeille | ✅ |
| Photo de profil — recadrage client, seau privé | ✅ |
| Transferts — demande, approbation, refus motivé, journal, compteur | ✅ |
| Baptêmes — saisie créant le croyant, registre, fenêtre paramétrable | ✅ |
| Import Excel des croyants (EF-CRO-11) | Reste du lot 2 — c'est là que se posera **ARB-6** |
| Saisie de baptêmes en lot (EF-BAP-07) | *Could* — non livré, le champ « session » le prépare |
| Tableau de bord | Coquille seulement — le moteur configurable est le Lot 5 |
| Bureaux, Finances, Rapports | À venir |

---

## Un seul chemin par opération

C'est la règle qui a guidé les dernières séances, et elle vaut d'être retenue :
**deux chemins pour la même opération divergent toujours.** La création d'entité
existait en page et en pop-up ; le champ Code n'avait été retiré que de l'un des
deux. La page `/structure/nouveau` a donc été supprimée.

Il en découle la forme actuelle de l'interface :

- **Structure** — l'organigramme et la vue liste partagent le même menu ⋮ et les
  mêmes quatre pop-up (`useEntityDialogs`, `EntityMenu`). Cliquer un nom ouvre la
  fiche sur place ; naviguer ferait perdre filtres et défilement pour un simple
  coup d'œil.
- **Croyants** — la liste a la même colonne d'options, et « Modifier » rouvre
  **le pop-up de création** : même formulaire, mêmes trois étapes.
- Les pages `/structure/[id]`, `/croyants/[id]` et leurs `modifier` restent en
  place pour le **lien profond et le partage** — c'est leur seule raison d'être.

**Filtres** — le contrôle suit la nature de l'ensemble : pictogrammes pour les
ensembles clos (niveaux, statuts, sexe, présence en cellule), sélecteur pour les
ensembles ouverts (églises, grades, nationalités, âge).

**Un filtre ne doit jamais attendre le serveur.** Les deux listes chargent leur
périmètre en une requête puis filtrent en mémoire ; `history.replaceState` garde
l'URL partageable sans déclencher de rendu serveur.

Pour les croyants, cela a demandé de **réviser ENF-PRF-08** : le filtrage
serveur coûtait quatre allers-retours enchaînés par caractère saisi, soit 1,7 s
mesurées par frappe. L'exigence de volume est maintenant tenue par un plafond
(`PLAFOND_CHARGEMENT_INTEGRAL = 2 000`) plutôt que par la pagination. Au-delà, le
lot est tronqué, l'écran le dit, et restreindre l'église recharge un périmètre
plus étroit.

---

## Deux identifiants attribués par la base, jamais saisis

**Code d'entité** — `SG-0001`, `REG-0004`, `DIS-0012`, `PAR-0007`, `EGL-0031`,
`CEL-0118`. Séquence de 4 chiffres par niveau.

**Matricule de croyant** — `MNK-00001-26` : initiales du nom et du prénom (3 au
plus), séquence de 5 chiffres, deux derniers chiffres de l'année d'enregistrement.

Dans les deux cas un trigger `BEFORE INSERT` renseigne la valeur si elle est
absente : seule la base peut garantir l'unicité de la séquence face à deux
créations simultanées. Les formulaires de création affichent le gabarit verrouillé
plutôt que de masquer le champ — l'utilisateur doit voir ce qui a été décidé pour lui.

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

**1. La rotation de la clé `service_role`** (Supabase > Project Settings > API).
Elle a figuré en clair dans un transcript local ; celui-ci a depuis été remplacé et
le dossier est exclu du dépôt, mais la clé a existé hors du coffre. Procédure
détaillée dans `README.md`. Un secret exposé ne se retire pas, il se révoque.
Cette clé sert désormais à un usage courant — tout accès au stockage des
photos — et non plus aux seules invitations : la rotation gagne en urgence.

**2. Supprimer le seau `croyant-photos`**, resté **public** dans le projet
Supabase. Tout fichier qui s'y trouve est lisible par quiconque connaît son URL.
`pnpm db:bucket` le signale à chaque exécution.

---

## Ce qui reste au Lot 2

**L'import Excel des croyants** (EF-CRO-11, *Should*). C'est là qu'**ARB-6** se
posera enfin : il faudra voir vos fichiers sources — volume, format, qualité —
pour caler l'import. La question a été mise de côté depuis le cadrage
précisément pour être posée à ce moment.

La **saisie de baptêmes en lot** (EF-BAP-07) est un *Could* : le champ
« session ou cérémonie » est déjà saisi, ce qui évitera de revenir sur les
baptêmes existants le jour où elle sera livrée.

---

## Deux points déjà rattachés au Lot 3 — Bureaux

- **EF-TRF-09** — un transfert effectif doit clore les mandats de bureau de
  l'entité d'origine. Le point d'insertion est marqué dans
  `fn_appliquer_transfert`, entre le déplacement et la clôture du transfert.
- La **frise du croyant** accueillera les fonctions occupées : `TypeEvenement`
  n'a qu'à gagner une valeur, et le composant une icône.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
pnpm dev          # http://localhost:3000
pnpm verify       # secrets + lint + types + 200 tests + build
```

Lire avant toute tâche : `CLAUDE.md`, puis `notes/cdg.md` et `notes/plan.md`.
