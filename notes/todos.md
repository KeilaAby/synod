# TODO — demandes en attente

> Liste tenue à jour au **20 août 2026**, pour la reprise sur une autre machine.
>
> Elle porte les demandes **et** ce qui a déjà été tranché, avec le motif : une
> décision dont on a perdu la raison se redéfait. Ce qui est livré passe en
> `[x]`, garde sa justification ici, et entre dans [`CLAUDE.md`](../CLAUDE.md)
> et dans le dernier point d'étape.
>
> **À lire avant de commencer** : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
> puis `CLAUDE.md`, [`cdg.md`](cdg.md) et [`plan.md`](plan.md).

---

## ⚠ État de la base

**Appliquées : `0001` à `0060`. Aucune migration n'attend.**

C'est **cette ligne** qui fait foi — pas le numéro le plus élevé de
`supabase/migrations/`, qui dit ce qui est *écrit* et non ce qui est *appliqué*.
Les migrations ne s'appliquent pas toutes seules : l'utilisateur les passe dans
l'éditeur SQL Supabase et le confirme.

*(Cette section annonçait encore `0058` le 20 août, alors que `0059` et `0060`
étaient appliquées depuis le matin. Corrigé.)*

---

## 1. `/croyants`

- [ ] **Document d'attestation de transfert.** Dynamique comme les rapports,
      avec l'en-tête de l'entité. Demande une habilitation fine et distincte —
      un document signé n'est pas une lecture de liste.
- [x] **Tri des colonnes au clic**, avec chevrons indiquant le sens. *(20 août
      2026)* — `lib/domain/tri.ts` (pur, testé) et `EnteteTriable`, partagés :
      les autres tables n'auront qu'à s'y brancher. Les valeurs **absentes
      restent en queue dans les deux sens** — une cellule vide n'est pas une
      petite valeur. Deux états seulement, pas trois : un « aucun tri » rendrait
      un ordre qu'aucun chevron n'explique.
- [ ] **Validation de la promotion de grade par une entité supérieure.**
      Workflow à activer ou non dans les paramètres généraux (règle 21 : le
      réglage se lit à chaque rendu, jamais codé en dur).
- [x] **La liste des versements sans fiche** devient la base des croyants non
      rattachés, et se replie. *(20 août 2026)* — le bandeau porte désormais
      « N personnes non rattachées » et **ne se replie jamais** : replier
      l'alerte reviendrait à la supprimer. C'est la **table** qui se replie, et
      elle est fermée par défaut — on vient sur cet écran pour la liste des
      croyants. Le pop-up de création vit hors du repli, sinon refermer la file
      emporterait une saisie en cours.

### Demandes du 20 août 2026

- [ ] **Impression PDF de la liste**, respectant **les filtres appliqués**.
      Ce qui s'imprime doit être ce qu'on voit — même doctrine que l'export
      XLSX/CSV d'EF-FIN-25, dont la sélection filtrée et son nombre de lignes
      sont annoncés sur le menu. Attention règle 33 : sur une feuille, un
      libellé tronqué est perdu — on replie entre les mots, on réduit la police,
      on ne coupe pas. Et le document doit **dire quels filtres il porte**,
      sinon un total qui ne correspond pas reste inexplicable au lecteur.
- [ ] **Relier deux croyants mariés** (époux ↔ épouse).
      - Dans le formulaire, si le statut marital est « marié », proposer une
        liste de croyants **de sexe opposé** — même sélecteur que la liste des
        croyants : photo + zone de recherche (règle 18 : l'ensemble est
        *ouvert*, donc un sélecteur, pas des pictogrammes).
      - Si le conjoint n'est pas encore enregistré : **« Non renseigné »**.
      - Si les deux fiches existent déjà, le lien se pose **par simple mise à
        jour** de l'une ou de l'autre.
      - La fiche croyant **affiche le conjoint**, avec le maximum
        d'informations le concernant.

      **Points à trancher avant d'écrire** — ils décident du schéma :
      1. **Le lien est-il symétrique et automatique ?** Relier A à B doit
         relier B à A, sinon deux fiches se contrediront. Une colonne
         `conjoint_id` de chaque côté demande un trigger pour rester cohérente
         (règle 20 : deux écritures indissociables se font **en base**).
      2. **Que se passe-t-il au veuvage, au divorce, au décès ?** Effacer le
         lien perdrait l'histoire ; le garder afficherait un conjoint qui ne
         l'est plus. Le statut marital et le lien doivent se répondre.
      3. **Un conjoint hors périmètre.** La RLS le rendra invisible : la fiche
         doit afficher « conjoint hors de votre périmètre » et non un blanc
         (règle 15).

