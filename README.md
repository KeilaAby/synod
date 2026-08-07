# SYNOD

Plateforme web de gestion et de pilotage d'une organisation ecclésiale.

| Document | Contenu |
|---|---|
| [`cdg.md`](notes/cdg.md) | Cahier des charges — exigences `EF-*`, règles de gestion `RG-01` à `RG-32`, critères d'acceptation |
| [`plan.md`](notes/plan.md) | Plan de conception — modèle de données, RLS, design system, écrans, lots |
| [`.agents/rules/designrules.md`](.agents/rules/designrules.md) | Stack et design system **imposés** |

---

## Démarrage

```bash
pnpm install
cp .env.example .env.local     # puis renseigner les valeurs Supabase
pnpm dev
```

> Un `.env.local` de démarrage contenant des **valeurs de place** est présent :
> il permet à `pnpm dev` et `pnpm build` de fonctionner avant que le projet
> Supabase n'existe. Toute requête réelle échouera tant qu'il n'est pas
> renseigné.

### Base de données

> ⚠️ **L'ordre est significatif.** `seed.sql` insère dans des tables créées par
> les migrations : l'exécuter en premier échoue avec
> `relation "entities" does not exist`.

#### Base neuve

Coller l'intégralité de [`supabase/install.sql`](supabase/install.sql) dans
l'éditeur SQL Supabase, puis exécuter. Ce fichier est **généré** : il concatène
les migrations dans l'ordre, puis l'amorce.

```bash
pnpm db:bundle
```

#### Base déjà installée

> ⚠️ Rejouer `install.sql` sur une base existante **échoue** dès le premier
> `create type … already exists`. C'est attendu : ce fichier vise une base neuve.

1. Exécuter [`supabase/diagnostic.sql`](supabase/diagnostic.sql) : sa première
   requête donne la dernière version appliquée.
2. Générer le fichier de mise à jour, puis le coller dans l'éditeur :

```bash
pnpm db:bundle -- --depuis 0009    # → supabase/install-incremental.sql
```

Il ne contient que les migrations postérieures, sans l'amorce. Un registre
`schema_migrations` enregistre chaque application ; la première mise à jour
rattrape aussi l'historique antérieur.

**Ou fichier par fichier**, avec n'importe quel client PostgreSQL — les
migrations sont du SQL standard (ENF-POR-05) :

```bash
supabase db reset                                     # via la CLI Supabase

for f in supabase/migrations/*.sql; do                # ou directement
  psql "$DATABASE_URL" -f "$f"
done
psql "$DATABASE_URL" -f supabase/seed.sql
```

L'amorce crée le **Siège** (racine unique de la hiérarchie) et les quatre
référentiels : grades, nationalités, fonctions, catégories financières.

### Stockage des fichiers

```bash
pnpm db:bucket
```

Crée le seau `synod` — **privé**, 5 Mo par fichier — ou le remet en conformité
s'il a dérivé. Idempotent, et il signale tout seau public du projet : un seau
public rend chaque photo lisible par quiconque devine son URL.

> **Pourquoi un script et non une migration SQL.** `storage.buckets` et
> `storage.objects` appartiennent à `supabase_storage_admin` ; le rôle
> `postgres` de l'éditeur SQL n'en est pas membre et se voit refuser tout
> `CREATE POLICY` (`42501`). L'API de stockage, elle, accepte la clé de
> service : c'est l'interface légitime, et le résultat reste **versionné dans
> le dépôt** — contrairement à des clics dans un tableau de bord que personne
> ne pourra rejouer.

Le seau ne porte **aucune politique** : il est donc fermé à tout utilisateur.
Les fichiers ne transitent que par les Server Actions, qui portent déjà le
contrôle d'habilitation avec sa portée. `SUPABASE_SERVICE_ROLE_KEY` devient
donc nécessaire aux photos ; sans elle, les avatars à initiales s'affichent et
le téléversement est refusé avec un message explicite.

### Premier compte

1. **Supabase > Authentication > Users > Add user** — cocher *Auto Confirm User*.
2. Exécuter [`supabase/bootstrap-superadmin.sql`](supabase/bootstrap-superadmin.sql)
   après y avoir remplacé l'adresse et le nom.

