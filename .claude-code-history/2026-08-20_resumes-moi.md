# Résumé — 20 août 2026

> Point d'étape destiné à la reprise de session.
> **Nouvelle machine ou nouvelle session ? Lire d'abord**
> [`.agents/rules/reprise.md`](../.agents/rules/reprise.md), puis
> **[`notes/todos.md`](../notes/todos.md)** — c'est là que se trouve ce qu'il
> reste à faire.
>
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-19_resumes-moi.md`](2026-08-19_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local`.

---

## L'état de la base

Migrations `0001` à **`0060`** appliquées. **Aucune n'attend.** Les cinq du
jour :

| N° | Ce qu'elle apporte |
|---|---|
| `0056` | Les **trois règles de rapprochement** des dîmes — `fn_attribuer_enveloppe`, et les fonctions de collecte et de résolution qui l'appellent. |
| `0057` | Le **reçu suit le nom lu**, plus la fiche. Et la résolution **ne renumérote jamais** un reçu déjà émis. |
| `0058` | L'**église de rattachement lue dans le fichier** : `eglise_source` et `eglise_id` sur la ligne de rapprochement. |
| `0059` | Deux verrous de bureau : le **terme exigé à l'ouverture**, et l'**interdiction de supprimer un bureau clos**. |
| `0060` | **La publication des rapports est retirée** : `report.read` décide seul qui peut ouvrir un rapport. |

**773 tests unitaires, 37 fichiers.** `pnpm verify` vert.

---

## Ce qui a été livré aujourd'hui

### Finances — la saisie déléguée, en fin de journée

**Sans migration.** Deux passages, sur un même signalement qui disait l'inverse
de ce qu'il était : *« une personne sans habilitation peut quand même saisir »*.
Vérification faite, l'écriture n'aboutissait pas — elle était **refusée**, alors
qu'elle aurait dû passer.

- **Le critère était trop étroit.** Une cellule ouverte la veille a l'accès à
  l'application et n'a **aucun compte** : un compte suppose un mandat en cours
  (lot 7), et son bureau n'est pas constitué. Les deux branches refusaient donc
  à la fois — la directe parce que `finance.create` est `PROPRE` depuis `0050`,
  la déléguée parce qu'elle exigeait `sans_acces_application`. **L'argent de la
  cellule n'entrait nulle part.**
  « Personne pour saisir » couvre désormais les **deux** cas : entité déclarée
  sans accès — une décision, qui durera — **ou** aucun titulaire en fonction —
  un état de fait, qui se résoudra seul. La condition se relit à chaque
  écriture : le jour où un bureau s'ouvre, la délégation se referme d'elle-même.
- **La case à cocher a disparu.** Ce n'était pas un choix — soit l'entité a un
  opérateur et la délégation lui est refusée, soit elle n'en a pas et c'est le
  seul mode. Laisser choisir, c'était laisser se tromper, et la case oubliée
  répondait « vous n'avez pas l'autorisation » quand l'autorisation était là.
- **`peutDeleguer` valait `true` en dur** : l'écran ne vérifiait jamais
  `finance.delegate`. L'encart avertit maintenant **avant** la saisie, sur
  l'entité choisie, et le serveur **nomme** l'habilitation au lieu de la
  formule générique. La ligne d'audit `DENIED` est conservée — un refus est un
  événement.

### Croyants

