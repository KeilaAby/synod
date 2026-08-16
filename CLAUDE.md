@AGENTS.md

# SYNOD — contexte projet

Application web de gestion d'église. **Lire avant toute tâche** :

- [`cdg.md`](notes/cdg.md) — exigences `EF-*`, règles de gestion `RG-01` à `RG-33`
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
dépendance — ARB-6 clos) et la **saisie de baptêmes en lot** (EF-BAP-07) :
en-tête commun à la cérémonie — date, lieu, session, célébrants, nationalité —
puis une grille d'une ligne par personne. Le **grade ne se demande dans aucun
des deux formulaires** : un nouveau baptisé est « Croyant », le serveur le
résout et refuse en le disant si le référentiel n'en contient plus. L'**église est une
colonne**, parce qu'une cérémonie de district réunit des baptisés de plusieurs
églises ; elle s'efface quand le périmètre n'en compte qu'une. Le critère est ce
que le périmètre **contient**, jamais le rôle : un gestionnaire de district
n'est pas SuperAdmin et compte pourtant vingt églises. Trois écritures pour N
baptisés, jamais trois par baptisé, et les fiches se relient à leur ligne par la
**clé de rapprochement**, pas par le rang du `returning`.

**Lot 3 (bureaux) livré** : ouverture, **modification**, composition par rang
avec fonctions vacantes, désignation, remplacement, reconduction, clôture
atomique, **suppression** sous `bureau.delete` (droit distinct et non
délégable), **organigramme React Flow** (EF-BUR-07) — en lecture comme seconde
représentation de la composition, et en **édition** sur
`/bureaux/[id]/organigramme` : palette de fonctions à poser, déplacement libre,
traits de dépendance, désignation au glisser-déposer. Le plan est un **dessin**,
pas la définition des postes : la composition tabulaire reste la source des
vacances, et ôter un bloc ne touche jamais le référentiel. « Poser les
manquantes » est **additif** et se désactive quand il ne manque rien : les
traits tirés à la main sont la seule chose qu'aucune donnée ne porte.
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
son URL signée périmerait.

**Lot 4 (finances) — socle livré** : `finance_entries`, workflow
`Brouillon → Soumis → Validé` avec rejet et annulation **motivés**, soldes
propre et consolidé calculés **en base** (`fn_finance_solde`), écran
`/finances`, saisie déléguée. Le workflow s'active **par entité** et non
globalement — écart à EF-FIN-15, amendé et daté dans `cdg.md`. **Aucun
héritage depuis le parent** : chaque entité a son bureau et chaque bureau gère
ses finances ; la hiérarchie ne fait que les consulter. `null` signifie donc
« défaut de l'organisation », jamais « comme mon parent ».

