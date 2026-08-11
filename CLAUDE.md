@AGENTS.md

# SYNOD — contexte projet

Application web de gestion d'église. **Lire avant toute tâche** :

- [`cdg.md`](notes/cdg.md) — exigences `EF-*`, règles de gestion `RG-01` à `RG-32`
- [`plan.md`](notes/plan.md) — modèle de données, RLS, design system, écrans, lots
- [`.agents/rules/`](.agents/rules/) — règles **impératives** : `designrules.md`
  (stack et design) et `gitpush.md` (procédure de publication)

Toute modification doit citer l'exigence ou la règle qu'elle sert. Si une
demande contredit `cdg.md`, signalez-le avant d'implémenter.

## État — 9 août 2026

**Lots 0, 1 et 2 livrés** : socle, authentification, habilitations avec portée,
structure à 6 niveaux (organigramme éditable **et** vue liste), référentiels,
croyants avec photo, **transferts** avec workflow d'approbation, **baptêmes**.

**Lot 2 achevé**, y compris la lecture **XLSX** (`lib/domain/xlsx.ts`, sans
dépendance — ARB-6 clos). Reste hors périmètre la saisie de baptêmes en lot
(EF-BAP-07, *Could*).

**Lot 3 (bureaux) livré** : ouverture, **modification**, composition par rang
avec fonctions vacantes, désignation, remplacement, reconduction, clôture
atomique, **suppression** sous `bureau.delete` (droit distinct et non
délégable), **organigramme React Flow** (EF-BUR-07) — en lecture comme seconde
représentation de la composition, et en **édition** sur
`/bureaux/[id]/organigramme` : palette de fonctions à poser, déplacement libre,
traits de dépendance, désignation au glisser-déposer. Le plan est un **dessin**,
pas la définition des postes : la composition tabulaire reste la source des
vacances, et ôter un bloc ne touche jamais le référentiel.
Les fonctions occupées figurent dans la frise du croyant.
Le menu ⋮ de la structure ouvre le bureau d'une entité et enregistre un croyant
sur une église ou une cellule, rattachement verrouillé.

**Impression de l'organigramme livrée** (`lib/domain/organigramme-svg.ts`, SVG
sans dépendance) : la feuille A4 rend la **hiérarchie**, pas la mise en page de
travail, au rapport de la page et à la même échelle d'un bureau à l'autre. Un
seul appelant partagé, `imprimerOrganigramme`, sert l'éditeur **et** le pop-up
ouvert depuis la structure. Aucun nom n'y est abrégé : il se replie entre les
mots et la police descend d'un point tant que cela ne tient pas. Les portraits y
figurent, **embarqués** en `data:` — une image liée arriverait après `print()` et
son URL signée périmerait. Reste d'EF-BUR-11 l'export **Excel** de la
composition — en liste d'attente.

**Prochain lot : 4 — Finances.**

Base à jour jusqu'à la migration `0022`. Le stockage de fichiers ne se
configure **pas** en SQL — `storage.*` appartient à `supabase_storage_admin` et
`postgres` s'y voit refuser `CREATE POLICY` : `pnpm db:bucket` s'en charge par
l'API.

Historique : [`SESSION_HISTORY.md`](.claude-code-history/SESSION_HISTORY.md) ·
dernier point d'étape : [`.claude-code-history/2026-08-09_resumes-moi.md`](.claude-code-history/2026-08-09_resumes-moi.md)

## Publication — lire `.agents/rules/gitpush.md` AVANT tout push

1. **Demander l'autorisation** de l'utilisateur avant chaque `git push`.
   Une autorisation vaut pour UN push, pas pour les suivants.
2. Mettre à jour au préalable les trois documents exigés :
   `.claude-code-history/SESSION_HISTORY.md`, le dernier
   `.claude-code-history/..._resumes-moi.md`, et ce fichier.
3. `pnpm check:secrets` — le hook `pre-commit` l'exécute déjà, mais un
   `--no-verify` le contournerait. `.claude-code-history/` est ignoré **sauf**
   les deux documents rédigés à la main : les transcripts bruts contiennent des
   valeurs lues dans `.env.local`.

Un secret exposé ne se retire pas, il se **révoque** : voir « Rotation d'un
secret » dans `README.md`.

Ce qu'il reste à faire est décrit dans le dernier point d'étape
`..._resumes-moi.md`, et le découpage en lots dans [`notes/plan.md`](notes/plan.md).

