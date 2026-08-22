@AGENTS.md

# SYNOD — contexte projet

Application web de gestion d'église. **Lire avant toute tâche** :

- [`cdg.md`](notes/cdg.md) — exigences `EF-*`, règles de gestion `RG-01` à `RG-33`
- [`plan.md`](notes/plan.md) — modèle de données, RLS, design system, écrans, lots
- [`.agents/rules/reprise.md`](.agents/rules/reprise.md) — **à lire en premier
  sur une machine ou une session neuve** : ordre de lecture, installation,
  état de la base, et les pièges qui ont réellement coûté du temps
- [`.agents/rules/`](.agents/rules/) — règles **impératives** : `designrules.md`
  (stack et design) et `gitpush.md` (procédure de publication)

Toute modification doit citer l'exigence ou la règle qu'elle sert. Si une
demande contredit `cdg.md`, signalez-le avant d'implémenter.

## État — 22 août 2026

**Lots 0 à 7 livrés.** Il reste le **lot 8** — portabilité, recette et mise en
production — et quelques finitions listées au dernier point d'étape.

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

**Lot 5 — tableau de bord, première tranche** : EF-DSH-01/02/04/11/12.
`fn_tableau_de_bord` (migration `0041`) rend **dix-huit mesures en un
aller-retour**, `SECURITY INVOKER` — c'est la RLS qui tient EF-DSH-02, l'écran
ne refait aucun filtrage. Un **effectif est un état**, une **recette est un
flux** : ils n'ont pas la même borne temporelle, et le solde est un cumul depuis
l'origine à côté d'un mois. Le registre `lib/domain/kpi.ts` est déclaratif, et
**l'indicateur non habilité DISPARAÎT** — la RLS le compte à zéro, et ce zéro
affiché se lirait « nous n'avons rien » là où la vérité est « je n'ai pas le
droit de savoir » (règle 15).

**EF-DSH-03/07/09 livrés** : la personnalisation, sans migration —
`dashboard_layouts` existait depuis `0005`. La disposition porte un **ordre et
des masques explicites**, jamais une liste de visibles : un indicateur ajouté au
registre plus tard n'apparaîtrait sinon **jamais** chez ceux qui ont
personnalisé. Ce qui n'est ni ordonné ni masqué est *nouveau*, et se montre à la
fin. On réordonne **dans** un groupe — « Effectifs » et « Finances » ne sont pas
des étiquettes arbitraires. Le glisser-déposer est en HTML natif (règle 29),
doublé de deux flèches : inaccessible au clavier, il ne serait un réglage que
pour ceux qui ont une souris.

**EF-DSH-05/06 amorcés** : grille à **six** colonnes — c'est le défilement, pas
la taille, qui empêche de comparer deux chiffres — largeur déclarée au registre
en classes **littérales** (Tailwind lit le source, un `col-span-${n}` n'existe
dans aucune feuille). Les **parts** se déclarent (`partDe`) et rendent `null`
sur un total nul, jamais `0` : « 0 % » se lit comme une mesure là où il n'y a
rien à mesurer. Deux **blocs composés** : les cinq dernières fiches — un
effectif ne dit jamais *qui* a rejoint — et l'**évolution financière** en aire,
catégorie sélectionnable, qui réutilise `chargerSyntheseAnnuelle` du lot 4
plutôt que d'écrire une seconde somme que rien ne garantirait égale. Une aire et
non des barres : « dans quel sens allons-nous ? » se répond par une pente.

**EF-DSH-05 livré** (migration `0042`) : quatre **répartitions** — âge, grade,
nationalité, entités filles — en **une** fonction, parce qu'elles ne diffèrent
que par la colonne de regroupement ; le classement des filles *est* une
répartition. Deux pourcentages par barre, et ce n'est pas une redondance : la
`part` se **lit**, la `longueur` se **voit** — à l'échelle de la part, une
répartition où rien ne dépasse 20 % ne donnerait que huit traits minuscules.
Tri par effectif **sauf l'âge**, qui a un ordre naturel : le trier en ferait un
classement, ce qu'une pyramide n'est pas. Des **barres horizontales** et non un
camembert — l'œil compare des longueurs, pas des angles, et le libellé est à
côté de sa barre. La **jauge** dit « 12 sur 20 » et pas seulement « 60 % » : un
pourcentage seul ne distingue pas trois entités sur cinq de six cents sur mille.
Les cellules sont hors du dénominateur — elles n'ont pas de bureau, et les
compter ferait plonger la couverture de celles qui vont le mieux.

**EF-DSH-06 livré pour l'écran** : périmètre et période se règlent et commandent
toutes les lectures. **Sans migration** — `fn_tableau_de_bord` prenait déjà ses
bornes, c'est l'écran qui les codait en dur. Le réglage voyage par l'**URL** et
non par la disposition : le choix des indicateurs est une préférence durable,
« mars 2026 » est une question du moment — et un lien se partage. La règle 17 ne
s'applique pas ici : ces deux réglages changent ce que la base **agrège**, pas
ce qu'on trie dans une liste chargée. Ce qui vient de l'URL est **gardé** —
`estGranularite`, et l'entité vérifiée contre l'arbre : une valeur non reconnue
donnerait les bornes du mois sous un libellé annonçant un trimestre, et une
entité hors portée donnerait des zéros qu'on lirait « nous n'avons rien »
(règle 15).

**EF-DSH-10 livré** : **imprimer, c'est imprimer l'écran** — refabriquer un
document des mêmes données aurait donné un second rendu à maintenir (règle 16).
D'où *pas* de PDF dans le menu « Exporter » : deux boutons pour deux PDF du même
écran feraient hésiter à chaque clic. Le **CSV est là où la donnée est
tabulaire** — les chiffres en un fichier, chaque répartition exportant sa table.
Les **icônes** ne sont pas dans `KPI_REGISTRY` : une icône est une fonction
React, elle ne traverse pas la frontière (règle 24) — la table vit côté client et
se lit par la clé, rendue par `createElement` parce qu'une variable majuscule
liée en cours de rendu est un composant *créé* pour le compilateur React.