Le SuperAdmin est nécessairement rattaché au Siège (EF-ACT-2) : un trigger
refuse tout autre rattachement. Aucune ligne dans `user_permissions` n'est
requise — `is_superadmin()` court-circuite l'évaluation des habilitations.

Le script est idempotent et **échoue bruyamment** : si l'utilisateur
d'authentification n'existe pas, il le dit au lieu de ne rien faire.

### Diagnostic

[`supabase/diagnostic.sql`](supabase/diagnostic.sql) rapporte l'état de
l'installation, liste les comptes d'authentification, et vérifie qu'aucune
table métier n'échappe à la RLS (règle non négociable n° 9).

### Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm db:bundle` | Génère `install.sql` (ou `--depuis <version>`) |
| `pnpm db:bucket` | Crée ou remet en conformité le seau de stockage |
| `pnpm lint` | ESLint, garde-fous inclus |
| `pnpm typecheck` | TypeScript strict |
| `pnpm test` | Tests unitaires (Vitest) |
| `pnpm test:coverage` | Couverture sur la logique métier |
| `pnpm build` | Build de production |
| `pnpm verify` | Les quatre précédents, dans l'ordre de la CI |

---

## Architecture

```
app/
  (auth)/          connexion · mot-de-passe-oublie · reinitialiser
  (app)/           layout applicatif (sidebar, topbar, session)
lib/
  auth/            ADAPTATEUR d'identité      ← ENF-POR-02
  storage/         ADAPTATEUR de stockage     ← ENF-POR-03
  domain/          règles de gestion PURES, 100 % testées
  data/            lectures typées
  actions/         Server Actions (mutations)
  session.ts       requireSession · requirePermission · auditer
components/
  ui/              Shadcn — possédés, éditables
  layout/          sidebar, topbar, fil d'Ariane
  shared/          PageHeader, EmptyState, StatusBadge, PermissionGate, Field
  skeletons/       un squelette par écran (règle UI-15)
supabase/
  migrations/      SQL standard, ordonné
  seed.sql         Siège + référentiels
proxy.ts           session, garde de route, en-têtes de sécurité
```

### Sécurité — défense en profondeur

| Couche | Rôle |
|---|---|
| `proxy.ts` | Session valide, redirection, en-têtes (ENF-SEC-07) |
| Layout `(app)` | Charge profil + habilitations **une fois** par requête |
| `<PermissionGate>` | **Confort d'affichage uniquement** — ne protège rien |
| Server Action | Revalide : session → droit → **portée** → périmètre → audit |
| PostgreSQL RLS | Filet ultime : hors périmètre = **zéro ligne** (ENF-SEC-01) |

Les habilitations sont des couples **(droit, portée)** : détenir `finance.create`
ne signifie pas pouvoir saisir pour n'importe quelle paroisse. Utilisez toujours
`can(permission, entityId)`, jamais la seule clé.

### Secrets — détection et rotation

**Un secret versionné ne se retire pas : il se révoque.** Une fois poussé, il vit
dans l'historique git, dans les clones et dans les caches des forges. Le retirer
d'un commit ultérieur ne le rend pas inaccessible.

Trois barrières bloquent avant que cela n'arrive :

| Barrière | Déclenchement |
|---|---|
| `.githooks/pre-commit` | refuse le commit — installé par `pnpm prepare` |
| `pnpm verify` | refuse la publication locale |
| CI | refuse la fusion |

```bash
pnpm check:secrets     # analyse tous les fichiers suivis
```

Sont détectés : les jetons JWT (clés Supabase `anon` et `service_role`), une
`SUPABASE_SERVICE_ROLE_KEY` renseignée, les clés privées, les identifiants AWS
et les valeurs sensibles codées en dur. Dérogation ponctuelle : `secret-scan:ignore`
en fin de ligne.

> Le hook s'installe via `git config core.hooksPath .githooks`, exécuté
> automatiquement par `pnpm install`. Après un clone, un simple `pnpm install`
> suffit.