## 2. `/bureaux`

- [x] **Onglets d'entité → cartes → liste des bureaux.** *(20 août 2026)* —
      onglets par **niveau** (règle 18 : les six niveaux sont un ensemble clos
      et connu ; les entités, elles, sont ouvertes — un onglet par église en
      donnerait vingt). Seuls les niveaux qui **portent vraiment un bureau**
      sont proposés, avec leur compte : un onglet qui ne montre rien ferait
      chercher une donnée qui n'existe pas (règle 15). Les cartes sont ensuite
      **groupées par entité**, le nom en titre : une entité a plusieurs bureaux
      — le mandat en cours et ceux d'avant — et la grille plate obligeait à
      lire chaque sous-titre pour savoir à qui la carte appartenait.
- [x] **Date de fin de mandat obligatoire.** *(20 août 2026, migration `0059`)*
      — exigée **à l'ouverture seulement**. La colonne n'est **pas** passée en
      `not null` : des bureaux existent sans terme, et leur en inventer un
      serait pire que de le laisser vide — une date de fin inventée a l'air
      vraie, elle fermera des accès le jour venu, et personne ne saura d'où
      elle sort. La modification reste donc tolérante, et le trigger ne
      regarde que les insertions.
      *(La divergence d'opérateurs signalée ici était **périmée** : la migration
      `0020` a aligné `bureaux_periode` sur `>=`, comme `membres_periode`.)*
- [x] **Un mandat échu révoque l'accès de ses membres**, sauf le responsable
      informatique. *(20 août 2026)* — `lib/domain/mandat.ts`, **sans
      migration** : la règle s'évalue à **chaque ouverture de session**, jamais
      par une tâche planifiée qui laisserait passer la journée et tomberait en
      silence. Les mandats voyagent avec le profil en **un seul** aller-retour.
      **Deux portes fermées** : le gabarit redirige vers `/mandat-echu`, et
      `requireSession` refuse — une Server Action s'appelle sans passer par
      l'écran qui la propose. **On révoque sur preuve, jamais sur absence de
      preuve** (règle 15) : aucun mandat *connu* ne ferme rien.
      **Deux dérogations, et deux seulement :**
      - **Le Siège.** Quand tous les bureaux se ferment, lui seul garde un
        mandat ouvert — sinon plus personne ne peut rouvrir quoi que ce soit,
        et il ne reste que l'accès direct à la base. La dérogation porte sur
        **l'entité**, pas sur le rôle : un administrateur du Siège qui n'est
        pas SuperAdmin doit lui aussi pouvoir rouvrir les bureaux. Elle **ne
        descend pas** — un district dont les mandats sont échus perd l'accès.
      - **Le responsable informatique, tant qu'il l'est.** Remplacé, il
        redevient un membre de bureau comme les autres et perd l'accès si
        aucun mandat ne le couvre.

      Dans tous les cas **on ne ferme que l'accès** : un trésorier remplacé
      reste un croyant de son église, avec son historique, ses dîmes et ses
      baptêmes. L'écran le dit explicitement.
- [x] **Un bureau clos est archivé, jamais supprimé.** *(20 août 2026,
      migration `0059`)* — le verrou est un **trigger**, pas une politique RLS :
      une politique rendrait la ligne invisible à la suppression, donc
      répondrait « 0 ligne supprimée » et l'écran annoncerait une réussite. Le
      trigger refuse **en disant pourquoi**. L'entrée de menu disparaît aussi —
      un menu qui offre ce qu'il n'accorde pas fait douter du reste — et
      l'action redit la règle en français avant d'atteindre la base. La
      suppression **reste ouverte sur un bureau en cours** : elle rattrape une
      ouverture faite par erreur, et rien n'en dépend encore.

### Demande du 20 août 2026