**EF-DSH-08 livré pour moitié** : quatre **modèles** applicables en un clic,
déclarés dans le domaine. Un modèle déclare ce qu'il **garde**, jamais ce qu'il
masque — les masques se calculent à l'application contre le registre du jour, si
bien qu'un indicateur ajouté plus tard **apparaît** quand même. Un modèle
inapplicable reste visible, éteint et expliqué : le retirer ferait croire qu'il
n'existe pas. Reste « imposer un modèle par niveau », qui demande
`dashboard_templates` et un écran d'administration.

**Lot 6 — GÉNÉRATEUR DE RAPPORTS COMPLET** (EF-RAP-01 à 18), cinq écrans :
`/rapports` (bibliothèque), `/rapports/modeles/[id]/editer` (composition),
`/rapports/generer/[modeleId]`, `/rapports/generes/[id]` (rapport figé) et
`/rapports/generes` (historique). **Une entité ne compose que pour elle-même** :
l'entité propriétaire est celle de rattachement de l'auteur, lue dans la
session — elle ne voyage pas dans le formulaire, donc elle ne se choisit pas,
donc elle n'a pas à se refuser. Le Siège fait exception, et une seule : il pose
des modèles **officiels** qui n'appartiennent à aucune entité. Migration `0045`
(`rapport_composition_libre`) : fermée, la composition est **réservée au
Siège** — mais **le Siège n'est jamais pris dans son propre verrou**, sinon il
ne pourrait plus poser la trame à laquelle les autres doivent se conformer.
Deux corollaires : **dupliquer, c'est composer** (l'autoriser rendrait le verrou
décoratif) et, composition fermée, **une entité n'emploie pas le modèle d'une
autre** — sans quoi une paroisse reprendrait la trame que son district partage
à ses descendants. Ce réglage est **monté par aucun écran** : sa place est dans
Administration (lot 7) ; `CompositionDialog` est écrit et prêt.
**La source appartient au BLOC, pas à son type** (EF-RAP-03) : c'est elle qui
décide de l'habilitation exigée, donc de l'omission RG-26 — lire celle du type
omettrait le bon bloc pour le mauvais motif. **Un seul rendu pour l'aperçu et
pour le papier** (`RenduRapport`, règle 16) : `contenu` absent → données
d'exemple **déterministes** avec leur mention, `contenu` figé → les vraies
valeurs. La marge du papier est **réglable**, et le rendu émet son propre
`<style>` — `@page` n'accepte ni classe ni variable, et figée elle rendait
l'aperçu menteur. `template_snapshot` porte la structure **APRÈS** omission : le
re-résoudre à la lecture ferait varier le document d'un lecteur à l'autre. **Un
rapport est un document** — qui peut l'ouvrir se décide par `report.read` et par
la publication, pas en rejouant l'omission bloc par bloc. **Aucun PDF n'est
stocké** (`pdf_key` reste `null`) : exporter, c'est imprimer la feuille, et le
contenu étant figé la réimpression est reproductible par construction.

**Lot 6 — fondations posées** (migration `0043`, `lib/domain/rapport.ts`) :
`report_templates` décrit **comment composer**, `report_instances` conserve **ce
qui a été produit** — d'où la copie de la structure dans chaque rapport, pour
qu'archiver un modèle ne change rien à ce qui est diffusé. **RG-27** est un
trigger : ni les données, ni la structure, ni la période d'un rapport généré ne
changent — « corriger » un rapport diffusé réécrirait l'histoire sans trace.
**RG-26** omet les blocs non habilités et les **trace** : un tableau de finances
rendu vide afficherait « aucun mouvement », ce qui est faux. Une section qui perd
tous ses blocs disparaît ; les blocs de mise en page ne s'omettent jamais ; et la
mention **compte** sans énumérer — « tableau des recettes » dirait qu'il y a des
recettes. L'habilitation est portée par la **source**, pas par le type de bloc.
Trois largeurs seulement (pleine, demie, tiers) : elles se combinent toujours en
rangées pleines.

**Lot 7 — HABILITATIONS ET ADMINISTRATION LIVRÉ** (migrations `0046`, `0047`,
`0048`). Sept écrans : accueil `/administration` — qui **remplace « Mon compte »**
dans la barre latérale —, comptes, paramètres généraux en trois onglets, journal
d'audit, corbeille, mot de passe oublié, changement imposé.

**On se connecte au matricule.** Beaucoup de membres de bureau n'ont pas
d'adresse électronique et le fournisseur d'identité en exige une : on en
**fabrique** une, `<matricule>@synod.invalid` — domaine réservé par l'IETF, donc
aucun message ne peut y aboutir. Ce qui ne ressemble pas à une adresse est
cherché comme matricule, et son adresse — vraie ou fabriquée — sert à
authentifier.

**Aucune invitation par courriel** : l'administrateur ouvre le compte et remet
les identifiants en main propre. Le mot de passe généré est **dictable** — ni
`0`/`O`, ni `1`/`l`, trois groupes de cinq — parce qu'il sera lu à voix haute, pas
copié. Il est **provisoire** au sens strict : tant qu'il n'est pas changé, la
disposition partagée renvoie vers `/changer-mot-de-passe`, quelle que soit la
page demandée — un garde-fou qu'on doit penser à poser écran par écran finit par
manquer quelque part. **Deux circuits de réinitialisation** se règlent
(`reinitialisation_par_email`, `0046`) : par courriel, ou par l'administrateur.
La sortie est la même dans les deux cas ; ce qui change est par où passe la
demande, et cela dépend de l'organisation.

**Seuls les membres de bureau ont un compte** — la liste des candidats ne
propose que les **mandats en cours**. La règle se mordait la queue le premier
jour : sans bureau, pas de compte ; sans compte, pas de bureau. D'où le
**responsable informatique** (`0047`), **un seul par entité** — garanti par un
index partiel, pas par une vérification applicative qui se contourne — désigné
par le Siège, qui reçoit un compte sans siéger nulle part.

**Des habilitations, pas un rôle** : chaque droit avec son interrupteur, groupé
par domaine, surmonté de **profils de privilèges** qui posent une série
d'interrupteurs d'un clic et se retouchent ensuite. On n'accorde que ce qu'on
détient soi-même et que ce qui est **délégable**, et la modification **ne
réécrit que les droits que l'auteur aurait pu accorder** : sinon un
administrateur de district, en corrigeant une ligne, effacerait sans le savoir
ce que le Siège avait posé. Un compte qui a **signé des lignes d'audit ne se
supprime pas** — le refus dit combien ; la désactivation reste ouverte.