#### Rotation d'un secret Supabase

À faire dès qu'une clé a pu être exposée — dépôt public, capture d'écran,
sauvegarde synchronisée, transcript d'outil.

1. **Supabase > Project Settings > API > Legacy API keys > Rotate**
   (ou *JWT Settings > Generate new JWT secret*, qui invalide **toutes** les clés).
2. Reporter les nouvelles valeurs dans `.env.local` :
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Mettre à jour les mêmes variables sur l'hébergement de production.
4. Redémarrer l'application ; les sessions ouvertes seront invalidées si le
   secret JWT a été régénéré.

La clé `service_role` **contourne intégralement la RLS** : c'est le seul secret
du projet dont la fuite annule tout le cloisonnement par périmètre (ENF-SEC-01).
Elle ne doit jamais être préfixée `NEXT_PUBLIC_` ni atteindre le navigateur — le
code ne l'utilise que dans `createAdminClient()`, côté serveur.

### Portabilité (ARB-8)

Le patrimoine de données doit rester transférable vers un autre hébergeur.
Trois garde-fous structurels :

1. **SQL standard uniquement** — `ltree`, `pg_trgm`, `pgcrypto`, RLS, triggers,
   vues matérialisées. Aucune extension propriétaire.
2. **`profiles` a sa propre clé primaire**, indépendante du fournisseur
   d'identité ; `auth_user_id` est le seul point de couplage.
3. **La base ne stocke que des clés d'objet relatives** — jamais d'URL signée.

Une règle ESLint interdit d'importer le SDK de l'hébergeur hors de
`lib/supabase`, `lib/auth` et `lib/storage`.

---

## Règles non négociables

Vérifiées automatiquement (`pnpm lint`) ou en revue de code :

1. Aucune écriture en base depuis un composant — tout passe par une Server Action.
2. Aucune mutation sans validation Zod côté serveur.
3. Aucun contrôle de droit sans sa portée : `can(permission, entityId)`.
4. **Aucune page sans squelette** — jamais d'écran blanc ni de spinner plein écran.
   `Loader2` est réservé aux actions ponctuelles.
5. Aucune valeur numérique ou monétaire sans `font-mono`.
6. Aucun espacement hors grille de 8 px — *vérifié par ESLint*.
7. Aucune bibliothèque lourde importée statiquement (React Flow, Recharts, PDF, xlsx).
8. Aucune mutation sans écriture d'audit.
9. Aucune table métier sans RLS activée.
10. Aucun import du SDK de l'hébergeur hors des adaptateurs — *vérifié par ESLint*.
11. Aucune URL absolue de fichier stockée en base.

---

## Écarts assumés par rapport aux documents de conception

| Sujet | Prévu | Livré | Raison |
|---|---|---|---|
| Framework | Next.js 15+ | **Next.js 16.3** | `latest` au moment du socle ; satisfait « 15+ ». |
| Convention middleware | `middleware.ts` | **`proxy.ts`** | Renommé et déprécié par Next 16. |
| Police | Google Sans | **Inter** (auto-hébergée) | Google Sans est propriétaire, non distribuable. Bascule documentée dans [`lib/fonts.ts`](lib/fonts.ts) : déposer le `.woff2` sous licence et changer une ligne. |
| Chargement des polices | `next/font/google` | **`next/font/local`** | P-9 : aucune requête vers un CDN externe, build reproductible hors ligne. |

---

## Avancement

| Lot | Contenu | État |
|---|---|---|
| **0** | Socle : design system, adaptateurs, session, auth, layout, squelettes, CI | ✅ |
| **1** | Structure & référentiels — organigramme React Flow, CRUD entités, 4 référentiels | ✅ |
| 2 | Croyants & transferts — workflow d'approbation | à venir |
| 3 | Bureaux — mandats, organigramme | à venir |
| 4 | Finances — recettes/dépenses, solde, workflow de validation | à venir |
| 5 | Tableaux de bord configurables | à venir |
| 6 | Générateur de rapports | à venir |
| 7 | Habilitations fines & administration | à venir |
| 8 | Portabilité, recette, mise en production | à venir |