## Règles non négociables

1. Aucune écriture en base depuis un composant — tout passe par une Server Action.
2. Aucune mutation sans validation Zod **côté serveur**, même si le client valide.
3. Aucun contrôle de droit sans sa portée : `can(permission, entityId)`, jamais
   la seule clé. Détenir `finance.create` ≠ pouvoir saisir pour n'importe quelle
   paroisse (RG-25).
4. **Aucune page sans squelette** (`components/skeletons/`). Jamais d'écran blanc
   ni de spinner plein écran. `Loader2` uniquement pour les actions ponctuelles.
5. Toute valeur numérique ou monétaire en `font-mono tabular-nums`.
6. Espacements sur la grille de 8 px — vérifié par ESLint.
7. Bibliothèques lourdes (React Flow, Recharts, PDF, xlsx) toujours en import
   dynamique, avec squelette en `fallback`.
8. Aucune mutation sans `auditer()`.
9. Aucune table métier sans RLS activée.
10. Aucun import de `@supabase/*` hors de `lib/supabase`, `lib/auth`,
    `lib/storage` — vérifié par ESLint (ENF-POR-02/03).
11. La base ne stocke que des **clés d'objet relatives**, jamais d'URL signée.
12. Un schéma Zod partagé client/serveur doit être **idempotent** : le serveur
    revalide ce que le client a déjà transformé. `z.preprocess` pour normaliser
    le vide, jamais `z.coerce` sur un champ facultatif — `coerce.date(null)`
    donne le 1ᵉʳ janvier 1970.
13. Une fonction appelée par un trigger et qui écrit dans une table verrouillée
    par RLS doit être `SECURITY DEFINER` : un trigger s'exécute avec les droits
    de l'appelant.
