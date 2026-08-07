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

**SYNOD** — plateforme de gestion d'église. **Lots 0 et 1 livrés**, **Lot 2 aux
deux tiers**.

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
| Transferts, baptêmes | Base et domaine faits ; **écrans à construire** |
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

**Un filtre ne doit jamais attendre le serveur.** Son état vit côté client, le
clic le change immédiatement, l'URL suit dans une transition, et la liste reste
affichée en s'estompant plutôt que de céder la place à un squelette.

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

**1. Appliquer la migration `0013`.** Dans l'éditeur SQL Supabase, exécuter
`supabase/install-incremental.sql` (ne contient que `0013`). Elle crée les
séquences de codes d'entité, réécrit le générateur de matricule au nouveau format
et rattrape les compteurs des enregistrements existants. Sans elle, la création
d'entité échouera : le formulaire n'envoie plus de code.

**2. La rotation de la clé `service_role`** (Supabase > Project Settings > API).
Elle a figuré en clair dans un transcript local ; celui-ci a depuis été remplacé et
le dossier est exclu du dépôt, mais la clé a existé hors du coffre. Procédure
détaillée dans `README.md`. Un secret exposé ne se retire pas, il se révoque.

---

## Ce qui reste au Lot 2

Dans cet ordre — chaque étape s'appuie sur la précédente :

1. **Transferts** (EF-TRF-01 à 08) : dialogue de demande, file d'approbation,
   journal. La table, les transitions d'état et la recherche d'approbateur
   compétent (`RG-12`, `fn_ancetre_commun`) sont déjà en base et testées ; il ne
   manque que les écrans.
2. **Baptêmes** (EF-BAP-01 à 04) : saisie, et fenêtre « nouveaux baptisés » de
   15 jours (ARB-5).
3. **Compteurs « en attente »** dans l'en-tête (UI-21) — ils n'ont de sens qu'une
   fois la file d'approbation existante.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
pnpm dev          # http://localhost:3000
pnpm verify       # secrets + lint + types + 168 tests + build
```

Lire avant toute tâche : `CLAUDE.md`, puis `notes/cdg.md` et `notes/plan.md`.
