# Résumé — 19 août 2026

> Point d'étape destiné à la reprise de session.
> **Nouvelle machine ou nouvelle session ? Lire d'abord**
> [`.agents/rules/reprise.md`](../.agents/rules/reprise.md) — installation,
> état de la base, et les pièges déjà payés.
>
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-18_resumes-moi.md`](2026-08-18_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local`.

---

## L'état de la base

Migrations `0001` à **`0048`** appliquées. Les quatre dernières :

| N° | Ce qu'elle apporte |
|---|---|
| `0045` | `organisation_settings.rapport_composition_libre` — les entités autres que le Siège composent-elles leurs propres modèles de rapport ? `true` par défaut. |
| `0046` | `organisation_settings.reinitialisation_par_email` et `profiles.doit_changer_mot_de_passe` — les deux circuits de réinitialisation, et le mot de passe provisoire. |
| `0047` | `profiles.est_responsable_informatique` (index partiel : **un seul par entité**), `email_settings`, `email_templates` avec trois modèles. |
| `0048` | `grades.peut_celebrer` — la liste des célébrants sort du code et rentre dans le référentiel. |

**Aucune migration n'attend.**

---

## Où en est le projet

**Lots 0 à 7 livrés.**

| Module | État |
|---|---|
| Authentification, habilitations avec portée, structure à 6 niveaux | ✅ |
| Référentiels, croyants, transferts, baptêmes | ✅ |
| Bureaux — composition, organigramme, impression | ✅ |
| Finances — lot 4 complet, EF-FIN-01 à 35 | ✅ |
| Tableau de bord — lot 5, EF-DSH-08 pour moitié | ✅ |
| Rapports — bibliothèque, éditeur, aperçu A4, génération | ✅ |
| **Administration — comptes, habilitations, audit, corbeille, paramètres, courriels** | ✅ |

**698 tests unitaires, 32 fichiers.** `pnpm verify` vert.

---

## Le lot 7 en sept écrans

| Écran | Route | Ce qu'il fait |
|---|---|---|
| Accueil administration | `/administration` | Le point d'entrée, à la place de « Mon compte » |
| Comptes | `/administration/comptes` | Ouvrir, modifier, désactiver, supprimer un compte |
| Paramètres généraux | `/administration/parametres` | Trois onglets : organisation, courriels, profils |
| Journal d'audit | `/administration/audit` | Ce qui s'est passé, en français |
| Corbeille | `/administration/corbeille` | Restaurer ou purger entités et croyants |
| Mot de passe oublié | `/mot-de-passe-oublie` | Actif seulement si le circuit courriel l'est |
| Changement imposé | `/changer-mot-de-passe` | Barrage tant que le provisoire n'est pas changé |

### Les invariants à ne pas perdre

**On se connecte au matricule.** Ce qui ne ressemble pas à une adresse est
cherché comme matricule, et l'adresse du compte — vraie ou fabriquée — sert à
authentifier. Les comptes sans courriel portent `<matricule>@synod.invalid` :
`.invalid` est réservé par l'IETF, aucun message ne peut y aboutir.

**Aucune invitation par courriel.** L'administrateur ouvre le compte et remet
les identifiants en main propre. Le mot de passe généré est **dictable** — ni
`0`/`O`, ni `1`/`l`, trois groupes de cinq. Il est **provisoire** : tant qu'il
n'est pas changé, la disposition partagée renvoie vers le changement, quelle que
soit la page demandée.

**Seuls les membres de bureau ont un compte** — la liste des candidats ne
propose que les mandats en cours. **Sauf le responsable informatique**, un par
entité, désigné par le Siège : sans lui, personne ne pourrait créer les premiers
bureaux, faute d'un compte que seul un bureau permet d'obtenir.

**On n'accorde que ce qu'on détient, et que ce qui est délégable.** La
modification d'un compte ne réécrit **que les droits que l'auteur aurait pu
accorder** : sinon un administrateur de district effacerait, en corrigeant une
ligne, les droits que le Siège avait posés.

**Un compte qui a signé des lignes d'audit ne se supprime pas** — le refus dit
combien. La désactivation reste ouverte.

**Le mot de passe SMTP n'est pas en base**, il est dans les variables
d'environnement (`SMTP_PASSWORD`). Une base se sauvegarde, se copie, s'exporte.

**Le journal d'audit se tait quand il ne sait pas dire.** Une description
approximative dans un journal d'audit serait pire que pas de description : on la
citerait. Le détail technique reste consultable, replié.

---

## Ce qu'il reste

### Lot 8 — portabilité, recette, mise en production

Le prochain au plan, et il n'est pas entamé : export intégral,
`S3StorageAdapter`, `RESTORE.md`, restauration prouvée chez un tiers (CA-16),
campagne de performance, audits d'accessibilité, de sécurité et de design,
documentation et bascule.