14. Un identifiant à séquence (code d'entité, matricule) est attribué **par la
    base**, jamais par le client : elle seule garantit l'unicité face à deux
    créations simultanées.
15. Une absence de données n'est pas un refus de droit. Un périmètre vide
    signale une panne de lecture, pas une entité hors périmètre.
16. **Un seul chemin par opération.** Deux formulaires pour la même création
    divergent toujours. Les pages `[id]` et `[id]/modifier` ne subsistent que
    pour le lien profond ; toute création ou édition déclenchée depuis une liste
    passe par le pop-up partagé.
17. Un filtre ne doit **jamais attendre le serveur** : charger le périmètre en
    une requête, filtrer en mémoire, synchroniser l'URL par
    `history.replaceState`. Ce qui coûte, ce n'est pas la durée d'un
    aller-retour mais leur **nombre** — mesurer avant d'optimiser une requête.
    Un volume trop grand se borne par un **plafond annoncé à l'écran**, jamais
    par un retour silencieux à la pagination serveur.
18. Le contrôle suit la nature de l'ensemble : **pictogrammes** si l'ensemble
    est clos et connu (niveaux, statuts, sexe), **sélecteur** s'il est ouvert
    (entités, grades, nationalités).
19. Une action n'écrit **que les champs dont son formulaire est la source**. Un
    champ qu'un formulaire n'affiche pas mais qu'il envoie arrive vide et
    **efface la donnée** — sans message et sans erreur.
20. Deux écritures indissociables se font **en base**, dans une fonction : deux
    appels HTTP ne forment pas une transaction. Avant d'en écrire une, se
    demander si l'état intermédiaire est *faux et indétectable* (alors la
    fonction s'impose) ou *bénin et rattrapable* (alors il suffit de le dire).
21. Un paramètre configurable se **lit à chaque rendu**, jamais codé en dur dans
    un écran — sinon le réglage devient décoratif.
22. Le stockage de fichiers ne se configure pas en SQL : `pnpm db:bucket`.
23. Toute migration doit être **rejouable** : `create table if not exists`,
    `create index if not exists`, `create or replace function`, et un
    `drop … if exists` avant chaque `create policy` ou `create trigger`. Le
    fichier incrémental est régénéré à chaque nouvelle migration et rien ne
    garantit qu'il ne recouvre pas du déjà-appliqué ; une migration qui échoue
    au rejeu bloque toutes les suivantes du même lot.
24. Ne traverse la frontière serveur → client que des **objets simples**. Un
    schéma Zod, une `Map`, une classe font échouer la page entière. Quand un
    registre pur porte la donnée, passer sa **clé** et laisser le client le
    lire : rien ne traverse, le problème disparaît au lieu d'être contourné.
25. Une donnée dérivée ne se rafraîchit **jamais depuis elle-même**. Recalculer
    `entities.path` en sélectionnant les descendants *par leur chemin* laissait
    intact tout descendant déjà faux — définitivement. On repart de la colonne
    qui fait autorité (`parent_id`), et le recalcul devient auto-réparateur.
    Un chemin faux ne donne pas un affichage bizarre : il donne des **droits**
    faux, en silence.
26. Une contrainte interdit l'**impossible**, pas l'inhabituel. Une période qui
    commence et finit le même jour est brève, pas fausse : `date_fin >=
    date_debut`. Et deux tables qui portent la même règle portent le **même
    opérateur** — `bureaux_periode` en `>` et `membres_periode` en `>=` se sont
    contredites en une migration.
27. **Une transition couvre l'attente, jamais l'appel.** Tout `setState` fait
    dans `startTransition` est une mise à jour de transition, que React peut
    fondre avec les suivantes **sans rendre l'état intermédiaire** : ouvrir
    puis fermer un indicateur dans la même séquence revient à ne rien
    afficher. Un composant qui reçoit un gestionnaire l'appelle donc en dehors
    de sa transition, et n'y met que l'`await`.
28. Ce qui coûte, c'est le **nombre** d'allers-retours, pas leur durée : un
    seul se mesure ici entre 0,5 et 4 secondes. Une action qui en enchaîne
    cinq est cinq fois exposée à la panne comme à l'attente. Lectures
    indépendantes en `Promise.all`, données liées en **un** embed, et jamais
    de requête dont on jette le résultat. Une lecture se **rejoue** sur échec
    de transport ; une écriture, jamais — la requête a pu aboutir et seule la
    réponse se perdre.

29. Une dépendance qui échoue au CHARGEMENT casse en amont de tous les
    garde-fous : le module ne s'évalue pas, la Server Action ne démarre pas,
    et aucun `try/catch` ne peut rien attraper — l'écran reste muet.
    `isomorphic-dompurify` entraînait `jsdom` (`ERR_REQUIRE_ESM` sur Vercel) et
    tuait ainsi TOUTE mutation. Avant d'ajouter une dépendance serveur, se
    demander ce qu'elle apporte vraiment : retirer du balisage d'un nom propre
    est une opération de texte, pas un travail pour un moteur HTML.
30. **La notification ne porte que ce qui se constate.** « Croyant enregistré »
    se voit du coin de l'œil et rien n'est perdu : l'écran montre déjà le
    résultat. Tout le reste — refus motivé, avertissement, panne, fichier
    invalide — porte la **seule** information utile de l'opération et
    disparaîtrait avant d'être lu : `avertir()` de
    `components/shared/messages`, un pop-up que l'utilisateur ferme. Seul
    `toast.success` subsiste, et ESLint refuse les autres.
31. **Ce qui s'imprime n'a pas de recours.** À l'écran, un libellé abrégé se
    survole, s'ouvre, se cherche ; sur une feuille, il est perdu. Un document
    destiné au papier ne tronque donc rien : il **replie** entre les mots et
    **réduit** la police, quitte à agrandir le cadre. Et il rend la
    **structure** — qui dépend de qui —, jamais les coordonnées où
    l'utilisateur a posé ses blocs pour travailler : une mise en page de
    travail n'est pas un document.

## Conventions

- Interface et identifiants métier **en français** (`croyants`, `eglise_id`) ;
  termes techniques en anglais (`created_at`, `is_active`, `deleted_at`).
- Fichiers de composants en `kebab-case.tsx`, composants en `PascalCase`.
- Tables et colonnes SQL en `snake_case`.
- Les tests de règles portent le code dans leur intitulé : `RG-14 — ...` (CA-02).
- Les commentaires expliquent **pourquoi**, pas quoi ; ils citent l'exigence.

## Vérification

`pnpm verify` = lint + typecheck + test + build. Bloquant en CI.

**`pnpm dev:propre` après une série de modifications.** Turbopack a servi trois
fois des versions MÉLANGÉES de modules — un composant récent lié à un hook
ancien —, ce qui se manifeste par des fonctionnalités « absentes » ou des
`X is not defined` sur du code correct. Symptôme reconnaissable : `pnpm verify`
passe alors que l'écran ne suit pas. Le diagnostic se confirme en comptant les
versions d'un même module dans `.next/dev/static/chunks/`.