Le **journal d'audit se lit** (`lib/domain/audit.ts`) : domaine en français,
action au passé, et une **phrase** quand la forme de la différence est reconnue.
Quand elle ne l'est pas, **il se tait** — une description approximative dans un
journal d'audit serait pire que pas de description, on la citerait. Le détail
technique reste consultable, replié.

**Courriels** (`0047`) : serveur d'envoi et modèles de message réglables, client
SMTP **écrit à la main** (`node:net`, `node:tls` — règle 29), bouton d'essai qui
envoie un vrai message et rapporte la réponse du serveur. Le **mot de passe SMTP
n'entre pas en base** : il vit dans `SMTP_PASS`, parce qu'une base se
sauvegarde, se copie et s'exporte. L'éditeur visuel des modèles n'expose que ce
que le nettoyage serveur laisse passer — proposer un bouton dont le résultat
serait retiré à l'enregistrement serait un mensonge d'interface.

**EF-ADM-14** : les grades habilités à célébrer sortent du code
(`grades.peut_celebrer`, `0048`). `['PASTEUR', 'DIACRE', 'EVANGELISTE']` y était
écrit en dur, et la conséquence se comprenait tard — un grade créé après coup ne
pouvait **jamais** célébrer, sans que rien ne le dise : la liste était seulement
plus courte. La reprise rétablit nommément les trois codes, bornée à
`peut_celebrer = false` pour ne jamais défaire un choix fait à l'écran.