- [ ] **Un niveau de navigation de plus : entité, puis bureaux.**
      Le classement actuel est bon, mais l'onglet doit d'abord afficher **toutes
      les entités du niveau sélectionné**. Le clic sur une entité ouvre alors sa
      liste de bureaux — celle d'aujourd'hui, inchangée —, puis le menu ⋮ d'un
      bureau fonctionne comme actuellement.

      `Onglet de niveau → liste des entités → clic → liste des bureaux → menu ⋮`

      À vérifier en chemin : une entité **sans aucun bureau** doit figurer dans
      la liste et le dire, pas disparaître (règle 15) — c'est justement celle
      sur laquelle il y a quelque chose à faire.

## 3. `/finances`

- [x] **Trois nouvelles règles de rapprochement à l'import des dîmes.**
      *(Règles données le 20 août 2026 — migration `0056`.)*
      - **A. Nom + prénom, sans numéro** — reconnu : rattaché ; inconnu : file
        des personnes non rattachées. *(Déjà en place.)*
      - **B. Nom + prénom, avec numéro** — reconnu et numéro nouveau : rattaché
        **et le numéro lui est attribué**, à l'import **comme** à la
        résolution. Le numéro va dans **l'église du croyant**, jamais dans
        l'entité collectrice — une cérémonie de district réunit des donateurs
        de vingt églises. Un numéro **déjà détenu par un autre n'est jamais
        pris** : le voler en silence attribuerait les dîmes suivantes au
        mauvais nom. L'ancien numéro est **désactivé, pas supprimé** — il
        figure sur des reçus déjà remis.
      - **C. Sans nom, avec numéro** — la ligne **entre dans la file**, où le
        dernier porteur du numéro est proposé. **C'est un renversement
        assumé** : `0032` excluait toute ligne sans nom, « il n'y aurait rien à
        rapprocher ». C'était juste tant qu'il n'y avait rien pour travailler ;
        un numéro *est* ce quelque chose. La règle est donc bornée à ce qu'elle
        couvrait vraiment — **sans nom NI numéro**, la ligne reste dehors.
        « Créer la fiche » disparaît sur ces lignes : sans nom pour l'amorcer,
        le seul résultat possible serait une personne inventée.
- [x] ~~Numéro d'enveloppe facultatif à la saisie manuelle~~ — **déjà fait**,
      migration `0033` : la contrainte `dime_versements_nature_coherente`
      n'exige un numéro dans aucune nature, `versementSchema` le déclare
      facultatif, et le formulaire ne le marque pas requis. Vérifié le 20 août
      2026 sur les trois niveaux.

### Demandes du 20 août 2026 — l'église lue, et le travail rendu à l'église

**Le constat de départ.** À l'import Excel, l'application n'arrive pas toujours
à reconnaître le nom de l'église : casse des lettres, accents, ou autre. La
réponse demandée n'est *pas* d'améliorer le rapprochement automatique mais de
**montrer ce que le fichier disait** et de laisser l'église trancher à l'œil.

> ⚠ **Une partie existe déjà — vérifier avant d'écrire.** La migration `0058`
> a introduit `eglise_source`, qui garde le texte lu **même si rien ne le
> reconnaît**, précisément pour qu'on tranche à l'œil ; `eglise_id` porte
> l'entité, résolue **une fois** à l'import. Ce qui suit peut donc être en
> partie de l'affichage, pas du schéma.

- [ ] **Afficher le nom d'église issu du fichier** dans la liste des dîmes, sur
      les lignes à rapprocher. C'est lui qui permet d'associer la personne à la
      bonne église sans deviner.
- [ ] **Le pop-up de rapprochement propose de choisir l'église.** Si la personne
      n'existe pas en base, on propose de **créer la fiche au niveau de cette
      église** — la proposition arrive alors dans **sa** liste de croyants sans
      rattachement. Si la personne existe, la procédure de rapprochement
      actuelle s'applique sans changement.
- [ ] **Même traitement pour un nom renseigné sans correspondance en base**,
      sans enveloppe, église connue.
- [ ] **En conséquence, la liste des croyants sans rattachement s'élargit.**
      Elle doit désormais porter :
      - les **propositions de création** faites par les opérateurs de la
        finance et adressées à cette église ;
      - les **enveloppes numérotées dont l'église est connue**, à charge pour
        l'église de retrouver le porteur du numéro.

      Le travail de l'église devient donc triple : **rapprocher**, **créer une
      fiche**, ou **retrouver le propriétaire d'une enveloppe**.
