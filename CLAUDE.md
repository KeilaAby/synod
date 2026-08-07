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

**Lots 0 et 1 livrés** : socle, authentification, habilitations avec portée,
structure hiérarchique à 6 niveaux (organigramme éditable **et** vue liste, même
CRUD en pop-up), référentiels.
**Lot 2 aux deux tiers** : croyants livrés ; transferts et baptêmes ont leur base
et leur domaine, les écrans restent à construire.

⚠️ Migration `0013` **à appliquer** sur la base de l'utilisateur
(`supabase/install-incremental.sql`) : sans elle, la création d'entité échoue —
le formulaire n'envoie plus de code.

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

## Conventions

- Interface et identifiants métier **en français** (`croyants`, `eglise_id`) ;
  termes techniques en anglais (`created_at`, `is_active`, `deleted_at`).
- Fichiers de composants en `kebab-case.tsx`, composants en `PascalCase`.
- Tables et colonnes SQL en `snake_case`.
- Les tests de règles portent le code dans leur intitulé : `RG-14 — ...` (CA-02).
- Les commentaires expliquent **pourquoi**, pas quoi ; ils citent l'exigence.

## Vérification

`pnpm verify` = lint + typecheck + test + build. Bloquant en CI.
