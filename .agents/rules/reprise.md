---
trigger: always_on
---

# Reprendre SYNOD — à lire en premier

Ce fichier s'adresse à **tout agent qui ouvre ce dépôt sans avoir vécu les
sessions précédentes** : nouvelle machine, nouvelle session, nouvel outil. Il ne
répète pas les règles du projet — il dit **où les trouver**, **ce qui est
déjà fait**, et **les pièges qui ont réellement coûté du temps**.

---

## 1. L'ordre de lecture

1. `CLAUDE.md` — l'état du projet, les **33 règles non négociables**, les
   conventions. C'est le document qui fait autorité.
2. **`notes/todos.md` — ce qu'il reste à faire.** La liste des demandes en
   attente, les migrations non appliquées, et ce qui attend une réponse de
   l'utilisateur. C'est le point de départ du travail ; le *pourquoi* de chaque
   ligne est dans les deux documents suivants.
3. `.claude-code-history/*_resumes-moi.md` — le **dernier** en date : point
   d'étape, ce qui vient d'être livré, ce qui attend une décision.
4. `notes/cdg.md` — les exigences `EF-*` et les règles de gestion `RG-01` à
   `RG-33`. **Toute modification doit citer l'exigence ou la règle qu'elle
   sert.**
5. `notes/plan.md` — modèle de données, RLS, design system, découpage en lots.
6. `.agents/rules/designrules.md` (stack et design) et `.agents/rules/gitpush.md`
   (publication).

`.claude-code-history/SESSION_HISTORY.md` raconte le **pourquoi** des décisions.
On n'a pas besoin de le lire en entier ; on y cherche un sujet quand on doit y
toucher. Il évite de refaire un choix déjà tranché — ou de défaire une
correction dont on ignore le motif.

---

## 2. Installer sur une machine neuve

```bash
pnpm install               # installe aussi le hook pre-commit de detection de secrets
cp .env.example .env.local # puis renseigner les valeurs — voir ci-dessous
pnpm exec next typegen     # ⚠ AVANT le premier `pnpm verify` — voir ci-dessous
pnpm dev                   # http://localhost:3000
```

**`.env.example` est versionne** — c'est la seule exception au `.env*` du
`.gitignore`, et il ne porte que des noms de variables, jamais de valeurs. Il
avait manque jusqu'au 19 aout 2026 : le `cp` ci-dessus echouait alors sur tout
clone frais, et `lib/env.ts` renvoyait vers un fichier qui n'existait pas.

**`pnpm typecheck` echoue sur un clone frais**, sur `LayoutProps` introuvable.
Ce n'est pas une regression : Next 16 **genere** `PageProps`, `LayoutProps` et
`RouteContext` dans `.next/types/`, et `.next` n'existe pas avant le premier
build. `pnpm exec next typegen` les produit. L'ordre de `verify` rend le blocage
inevitable — il s'arrete au typecheck **avant** d'atteindre le build qui les
aurait crees.

**Sur Windows, si `pnpm` manque** : `corepack enable` echoue en `EPERM`, il
ecrit ses shims dans `C:\Program Files\nodejs`. Les poser ailleurs, puis ajouter
le dossier au `PATH` **utilisateur** :

```bash
corepack enable --install-directory "$LOCALAPPDATA/corepack-shims"
```

**`.env.local` n'est pas dans le dépôt, et ne doit jamais y entrer** (ENF-SEC-09,
`.gitignore`). Les valeurs se relisent dans le tableau de bord Supabase :
*Project Settings → API*. Quatre comptent :

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sans elles,
  rien ne démarre ;
- `SUPABASE_SERVICE_ROLE_KEY` — **contourne la RLS**. Elle sert à l'ouverture
  des comptes, à la réinitialisation des mots de passe et à **tout** accès au
  stockage. Sans elle, les photos ne s'affichent pas et le téléversement est
  refusé avec un message explicite : ce n'est pas une panne, c'est une clé
  manquante ;
- `SMTP_PASS` — **le seul réglage de courriel qui ne soit pas à l'écran**.
  L'hôte, le port, l'expéditeur et l'identifiant se règlent dans
  *Administration → Paramètres → Courriels* ; le mot de passe reste ici, parce
  qu'une base se sauvegarde, se copie et s'exporte. Vide, les réglages
  s'enregistrent mais aucun message ne part — le bouton d'essai le dit.

**Un secret exposé ne se retire pas, il se révoque** — voir « Rotation d'un
secret » dans `README.md`.

---

## 3. L'état de la base

Les migrations vivent dans `supabase/migrations/`, numérotées. **Elles ne
s'appliquent pas toutes seules** : c'est l'utilisateur qui les passe dans
l'éditeur SQL Supabase, et il le confirme. Ne jamais supposer qu'une migration
écrite est appliquée.

La derniere appliquee est la **`0060`** (20 aout 2026) ; **aucune n'attend**.
`notes/todos.md` et le dernier point d'étape le confirment tous deux — et c'est
cette liste-là qui fait foi, pas le numéro le plus élevé du dossier.

Pour une base **neuve**, `supabase/install.sql` les regroupe toutes — il est
**généré** (`pnpm db:bundle`), donc jamais édité à la main.