- **Tri des colonnes au clic** (`lib/domain/tri.ts`, partagé — les autres tables
  n'auront qu'à s'y brancher).
- La file des versements sans fiche devient **« les personnes non rattachées »**,
  et sa table **se replie** — le bandeau, lui, ne se replie jamais.

### Bureaux

- **Un mandat échu ferme l'application** (`lib/domain/mandat.ts`, sans migration).
- **Le terme est exigé à l'ouverture** d'un bureau.
- **Un bureau clos est archivé, jamais supprimé.**
- L'écran est réorganisé : **onglets par niveau**, puis cartes **groupées par
  entité**.

### Dîmes

- **Les trois règles de rapprochement**, avec l'attribution du numéro
  d'enveloppe à l'import comme à la résolution.
- **Un nom lu suffit pour un reçu** — il n'est plus besoin d'une fiche.
- **L'église de rattachement** est lue dans le fichier d'import.
- Le relevé gagne un **menu** (Ticket / Rapprocher) et affiche l'**enveloppe
  habituelle** d'un donateur qui n'en a pas présenté.

### Rapports

- **La publication est retirée.**
- **Filtres par bloc** — sexe, statut, sens, niveau, état du mandat.

---

## Les décisions à ne pas défaire

**Une absence n'est pas une petite valeur.** Au tri, les lignes sans valeur
restent en queue **dans les deux sens** : un croyant sans date de baptême n'est
pas « le premier baptisé », et inverser cela ferait remonter en tête, sur un
second clic, exactement ce qu'on ne cherchait pas.

**On révoque un accès sur PREUVE, jamais sur absence de preuve** (règle 15). Un
compte dont on ne connaît aucun mandat n'est pas un compte dont les mandats sont
échus. Deux dérogations, et deux seulement : **le Siège** — la dérogation porte
sur **l'entité**, pas sur le rôle, sinon le redémarrage dépendrait d'une seule
personne — et le **responsable informatique, tant qu'il l'est**.

**Fermer un accès n'efface rien.** Un trésorier remplacé reste croyant de son
église, avec son historique. De même, **clore un bureau archive** : la
composition, les dates, les liens vers les croyants restent lisibles.

**Une date de fin de mandat inventée est pire qu'une absente.** Elle a l'air
vraie, elle fermera des accès le jour venu, et personne ne saura d'où elle sort.
C'est pourquoi `bureaux.date_fin` n'est PAS `not null` : le terme est exigé à
l'**insertion** seulement.

**Un numéro d'enveloppe déjà détenu par un autre n'est jamais pris.** Le voler
en silence attribuerait les dîmes suivantes au mauvais nom. Et l'ancien numéro
d'un croyant est **désactivé, pas supprimé** — il figure sur des reçus remis.

**Un reçu ne se renumérote pas.** Depuis `0057`, une ligne nommée porte son reçu
dès l'import ; en émettre un second à la résolution donnerait deux références
pour un versement, et le papier détenu par le donateur cesserait de correspondre
à la base.

**Un rapport est confidentiel à son entité.** RG-26 omet les blocs non habilités
**à la génération**, sous la session de celui qui génère, et le contenu est
ensuite figé (RG-27) : publier montrait donc des finances à qui n'y avait pas
droit. Rejouer l'omission à la lecture ferait varier le document d'un lecteur à
l'autre — un rapport cesserait d'être un document.

**Un filtre de rapport ne porte que sur des ensembles clos et connus** (règle
18). Un filtre par grade ou par catégorie figerait dans le modèle une valeur que
le référentiel peut renommer, et le bloc se viderait sans que rien ne
l'explique. **L'absence vaut « tout »**, et un filtre orphelin est ignoré.

**Un verrou se pose en base, pas sur un bouton.** Et pour un refus qui doit se
lire, c'est un **trigger** et non une politique RLS : une politique rendrait la
ligne invisible, donc répondrait « 0 ligne supprimée » et l'écran annoncerait
une réussite.

---

## Ce qu'il reste

**La liste fait foi : [`notes/todos.md`](../notes/todos.md).** En résumé :

- **`/rapports`** — logo téléversé (demande la chaîne de stockage complète, et
  l'embarquement en `data:` pour l'impression) ; génération périodique
  programmée, **écartée** le 20 août.
- **`/administration`** — portée par droit dans l'octroi ; profils locaux.
- **Transversal** — fond blanc et ombres légères sur toutes les pages ;
  réécrire les libellés d'écran en langage courant.
- **Nouveau, arrivé le 20 août au soir** — l'impression PDF de la liste des
  croyants (filtres compris), le **lien conjugal** époux ↔ épouse, l'affichage
  de l'**église lue du fichier** dans les dîmes, un niveau de navigation de plus
  sur `/bureaux`, une **section Design entière** (12 points : couleur des
  boutons réglable, réglages Sonner, référentiel « Événement », marges de 4 px,
  pop-up déplaçables, ordre protocolaire au glisser-déposer…), et deux
  anomalies : le **motif** au retrait d'un titulaire, et la portée de « Gérer
  les modèles partagés ».
- **`finance.create` n'est toujours pas filtré dans le sélecteur d'entité** de
  `/finances`. Chaque refus est motivé désormais, mais l'écran propose encore
  tout le périmètre actif.
- **Reporté en fin de liste** — le **PDF d'un rapport**, toujours bâclé après
  cinq tentatives. La cinquième piste vient de l'utilisateur : régler les
  **quatre marges séparément** plutôt qu'une seule pour tout le papier.
  *Reprendre avec le PDF produit sous les yeux.*
- **Lot 8** — portabilité, recette et mise en production. Pas entamé.

### Dette technique connue

- **Règle 17 à moitié tenue sur `/finances`** : filtres en mémoire, mais pas de
  synchronisation de l'URL. `/croyants` et `/administration/audit` le font.
- **`pnpm typecheck` échoue sur un clone frais**, sur `LayoutProps` :
  `pnpm exec next typegen` le résout.
- **RG-19, RG-22, RG-23 et ENF-SEC-11** n'ont pas de test portant leur code.

### À décider par vous

- **Poser `SMTP_PASS`** dans les variables d'environnement de production : sans
  lui, le serveur d'envoi est configuré mais aucun message ne part.
- **Révoquer le mot de passe d'application Google** qui a transité par
  `.env.example` le 19 août. Rien n'a été commité — mais un secret exposé se
  révoque.
- **Faire tourner `SUPABASE_SERVICE_ROLE_KEY`** — voir `README.md`.
- **Borner ou non la visibilité des croyants** dans la saisie des dîmes.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
cp .env.example .env.local   # puis renseigner : les valeurs sont dans Supabase
pnpm exec next typegen       # sur un clone frais, AVANT le premier typecheck
pnpm verify       # secrets + lint + types + 767 tests + build
pnpm dev:propre   # cache Turbopack vidé — après toute série de modifications
```

**Sur Windows sans `pnpm`** : `corepack enable` échoue en `EPERM` (il écrit dans
`C:\Program Files\nodejs`). Poser les shims ailleurs :

```bash
corepack enable --install-directory "$LOCALAPPDATA/corepack-shims"
```

puis ajouter ce dossier au `PATH` **utilisateur**.

Lire avant toute tâche : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
`notes/todos.md`, puis `CLAUDE.md`, `notes/cdg.md` et `notes/plan.md`.
