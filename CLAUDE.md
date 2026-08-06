@AGENTS.md

# SYNOD — contexte projet

Application web de gestion d'église. **Lire avant toute tâche** :

- [`cdg.md`](notes/cdg.md) — exigences `EF-*`, règles de gestion `RG-01` à `RG-32`
- [`plan.md`](notes/plan.md) — modèle de données, RLS, design system, écrans, lots
- [`.agents/rules/designrules.md`](.agents/rules/designrules.md) — stack et design **imposés**

Toute modification doit citer l'exigence ou la règle qu'elle sert. Si une
demande contredit `cdg.md`, signalez-le avant d'implémenter.

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

## Conventions

- Interface et identifiants métier **en français** (`croyants`, `eglise_id`) ;
  termes techniques en anglais (`created_at`, `is_active`, `deleted_at`).
- Fichiers de composants en `kebab-case.tsx`, composants en `PascalCase`.
- Tables et colonnes SQL en `snake_case`.
- Les tests de règles portent le code dans leur intitulé : `RG-14 — ...` (CA-02).
- Les commentaires expliquent **pourquoi**, pas quoi ; ils citent l'exigence.

## Vérification

`pnpm verify` = lint + typecheck + test + build. Bloquant en CI.