- [ ] **Basculer une enveloppe en anonyme.** Si le propriétaire reste
      introuvable, l'église peut déclarer l'enveloppe anonyme, ce qui **met à
      jour la ligne dans la liste des dîmes**.

      À ne pas manquer : c'est une écriture qui touche **deux** endroits — la
      file de rapprochement et le versement. Si l'état intermédiaire est faux et
      indétectable, elle se fait **en base** dans une fonction (règle 20).

**Le point de vigilance de tout ce bloc** — RG-33 : une dîme appartient au
**Siège**, jamais à l'église qui la collecte. `entity_id = <Siège>`,
`entite_collecte_id = <église>`. Rien de ce qui précède ne doit faire glisser un
montant vers l'église, sous peine de compter le même argent deux fois. Et
**aucune entité « église inconnue » ne doit être créée** : elle entrerait dans
la structure, recevrait un code, apparaîtrait dans chaque sélecteur et dans les
soldes consolidés — la décision a déjà été prise et tenue une fois.

- [ ] **Menu de versement individuel sur chaque ligne** de `/finances/dimes`.
      Le pop-up s'ouvre avec le champ entité **verrouillé** sur celle de la
      ligne — même principe que l'enregistrement d'un croyant depuis la
      structure, où le rattachement est imposé et n'a donc rien à se faire
      choisir (règle 16).

## 4. `/rapports`

- [ ] **Génération périodique programmée.** *(Écartée le 20 août 2026 — à
      reprendre plus tard.)*
- [x] **Filtres par bloc.** *(20 août 2026, **sans migration** — les filtres
      vivent dans les réglages du bloc, que `report_templates` porte déjà.)*
      **Que des ensembles clos et connus** (règle 18) : sexe, statut, sens,
      niveau, état du mandat. Un filtre par **grade** ou par **catégorie**
      serait ouvert — il figerait dans le modèle une valeur que le référentiel
      peut renommer, et le bloc se viderait sans que rien ne l'explique. Ceux-là
      se feront quand le besoin sera nommé.
      **L'absence vaut « tout »**, jamais « rien » : un modèle écrit avant cette
      version rend exactement ce qu'il rendait. Un filtre **orphelin** — dont la
      source a changé — est ignoré plutôt qu'appliqué : sinon il viderait le
      tableau, et on lirait « il n'y a rien » (règle 15).
      **On récolte une fois, chaque bloc taille sa part en mémoire** : deux
      blocs qui partagent une source et la filtrent différemment ne doivent pas
      coûter deux lectures (règle 28). Et le filtrage ne touche **que la source
      du bloc** — `statut` existe pour les croyants *et* les transferts.
      **Le rapport dit ce qu'il a retenu**, sous le titre du bloc : sur une
      feuille imprimée, personne ne peut ouvrir les réglages pour comprendre
      pourquoi le total ne correspond pas.
- [ ] **Logo téléversé** pour le bloc Image (aujourd'hui le bloc existe, la
      source du logo non).
- [x] **Retirer la publication** — un rapport reste confidentiel à son entité.
      *(20 août 2026, migration `0060`)* — **le défaut était réel, pas
      théorique** : RG-26 omet les blocs non habilités **à la génération**, sous
      la session de *celui qui génère*, et le contenu est ensuite figé (RG-27).
      Un rapport publié montrait donc ses finances à quelqu'un à qui
      `finance.read` avait été refusé. Rejouer l'omission à la lecture aurait
      fait varier le document d'un lecteur à l'autre — un rapport cesserait
      d'être un document. On resserre donc qui peut l'ouvrir :
      **`report.read` décide seul, avec sa portée**.
      Trois conséquences tenues : les rapports **déjà publiés gardent leur
      statut** (c'est de l'histoire, RG-27 l'interdit d'effacer) mais il
      n'ouvre plus rien ; **passer à « publié » est refusé** plutôt qu'ignoré,
      sinon quelqu'un le poserait et croirait avoir diffusé ; et
      **`report.publish` disparaît du registre** au lieu de devenir décoratif —
      les octrois déjà en base restent, inertes, parce que le journal d'audit
      les cite.
