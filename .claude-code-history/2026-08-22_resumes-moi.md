# Résumé — 22 août 2026

> Point d'étape destiné à la reprise de session.
> **Nouvelle machine ou nouvelle session ? Lire d'abord**
> [`.agents/rules/reprise.md`](../.agents/rules/reprise.md), puis
> **[`notes/todos.md`](../notes/todos.md)** — c'est là que se trouve ce qu'il
> reste à faire, et l'état exact de la base.
>
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-21_resumes-moi.md`](2026-08-21_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local`.

---

## L'état de la base

**Appliquées : `0001` à `0072`**, confirmé par l'utilisateur — `0071` et
`0072` de surcroît vérifiées en conditions réelles, `0071` après correction de
deux défauts trouvés en test (voir plus bas). L'état qui fait foi est en tête
de `notes/todos.md` — ce fichier-ci ne le répète pas deux fois.

- `0069` — `organisation_settings.jours_correction_saisie` : le délai de
  correction (15 jours par défaut, borné 1–365) devient un réglage
  d'administration au lieu d'une constante écrite deux fois dans le code.
- `0070` — `attestation_transfert_settings` : le gabarit réglable de
  l'attestation de transfert (logo, texte du corps, mentions légales,
  cartouche de signature), une seule ligne, lecture libre / écriture
  `settings.manage`.
- `0071` — `croyants.conjoint_id` : le lien conjugal symétrique (EF-CRO-14),
  maintenu par deux triggers `SECURITY DEFINER`.
- `0072` — élargit `dime_rapprochements` à l'église résolue (RLS
  `select`/`write`, `fn_resoudre_rapprochement`) et ajoute
  `fn_marquer_enveloppe_anonyme`, `SECURITY DEFINER`. « En attente » se lit
  désormais à `resolu_le is null`, plus à `croyant_id is null`.

**883 tests unitaires, 44 fichiers.** `pnpm verify` vert (lint, typecheck,
tests, build).

---

## Ce qui a été livré aujourd'hui

Reprise de `notes/todos.md` §10 (« Demandes du 21 août 2026, soir ») après un
pull du dépôt distant et la correction de l'en-tête de `todos.md`, qui
annonçait encore `0067` alors que `0068` était déjà appliquée.

### La palette de l'organigramme retriait ce que la requête triait déjà

`fonctionsDuNiveau` (`lib/domain/bureau.ts`) portait un `.sort()` alphabétique
oublié d'avant la migration `0061` (qui a introduit
`fonctions.ordre_protocolaire`). La requête `listerFonctions` rendait le bon
ordre ; cette fonction, appelée en aval pour filtrer par niveau, l'écrasait
silencieusement — pour la composition tabulaire **et** pour la palette
« Fonctions à poser » de l'organigramme, qui partagent le même appel. Supprimé :
`fonctionsDuNiveau` ne fait plus que filtrer, sans retrier. Les deux tests
concernés ont été réécrits pour vérifier la préservation de l'ordre — les
anciens, sur une entrée déjà alphabétique, ne pouvaient pas voir le défaut.

### Le délai de 15 jours, écrit deux fois, devient un réglage

