# Résumé — 23 août 2026

> Point d'étape destiné à la reprise de session.
> **Nouvelle machine ou nouvelle session ? Lire d'abord**
> [`.agents/rules/reprise.md`](../.agents/rules/reprise.md), puis
> **[`notes/todos.md`](../notes/todos.md)** — c'est là que se trouve ce qu'il
> reste à faire, et l'état exact de la base.
>
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-22_resumes-moi.md`](2026-08-22_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local`.

---

## L'état de la base

**Inchangé depuis le 22 août : `0001` à `0073` appliquées**, confirmé par
l'utilisateur. Aucune migration écrite ni retirée aujourd'hui — les deux
opérations du jour (un retrait, un ajout) portent sur le CODE, pas le
schéma. `permission_profiles.entity_id`, exploité par les profils locaux
livrés plus bas, existait déjà depuis `0005`/`0008`. L'état qui fait foi est
en tête de `notes/todos.md`.

**884 tests unitaires, 44 fichiers.** `pnpm verify` vert (lint, typecheck,
tests, build) — vérifié après chacune des deux opérations du jour.

---

## Ce qui a été fait aujourd'hui

### 1. La portée par droit dans l'octroi (EF-ADM-03) est retirée sur décision explicite

Livrée la veille (22 août, trois commits : `f85775c`, `44db5f9`, `54d2d49`),
testée et confirmée fonctionnelle par l'utilisateur — mais jugée trop lourde
à l'usage : « je préfère revenir au cas précédent pour ne pas surcharger le
formulaire de création de compte et les habilitations. »

**Retiré par TROIS `git revert` successifs**, du plus récent au plus ancien
(`54d2d49` → `44db5f9` → `f85775c`), chacun appliqué sans conflit. Vérifié
par `git diff ab7f25b HEAD` (le commit juste avant le premier des trois) :
**diff vide** — le code est revenu à l'identique, octet pour octet, pas
seulement fonctionnellement équivalent. `pnpm verify` repasse au vert avec
883 tests (contre 889 la veille : les 6 tests de `resoudrePortee` partent
avec le reste).

Choix délibéré : `git revert` plutôt qu'un `reset --hard` + force-push. Les
trois commits étaient déjà **poussés** sur `origin/main` — les réécrire
aurait fallu une réécriture d'historique sur une branche partagée, que les
règles du dépôt interdisent sans autorisation explicite pour cela. Trois
commits de revert, chacun rattaché par son message au commit qu'il annule,
gardent la trace complète : ce qui a été tenté, pourquoi, et qu'on est
délibérément revenu en arrière — pas une réécriture qui ferait disparaître
l'épisode.

**La règle retenue à la place, dictée par l'utilisateur, à respecter pour
toute reprise de ce sujet :**

> Les habilitations d'un compte doivent être limitées au sein de son entité
> même. Si une entité enfant n'a pas accès à l'application, alors son entité
> parent peut saisir pour elle (toutes les options, dans la limite de
> l'habilitation d'un compte au sein de son parent).

Autrement dit : **pas de portée plus étroite que l'entité de rattachement**,
jamais. Le besoin qu'EF-ADM-03 visait à couvrir — atteindre une entité
enfant sans accès — reste couvert par le mécanisme déjà en place : un droit
`DESCENDANTE` (RG-25, la majorité des droits) couvre déjà l'entité de
rattachement ET tout son sous-arbre, combiné à `sans_acces_application` +
`finance.delegate` (la saisie déléguée, lot 4) pour les entités qui n'ont
personne pour saisir. Ce n'est donc pas un besoin non résolu — c'est un
besoin résolu **autrement** que par une restriction par droit à l'écran.

`notes/cdg.md` (EF-ADM-03) et `notes/todos.md` (§5) portent tous les deux la
décision, datée et motivée — le même principe déjà appliqué à EF-FIN-15 le
12 août : un écart à l'exigence d'origine se documente à l'endroit où
l'exigence est citée, pas seulement dans un journal qu'on ne relit pas.

### 2. Les profils locaux (EF-ADM-05), livrés — sans migration

Reprise de `notes/todos.md` §5, le point suivant : « Profils locaux — la
colonne existe, aucun écran ne la renseigne. » Vérifié en explorant avant
d'écrire : `permission_profiles.entity_id` et sa RLS existaient depuis la
TOUTE PREMIÈRE migration (`0005`/`0008`) — la colonne et la politique
d'écriture étaient prêtes, seul l'écran forçait `entity_id = null` sur tout
profil et réservait toute la composition au Siège.

**La RLS elle-même pointait vers la réponse, avant même de poser la
question.** Sa politique d'écriture exige `permission.delegate` — PAS
`settings.manage`, réservé aux profils globaux — combiné à `entity_in_scope`.
Question posée avant d'écrire : le Siège garde-t-il l'exclusivité en ciblant
une entité, ou chaque entité gère-t-elle les siens ? Réponse — **chaque
entité gère les siens**, cohérente avec ce que la RLS attendait déjà.