- [x] ~~Monter l'écran du réglage `rapport_composition_libre`~~ — **déjà fait** :
      il vit dans `/administration/parametres`, groupe « Rapports ». La ligne
      décrivait un état antérieur ; un commentaire de `rapports-client.tsx` le
      répétait, corrigé le 20 août 2026.

## 5. `/administration`

- [ ] **Portée par droit dans l'octroi.** Aujourd'hui toute habilitation prend
      la portée de l'entité de rattachement ; RG-25 distingue désormais `PROPRE`
      et `DESCENDANTE` par droit, mais l'écran ne permet pas de choisir la
      portée d'un octroi.
- [ ] **Profils locaux** — la colonne existe, aucun écran ne la renseigne.

## 6. Transversal

- [ ] **Fond blanc et ombres légères sur toutes les pages.** Fait sur
      `/tableau-de-bord` et sur les cartes de `/finances` ; reste le reste.
- [ ] **Réécrire toutes les descriptions en langage courant.** Les libellés
      d'écran et d'aide, pas les commentaires de code.

## 7. Design — demandes du 20 août 2026

### Réglages à centraliser dans Administration

- [ ] **Personnalisation du design, réservée au SuperAdmin.** En priorité : la
      **couleur des boutons** (noire aujourd'hui).
      Le point technique à ne pas rater — **règle 32** : une valeur arbitraire
      qui pointe une variable CSS casse **toute la feuille**, et *citer la
      classe fautive dans un commentaire la recrée*. Une couleur réglable passe
      donc par les **jetons de `globals.css`**, jamais par une classe Tailwind
      fabriquée à la volée. Et le réglage se **lit à chaque rendu** (règle 21),
      sinon il est décoratif.
- [ ] **Configuration des notifications Toast (Sonner)** : durée d'affichage,
      bouton de fermeture, couleur de fond selon le cas.
      ⚠ À croiser avec la **règle 30** : seul `toast.success` subsiste dans ce
      projet, ESLint refuse les autres, et tout le reste passe par `avertir()`.
      Le réglage ne doit pas rouvrir en douce ce que cette règle a fermé.
- [ ] **Référentiel « Événement ».** La liste est figée dans le code ; elle doit
      devenir un référentiel comme les grades, fonctions et nationalités —
      `lib/domain/referentiels.ts` est déclaratif, en ajouter un cinquième c'est
      ajouter une entrée. Même leçon qu'EF-ADM-14 : une liste écrite en dur ne
      refuse rien, elle est simplement **plus courte**, et personne ne comprend
      pourquoi.

### Apparence

- [ ] **Bordure de focus des champs : noire**, pas violette.
- [ ] **Réduire les marges horizontales du contenu** de page (gauche et droite)
      pour agrandir la zone utile : **4 px**.
      ⚠ **Écart explicite à la règle 6** (grille de 8 px, vérifiée par ESLint) :
      il doit être assumé et commenté, comme l'a été `pt-4.5` au tableau de bord.
- [ ] **Annuler le flou derrière les pop-up** et les rendre **déplaçables**.
      À vérifier : un pop-up déplaçable ne doit pas perdre son piège à focus ni
      sa fermeture au clavier — c'est ce que le flou et la superposition
      signalaient visuellement.
- [ ] **Ordre protocolaire par glisser-déposer** dans les **fonctions** et dans
      les **grades** : retirer la colonne de rang du tableau et laisser
      réordonner verticalement.
      Le glisser-déposer se double de **deux flèches** — décision déjà prise
      pour la personnalisation du tableau de bord : inaccessible au clavier, il
      ne serait un réglage que pour ceux qui ont une souris.

### Écrans

- [ ] **`/structure` : la barre latérale se replie automatiquement.**
- [ ] **`/structure` : dupliquer le bouton « Accès à l'application »**, qui
      n'est aujourd'hui que sur `/finances`.
- [ ] **`/mon-compte` : afficher la photo de profil.**
- [ ] **Pop-up « Accès à l'application » — trois corrections.**
      1. **Verrouiller sa hauteur**, comme celui du workflow de validation.
      2. **Inverser le sens des interrupteurs** : activé = l'entité **a** accès.
         C'est l'inverse aujourd'hui. Reprendre en conséquence les libellés
         « Se connecte » et « Ne se connecte pas ».
         ⚠ **Le sens en base ne change pas** : la colonne s'appelle
         `sans_acces_application`, et c'est l'affichage qui s'inverse. La
         renommer toucherait `saisirMouvement`, la migration `0051` et toute la
         doctrine de la saisie déléguée — ne pas confondre les deux gestes.
      3. **Le spinner fait trembler le pop-up** et fait apparaître deux barres
         de défilement : il doit prendre la place de l'interrupteur, pas s'y
         ajouter.
- [ ] **Hiérarchie intermédiaire dans l'organigramme des bureaux** — le cas du
      vice-président, en violet sur l'image jointe — **sans toucher au design
      actuel ni à l'impression PDF**.
      ⚠ **L'image n'est pas arrivée** (`image.png`) : à redemander avant de
      commencer. Rappel règle 33 : le PDF rend la **hiérarchie**, jamais les
      coordonnées où l'utilisateur a posé ses blocs pour travailler.

---

## 8. Anomalies signalées le 20 août 2026

- [ ] **Une saisie possible là où l'habilitation manque — à trancher.**
      *Signalé :* Hanitra Eugenie, rattachée à l'église **Antsahatsiresy**, sans
      l'habilitation de saisir pour le compte d'une entité, peut malgré tout
      saisir un mouvement pour la cellule **FITAHIANA (CEL-0002)** — cellule qui
      n'a pas encore de bureau **et** qui a accès à l'application.

      **Ce qui a été vérifié dans le code le 20 août 2026 :**
      - Le garde-fou **serveur est correct**. `saisirMouvement` appelle
        `requirePermission(session, 'finance.create', entite.path)`, qui passe
        par `peut()` — donc avec la portée. `finance.create` est `PROPRE` depuis
        `0050` : une portée sur l'église **ne couvre pas** sa cellule.
      - La branche déléguée est correcte aussi : elle exige `finance.delegate`
        **et** `sans_acces_application` sur l'entité visée (`0051`, `0052`).
      - **L'écran, lui, ne filtre rien.** `app/(app)/finances/page.tsx` passe
        `arbre.filter((e) => e.is_active)` au sélecteur d'entité : **toutes** les
        entités actives du périmètre sont proposées, sans jamais consulter
        `peut('finance.create', …)`.

      **Trois hypothèses à départager, dans cet ordre :**
      1. **L'écran promet ce que le serveur refuse.** Le plus probable : la
         cellule est *sélectionnable*, et l'écriture échoue à l'enregistrement.
         C'est un défaut réel — on ne propose pas un geste qu'on n'accorde
         pas —, mais ce n'est pas un trou de sécurité.
      2. **L'écriture aboutit vraiment.** Alors vérifier ses habilitations
         réelles en base : détient-elle `finance.create` avec un `scope_path`
         plus large que son église ? Est-elle `SUPERADMIN` — `estSuperAdmin`
         court-circuite tout contrôle ?
      3. **`0050` n'est pas active sur cette base** : `has_perm` testerait
         encore l'inclusion de chemin pour tous les droits.

      **Le correctif attendu dans tous les cas** : filtrer le sélecteur d'entité
      par `peut('finance.create', path)`, et par `sans_acces_application` pour
      la saisie déléguée.

- [ ] **Retirer un titulaire : demander le motif.** Deux cas se présentent, et
      ils ne laissent pas la même trace :
      1. **Erreur d'assignation** → **rien** n'est inscrit dans l'historique de
         la fiche croyant. Ce n'est pas un événement de sa vie, c'est une
         correction de saisie.
      2. **Retrait avant la fin du mandat** → **motif obligatoire**, en texte
         libre : décès, sanction pour faute lourde…

      Un pop-up doit donc demander lequel des deux avant d'agir.

- [ ] **« Gérer les modèles partagés » (rapports) : portée à vérifier.**
      *Signalé :* un utilisateur habilité peut sélectionner **tous** les niveaux
      d'organisation — Siège, Régional, District, Paroisse, Église, Cellule — et
      donc fixer l'étendue d'un modèle **hors de son périmètre**.

      À rapprocher de la doctrine du lot 6, déjà tranchée : *« une entité ne
      compose que pour elle-même »*, l'entité propriétaire étant celle de
      rattachement de l'auteur, lue dans la session — elle ne voyage pas dans le
      formulaire, donc elle ne se choisit pas. Si l'étendue échappe au
      périmètre, c'est la même règle qui fuit par une autre porte.

---

> **Pour toutes les demandes ci-dessus** — question posée par l'utilisateur le
> 20 août 2026 : **vérifier si les habilitations fines méritent d'être mises à
> jour**. Un geste nouveau qui réemploie un droit existant lui donne une portée
> qu'il n'avait pas ; c'est exactement ce qui s'était produit avec
> `finance.delegate` avant `0051`.

## 9. ⏳ Reporté volontairement en fin de liste

- [ ] **Le PDF d'un rapport est toujours bâclé.**
      *Quatre tentatives, toutes insuffisantes :*
      1. barre latérale collante masquée → première page toujours blanche ;
      2. hauteurs d'écran et `transform` → idem ;
      3. sélecteur étendu aux enfants directs de `body` (les portails) → idem ;
      4. **changement de méthode** — `imprimerRapport` ouvre désormais une
         fenêtre vide et n'y met que l'aperçu, avec les feuilles de style de
         l'application et un `<base href>` pour qu'elles se résolvent. Le rendu
         ne suit toujours pas.

      **Reprendre avec le PDF produit sous les yeux.** Les trois premiers
      diagnostics étaient chacun justes sans être suffisants : la cause
      restante n'est probablement pas celle qu'on suppose.

- [ ] **Quatre marges réglables séparément** — haut, bas, gauche, droite — au
      lieu de l'unique curseur actuel, qui les fixe toutes ensemble (aperçu A4
      du rapport). *(Demandé le 20 août 2026.)*

      C'est une demande **distincte** du défaut ci-dessus, pas une cinquième
      tentative pour le corriger. Le rendu émet déjà son propre `<style>` parce
      que `@page` n'accepte ni classe ni variable ; ce sont ses quatre valeurs
      qu'il faut ouvrir. À faire dans le même passage, tant que le sujet est
      rouvert.