**EF-FIN-07 et EF-FIN-08 livrés** : pièce justificative (type déduit des
**premiers octets**, clé relative en base, URL signées en lot à l'affichage) et
saisie en série, qui conserve entité, catégorie et date. Un mouvement validé
fige aussi sa pièce (RG-17).

**EF-FIN-21 livré** : la file `/finances/a-valider`, du plus **ancien** au plus
récent, avec sélection et traitement par lot. Quatre allers-retours pour N
mouvements, et un refus partiel n'arrête pas le lot — la ligne écartée est
nommée, le reste passe.

**EF-FIN-11 livré** : `/finances/consolide`, le solde propre et consolidé de
chaque entité, trié CROISSANT — ce qui va mal remonte en tête. Migration `0026`
(`fn_finance_soldes_perimetre`) calcule tout en UNE passe et reste
`SECURITY INVOKER` : la RLS borne le résultat, l'écran n'a aucun filtrage à
refaire.

L'**écran de réglage** du workflow est livré — bouton de `/finances`, trois
choix par entité — ainsi que **`finance.validate_own`** (EF-FIN-18), qui lève la
séparation saisie/validation et s'évalue **avec sa portée**, et
**`finance.workflow.manage`**, **délégable** : le Siège le confie à un district
pour son seul district, là où `settings.manage` aurait ouvert avec lui la devise
et le format des matricules. Au passage, une
divergence : `bureau.delete` était non délégable en TypeScript et délégable en
SQL. Migration `0025`, et un test lit désormais le fichier SQL pour comparer les
deux listes — une règle écrite à deux endroits ne diverge jamais le jour où on
l'écrit.

**Dîmes — saisie livrée** : EF-FIN-27 à 31, RG-33, conception dans
[`plan.md`](notes/plan.md) §4.bis. Le point à ne pas manquer avant d'écrire une
ligne : **une dîme n'est pas une recette de l'église qui la collecte**. Elle
appartient au Siège, à qui elle est remise en mains propres. Le mouvement porte
donc `entity_id = <Siège>` et jamais l'église, sans quoi `fn_finance_solde`
compterait le même argent deux fois — chez celui qui l'a collecté et chez celui
à qui il appartient, deux soldes plausibles et tous deux faux. Le lien avec
l'église passe par `entite_collecte_id`, qui sert la traçabilité et n'entre dans
aucun solde.

Migrations `0027` (schéma : enveloppes, versements, remises, deux séquences
attribuées par la base), `0028` (**reprise** des dîmes déjà saisies comme
recettes d'église — elle suspend `trg_finance_biu`, RG-17 l'interdisant, et se
borne à `entite_collecte_id is null` pour rester rejouable) et `0029`
(`fn_saisir_collecte_dime`, **SECURITY DEFINER** : elle vérifie
`finance.dime.collect` sur l'**entité collectrice** avant d'écrire au nom du
Siège, et rend l'écriture atomique).

Écran `/finances/dimes` — un **relevé de collecte**, jamais un solde : aucune
carte de solde n'y figure, délibérément. **Remise par bordereau** (EF-FIN-30) :
c'est elle, et elle seule, qui VALIDE le mouvement et alimente le Siège — une
collecte naît `SOUMIS`, parce qu'elle annonce sans encaisser. **Import
Excel/CSV** (EF-FIN-34) : aucune ligne portant un montant n'est rejetée ; un nom
inconnu donne un versement anonyme ET une ligne à rapprocher dans `/croyants`,
où le travail est de l'identification, pas de la comptabilité.

**Lot dîmes clos** — EF-FIN-27 à 35. Le **reçu s'imprime**
(`components/finances/imprimer-recus.ts`) : il existait déjà, la base le
numérote à la collecte ; ce qui manquait, c'est le papier. **Deux formats, parce
que ce sont deux gestes** — l'**A4** à huit talons pour la collecte entière
après le culte, le **rouleau de 80 mm** pour celui qu'on tend à quelqu'un qui
est devant soi. Ce n'est pas une variante : sur un rouleau la largeur est fixée
et la hauteur libre, l'inverse d'une feuille, et 72 mm utiles n'admettent pas
deux colonnes. Le talon de caisse porte seul la mention « Dîme reçue pour le
compte du Siège » (EF-FIN-29) — c'est le seul papier que le donateur emporte. Le
montant y figure **en toutes lettres** (`lib/domain/montant-en-lettres.ts`, sans
dépendance) — « 12 000 » devient « 112 000 » d'un trait de stylo, « douze mille
ariary » ne se rallonge pas. Chaque talon porte **sa** cérémonie, jamais celle du
lot : depuis la fiche d'un croyant on réimprime des reçus de collectes, et
parfois d'églises, différentes. L'**historique du croyant** (EF-FIN-35) affiche
le numéro d'enveloppe **en vigueur le jour du versement**, pas celui
d'aujourd'hui : c'est le reçu détenu qui fait foi, et il ne change pas.

La file de rapprochement offre **trois** chemins et pas un de plus : le numéro
d'enveloppe propose (`SuggestionsEnveloppe`, partagé avec la collecte — un
numéro lu dans un fichier pose la même question que celui tapé pendant un
culte), la recherche trouve, la **création** ouvre une fiche quand la personne
n'en a simplement pas encore. Cette création amorce le nom lu — le retaper
serait une occasion de le taper autrement — et l'église **collectrice** quand
c'en est une. Aucune entité « église inconnue » n'a été créée : elle entrerait
dans la structure, recevrait un code, apparaîtrait dans chaque sélecteur et dans
les soldes consolidés, et quelqu'un finirait par y transférer un vrai croyant.

**EF-FIN-24 livré** : `/finances/synthese` — par catégorie, mois par mois, et
entre entités sœurs. Migration `0039` : deux fonctions `SECURITY INVOKER` qui
rendent **l'année entière et les deux portées** en un passage. Changer de mois,
de granularité ou de portée est alors une somme faite dans le navigateur ; seuls
l'année et l'entité repartent au serveur, parce que ce sont les deux seules
choses qui changent le volume lu (règles 17 et 28). L'évolution du solde n'a
**pas** de fonction — c'est la somme des catégories par mois. Le graphique est
un **SVG écrit à la main** : Recharts pèse quelques centaines de kilooctets pour
vingt-quatre rectangles (règle 29). Et la liste des sœurs est dressée par
l'écran depuis l'arbre : une sœur sans mouvement doit figurer **à zéro**, pas
disparaître (règle 15).

**EF-FIN-22 livré** : les huit critères du registre — entité, sens, statut,
catégorie, période, auteur, plage de montants, origine. **Aucune migration** :
tout voyageait déjà avec chaque mouvement, les cinq critères ajoutés se posent
en mémoire (règle 17). `filtrerMouvements` est descendu dans le domaine et
décrit la forme minimale qu'il sait lire — une règle métier n'a pas à dépendre
d'un embed PostgREST. Les deux bornes de période sont **incluses**, et les dates
se comparent en chaînes. Les critères secondaires se replient, mais leur
**compte reste visible** : un filtre caché qui vide la liste est pire que pas de
filtre.

**EF-FIN-25 livré** : trois exports, trois usages. **XLSX** pour retravailler —
les montants y restent des **nombres**, ce qu'un CSV perd et qui est la première
chose qu'on fait d'un export financier ; **CSV** pour un autre logiciel ;
**PDF** pour transmettre une pièce datée. `lib/domain/xlsx-ecriture.ts` écrit
l'archive en **STORED** : un CRC32 et des en-têtes suffisent, contre plusieurs
centaines de kilooctets embarqués (règle 29). Le test est un **aller-retour**
avec notre propre lecteur — s'ils se comprennent, le fichier est conforme. Le
CSV sort au **point-virgule** avec une marque d'ordre des octets, sans quoi
Excel français l'ouvre en une colonne et sans accents. **On exporte ce qu'on
voit** : la sélection filtrée, dont le nombre de lignes est annoncé sur le menu.

**EF-FIN-26 livré — le lot 4 est complet.** La clôture d'une période
(migration `0040`) : le verrou est greffé sur `fn_finance_before_write`, pas sur
un bouton grisé — sinon il se contourne par un appel direct à l'API. **Rien
n'entre dans une période close, et rien n'en sort** : déplacer une écriture
*hors* d'un exercice arrêté est la forme la plus discrète de la modification
rétroactive. **Aucun héritage**, mais une cascade qui **se demande**, entité par
entité et avec sa portée. On ne clôt pas sur un brouillon ou un mouvement
soumis : clos, il ne pourrait plus être ni validé ni rejeté. `finance.periode.
close` est délégable — c'est le bureau qui arrête ses comptes ;
`finance.periode.reopen` ne l'est pas, sinon celui qui clôt s'accorderait de
quoi rouvrir et la clôture ne serait qu'une convention entre soi.

**EF-BUR-11 clos** : l'export Excel de la composition est abandonné le 12 août
2026, le PDF de l'organigramme couvre le besoin.

Migrations appliquées jusqu'à `0039`, **`0040` écrite mais pas appliquée** :
sans elle, l'écran de clôture n'a ni table ni fonction, et le verrou d'EF-FIN-26
n'existe pas. Une collecte de dîmes naît `SOUMIS` et c'est la **remise** qui la
valide, donc qui alimente le Siège. Le stockage de fichiers ne se
configure **pas** en SQL — `storage.*` appartient à `supabase_storage_admin` et
`postgres` s'y voit refuser `CREATE POLICY` : `pnpm db:bucket` s'en charge par
l'API.

Historique : [`SESSION_HISTORY.md`](.claude-code-history/SESSION_HISTORY.md) ·
dernier point d'étape : [`.claude-code-history/2026-08-16_resumes-moi.md`](.claude-code-history/2026-08-16_resumes-moi.md)

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
5. Toute valeur numérique ou monétaire en `tabular-nums`. **Pas** `font-mono` :
   ce qui aligne une colonne, ce sont les chiffres de largeur égale, et Google
   Sans en possède. La chasse fixe reste réservée à ce qui **est** du code —
   matricules, références, codes d'entité *(amendé le 13 août 2026)*.
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