**Deux écrans, jamais un sélecteur d'entité — même doctrine que « une
entité ne compose que pour elle-même » du lot 6 (rapports).**
`/administration/parametres` garde les profils GLOBAUX (Siège,
`settings.manage`), désormais filtré à `entity_id is null` pour ne plus
montrer les profils locaux des autres entités. Nouvel écran
`/administration/profils` (`permission.delegate`) pour les profils LOCAUX :
l'entité n'est JAMAIS choisie, elle est celle de l'auteur — aucun sélecteur,
aucune portée à discuter à l'écran.

**`ReglagesProfils`/`ProfilDialog` gagnent un prop `entiteImposee` optionnel
plutôt que deux composants** (règle 16) : absent sur l'écran Siège, fourni
(l'entité de session, jamais un choix) sur l'écran local — même mécanisme
que `RattachementImpose` pour la création d'un croyant.

**L'habilitation d'une MODIFICATION se lit sur le profil EXISTANT en base,
pas sur ce que le formulaire renvoie** (règle 19, dans l'autre sens) :
`entity_id` n'est écrit qu'à la CRÉATION dans `enregistrerProfil` — jamais
réécrit par une modification, qui va d'abord chercher la portée réelle du
profil visé avant de décider quelle habilitation exiger. Sans cette
précaution, un profil aurait pu changer de propriétaire par un simple
enregistrement, si jamais `entiteImposee` divergeait un jour de ce que le
profil portait déjà.

**Troisième instance cette session d'une intention écrite sans appelant**
(`promotionDuCroyant`, `organisation_settings.logo_key`, et maintenant les
profils locaux) : `chargerProfilsHabilitation` vivait dans
`lib/data/courriel.ts`, aux côtés d'`email_settings`, sans rapport
fonctionnel avec le courriel — et son propre commentaire disait déjà que la
portée « n'est pas encore exploitée par l'écran ». Extrait dans
`lib/data/profils.ts` et `lib/actions/profils.ts`, ses propres fichiers.

`pnpm verify` : 44 fichiers, 884 tests, build compris — vert. Aucun test
neuf : la logique ajoutée est de l'autorisation dans des Server Actions,
comme `comptes.ts`, jamais unitairement testée dans ce projet.

---

## Les décisions à ne pas défaire

**Une fonctionnalité qui MARCHE peut quand même être refusée — la fatigue
d'usage est un motif suffisant, indépendant de la correction technique.**
Le sélecteur de portée par droit était fonctionnellement juste (testé,
`pnpm verify` vert, comportement conforme à RG-25) et a quand même été
retiré : la charge cognitive d'un formulaire de compte à treize sélecteurs
répétés valait plus que la flexibilité gagnée. Ne pas relire un refus
d'utiliser une fonctionnalité comme un signe qu'elle était mal construite.

**Défaire des commits déjà poussés se fait par `git revert`, jamais par une
réécriture d'historique.** Trois commits, retirés dans l'ordre inverse de
leur création, chacun sans conflit — vérifié par un `git diff` contre l'état
d'avant le premier des trois, qui doit rendre une différence VIDE pour
confirmer un retrait complet et non partiel.

**Une habilitation reste bornée à l'entité de rattachement, jamais plus
étroite.** Restreindre viendrait du côté DESCENDANTE de RG-25 (l'entité et
son sous-arbre) ou de `sans_acces_application` (saisie déléguée) — jamais
d'un choix fait ligne par ligne dans le formulaire d'octroi. Toute demande
future de « restreindre un droit à une sous-structure » doit repartir de
cette conversation avant d'être reprise.

**Une RLS déjà écrite pour un cas non exploité EST une spécification, pas un
hasard.** La politique d'écriture de `permission_profiles` exigeait
`permission.delegate` depuis `0008`, alors que l'écran n'a jamais utilisé
que `settings.manage`. Ce n'était pas une incohérence à ignorer : c'était la
conception voulue pour le cas local, jamais raccordée à un écran. Avant de
choisir une conception pour une fonctionnalité à moitié construite, lire ce
que la RLS vérifie déjà — elle a souvent la réponse.

---

## Ce qu'il reste

**EF-ADM-03 et EF-ADM-05 sortent tous deux de la liste des sujets ouverts**
— la première **tranchée** (déclinée, voir plus haut), la seconde
**livrée**. Pour le reste, voir
[`2026-08-22_resumes-moi.md`](2026-08-22_resumes-moi.md#ce-quil-reste) et
[`notes/todos.md`](../notes/todos.md) — inchangé sinon ces deux points.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
cp .env.example .env.local   # puis renseigner : les valeurs sont dans Supabase
pnpm exec next typegen       # sur un clone frais, AVANT le premier typecheck
pnpm verify       # secrets + lint + types + 884 tests + build
pnpm dev:propre   # cache Turbopack vidé — après toute série de modifications
```

Lire avant toute tâche : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
`notes/todos.md`, puis `CLAUDE.md`, `notes/cdg.md` et `notes/plan.md`.