---

## Ce qui attend une réponse de l'utilisateur

- **L'image `image.png`** citée pour la **hiérarchie intermédiaire dans
  l'organigramme des bureaux** (§7, cas du vice-président en violet) n'est pas
  arrivée. Sans elle, on ne peut pas savoir si le vice-président se place
  *entre* deux rangs, *à côté* du président, ou *en dérivation* — trois dessins
  et trois modèles de données différents.
- **Le comportement voulu au veuvage et au divorce** pour le lien conjugal
  (§1) : effacer le lien perd l'histoire, le garder affiche un conjoint qui ne
  l'est plus.
- **`SMTP_PASS`** doit être posé dans les variables d'environnement de
  production : sans lui le serveur d'envoi est configuré mais aucun message ne
  part. Le bouton d'essai le dit sans détour.
- **Révoquer le mot de passe d'application Google** qui a transité par
  `.env.example` le 19 août 2026. Rien n'a été commité — mais un secret exposé
  ne se retire pas, il se **révoque** (« Rotation d'un secret », `README.md`).
- **Faire tourner `SUPABASE_SERVICE_ROLE_KEY`** — même document.
- **Borner ou non la visibilité des croyants** dans la saisie des dîmes.

---

## Rappel — les pièges déjà payés

Ils sont détaillés dans `CLAUDE.md` (les 33 règles non négociables) et dans
[`SESSION_HISTORY.md`](../.claude-code-history/SESSION_HISTORY.md). Les trois
qui reviennent le plus :

1. **Toute migration qui crée ou remplace une fonction finit par
   `notify pgrst, 'reload schema'`** — sans lui, l'API répond « fonction
   inconnue » sur du SQL pourtant en place.
2. **`create or replace` ne suffit pas pour un `returns table`** : ajouter une
   colonne change le type de retour (42P13). Il faut un
   `drop function if exists <nom>(<types IN>)` juste avant.
3. **`could not find plugin "jsx-a11y"`** ne vient PAS de l'installation : c'est
   un fichier étranger laissé à la racine du dépôt, qu'aucun préréglage Next ne
   couvre. `ls -a` à la racine, et supprimer ce qui n'appartient pas au dépôt.
