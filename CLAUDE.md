@AGENTS.md

# SYNOD — contexte projet

Application web de gestion d'église. **Lire avant toute tâche** :

- [`cdg.md`](notes/cdg.md) — exigences `EF-*`, règles de gestion `RG-01` à `RG-32`
- [`plan.md`](notes/plan.md) — modèle de données, RLS, design system, écrans, lots
- [`.agents/rules/`](.agents/rules/) — règles **impératives** : `designrules.md`
  (stack et design) et `gitpush.md` (procédure de publication)

Toute modification doit citer l'exigence ou la règle qu'elle sert. Si une
demande contredit `cdg.md`, signalez-le avant d'implémenter.

## État — 7 août 2026

**Lots 0, 1 et 2 livrés** : socle, authentification, habilitations avec portée,
structure à 6 niveaux (organigramme éditable **et** vue liste), référentiels,
croyants avec photo, **transferts** avec workflow d'approbation, **baptêmes**.

**Lot 2 achevé**, hors deux facultatifs : la lecture **XLSX** (dernier reste
d'ARB-6 — l'import CSV est livré) et la saisie de baptêmes en lot (EF-BAP-07,
*Could*).

Base à jour jusqu'à la migration `0015`. Le stockage de fichiers ne se
configure **pas** en SQL — `storage.*` appartient à `supabase_storage_admin` et
`postgres` s'y voit refuser `CREATE POLICY` : `pnpm db:bucket` s'en charge par
l'API.

Historique : [`SESSION_HISTORY.md`](.claude-code-history/SESSION_HISTORY.md) ·
dernier point d'étape : [`.claude-code-history/2026-08-07_resumes-moi.md`](.claude-code-history/2026-08-07_resumes-moi.md)

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

## Conventions

- Interface et identifiants métier **en français** (`croyants`, `eglise_id`) ;
  termes techniques en anglais (`created_at`, `is_active`, `deleted_at`).
- Fichiers de composants en `kebab-case.tsx`, composants en `PascalCase`.
- Tables et colonnes SQL en `snake_case`.
- Les tests de règles portent le code dans leur intitulé : `RG-14 — ...` (CA-02).
- Les commentaires expliquent **pourquoi**, pas quoi ; ils citent l'exigence.

## Vérification

`pnpm verify` = lint + typecheck + test + build. Bloquant en CI.