Le stockage de fichiers **ne se configure pas en SQL** : `storage.*` appartient
à `supabase_storage_admin` et `postgres` s'y voit refuser `CREATE POLICY`.
C'est `pnpm db:bucket` qui s'en charge, par l'API.

---

## 4. Vérifier

```bash
pnpm verify       # secrets + lint + typecheck + tests + build — bloquant en CI
pnpm dev:propre   # meme chose que `pnpm dev`, cache Turbopack vide au prealable
```

**`pnpm dev:propre` après une série de modifications.** Turbopack a servi
plusieurs fois des versions **mélangées** de modules — un composant récent lié à
un hook ancien —, ce qui se manifeste par des fonctionnalités « absentes » ou
des `X is not defined` sur du code correct. Symptôme reconnaissable : `pnpm
verify` passe alors que l'écran ne suit pas.

---

## 5. Publier

Lire `.agents/rules/gitpush.md` **avant** tout `git push`. En résumé :

1. **Demander l'autorisation** de l'utilisateur avant chaque `git push`. Une
   autorisation vaut pour UN push, pas pour les suivants.
2. Mettre à jour au préalable les trois documents :
   `.claude-code-history/SESSION_HISTORY.md`, le dernier
   `..._resumes-moi.md`, et `CLAUDE.md`.
3. Ne jamais contourner le hook `pre-commit` par `--no-verify` : il exécute
   `pnpm check:secrets`.

`.claude-code-history/` est ignoré **sauf** les deux documents rédigés à la
main : les transcripts bruts contiennent des valeurs lues dans `.env.local`.

---

## 6. Les pièges qui ont réellement coûté du temps

Ils ne s'inventent pas, ils se retiennent. Chacun a été payé une fois.

**PostgREST garde un cache de schéma.** Toute migration qui crée ou remplace une
fonction doit finir par `notify pgrst, 'reload schema'`. Sans lui, l'API répond
« fonction inconnue » sur du SQL pourtant en place — constaté deux fois.

**`create or replace function` ne suffit pas pour un `returns table`.** Les
paramètres `OUT` font partie de la signature : *ajouter une colonne* est un
changement de type de retour, que PostgreSQL refuse (42P13). Il faut
`drop function if exists <nom>(<types IN>)` juste avant. L'erreur n'arrive qu'à
**l'application**, jamais à l'écriture.

**Les quatre référentiels ne sont pas uniformes.** `grades` et `fonctions`
portent un `code` ; `nationalites` porte `code_iso`. Vérifier le schéma plutôt
que de supposer une symétrie.

**Ce qui traverse la frontière serveur → client doit être un objet simple.**
Une fonction React, une `Map`, une classe font échouer la page **entière**.
Quand un registre pur porte la donnée, passer sa **clé** et laisser le client
le lire.

**Le compilateur React refuse un composant créé pendant le rendu.** Lier le
résultat d'une recherche à `const Icone` puis écrire `<Icone />` est refusé ;
`createElement(composant, props)` le dit sans ambiguïté.

**Une absence de données n'est pas un refus de droit** (règle 15). Les fonctions
SQL du projet sont `SECURITY INVOKER` : ce qu'on n'a pas le droit de lire est
**compté à zéro** par la RLS, pas refusé. Afficher ce zéro ferait conclure à une
base vide plutôt qu'à une habilitation manquante — d'où le masquage explicite
des indicateurs non habilités.

**Un module `'use client'` importé côté SERVEUR ne livre pas ses valeurs**, mais
des références. Une page qui importait une table de constantes depuis son
composant client n'en recevait pas le tableau : `ONGLETS.includes` n'était pas
une fonction, et l'écran tombait avant son premier rendu. Ce qui doit être lu
des deux côtés se déclare dans le **domaine**.

**Tailwind lit le source, commentaires compris.** Une valeur arbitraire pointant
une variable CSS voit ses tirets doubles mangés et produit un `var(...)` que
PostCSS refuse : toute la feuille cesse d'être compilée. Pire — **citer cette
classe dans un commentaire la recrée**, si bien que l'erreur survit à sa propre
correction. Une largeur qui dépend d'une variable se déclare dans `globals.css`.

**Une lecture écrite pour un écran ne convient pas forcément au suivant.** Une
fonction qui *lève* est juste là où elle **est** l'écran ; réutilisée comme un
bloc parmi vingt, elle fait tomber toute la page. Le contrat d'erreur appartient
à l'appelant.

---

## 7. Ce qu'on n'a pas le droit d'oublier

- **Aucune écriture en base depuis un composant** — tout passe par une Server
  Action, validée par Zod **côté serveur**.
- **Aucun contrôle de droit sans sa portée** : `can(permission, entityId)`,
  jamais la seule clé (RG-25).
- **Aucune page sans squelette**, et le squelette est calqué sur la grille
  **réelle** : un squelette qui ment fait sauter la page au moment où les
  données se posent.
- **Un seul chemin par opération** (règle 16). Deux formulaires pour la même
  création divergent toujours.
- **Ce qui coûte, c'est le nombre d'allers-retours**, pas leur durée : un seul
  se mesure ici entre 0,5 et 4 secondes.

La liste complète — 33 règles — est dans `CLAUDE.md`. Elle n'est pas
décorative : chaque entrée y est arrivée après un défaut constaté.