`JOURS_ERREUR_ASSIGNATION` (retrait d'un titulaire de bureau) et
`JOURS_ERREUR_GRADE` (correction de grade) portaient la même règle à deux
endroits — signalé dans `todos.md` lui-même comme le prochain
`bureau.delete`. Remplacées par une fonction pure partagée,
`dansLeDelaiDeCorrection` (`lib/domain/delai-correction.ts`), et un réglage en
base, `organisation_settings.jours_correction_saisie` (migration `0069`),
exposé dans un nouveau groupe « Corrections de saisie » de
`/administration/parametres`.

Le délai borne un **effacement** : les deux Server Actions qui tranchent
(`lib/actions/bureaux.ts`, `lib/actions/croyants.ts`) relisent
`getParametres()` au moment même de l'écriture, jamais une valeur reçue plus
tôt (règle 21) — un onglet resté ouvert pendant qu'on resserre le réglage ne
doit pas continuer d'effacer sous l'ancienne valeur. Ce que les pop-up
(`RetraitDialog`, `ChangementGradeDialog`) reçoivent en prop n'est qu'un
**hint d'affichage** ; le serveur reste seul à trancher pour de bon.

`joursDelai` a été enfilé jusqu'aux pop-up depuis chaque page qui les monte —
trois chaînes indépendantes pour `RetraitDialog` (`/bureaux`, le menu ⋮ de
`/structure` et `/structure/liste`, l'éditeur dédié
`/bureaux/[bureauId]/organigramme`), une pour `ChangementGradeDialog` via
`CroyantForm` (montée à quatre endroits, unifiées par `getOptionsCroyant()`
qui porte désormais aussi ce réglage).

### Le glisser-déposer des pop-up « lâchait » — ce n'était pas la capture

`setPointerCapture` était déjà en place dans `components/ui/dialog.tsx`
(depuis le 20 août) : la première piste suggérée par la demande était donc
déjà couverte. C'était la seconde qui restait vraie — `auMouvement` posait un
`setState` à CHAQUE `pointermove`, re-rendant tout le contenu du pop-up
(formulaire, tableau) à chaque pixel parcouru ; sur un pop-up chargé, le fil
d'événements pointeur s'engorge et la souris semble lâcher la prise, même sous
capture. Corrigé en mutant `ref.current.style.transform` **directement**, sans
passer par l'état React — même diagnostic que celui déjà posé sur
l'organigramme.

### Le contour de focus, en un seul endroit — via les Cascade Layers

Le contour vit à deux endroits : un `outline` par défaut déjà centralisé
(`@layer base`), et un `box-shadow` que chaque composant shadcn (input,
select, case à cocher, interrupteur, badge...) pose lui-même via sa propre
classe `ring-2`/`ring-3`/`ring-[3px]` — largeur gravée en dur par Tailwind,
sans variable partagée entre elles. La retoucher aurait demandé de réécrire
plus d'une dizaine de fichiers, exactement ce que la demande refusait.

Résolu via les **Cascade Layers** : les classes `ring-*` vivent dans
`@layer utilities`, et une déclaration posée HORS de tout `@layer` l'emporte
TOUJOURS sur une déclaration de calque, quelle que soit sa spécificité. Une
seule règle non calquée dans `app/globals.css` reprend donc la largeur
effective de tous les `ring-*` du projet via un jeton unique,
`--epaisseur-focus` (2px, contre 3px sur les champs), sans toucher ni un
fichier ni une couleur. Vérifié en inspectant la feuille CSS compilée : la
règle apparaît bien hors de tout bloc `@layer`.

### « Erreur d'assignation » devient le défaut — sur décision de l'utilisateur

Dernier point de la section 10, volontairement laissé de côté : la demande
d'origine posait elle-même le risque d'un tel changement — `DECISION` est le
défaut le plus conservateur (motif obligatoire, historique conservé),
`ERREUR` efface la ligne. Question posée avec une recommandation (garder
`DECISION`, le délai étant maintenant réglable jusqu'à un an) ; réponse de
l'utilisateur : basculer vers `ERREUR`.

Fait dans les deux pop-up (`retrait-dialog.tsx`, `changement-grade-dialog.tsx`)
: l'état initial et la réinitialisation à la fermeture passent de `'DECISION'`
à `'ERREUR'`. La garde qui retombe sur `DECISION` hors du délai de correction
n'a pas bougé — `ERREUR` n'est de toute façon jamais proposée au-delà.

**La section 10 de `notes/todos.md` est maintenant close en entier.**

### La pièce de dossier, consultable AVANT la décision de transfert

Un seul rendu pour les deux documents (règle 16), comme `RenduRapport` :
`imprimerAttestation` prend un `statut`, qui distingue la pièce de dossier
(`DEMANDE` — titre, verbe et mention différents, cartouche de signature
absent) de l'attestation définitive (`APPROUVE`/`EFFECTUE`). Nouvelle fonction
de domaine `pieceDossierDisponible`, testée pour ne jamais recouvrir
`transfertAttestable`. **L'audience n'est pas `transfer.certify`** — ce droit
protège ce qui *affirme* ; la pièce de dossier *informe* celui qui va juger,
donc son public est `peutDecider`, déjà calculé pour la carte « à trancher ».

### Le gabarit de l'attestation devient réglable

Question d'architecture posée à l'utilisateur avant d'écrire : bloc du
générateur de rapports, ou gabarit propre ? Réponse — **son propre gabarit**,
sur le patron des modèles de courriel (lot 7) : le générateur compose des
blocs qui agrègent des données sur une période, une attestation porte UN
transfert précis. Migration `0070`, `attestation_transfert_settings`, une
seule ligne — texte du corps, mentions légales, cartouche de signature sont
un choix d'organisation, pas un réglage par entité. Lecture libre, écriture
`settings.manage`. Le logo réutilise `PREFIXES.logos`, posé mais jusque-là
inemployé. La pièce de dossier n'y puise **rien** : son texte de mise en
garde reste fixe. Écran : nouvel onglet « Attestation » dans
`/administration/parametres`.

`pnpm verify` : 43 fichiers de test, 872 tests, build compris — vert.

### Une découverte en chemin, à moitié fausse

Une note enterrée dans un item déjà coché (« validation de la promotion de
grade », 21 août) signalait qu'aucun écran ne présente les demandes en
attente. Sortie en item séparé — puis, en le reprenant, la file s'est révélée
**déjà construite** : `PromotionsEnAttente` tourne sur `/croyants` depuis le
21 août, la note était simplement restée non corrigée. Ce qui manquait
vraiment : `promotionDuCroyant` (`lib/data/promotions.ts`) existait, avec son
intention écrite, mais **aucun appelant nulle part** — enfilée dans la fiche
du croyant, qui affiche désormais « → *grade demandé* en attente ».

### Impression PDF de la liste des croyants

Aucun second moteur de PDF : `exporterPdf`/`TableauExportable`, construits
pour le registre financier (EF-FIN-25), sont entièrement génériques et
réutilisés tels quels. On exporte ce qu'on voit — le résultat filtré et
trié dans son entier, construit au clic. Nouvelle fonction pure,
`libellesFiltresCroyants` (`lib/domain/croyant.ts`), qui traduit chaque
filtre actif en phrase lisible pour que le document dise ce qu'il porte
(règle 33). Le bouton rejoint `FiltresCroyants` via un slot.

`pnpm verify` : 43 fichiers, 877 tests, build compris — vert.

### Le lien conjugal — migration `0071`

Une divergence de citation découverte en cherchant où l'inscrire dans
`cdg.md` : `EF-CRO-12` et `RG-06` y désignent déjà autre chose que ce à quoi
le circuit de promotion de grade les accole depuis le 21 août. Signalé,
non corrigé (hors périmètre), `EF-CRO-14` ajoutée proprement pour cette
demande.

**Un seul trigger pose ET efface le lien**, symétriquement —
`fn_conjoint_symetrique()`, `SECURITY DEFINER` parce qu'elle écrit sur la
fiche de l'AUTRE conjoint. Le divorce (`conjoint_id` → `NULL`) relâche
l'ancien conjoint dans la MÊME fonction, pas une écriture séparée. Second
trigger distinct, `fn_conjoint_veuvage()`, pour le décès. `CroyantPicker`
existant est réutilisé tel quel ; nouvelle fonction pure testée,
`conjointsProposables`, exclut qui est déjà pris — **revalidée côté
serveur** (`resoudreConjoint`) pour qu'un client non rafraîchi ne romp pas
l'union d'un tiers en silence.

`conjointId` a failli manquer à l'écriture dans `modifierCroyant` (qui
construit son payload champ par champ, contrairement à `creerCroyant`) —
repéré en relisant, corrigé, et gardé par un test dédié qui lit le fichier
source. La fiche distingue « non renseigné » de « hors périmètre » (règle
15) — via une seconde requête ciblée dans `getCroyant`, pas une auto-jointure
(voir la correction ci-dessous, trouvée en testant avec l'utilisateur).

Un test flaky rencontré à répétition aujourd'hui (`apparence.test.ts`,
timeout à 5000 ms sous charge parallèle) a reçu un délai porté à 15 s.

`pnpm verify` : 44 fichiers, 883 tests, build compris — vert.

### Deux défauts trouvés en testant `0071` en conditions réelles

Assigner un conjoint puis consulter la fiche faisait planter l'écran.
**Sur une table qui se référence elle-même, PostgREST ne sait pas déduire la
direction de la relation** : le hint de contrainte
(`croyants!croyants_conjoint_id_fkey`) échouait (nom auto-généré différent
de l'hypothèse) ; le hint de colonne (`croyants!conjoint_id`) réussissait la
requête mais rendait un TABLEAU au lieu d'un objet. `getCroyant` lit
désormais le conjoint par une seconde requête ciblée, pas une auto-jointure
— une fiche se lit une à la fois, l'aller-retour de plus ne coûte rien ici
(à distinguer d'une LISTE, où ce serait du N+1, règle 28). Confirmé
fonctionnel par l'utilisateur après ce correctif.

### Un niveau de navigation de plus sur `/bureaux`

Demande du 20 août : `Onglet de niveau → liste des entités → clic → liste
des bureaux → menu ⋮`. Un seul état nouveau, `entiteId` — posé, `filtres`
(déjà mémoïsé) se borne aux bureaux de cette entité par un critère de plus.
**Une entité sans bureau figure et le dit** (règle 15) : la liste part de
l'arbre complet, pas des entités qui ont déjà un bureau. Cliquer une entité
sans bureau ouvre un état vide qui connaît son nom et propose `MandatDialog`
avec l'entité **imposée**, pas un formulaire vierge.

`pnpm verify` : 44 fichiers, 883 tests, build compris — vert.

### Les dîmes rendues à l'église — six points, migration `0072`

Reprise de `notes/todos.md` §3 (« Demandes du 20 août 2026 — l'église lue, et
le travail rendu à l'église »). Le constat de départ : l'import ne reconnaît
pas toujours le nom d'église écrit dans le fichier, et jusqu'ici seule
l'entité qui a **collecté** pouvait travailler la file de rapprochement — pas
l'église à qui le fichier attribue la personne, quand elle diffère (un
rassemblement de district réunit des donateurs de plusieurs églises).

**1. L'église s'affiche dans `/finances/dimes`.** Le libellé lu
(`eglise_source`) apparaît sous chaque versement, avec « — église non
reconnue » quand `eglise_id` est vide — `rapprochements-dimes.tsx` le
portait déjà depuis la migration `0058`, il manquait l'appelant côté
finances.

**2 et 3. Le pop-up de rapprochement propose l'église, et verrouille la
fiche à créer sur elle.** `rapprochements-dimes.tsx` pose un `EntityPicker`
(église seule, `compact`) sous le libellé lu, seulement quand `eglise_id` est
absent. `egliseRetenue` préfère le choix EXPLICITE de l'utilisateur à
l'amorce automatique d'`egliseProbable` (déjà en place). « Créer la fiche »
lui est désormais **subordonné** : `NouveauCroyantDialog` reçoit
`rattachement` (`RattachementImpose`, verrouillé — le même mécanisme que
l'enregistrement d'un croyant depuis la structure) et non plus
`eglisePreselectionnee` (libre, amendable) ; le bouton reste désactivé tant
qu'aucune église n'est retenue, avec l'explication « Choisir l'église
d'abord. ».

**4. La file s'élargit par la RLS, pas par une nouvelle requête.** Migration
`0072` : `dime_rapprochements_select` et `..._write` acceptent désormais
`entity_in_scope`/`can('finance.dime.collect', …)` sur l'entité collectrice
**ou** sur l'église résolue. `fn_resoudre_rapprochement` et la nouvelle
`fn_marquer_enveloppe_anonyme` vérifient l'habilitation sur l'une ou l'autre.
Une église qui n'a rien collecté peut donc désormais rapprocher, créer une
fiche, ou déclarer anonyme une ligne que le fichier lui attribue — le compte
reste au Siège (RG-33), seule la VISIBILITÉ et le DROIT D'AGIR s'étendent.

**5. Basculer une enveloppe en anonyme.** `fn_marquer_enveloppe_anonyme`,
`SECURITY DEFINER`, écrit `dime_versements.nature = 'ENVELOPPE_ANONYME'` et
`dime_rapprochements.resolu_le = now()` dans la MÊME fonction (règle 20 :
l'état intermédiaire — anonymisé mais toujours « en attente », ou l'inverse —
serait faux et indétectable). Réservé aux lignes **sans nom** porteuses d'un
numéro, disponible depuis les deux écrans (menu ⋮ sur `/finances/dimes`,
bouton sur `/croyants`). **`resolu_le` devient le signal canonique de « en
attente »**, remplaçant `croyant_id is null` : une ligne anonymisée ne prend
jamais de `croyant_id`, et l'ancien critère l'aurait laissée pour toujours
dans la file après l'avoir close. `chargerRapprochements` et l'index partiel
`dime_rapprochements_attente_idx` ont suivi ce changement de critère — trouvé
en écrivant le point 5, propagé au point 4 pour rester cohérent.

**6. Un menu de versement individuel sur chaque collecte de
`/finances/dimes`.** `CollecteDialog` gagne le mode piloté déjà rodé sur
`MandatDialog` (`entiteImposee`, `open`/`onOpenChange`, bouton déclencheur
propre masqué) : l'entité collectrice s'affiche verrouillée au lieu de
l'`EntityPicker` habituel (règle 16 — même geste que l'enregistrement d'un
croyant depuis la structure). Un menu ⋮ par collecte, gardé par
`finance.dime.collect` sur l'entité de la ligne, ouvre « Nouveau versement »
ainsi verrouillé.

**Bug trouvé et corrigé en chemin, non signalé par l'utilisateur :** le
drapeau `rapprochable` de `dimes-client.tsx` testait encore
`croyant_id === null`, qui serait resté vrai sur une ligne anonymisée — elle
aurait continué de proposer « Rapprocher » après sa clôture. Corrigé en
`resolu_le === null`, avant même que la migration ne soit appliquée.

`pnpm verify` : 44 fichiers, 883 tests, build compris — vert. **Aucun test
neuf** : aucune Server Action de dîmes n'en avait jusqu'ici (le précédent le
plus proche, `resoudreRapprochement`, n'en porte pas non plus), et
`marquerEnveloppeAnonyme` est un passe-plat sans logique de complétude de
champs à couvrir — contrairement au lien conjugal, où `conjointId` avait
failli manquer dans un payload construit champ par champ.

Migration `0072` confirmée appliquée par l'utilisateur et testée en
conditions réelles le jour même.

### Le logo de l'organisation, et le bloc Image des rapports

Reprise de `notes/todos.md` §4 : « Logo téléversé pour le bloc Image
(aujourd'hui le bloc existe, la source du logo non). » En lisant le code
existant (`panneau-reglages.tsx`), le réglage attendu était déjà nommé dans
un texte d'aide jamais honoré : « L'image elle-même est choisie à la
génération — logo de l'organisation par défaut. »

**`organisation_settings.logo_key` existait depuis la toute première
migration de réglages (`0006`), sans écran ni lecteur.** Comme
`promotionDuCroyant` la veille : une intention écrite dans le schéma,
jamais reliée à rien. Deux actions dans `lib/actions/parametres.ts`
(`televerserLogoOrganisation`, `supprimerLogoOrganisation`) lui donnent
enfin un écran — groupe « Identité » de l'onglet Général,
`/administration/parametres`.

**Le document imprimé ne peut pas dépendre d'une URL signée.** Un rapport
généré est FIGÉ (RG-27) et relu potentiellement des mois plus tard — le même
raisonnement qui a fait embarquer les portraits de l'organigramme en
`data:` (règle 33) s'applique ici, en pire : ce n'est plus une fenêtre de
`print()` à tenir, c'est une ligne en base censée rester lisible
indéfiniment. `StorageAdapter` gagne donc une méthode `download()` (rendant
des octets, pas une URL) — jusqu'ici l'interface ne savait que déposer et
signer. À la génération, `resoudreContenu` télécharge le logo une seule
fois (même si plusieurs blocs Image existent) et l'embarque en
`data:${contentType};base64,${base64}` dans chaque bloc.

**Trois états, pas deux, dans `RenduRapport`** : composition (aucun contenu
résolu — « Image posée à la génération », inchangé), généré SANS logo réglé
(« Aucun logo réglé pour l'organisation » — un cadre vide se lirait comme
une panne d'affichage, règle 15), généré AVEC logo (l'image). Un bloc Image
n'a pas de `source` (`sourceDuBloc` rend `null`) : sans un second drapeau
dans `resoudreContenu`, un modèle qui ne contiendrait QUE des blocs de mise
en page — Image compris — sortait de la fonction avant même d'y songer.

**`components/shared/logo-uploader.tsx` — extrait en écrivant le SECOND
appelant, pas avant.** L'upload/retrait d'un logo à clé fixe existait déjà
pour l'attestation de transfert (`0070`, la veille) : composant quasi
identique à l'octet près. `ReglagesAttestationTransfert` a été refait sur ce
composant partagé au passage — deux copies auraient divergé à la première
retouche de l'une sans l'autre.

`pnpm verify` : 44 fichiers, 883 tests, build compris — vert. Aucun test
neuf : ni le logo de l'attestation (livré la veille) ni les actions miroir
n'en avaient — cohérent avec l'existant plutôt qu'un standard inventé pour
l'occasion.

---

## Les décisions à ne pas défaire

**Un tri appliqué APRÈS une requête déjà triée peut l'écraser en silence, sans
rien dans le schéma pour le trahir.** Deux ordres qui se superposent finissent
par diverger, et c'est le second — souvent le plus ancien, oublié — qui gagne.
Ne pas retrier en mémoire ce qu'une requête peut trier elle-même.

**Un paramètre qui borne un effacement se relit à l'écriture, jamais à
l'ouverture d'un formulaire.** Ce que le composant reçoit en prop n'est qu'un
hint d'affichage — le serveur retranche la valeur réelle au moment de trancher,
et peut refuser une saisie que l'écran annonçait encore recevable.

**Une règle écrite à deux endroits ne diverge pas le jour où on l'écrit — elle
diverge le jour où on retouche l'un sans penser à l'autre.** Rappel du même
principe déjà payé sur `bureau.delete` (TypeScript vs SQL) et sur
`peut_celebrer` (liste codée en dur) : dès qu'une même valeur ou condition doit
être vraie à deux endroits, un seul des deux devient la source, l'autre la lit.

**Un trigger qui pose un lien symétrique doit aussi savoir le RELÂCHER, dans
la MÊME fonction.** Écrire « poser le lien » et « l'effacer » comme deux
chemins séparés les ferait diverger le jour où l'un des deux oublie l'autre
côté — exactement ce que `fn_conjoint_symetrique()` évite en traitant les
deux cas dans le même trigger, guidé par la comparaison `NEW`/`OLD`.

**Sur une table qui se référence elle-même, PostgREST ne sait pas déduire la
direction de la relation — n'auto-jointez pas.** Testé en conditions
réelles avec l'utilisateur le 22 août : le hint de contrainte
(`croyants!croyants_conjoint_id_fkey`) échouait, le nom auto-généré ne
correspondant pas ; le hint de colonne (`croyants!conjoint_id`) réussissait
la requête mais rendait un TABLEAU au lieu d'un objet — `croyant.conjoint.
nom` valait `undefined`, la fiche plantait. `getCroyant` lit désormais le
conjoint par une seconde requête ciblée, pas une auto-jointure. Une fiche se
lit une à la fois : l'aller-retour de plus ne coûte rien ici (à distinguer
d'une LISTE, où ce serait du N+1, règle 28).

**Un document FIGÉ ne peut embarquer qu'un OCTET, jamais une référence qui se
résout ailleurs.** Une clé de stockage se résout en URL signée, une URL
signée périme ; les deux sont donc interdites dans un contenu que RG-27
promet inchangé des mois plus tard. Seule une image DÉJÀ encodée en `data:`
tient cette promesse — le même raisonnement que les portraits de
l'organigramme imprimé (règle 33), transposé d'une fenêtre de `print()` à
une ligne de base censée durer.

**Le signal de « en attente » dans une file de rapprochement doit couvrir
TOUTES les façons de la clore, pas seulement la plus fréquente.**
`croyant_id is null` suffisait tant que la seule clôture possible était un
rattachement. Dès qu'un second chemin de clôture apparaît (« anonymiser ») qui
n'écrit jamais `croyant_id`, le critère se trompe silencieusement — la ligne
close reste visible comme si elle attendait encore. `resolu_le`, posé à CHAQUE
clôture quel qu'en soit le chemin, est le seul critère qui reste vrai.

*(Les décisions du 21 août — l'étendue d'un modèle, erreur/décision, la fenêtre
de 15 jours vérifiée côté serveur, le sens de l'`ordre` des grades — restent
valables ; voir
[`2026-08-21_resumes-moi.md`](2026-08-21_resumes-moi.md).)*

---

## Ce qu'il reste

**La liste fait foi : [`notes/todos.md`](../notes/todos.md).** Les **sections
10, l'attestation de §1, l'impression PDF de §1 (20 août), le lien conjugal de
§1, la navigation de `/bureaux` de §2 (20 août), les six points des dîmes de
§3 (20 août, code écrit et migration confirmée le 22) et le logo du bloc
Image de §4 (20 août, code écrit le 22) sont closes**. En tête de ce qui
reste :

- **`/rapports`** — génération périodique programmée (écartée le 20 août, à
  reprendre plus tard).
- **`/administration`** — portée par droit ; profils locaux.
- **Référentiel « Événement »** — signalé lui-même comme plus lourd que son
  intitulé.
- **Lot 8** — portabilité, recette et mise en production. Pas entamé.

### À décider par vous

- **Poser `SMTP_PASS`** en production : sans lui, aucun message ne part.
- **Révoquer le mot de passe d'application Google** passé par `.env.example`.
- **Faire tourner `SUPABASE_SERVICE_ROLE_KEY`** — voir `README.md`.
- **Borner ou non la visibilité des croyants** dans la saisie des dîmes.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
cp .env.example .env.local   # puis renseigner : les valeurs sont dans Supabase
pnpm exec next typegen       # sur un clone frais, AVANT le premier typecheck
pnpm verify       # secrets + lint + types + 883 tests + build
pnpm dev:propre   # cache Turbopack vidé — après toute série de modifications
```

Lire avant toute tâche : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
`notes/todos.md`, puis `CLAUDE.md`, `notes/cdg.md` et `notes/plan.md`.