Ce que le lot 7 **ne fait pas** : pas de portée par droit (toute habilitation
prend la portée de l'entité de rattachement), pas de profils **locaux**
(la colonne existe, aucun écran ne la renseigne), et l'audit est écrit par
**`auditer()`** dans chaque Server Action, pas par des triggers — un trigger ne
connaît ni l'auteur applicatif, ni le motif d'un refus.

**EF-BUR-11 clos** : l'export Excel de la composition est abandonné le 12 août
2026, le PDF de l'organigramme couvre le besoin.

**RG-25 précisé — la portée est une propriété du DROIT** (`0050`,
`fn_permissions_portee_propre()`). `has_perm` testait une inclusion de chemin
pour *tous* les droits : accorder `finance.validate` à un district lui donnait
la validation de ses paroisses et de ses églises, l'inverse exact de la doctrine
du lot 4 — « chaque bureau gère ses finances ; la hiérarchie ne fait que les
consulter ». Onze droits sont désormais `PROPRE` (l'entité seule) ; tout le
reste est `DESCENDANTE` **par défaut**, pour qu'un droit ajouté demain se
comporte comme avant et que `PROPRE` reste une décision explicite. Ce n'est pas
à l'administrateur de décider si « valider une finance » descend : cela tient à
la nature de l'acte. La liste vit aux deux endroits, et un test lit le SQL pour
les comparer — sinon l'écart serait **invisible** : l'écran refuserait pendant
que la base accorderait.

**La saisie déléguée exige qu'il n'y ait PERSONNE pour saisir** (règle 21).
Le drapeau `sans_acces_application` ne décidait d'abord de rien : détenir
`finance.delegate` suffisait à signer au nom de n'importe quelle entité du
périmètre. Deux bornes cumulatives maintenant, toutes deux vérifiées côté
serveur : la portée de l'octroi **et** l'incapacité de l'entité visée. Le droit
devient de ce fait **délégable** (`0051`) — ce qui le rendait dangereux n'était
pas le droit mais l'absence de la seconde borne. Le réglage a son écran, sur
`/finances` : il vivait dans la fiche de chaque entité, où savoir lesquelles de
ses vingt églises saisissent elles-mêmes demandait vingt ouvertures de fiche —
une question de comparaison veut une réponse en tableau.

**« Personne pour saisir » couvre DEUX cas, et le critère n'en voyait qu'un**
(`lib/domain/finance.ts`, 20 août 2026). Une cellule ouverte la veille a l'accès
et n'a **aucun compte** — un compte suppose un mandat en cours (lot 7). Les deux
branches la refusaient alors : la saisie directe parce que `finance.create` est
`PROPRE`, la déléguée parce qu'elle exigeait le drapeau. Son argent n'entrait
nulle part. On regarde donc l'**état de fait** : entité déclarée sans accès —
une décision, qui durera — **ou** aucun titulaire en fonction — un état qui se
résoudra seul. `motifDeDelegation` nomme la décision avant la lacune, les deux
étant vrais pour une entité sans accès. **La case à cocher a disparu** : ce
n'était pas un choix — soit l'entité a un opérateur et la délégation lui est
refusée, soit elle n'en a pas et c'est le seul mode. Laisser choisir, c'était
laisser se tromper, et la case oubliée répondait « vous n'avez pas
l'autorisation » quand l'autorisation était là.

**Un refus nomme l'habilitation qui manque, et se dit AVANT la saisie.**
`peutDeleguer` valait `true` en dur : l'écran ne vérifiait pas
`finance.delegate` et le découvrait au retour du serveur, sous la formule
générique de `requirePermission` — laquelle est trompeuse ici, l'utilisateur
détenant bien `finance.create`. L'encart avertit désormais **sur l'entité
choisie** (règle 3), et le serveur nomme le droit au lieu de la formule. La
ligne d'audit `DENIED` est conservée : un refus est un événement, le remplacer
par un message le ferait disparaître du journal.

**Une saisie déléguée ne passe par AUCUN workflow** (`0052`). Ce n'est pas une
commodité : c'est le seul état cohérent. `finance.validate` étant `PROPRE`
depuis `0050`, et l'entité visée n'ayant aucun compte, une écriture déléguée
née `SOUMIS` n'aurait **personne** pour la valider — ni l'entité, ni
l'ascendant qui l'a saisie. Elle attendrait indéfiniment, comptée nulle part,
et le solde serait faux sans que rien ne le signale. Les dîmes n'y entrent
pas : `fn_saisir_collecte_dime` n'écrit jamais `est_delegue`, et une collecte
doit naître `SOUMIS` — c'est la remise qui la valide. Le formulaire l'annonce
**avant** de le faire.

**Une redirection n'est pas une panne** (`lib/utils/erreurs-next.ts`).
`redirect()` et `notFound()` **lèvent** — c'est ainsi que la navigation voyage,
dans le `digest` de l'exception. Trois traitements d'erreur la voyaient
différemment ; le pire l'**avalait**, ce qui annonçait « action non aboutie »
*et* supprimait la redirection. `estNavigationNext` porte la règle une seule
fois, teste le **préfixe** `NEXT_` — large est le choix sûr, se relever de trop
est bénin — et ne l'importe pas de `next/dist/…`, un chemin interne qui se
déplace d'une version à l'autre.

**La fiche d'entité tient sa promesse** (`0053`, `fn_chiffres_perimetre`).
Effectifs, bureau courant et solde figurent enfin dans le pop-up de
l'organigramme **et** dans la fiche pleine page — un seul rendu partagé
(règle 16). Tout le périmètre est chargé **avec l'arbre**, en une passe : le
pop-up s'ouvre sans requête, et c'est ce qui le rend instantané (règle 28). Les
soldes viennent de `fn_finance_soldes_perimetre` et non d'une seconde somme.
Un bloc non habilité **disparaît** au lieu de s'afficher à zéro (règle 15), et
le droit s'évalue avec sa portée — `peut`, jamais `detient`.

**L'effacement définitif existe, et c'est un acte à part** (`trash.purge`,
`0054` et `0055`). Restaurer défait une suppression, purger la rend
définitive : deux actes opposés, pas deux degrés du même droit. **Non
délégable** — c'est la seule opération qui ne se rattrape par rien — et à
portée **PROPRE**, sinon un district effacerait chez ses églises sans que
personne s'en aperçoive à temps. La conséquence est dite sans détour : le
journal garde « Croyant supprimé », plus le nom. **La base a le dernier mot** :
les clés étrangères en `on delete restrict` refusent ce qui est cité ailleurs,
et l'action se contente de traduire le refus **en nommant la ligne**. Un refus
partiel n'arrête pas le lot. Les deux fonctions SQL sont dans **deux**
migrations : le test d'alignement extrait le *premier* `select array[...]` du
fichier, et les réunir lui aurait fait comparer la mauvaise liste.

**Les profils de privilèges sont réservés au Siège.** Un profil est *commun* à
toute l'organisation — il apparaît dans le formulaire de compte de chaque
entité. `settings.manage` étant non délégable, le Siège était déjà seul à le
détenir en pratique ; mais « en pratique » n'est pas une garantie, et la
suppression suit la même règle que la création.

**Journée du 20 août 2026 — la liste `notes/todos.md`, reprise dans l'ordre**
(migrations `0056` à `0060`). Ce qui a été livré, et ce qu'il ne faut pas
défaire :

**Tri des colonnes** (`lib/domain/tri.ts`, partagé). **Une absence n'est pas une
petite valeur** : les lignes sans valeur restent en queue **dans les deux
sens** — un croyant sans date de baptême n'est pas « le premier baptisé ».
Deux états, pas trois : un « aucun tri » rendrait un ordre qu'aucun chevron
n'explique.

**Un mandat échu ferme l'application** (`lib/domain/mandat.ts`, sans migration).
Évalué **à chaque ouverture de session**, jamais par une tâche planifiée — qui
laisserait passer la journée et tomberait en silence. **Deux portes** : le
gabarit redirige vers `/mandat-echu`, et `requireSession` refuse. **On révoque
sur preuve, jamais sur absence de preuve** (règle 15) : aucun mandat *connu* ne
ferme rien. Deux dérogations — **le Siège**, portée par l'**entité** et non par
le rôle (ne dispenser que le SuperAdmin ferait dépendre le redémarrage d'une
seule personne), et le **responsable informatique tant qu'il l'est**. Dans tous
les cas **on ne ferme que l'accès** : la personne reste croyante de son église.

**Bureaux** (`0059`) : le **terme est exigé à l'ouverture** — mais la colonne
n'est **pas** `not null`, parce qu'**une date de fin inventée est pire qu'une
absente** : elle a l'air vraie et fermera des accès sans que personne sache d'où
elle sort. Le trigger ne regarde que les insertions. **Un bureau clos est
archivé, jamais supprimé** : le verrou est un **trigger** et non une politique
RLS — une politique rendrait la ligne invisible, répondrait « 0 ligne
supprimée », et l'écran annoncerait une réussite.

**Dîmes — les trois règles de rapprochement** (`0056`). Un nom reconnu qui
présente un numéro **nouveau** se le voit attribuer, à l'import **comme** à la
résolution. Le numéro va dans **l'église du croyant**, jamais dans l'entité
collectrice ; un numéro **déjà détenu par un autre n'est jamais pris** ; l'ancien
est **désactivé, pas supprimé** — il figure sur des reçus remis. Une enveloppe
numérotée **sans nom** entre dans la file : `0032` l'excluait, mais ce
raisonnement valait tant qu'il n'y avait rien pour travailler — un numéro *est*
ce quelque chose. Sans nom NI numéro, elle reste dehors.

**Un nom lu suffit pour un reçu** (`0057`) : ce qui manque à quelqu'un que le
fichier nomme sans qu'une fiche le reconnaisse n'est pas son identité mais son
enregistrement — un travail qui nous appartient. **Le reçu ne se renumérote
pas** : la résolution conserve celui déjà émis, sinon deux références
désigneraient le même argent et le papier détenu cesserait de correspondre.

**L'église lue dans le fichier** (`0058`) : `eglise_source` garde ce que le
fichier disait **même si rien ne le reconnaît**, `eglise_id` porte l'entité,
résolue **une fois à l'import** — la résoudre à l'affichage la ferait dépendre
du lecteur.

**La publication des rapports est retirée** (`0060`). Le défaut était réel :
RG-26 omet les blocs non habilités **à la génération**, sous la session de celui
qui génère, et le contenu est ensuite figé (RG-27) — un rapport publié montrait
ses finances à qui n'y avait pas droit. Rejouer l'omission à la lecture ferait
varier le document d'un lecteur à l'autre. **`report.read` décide seul**, avec sa
portée ; les rapports déjà publiés gardent leur statut (c'est de l'histoire) mais
il n'ouvre plus rien, et `report.publish` **disparaît du registre** au lieu de
devenir décoratif.

**Filtres par bloc** (EF-RAP-03, sans migration) : **que des ensembles clos et
connus** (règle 18) — un filtre par grade figerait dans le modèle une valeur que
le référentiel peut renommer. **L'absence vaut « tout »**, un filtre orphelin est
ignoré, et **le rapport dit ce qu'il a retenu** sous le titre du bloc : sur une
feuille imprimée, personne ne peut ouvrir les réglages pour comprendre pourquoi
le total ne correspond pas.

**Journée du 21 août 2026 — les deux anomalies, puis l'attestation**
(migration `0066`).

**Les modèles de rapport ne débordent plus** (`niveauxProposables`, sans
migration). Un district cochait « Siège » et son modèle s'annonçait à une entité
hors de son périmètre : c'est la doctrine du lot 6 — *une entité ne compose que
pour elle-même* — qui fuyait par une autre porte. L'entité **propriétaire** ne se
choisissait pas, donc ne pouvait pas se refuser ; l'**étendue**, elle, se
choisissait librement. On propose désormais **son niveau et ceux qui en
dépendent**, jamais au-dessus — le Siège les obtient tous par application, pas
par exception. Le serveur **nomme les niveaux fautifs**, l'écran **dit la
borne** (quatre pictogrammes sur six se lisent sinon comme un défaut
d'affichage), et un niveau illisible rend une liste **vide** plutôt que
complète.

**Retirer un titulaire demande lequel des deux gestes** (`0066`). L'application
les confondait. **Erreur d'assignation** → la ligne est **effacée** : rien
n'entre dans l'historique du croyant, parce qu'il ne s'est rien passé dans sa vie
— un mandat d'un jour laissé dans sa frise se lirait un jour comme une
destitution. **Retrait en cours de mandat** → le mandat est **clos**, motif
**obligatoire**. Le choix **se demande** et chaque option affiche **sa
conséquence** : deviner ferait perdre une ligne d'historique qu'on croyait
garder, ou l'inverse. La fenêtre de **quinze jours** court depuis
l'**enregistrement** — un bureau peut être saisi en retard — et se vérifie **côté
serveur** : ce qui est en jeu est un effacement, le refus se corrige, la ligne
effacée non. `motif_retrait` **reste nullable** : un mandat se clôt aussi par la
fermeture de son bureau ou par un remplacement, qui ne sont pas des retraits.

**Le même pop-up depuis les deux écrans.** Il avait d'abord été posé un motif
d'office dans l'organigramme, au prétexte que le choix appartenait à la
composition — c'était l'inverse de la règle 16 : deux entrées pour la MÊME
opération qui n'agissent pas pareil, c'est exactement la divergence qu'elle
interdit.

**L'attestation de transfert** (EF-TRF-08, sans migration). **Un droit à part**,
`transfer.certify` : consulter dit ce qui s'est passé, **attester engage
l'entité**. **On n'atteste que ce qui a abouti** — approuvé ou effectué : deux
statuts, parce qu'entre la décision et le rattachement c'est précisément le
moment où le croyant présente son papier. **L'entité d'accueil délivre**, à
défaut l'origine. **Aucun exemplaire n'est stocké** : le contenu étant figé à
l'approbation, réimprimer redonne le même document.

**Un transfert ne réécrit RIEN de l'historique des dîmes** — vérifié le 21 août à
la demande de l'utilisateur, et consigné. L'église affichée est
`entite_collecte_id`, **figée sur le mouvement** ; le numéro d'enveloppe est
recopié sur chaque versement (`0027`) ; et `fn_appliquer_transfert` ne touche à
aucune table de dîmes. La RLS suit : l'église d'origine continue de voir ce
qu'elle a collecté après le départ du croyant — cet argent est passé par elle.

**Journée du 22 août 2026 — la palette qui se retriait, et un délai qui
devient un réglage** (migration `0069`, reprise de `notes/todos.md` §10).

**`fonctionsDuNiveau` retriait ce que la requête triait déjà.** La palette
« Fonctions à poser » de l'organigramme ignorait l'ordre protocolaire posé par
la migration `0061` : `listerFonctions` le lit trié en base, mais cette
fonction — qui filtre ensuite par niveau, pour la composition tabulaire
**et** la palette — portait encore un `.sort()` alphabétique oublié d'avant
`0061`. **Deux ordres qui se superposent finissent par diverger**, et c'est le
second, invisible dans le schéma, qui gagnait. Corrigé en supprimant le tri :
la fonction ne fait plus que filtrer. Les tests existants ne pouvaient pas voir
le défaut — leur entrée était déjà alphabétique — et ont été réécrits pour
vérifier la préservation de l'ordre.

**Le délai de correction, écrit deux fois, devient `organisation_settings.
jours_correction_saisie`.** `JOURS_ERREUR_ASSIGNATION` (retrait d'un
titulaire) et `JOURS_ERREUR_GRADE` (correction de grade) portaient la même
règle des deux côtés — signalé dans `notes/todos.md` comme le prochain
`bureau.delete`. Remplacées par `dansLeDelaiDeCorrection`
(`lib/domain/delai-correction.ts`) et un réglage dans le nouveau groupe
« Corrections de saisie » de `/administration/parametres`. **Le délai borne un
effacement** : les deux Server Actions concernées relisent `getParametres()`
au moment même de l'écriture (règle 21), jamais une valeur reçue à l'ouverture
du pop-up — ce que celui-ci reçoit en prop n'est qu'un hint d'affichage, et le
serveur peut refuser une saisie que l'écran annonçait encore recevable si le
réglage a changé entre-temps.

**Le glisser-déposer des pop-up ne « lâchait » plus la capture — mais le
rendu.** `setPointerCapture` était déjà en place (`components/ui/dialog.tsx`,
20 août) ; le défaut restant était un `setState` à CHAQUE `pointermove`, qui
re-rendait tout le contenu du pop-up a chaque pixel parcouru et engorgeait le
fil d'événements pointeur. Le décalage mute maintenant `ref.current.style.
transform` **directement**, sans passer par l'état React — même diagnostic
que celui déjà posé sur l'organigramme : ce qui bouge en continu n'a pas sa
place dans le rendu.

**Le contour de focus, en un seul endroit — via les Cascade Layers.** Il vit à
deux endroits : un `outline` déjà centralisé (`@layer base`), et un
`box-shadow` que chaque composant shadcn pose lui-même via sa propre classe
`ring-2`/`ring-3`/`ring-[3px]`, largeur gravée en dur par Tailwind sans
variable partagée. Une seule règle, écrite **hors de tout `@layer`** dans
`app/globals.css`, l'emporte sur `@layer utilities` quelle que soit sa
spécificité (Cascade Layers) et reprend la largeur effective de tous les
`ring-*` du projet via un jeton unique, `--epaisseur-focus` (2px), sans
toucher un seul fichier ni une seule couleur.

**« Erreur d'assignation » devient le défaut, sur décision de l'utilisateur.**
La demande d'origine posait elle-même le risque du changement — `DECISION`
est le défaut le plus conservateur, `ERREUR` efface la ligne au lieu de
l'inscrire — et le délai étant maintenant réglable jusqu'à un an, la question a
été reposée avant d'y toucher plutôt que tranchée en silence. Réponse :
basculer quand même. Les deux pop-up (`retrait-dialog.tsx`,
`changement-grade-dialog.tsx`) initialisent désormais leur état à `'ERREUR'`
et le réinitialisent ainsi à la fermeture ; la garde qui retombe sur
`DECISION` hors du délai de correction n'a pas bougé. **La section 10 de
`notes/todos.md` est close en entier.**

**La pièce de dossier se consulte AVANT la décision de transfert.** Un seul
rendu pour les deux documents (règle 16), comme `RenduRapport` :
`imprimerAttestation` prend un `statut`, qui distingue la pièce de dossier
(`DEMANDE`) de l'attestation définitive (`APPROUVE`/`EFFECTUE`) — titre, verbe
et mention encadrée différents, cartouche de signature **absent** plutôt que
vide sur la pièce de dossier. Nouvelle fonction de domaine
`pieceDossierDisponible`, testée pour ne **jamais** recouvrir
`transfertAttestable`. **L'audience n'est pas `transfer.certify`** : ce droit
protège ce qui *affirme*, la pièce de dossier *informe* celui qui va juger —
son public est `peutDecider`, déjà calculé pour la carte « à trancher ».

**Le gabarit de l'attestation devient réglable — question d'architecture posée
avant d'écrire.** Bloc du générateur de rapports, ou gabarit propre ? Le
générateur compose des blocs qui agrègent des données sur une **période** ;
une attestation porte **un** transfert précis — l'intégrer y aurait demandé un
bloc d'un genre nouveau que rien d'autre n'aurait employé. Réponse retenue :
son propre gabarit, sur le patron des modèles de courriel (lot 7). Migration
`0070`, `attestation_transfert_settings` — **une seule ligne** : le texte du
corps, les mentions légales et le cartouche de signature sont un choix
d'organisation, pas un réglage par entité ; ce qui varie déjà par entité — son
nom — reste dynamique. **Lecture libre, écriture `settings.manage`** — à la
différence d'`email_settings`, ce gabarit doit être lu par quiconque imprime
une attestation, potentiellement délégué loin du Siège. Le logo réutilise
`PREFIXES.logos`, posé dans `lib/storage/types.ts` mais jusque-là inemployé —
même contrôle qu'une photo de croyant (ENF-SEC-06), clé fixe puisqu'une seule
ligne de réglages porte un seul logo. **La pièce de dossier n'y puise
rien** : ni logo, ni texte réglé, ni mentions légales — son texte de mise en
garde reste fixe, pour ne jamais pouvoir être atténué par un réglage.

**Une note qui décrit un manque se vérifie, elle ne se recopie pas.** La
demande « aucun écran pour les promotions de grade en attente » (21 août)
était devenue fausse à moitié : `PromotionsEnAttente` tournait déjà sur
`/croyants`. Ce qui manquait vraiment était plus discret — `promotionDuCroyant`
(`lib/data/promotions.ts`) existait, intention écrite en toutes lettres, sans
**aucun appelant nulle part**. Enfilée dans la fiche du croyant : un badge
« → *grade demandé* en attente » à côté du grade courant.

**L'impression PDF de la liste des croyants réutilise le PDF des finances
sans en changer une ligne.** `exporterPdf`/`TableauExportable`
(`components/finances/exporter.ts`), construits pour EF-FIN-25, se sont
révélés entièrement génériques malgré leur emplacement — un `<table>` HTML
imprimé par le navigateur, sans bibliothèque de rendu (règle 29). On exporte
ce qu'on voit : le résultat filtré et trié dans son entier, construit AU CLIC
pour ne pas ralentir la frappe dans la recherche. Nouvelle fonction pure,
`libellesFiltresCroyants` (`lib/domain/croyant.ts`), qui traduit chaque
filtre en phrase lisible — « Église : Ambohipo » plutôt qu'un identifiant —
pour que le document dise ce qu'il porte (règle 33).

**Le lien conjugal est symétrique, par UN SEUL trigger qui pose ET
efface** (migration `0071`, EF-CRO-14 — ajoutée à `cdg.md` le 22 août : la
demande n'y avait pas encore de référence propre). `croyants.conjoint_id`,
auto-référence, `on delete set null`. `fn_conjoint_symetrique()` est
**`SECURITY DEFINER`** : elle écrit sur la fiche de l'AUTRE conjoint, hors
de la portée RLS de l'auteur (règle 13). **Poser le lien et le RELÂCHER
vivent dans la MÊME fonction** — le divorce (`conjoint_id` → `NULL`) relâche
l'ancien conjoint dans le même trigger que celui qui pose le nouveau, pas un
second chemin qui finirait par diverger. La garde `is distinct from` arrête
la récursion sans compteur de profondeur. Second trigger, séparé,
`fn_conjoint_veuvage()` : le décès pose `statut_marital = 'VEUF'` sur le
survivant sans toucher au lien. Nouvelle fonction pure testée,
`conjointsProposables`, exclut du sélecteur qui est déjà pris — **revalidée
côté serveur** (`resoudreConjoint`) pour qu'un client non rafraîchi ne romp
pas l'union d'un tiers en silence. `conjointId` a failli manquer à
l'écriture de `modifierCroyant`, qui construit son payload champ par champ
(règle 19, encore) — repéré en relisant, gardé par un test dédié.

**Sur une table qui se référence elle-même, PostgREST ne sait pas déduire la
direction de la relation.** Testé en conditions réelles avec l'utilisateur :
`conjoint:croyants!croyants_conjoint_id_fkey (…)` échouait (mauvais nom de
contrainte auto-générée) ; remplacé par le hint de colonne
`croyants!conjoint_id`, qui réussissait la requête mais rendait un
**tableau** au lieu d'un objet — `croyant.conjoint.nom` valait `undefined`,
la fiche plantait. **Aucun des deux hints ne suffit** sur une auto-jointure :
`getCroyant` lit désormais le conjoint par une SECONDE requête ciblée
(`.eq('id', conjoint_id).maybeSingle()`), pas une auto-jointure. Une fiche se
lit une à la fois, l'aller-retour de plus ne coûte rien ici — à distinguer
d'une LISTE, où ce serait du N+1 (règle 28).

**Une divergence de citation découverte en chemin, signalée sans être
corrigée.** `EF-CRO-12` (cdg.md) désigne l'export Excel/CSV/PDF, `RG-06` le
référentiel du grade et de la nationalité — mais le circuit de promotion de
grade (21 août) leur est accolé dans des dizaines de commentaires depuis sa
livraison. Une dérive de citation sans impact fonctionnel, hors périmètre
d'une correction immédiate ; `EF-CRO-14` a été ajoutée proprement pour ne
pas reproduire l'erreur sur cette nouvelle demande.

**`/bureaux` gagne un niveau de navigation** (demande du 20 août) : onglet de
niveau → liste des **entités** (toutes, y compris **sans bureau** — règle
15, badge « Aucun bureau ») → clic → liste de ses bureaux → menu ⋮, inchangé.
Un seul état nouveau, `entiteId` : posé, le filtre déjà mémoïsé s'y borne par
un critère de plus, sans dupliquer le regroupement existant. Une entité sans
bureau ouvre un état vide qui propose `MandatDialog` avec l'entité
**imposée** — pas un formulaire vierge à re-remplir.

**Les dîmes rendues à l'église — six points, migration `0072`.** La file de
rapprochement n'était travaillable que par l'entité qui avait **collecté** ;
un rassemblement de district réunit pourtant des donateurs de plusieurs
églises, et c'est l'**église**, pas le collecteur, qui connaît ses gens.
`dime_rapprochements_select`/`..._write` acceptent désormais l'entité
collectrice **ou** l'église résolue (`eglise_id`) — le compte reste au Siège
(RG-33), seuls la visibilité et le droit d'agir s'étendent. Le pop-up de
rapprochement (`rapprochements-dimes.tsx`) pose un `EntityPicker` quand
`eglise_id` est vide, et **verrouille** « Créer la fiche » sur l'église
retenue : `NouveauCroyantDialog` reçoit `rattachement` (`RattachementImpose`,
déjà le mécanisme de l'enregistrement d'un croyant depuis la structure) au
lieu d'`eglisePreselectionnee`, libre — le bouton reste désactivé tant
qu'aucune église n'est déterminée, jamais une fiche créée à une église
choisie au hasard. **Basculer une enveloppe en anonyme** écrit
`dime_versements.nature` et `dime_rapprochements.resolu_le` dans une seule
fonction `SECURITY DEFINER`, `fn_marquer_enveloppe_anonyme` (règle 20).
**`resolu_le`, pas `croyant_id`, est désormais le signal de « en attente »** :
une ligne anonymisée ne prend jamais de `croyant_id`, et l'ancien critère
l'aurait gardée éternellement dans la file après sa clôture —
`chargerRapprochements` et l'index partiel ont suivi. Un menu ⋮ par collecte
de `/finances/dimes` ouvre un nouveau versement à entité **verrouillée**
(`CollecteDialog` gagne le mode piloté déjà rodé sur `MandatDialog`, règle
16).

**Le logo de l'organisation, et le bloc Image des rapports.** Premier jet
sans migration : `organisation_settings.logo_key` existait depuis la toute
première migration de réglages (`0006`), posé en schéma et jamais lu ni
écrit par aucun écran — même défaut que `promotionDuCroyant` la veille. Deux
actions (`televerserLogoOrganisation`, `supprimerLogoOrganisation`) lui ont
donné un écran, groupe « Identité » de l'onglet Général.

**Corrigé le jour même, en testant avec l'utilisateur : un seul logo pour
toute l'organisation ne répondait pas au vrai besoin** — « les entités
auront peut-être leur propre entête. Si l'entité n'a pas d'entête alors le
logo de l'organisation se placera. » Migration `0073`, `entities.logo_key` :
**deux niveaux, pas une hiérarchie à escalader** — l'entité visée par le
rapport porte peut-être son propre en-tête, sinon celui de l'organisation
prend le relais, SANS remonter par les ancêtres (une église sans en-tête
n'emprunte pas celui de sa paroisse). `televerserLogoEntite`/
`supprimerLogoEntite` (`lib/actions/entities.ts`) suivent le patron de la
photo d'un croyant — clé construite sur l'ID de l'entité, pas une clé fixe —
et sont gardées par `entity.update` (RG-25, DESCENDANTE), pas une
habilitation nouvelle. Écran : carte « En-tête » sur `/structure/[entityId]`,
visible en lecture même sans le droit de le changer (règle 15).

**Un document FIGÉ (RG-27) ne peut embarquer qu'un OCTET, jamais une
référence qui se résout ailleurs** : `StorageAdapter` gagne `download()`
(des octets, pas une URL) — le même raisonnement que les portraits de
l'organigramme imprimé (règle 33), transposé d'une fenêtre de `print()` à
une ligne de base censée durer. Le logo retenu (entité, sinon organisation)
est téléchargé UNE SEULE fois à la génération et embarqué en `data:` dans
chaque bloc Image. `RenduRapport` distingue TROIS états : composition,
généré sans logo réglé nulle part (« Aucun logo réglé », règle 15), généré
avec logo. `components/shared/logo-uploader.tsx` — extrait en écrivant le
SECOND appelant : le geste existait déjà pour le logo de l'attestation de
transfert (`0070`), refaite sur ce composant partagé, et
`components/structure/entite-logo.tsx` s'en sert à son tour pour la clé
variable.

**RG-25 précisé de nouveau — la portée par droit dans l'octroi, EF-ADM-03,
sans migration.** `user_permissions.scope_entity_id` existait depuis la
toute première migration (`0005`) et `has_perm`/`peut()` savaient déjà le
lire ; seul l'écran forçait toujours la portée à l'entité de rattachement du
compte, dans `creerCompte` et `modifierCompte`. **Un sélecteur par droit
coché, pas une portée globale pour tout l'octroi** — décidé avec
l'utilisateur : la base autorise une portée différente par ligne, un compte
porte souvent une vingtaine de droits actifs, et une portée unique aurait
interdit de restreindre deux droits différemment en un seul passage.
`SelecteurHabilitations` gagne un prop `portee` **optionnel**, absent pour
`reglages-profils.tsx` (un profil est un jeu de clés commun à
l'organisation, sans entité à restreindre). `resoudrePortee`
(`lib/domain/permissions.ts`, testée) NORMALISE en `null` l'entité choisie
quand c'est celle du compte lui-même — un id explicite figerait la portée
si le compte était un jour re-rattaché — et REFUSE toute entité hors de son
sous-arbre. **Deux contrôles distincts, nécessaires l'un et l'autre** :
`resoudrePortee` borne au sous-arbre du compte BÉNÉFICIAIRE, `peutDeleguer`
(RG-24, inchangée) vérifie ensuite que la portée reste dans ce que le
DÉLÉGANT détient lui-même.

**« Où peut-on ouvrir un compte » et « où peut-on restreindre un droit » ne
sont pas la même liste.** Trouvé en testant le jour même : le sélecteur de
portée réutilisait `ouvrables` (RG-21, pas de compte sur une Cellule), et
disparaissait donc entièrement chez une petite église dont les seules
sous-entités sont des cellules — alors que borner un droit à une cellule a
un sens. Second prop distinct, `entitesPourPortee` (le périmètre entier,
Cellules comprises), qui ne touche pas `entites` (réservé au champ « Entité
de rattachement »). `resoudrePortee` bornait déjà tout côté serveur :
élargir la liste à l'écran n'ouvrait aucune porte qu'il n'aurait pas
refermée si nécessaire.

**`EntityPicker` gagne un mode `discret`** — un déclencheur en texte
cliquable, sans bordure ni fond, au lieu du bouton `h-10 w-full` habituel.
Signalé à l'usage : treize droits accordés affichaient treize champs pleine
largeur répétant « Toute l'entité de rattachement », fatigants avant même
d'être lus. `discret` est opt-in (faux par défaut) : les autres usages du
composant — formulaires, colonnes de grille — restent identiques. **La
portée par défaut suit le droit, pas le sélecteur (RG-25)** : un droit
`DESCENDANTE` (la majorité) couvre l'entité choisie ET tout son sous-arbre,
qu'elle soit celle de rattachement ou un enfant restreint ; un droit
`PROPRE` (les onze de `fn_permissions_portee_propre()`) couvre l'entité
exacte, jamais ses descendantes — comportement de `porteeCouvre` depuis la
migration `0050`, que le nouveau sélecteur rend seulement visible.

Base à jour jusqu'à la migration `0073`, confirmée appliquée par
l'utilisateur et vérifiée en conditions réelles. Fuseau
`Indian/Antananarivo` (UTC+3).
**Toute migration qui crée ou remplace
une fonction doit finir par `notify pgrst, 'reload schema'`** : sans lui, l'API
répond « fonction inconnue » sur du SQL pourtant en place — constaté deux fois,
sur les dîmes (`0034`) et sur la synthèse. Une collecte de dîmes naît `SOUMIS`
et c'est la **remise** qui la valide, donc qui alimente le Siège. Le stockage de
fichiers ne se
configure **pas** en SQL — `storage.*` appartient à `supabase_storage_admin` et
`postgres` s'y voit refuser `CREATE POLICY` : `pnpm db:bucket` s'en charge par
l'API.

Historique : [`SESSION_HISTORY.md`](.claude-code-history/SESSION_HISTORY.md) ·
dernier point d'étape : [`.claude-code-history/2026-08-22_resumes-moi.md`](.claude-code-history/2026-08-22_resumes-moi.md)

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

**Ce qu'il reste à faire est listé dans [`notes/todos.md`](notes/todos.md)** —
les demandes en attente, les migrations non appliquées et ce qui attend une
réponse de l'utilisateur. Le contexte de chacune est dans le dernier point
d'étape `..._resumes-moi.md`, et le découpage en lots dans
[`notes/plan.md`](notes/plan.md).

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
    **`create or replace function` ne suffit pas pour un `returns table`** : les
    paramètres `OUT` font partie de la signature, donc *ajouter une colonne* est
    un changement de type de retour, que PostgreSQL refuse (42P13). Il faut
    `drop function if exists <nom>(<types des paramètres IN>)` juste avant —
    ce qui reste rejouable. Le vérifier **avant** de croire qu'une fonction se
    remplace : l'erreur n'arrive qu'à l'application, jamais à l'écriture
    *(constaté le 16 août 2026 sur `0042`)*.
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
31. **Un module `'use client'` importé côté SERVEUR ne livre pas ses valeurs.**
    Il livre des **références**. Une page — Server Component — qui importait une
    table de constantes depuis son composant client n'en recevait pas le
    tableau : `ONGLETS.includes` n'était pas une fonction, et l'écran tombait
    avant son premier rendu. C'est la frontière de la règle 24, dans l'autre
    sens : ce qui doit être lu des **deux** côtés se déclare là où aucun des
    deux ne l'emporte — dans le domaine.
32. **Tailwind lit le SOURCE, commentaires compris.** Deux conséquences, payées
    le même jour. Une valeur arbitraire pointant une variable CSS
    (`w-[var(--x)]`) voit ses tirets doubles mangés et produit un `var(...)` que
    PostCSS refuse : **toute la feuille** cesse d'être compilée, et
    l'application ne démarre plus. Et **citer cette classe dans un commentaire
    la recrée** — deux commentaires qui expliquaient le défaut l'ont ressuscité
    à l'identique, si bien que l'erreur a survécu à sa propre correction. Une
    largeur qui dépend d'une variable se déclare dans `globals.css`, sous son
    point de rupture ; un style inline ne conviendrait pas, il s'appliquerait
    aussi en dessous.
33. **Ce qui s'imprime n'a pas de recours.** À l'écran, un libellé abrégé se
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