### Lot 7 — ce qui n'a pas été fait

- **Pas de portée par droit.** Chaque habilitation accordée prend la portée de
  l'entité de rattachement du compte ; le `ScopeSelector` du plan n'existe pas.
  Restreindre un seul droit à une sous-branche demande encore une écriture en
  base.
- **Profils d'habilitation locaux** : `permission_profiles.entity_id` existe,
  aucun écran ne le renseigne. Les profils sont donc tous globaux.
- **L'audit est écrit par l'application** (`auditer()` dans chaque Server
  Action), pas par des triggers : un trigger ne connaît ni l'auteur applicatif,
  ni le motif d'un refus. C'est un choix, pas un oubli — mais une écriture qui
  contournerait les Server Actions ne serait pas tracée.
- **Plafond de chargement des listes** et **durée de vie des URL signées**
  restent des constantes, non réglables.
- **RG-19, RG-22, RG-23 et ENF-SEC-11** n'ont pas de test portant leur code —
  §18.3 en exige un. RG-20, RG-21, RG-24 et RG-25 sont couverts.

### Lot 5 — la moitié restante d'EF-DSH-08

« Le SuperAdmin peut **imposer** un modèle de tableau de bord par niveau. »
`dashboard_templates` existe depuis `0005` ; l'écran d'administration existe
désormais aussi. Il ne manque que le branchement.

### Lot 6 — ce qui n'a pas été fait

- **EF-RAP-19** (*Could*) — génération périodique programmée.
- Les **filtres par bloc** d'EF-RAP-03 (période, catégorie, sexe…) ne sont pas
  saisissables : la source se choisit, ses filtres non.
- Le bloc **Image** ne porte qu'une légende. Un logo téléversé par modèle
  demanderait la chaîne de stockage complète, jusqu'à l'embarquement en `data:`
  pour l'impression.

### Lot 4 et lot 1 — écarts assumés, portés au plan

- **Pas d'écran de saisie déléguée dédié** : le pop-up de mouvement la porte
  déjà (règle 16).
- **Pas de vue matérialisée** (`mv_entity_kpis`, `mv_finance_kpis`,
  `mv_finance_par_categorie`) : des fonctions `SECURITY INVOKER` les remplacent
  — une vue matérialisée ignore la RLS et vieillit entre deux rafraîchissements.
- **Pas d'export PDF de la vue consolidée** : seulement l'impression de l'écran.
- **Pas d'import Excel des entités** (les croyants, si).
- **Pas de sélecteur de périmètre global** dans la barre du haut : le périmètre
  se choisit écran par écran.

### Dette technique connue

- **Règle 17 à moitié tenue sur `/finances`** : filtres en mémoire, mais pas de
  synchronisation de l'URL par `history.replaceState`. `/rapports` et
  `/administration/audit` le font, et servent de modèle.
- ~~`.env.example` absent du dépôt~~ — **corrigé le 19 août 2026** : le modèle
  est versionné, avec une exception nommée dans `.gitignore`. Il ne porte que
  des noms de variables, jamais de valeurs.
- **`pnpm typecheck` échoue sur un clone frais**, sur `LayoutProps` : Next 16
  génère ces types dans `.next/types/`, et `verify` s'arrête au typecheck avant
  d'atteindre le build qui les aurait produits. `pnpm exec next typegen` le
  résout.

### À décider par vous

- **Poser `SMTP_PASSWORD`** dans les variables d'environnement : sans lui, le
  serveur d'envoi est configuré mais aucun message ne part. Le bouton d'essai le
  dira sans détour.
- **Faire tourner `SUPABASE_SERVICE_ROLE_KEY`** — voir « Rotation d'un secret »
  dans `README.md`.
- **Borner ou non la visibilité des croyants** dans la saisie des dîmes.
- **Un rapport publié montre tout ce qu'il contient** à qui a accès au
  périmètre, `finance.read` ou non, puisque l'omission a été faite à la
  génération. Si ce n'est pas voulu, cela se resserre.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
cp .env.example .env.local   # puis renseigner : les valeurs sont dans Supabase
pnpm exec next typegen       # sur un clone frais, AVANT le premier typecheck
pnpm verify       # secrets + lint + types + 698 tests + build
pnpm dev:propre   # cache Turbopack vidé — après toute série de modifications
```

**Sur Windows sans `pnpm`** : `corepack enable` échoue en `EPERM` (il écrit dans
`C:\Program Files\nodejs`). Poser les shims ailleurs :

```bash
corepack enable --install-directory "$LOCALAPPDATA/corepack-shims"
```

puis ajouter ce dossier au `PATH` **utilisateur**.

Lire avant toute tâche : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
puis `CLAUDE.md`, `notes/cdg.md` et `notes/plan.md`.
