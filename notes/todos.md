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

**Appliquées : `0001` à `0068`. `0069` et `0070` sont écrites et n'attendent
qu'une confirmation.**

| N° | Ce qu'elle apporte | Sans elle |
|---|---|---|
| `0070` | `attestation_transfert_settings` — le gabarit réglable de l'attestation de transfert (logo, texte du corps, mentions légales, cartouche de signature), une seule ligne, lecture libre / écriture `settings.manage` | L'attestation reste figée au texte de référence codé en dur, sans écran pour le personnaliser |
| `0069` | `organisation_settings.jours_correction_saisie` — le délai de correction (15 jours par défaut) devient un réglage, plus une constante dupliquée dans deux fichiers | Le retrait d'un titulaire et le changement de grade continuent de lire chacun leur propre `JOURS_ERREUR_*` codé en dur, sans écran pour le régler |
| `0068` | **Corrige `fn_decider_promotion`** : le statut passe par une variable **typée**. Dans une fonction, un `case` rend du `text` — le type de la colonne n'entre pas dans la résolution — et PostgreSQL refuse de l'affecter à une colonne énumérée. Le refus arrive à l'**exécution**, jamais à l'écriture. | Le bouton « Approuver » échoue : « column statut is of type statut_promotion but expression is of type text » |
| `0067` | Le **circuit de validation des promotions de grade** : réglage global, table `promotions_grade`, et `fn_decider_promotion` qui pose le grade en approuvant | Un grade se pose seul, sans que personne au-dessus ne le confirme — alors qu il vaut dans toute l organisation |
| `0066` | `bureau_membres.motif_retrait` — pourquoi un mandat a été **interrompu** avant son terme | Un retrait en cours de mandat reste sans raison écrite, et c'est exactement ce qu'on cherchera dans dix ans |

C'est **cette ligne** qui fait foi — pas le numéro le plus élevé de
`supabase/migrations/`, qui dit ce qui est *écrit* et non ce qui est *appliqué*.
Les migrations ne s'appliquent pas toutes seules : l'utilisateur les passe dans
l'éditeur SQL Supabase et le confirme.

*(Cette section annonçait encore `0067` le 21 août, sans dire clairement que
`0068` l'était aussi. Confirmé par l'utilisateur et corrigé le 21 août au
soir. `0069` et `0070`, écrites le 21 et le 22 août, suivent la même règle :
elles ne sont pas appliquées tant que l'utilisateur ne les a pas passées dans
l'éditeur SQL Supabase.)*

---

## 1. `/croyants`

- [x] **Document d'attestation de transfert.** *(21 août 2026, **sans
      migration** — une habilitation est une clé textuelle, il suffit de la
      déclarer.)*
      **Un droit à part**, `transfer.certify` : consulter un transfert dit ce
      qui s'est passé, en délivrer l'attestation **engage l'entité** — le papier
      porte son en-tête, il sera présenté ailleurs, et il vaut preuve. Délégable,
      car une entité délivre les siennes.
      **On n'atteste que ce qui a abouti** (`transfertAttestable`) : approuvé ou
      effectué. Une demande en attente ou refusée n'a rien produit, et en
      délivrer le papier ferait circuler un document qui affirme un transfert
      qui n'a pas eu lieu. **Deux statuts et non un** : entre la décision et le
      rattachement, c'est précisément le moment où le croyant présente son
      papier.
      **C'est l'entité d'accueil qui délivre** — elle reçoit le croyant, donc
      elle signe ce qu'il présentera ; à défaut, l'origine.
      **Aucun exemplaire n'est stocké** : le contenu étant figé à l'approbation,
      réimprimer redonne le même document (même doctrine que les rapports).

- [x] **Canevas Excel téléchargeables depuis les deux pop-up d'import.**
      *(21 août 2026, sans migration.)*
      Un bouton dans « Importer des croyants » et dans « Importer une feuille de
      versements ». Le classeur porte **deux feuilles** : « Saisie » —
      importable telle quelle, en-têtes en première ligne — et « Guide de
      remplissage ». L'ordre n'est pas décoratif : le lecteur d'import prend la
      **première feuille déclarée**, et poser le guide en tête importerait le
      mode d'emploi à la place des données.
      **L'étoile marque l'obligatoire DANS L'EN-TÊTE**, pas seulement dans le
      guide : le saisiste travaille dans la feuille de saisie, et une consigne
      rangée ailleurs demande de se souvenir qu'elle existe. Un test vérifie
      qu'elle ne casse pas la reconnaissance automatique des colonnes — sinon le
      canevas imposerait treize choix manuels à chaque import, et il aurait rendu
      l'import plus pénible qu'un fichier quelconque.
      **Le classeur se fabrique au clic**, il n'est pas servi depuis `public/` :
      un fichier déposé là serait une copie que le code ne met pas à jour — et
      c'est le fichier que le saisiste remplit. Il est construit à partir des
      **mêmes registres** que l'import, et un test compare les deux listes.
      **Le canevas reste une AMORCE, jamais une contrainte** : l'encart dit
      « aucun modèle à respecter » AVANT de proposer le fichier. L'ordre inverse
      ferait croire à un format imposé, et quelqu'un qui possède déjà sa feuille
      la recopierait colonne par colonne — le travail exact que cet import lui
      épargne.
      `pnpm canevas` les écrit aussi sur disque, pour les joindre à un courriel
      sans ouvrir l'application. Ils ne sont **pas versionnés**, pour la même
      raison qu'ils ne vivent pas dans `public/`.

### Demandes du 21 août 2026 — sur l'attestation

- [x] **Le document doit être consulté par l'entité RÉCEPTRICE avant toute
      approbation.**
      *(22 août 2026, sans migration — `components/transferts/imprimer-attestation.ts`,
      `lib/domain/transfert.ts`.)*

      **Un seul rendu pour les deux documents** (règle 16), exactement comme
      `RenduRapport` : `imprimerAttestation` prend désormais un `statut`, et
      c'est LUI qui décide entre la pièce de dossier et l'attestation
      définitive — pas un second fichier, pas une seconde fonction.
      1. **Ce qu'elle porte** : identité, matricule, origine, destination,
         date de demande, motif — jamais de date de décision ni de décideur,
         qui n'existent pas encore. Rien à masquer explicitement : ces champs
         sont naturellement `null` tant que rien n'est tranché, la même
         condition qui les affiche sur l'attestation les efface ici sans
         branche à part.
      2. **La distinction** : le titre change de mot (« Pièce de dossier —
         demande de transfert », jamais « Attestation »), le corps change de
         verbe (« fait l'objet d'une demande… à l'examen », jamais « atteste
         que… a été »), et une mention encadrée en tête du document — « Demande
         en cours d'examen — ce document ne constitue pas une attestation » —
         ne laisse aucune place à la confusion sur un papier détaché de
         l'écran. **Le cartouche de signature disparaît entièrement** plutôt
         que de rester vide : vide, il se lirait comme un oubli et non comme
         une étape à venir.

      **Nouvelle fonction de domaine**, `pieceDossierDisponible(statut)` — vraie
      pour `DEMANDE` seul, testée pour ne **jamais** recouvrir
      `transfertAttestable` (un statut n'ouvre jamais les deux à la fois).

      **L'audience n'est PAS `transfer.certify`.** Ce droit engage l'entité — il
      protège l'attestation, un document qui *affirme*. La pièce de dossier
      n'affirme rien, elle *informe* celui qui va juger : son public est donc
      celui qui `peutDecider` ce transfert précis (même portée — l'arbitre,
      RG-12 —, aucune règle nouvelle à écrire). Le bouton « Pièce de dossier »
      vit dans la carte « à trancher », juste avant le bouton qui décide —
      il **précède** la décision sans la remplacer.

- [x] **Le document A4 doit être configurable par l'entité émettrice.**
      *(22 août 2026, migration `0070`.)*

      **Question d'architecture posée à l'utilisateur avant d'écrire** : bloc du
      générateur de rapports, ou gabarit propre avec quelques champs réglables ?
      Réponse — **son propre gabarit**. Le générateur compose des blocs qui
      **agrègent des données sur une période** ; une attestation porte **un**
      transfert précis, à une date précise — l'y intégrer aurait demandé un bloc
      d'un genre nouveau que rien d'autre n'aurait employé.

      **Le patron retenu est celui des modèles de courriel** (lot 7,
      `email_settings`/`email_templates`) : `attestation_transfert_settings`,
      **une seule ligne** — le texte du corps, les mentions légales et le
      cartouche de signature sont un choix d'ORGANISATION, comme le sujet d'un
      courriel, pas un réglage par entité. Ce qui varie déjà par entité — le
      **nom** de l'entité émettrice — reste dynamique, lu à chaque impression :
      le figer ici l'aurait fait diverger de celui affiché partout ailleurs.

      **Lecture libre, écriture réservée** — à la différence d'`email_settings`.
      Un hôte SMTP ne sert qu'à l'administration ; ce gabarit doit être lu par
      quiconque imprime une attestation (`transfer.certify`), potentiellement
      délégué loin du Siège. Le modifier reste sous `settings.manage`, non
      délégable.

      **Le logo réutilise l'infrastructure de stockage existante**
      (`PREFIXES.logos`, posée mais inemployée) plutôt que d'en inventer une
      seconde : même contrôle de signature que la photo d'un croyant
      (premiers octets, jamais l'extension — ENF-SEC-06), clé fixe
      (`logos/attestation-transfert.<ext>`) parce qu'une seule ligne de
      réglages porte un seul logo. **Ce que la pièce de dossier n'emploie
      JAMAIS** : ni le logo, ni le texte du corps réglé, ni les mentions
      légales — son texte de mise en garde reste fixe, pour ne jamais pouvoir
      être atténué par un réglage (voir l'item précédent).

      Écran : nouvel onglet « Attestation » dans `/administration/parametres`,
      quatrième famille de réglages aux côtés d'Organisation, Profils de
      privilèges et Courriel.


- [x] **Un transfert d'église ne doit pas toucher l'historique des dîmes.**
      *(Demandé le 21 août 2026 — **vérifié, c'est déjà le cas**, et consigné
      pour que personne ne le défasse.)*

      **Trois points, et l'invariant tient par construction :**
      1. **L'église affichée est `entite_collecte_id`**, figée sur le mouvement
        au moment de la collecte. La lire par l'église *courante* du croyant
        aurait rétroactivement attribué ses anciennes dîmes à sa nouvelle
        église — une réécriture silencieuse de ce qui a été encaissé.
      2. **Le numéro d'enveloppe est recopié sur chaque versement** à la saisie
        (migration `0027`), pas lu par jointure : c'est le reçu détenu qui fait
        foi, et il ne change pas.
      3. **`fn_appliquer_transfert` (`0014`) ne touche à aucune table de
        dîmes.** Rien à défaire, donc rien à surveiller.

      **La RLS suit la même logique** : un versement se voit à travers son
      mouvement, donc à travers l'entité **collectrice**. L'église d'origine
      continue de voir ce qu'elle a collecté après le départ du croyant — c'est
      la seule lecture juste, cet argent est passé par elle.

      *Consigné dans le commentaire de `chargerVersementsDuCroyant`.*


### Suite `/croyants`

- [x] **Tri des colonnes au clic**, avec chevrons indiquant le sens. *(20 août
      2026)* — `lib/domain/tri.ts` (pur, testé) et `EnteteTriable`, partagés :
      les autres tables n'auront qu'à s'y brancher. Les valeurs **absentes
      restent en queue dans les deux sens** — une cellule vide n'est pas une
      petite valeur. Deux états seulement, pas trois : un « aucun tri » rendrait
      un ordre qu'aucun chevron n'explique.
- [x] **Validation de la promotion de grade par une entité supérieure.**
      *(21 août 2026, migration `0067` — socle et circuit livrés.)*

      **Le réglage est GLOBAL, pas par entité**, et c'est l'écart à signaler.
      Le workflow financier s'active entité par entité (chaque bureau gère ses
      comptes) ; un grade ne se compare pas : il vaut dans **toute**
      l'organisation. « Pasteur à Antananarivo » et « Pasteur à Toamasina »
      doivent désigner la même chose. Un circuit ouvert ici et fermé là
      produirait exactement l'inverse.

      **Fermé par défaut** : cette règle n'invalide pas les organisations qui
      n'en veulent pas. Et le réglage se lit **à chaque écriture** (règle 21) —
      l'activer referme la porte immédiatement, sans qu'aucun écran n'ait à
      être redémarré ; le lire au chargement d'un formulaire laisserait passer,
      pendant des heures, les onglets ouverts avant le changement.

      **L'arbitre est le PARENT immédiat, figé à la demande.** Remonter plus
      haut ferait trancher le Siège des promotions de cellule ; s'arrêter à
      l'église ne serait plus une validation par un tiers. Le figer évite qu'une
      réorganisation change, après coup, qui était compétent.

      **L'anti-auto-approbation ne coûte aucune règle de plus** : le droit
      s'évalue sur l'arbitre, donc un compte borné à l'église ne le couvre pas.
      C'est ce qui la rend difficile à contourner par mégarde.

      **`croyant.grade.approve` est un droit distinct** — mais *demander* reste
      sous `croyant.update` : c'est le même geste qu'avant le circuit, seul
      change qui tranche. On ne crée pas un droit pour un geste inchangé.

      **La fiche s'enregistre quand même** : seul le grade attend. Bloquer toute
      la fiche pour une promotion en attente ferait perdre une correction
      d'adresse.

      **Une seule demande en cours par croyant** (index partiel, RG-06) : deux
      demandes ouvertes laisseraient trancher deux fois, et le second verdict
      écraserait le premier.

      **Approuver POSE le grade dans la même transaction** (`fn_decider_promotion`,
      règle 20) : l'un sans l'autre laisserait une promotion accordée qui n'a
      rien changé, ou un grade posé dont la demande reste ouverte.

      **Un refus se motive, une approbation non** : approuver confirme ce que la
      demande disait déjà ; refuser dit le contraire.

      **Reste à faire — l'écran de la file.** Le socle est complet et testé
      (domaine, migration, actions `deciderPromotion` et `retirerPromotion`,
      réglage monté dans les paramètres généraux), mais **aucun écran ne
      présente encore les demandes en attente** à l'entité supérieure. Le patron
      existe : la file des transferts (`/transferts`) fait exactement cela — le
      journal restreint à ce que l'utilisateur peut réellement trancher.
      À prévoir aussi : la fiche du croyant doit **dire qu'une promotion est en
      attente**, sinon on croira que le changement n'a pas été enregistré.

      *(Repéré le 22 août 2026 en reprenant `notes/todos.md` dans l'ordre :*
      *cette note vivait dans les détails d'un item déjà coché, sans case à
      elle — invisible à qui ne lit pas jusqu'au bout. Sortie en item séparé
      ci-dessous pour qu'elle ne se reperde pas.)*

- [x] **L'écran de la file des promotions de grade en attente.**
      *(22 août 2026 — moitié DÉJÀ livrée, en réalité, moitié terminée
      aujourd'hui. La note ci-dessus, écrite le 21 août, était devenue
      trompeuse : le socle avait continué d'avancer sans qu'elle soit
      corrigée. À retenir — une note qui décrit un manque doit être vérifiée,
      pas recopiée, à chaque reprise de `notes/todos.md`.)*

      **La file existait déjà** : `PromotionsEnAttente`
      (`components/croyants/promotions-en-attente.tsx`), montée sur
      `/croyants` en tête d'écran — même patron que `/transferts`, filtrée sur
      la COMPÉTENCE (`peutDeciderPromotion`) et non sur la seule visibilité,
      approuver en un geste, motif exigé pour un refus. Rien à faire ici.

      **Ce qui manquait vraiment** : la fiche du croyant ne disait pas qu'une
      promotion était en attente. `promotionDuCroyant` (`lib/data/
      promotions.ts`) existait pourtant déjà, avec son commentaire d'intention
      explicite (« sans elle, le circuit est incompréhensible ») — mais
      **aucun appelant nulle part**, exactement la classe de défaut que ce
      projet a déjà payée plusieurs fois : une fonction écrite avec la bonne
      intention, jamais branchée à l'écran qui en avait besoin. Enfilée dans
      `app/(app)/croyants/[croyantId]/page.tsx`, elle pose désormais un badge
      « → *Grade demandé* en attente » à côté du grade courant.

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
      2. ✅ **Décès, divorce et caractère facultatif — tranchés le 20 août 2026.**
         - **Décès.** Si A ou B est déclaré décédé, l'autre devient **veuf ou
           veuve**. Le statut marital du survivant suit donc le décès du
           conjoint : c'est une conséquence, pas une saisie à refaire à la main —
           sinon deux fiches se contrediraient jusqu'à ce que quelqu'un s'en
           aperçoive.
         - **Divorce : le lien s'efface, sans historique.** Rien n'en est
           conservé. C'est une décision explicite, à ne pas « améliorer » plus
           tard en gardant une union passée : ce registre sert l'église
           d'aujourd'hui, pas la généalogie, et une ex-union qui traîne dans une
           fiche est une information que personne n'a demandé à voir.
         - **Le lien n'est jamais obligatoire**, même sur un croyant déclaré
           marié : son conjoint peut très bien ne pas être croyant. « Marié »
           sans conjoint renseigné est un état **normal**, pas une fiche
           incomplète — rien ne doit le signaler comme une anomalie.

         **Ce que le divorce impose à l'écriture** : effacer un lien symétrique
         touche **deux** fiches, et n'en effacer qu'une les ferait se
         contredire — l'une divorcée, l'autre toujours mariée à elle. Les deux
         écritures sont donc indissociables et se font **en base** (règle 20).
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
- [ ] La liste des habilitations fines des comptes doivent être mises à jour et 
      configurées si une des mises à jour dans ce Todos.md est susceptibles d'impacter les habilitations fines d'un utilisateur 

## 6. Transversal

- [x] **Fond blanc et ombres légères sur toutes les pages.** *(20 août 2026,
      demandé à la suite des marges à 4 px.)*
      **Le fond se demandait écran par écran** — `data-fond="blanc"` — et deux
      pages seulement l'avaient posé. Un réglage que chaque nouvel écran doit
      penser à reprendre finit par manquer quelque part, et c'est l'écran oublié
      qu'on remarque : celui dont le fond reste gris quand tous les autres sont
      blancs se lit comme un défaut d'affichage. Le gabarit le pose désormais
      pour tous, et l'attribut est **retiré** — un drapeau qui ne décide plus de
      rien devient un piège (règle 21).
      **Ce que cela obligeait à changer ailleurs**, et c'est le vrai travail :
      sur gris, une carte blanche se découpait d'elle-même et la bordure ne
      faisait que la finir. Sans contraste de fond à emprunter, elle se fond
      dans la page. `Card` porte donc **`shadow-sm` par défaut**, et sa bordure
      passe à `border-border/70`.
      **`shadow-sm`, et pas davantage** : une ombre marquée sur vingt cartes
      fabrique un bruit que l'œil doit trier avant d'atteindre les chiffres.
      La bordure **reste** — elle tient le trait là où le rendu des ombres est
      pauvre, et elle borne la carte quand deux se touchent.
      *(Le commentaire UI-03/UI-05 « la séparation repose sur une bordure,
      jamais sur une ombre » a été amendé sur place : il était juste tant que la
      page était grise.)*
- [ ] **Réécrire toutes les descriptions en langage courant.** Les libellés
      d'écran et d'aide, pas les commentaires de code.

## 7. Design — demandes du 20 août 2026

### Réglages à centraliser dans Administration

- [x] **Couleur des boutons réglable.** *(20 août 2026, migration `0063`.)*
      Elle voyage comme une **valeur** posée sur le jeton `--primary`, jamais
      comme une classe : règle 32, Tailwind lit le **source** et ne devine pas
      ce que le serveur enverra — une classe fabriquée à la volée n'existerait
      dans aucune feuille.
      **La couleur du texte ne se saisit pas, elle se déduit** de la luminance
      du fond (`texteSurCouleur`). La laisser choisir permettrait de poser du
      blanc sur du jaune, et personne ne relit un bouton qu'il a lui-même
      réglé. La formule est celle de la luminance relative WCAG : une moyenne
      des trois canaux donnerait du blanc sur du jaune vif, l'œil étant
      beaucoup plus sensible au vert qu'au bleu.
      **L'aperçu est le vrai contrôle** : personne ne sait à quoi ressemble
      `#4f46e5` avant de le voir sur un bouton, avec son texte.
      La borne hexadécimale est **en base** (`check`), dans le schéma Zod et
      dans le rendu : une chaîne quelconque poussée dans un attribut `style`
      n'est pas seulement laide.
      *Réserve :* sur la page de connexion la RLS ne rend rien — la lecture est
      réservée aux comptes connectés — et l'apparence d'origine s'applique. On
      ne personnalise pas pour quelqu'un qu'on ne connaît pas encore.
      *Non fait :* le réglage est sous `settings.manage`, donc au Siège en
      pratique, mais il n'est pas **explicitement** réservé au SuperAdmin comme
      le demandait la formulation. À reprendre si la distinction compte.
- [x] **Notifications réglables** — durée, bouton de fermeture, fond coloré.
      *(20 août 2026, migration `0063`.)*
      **La règle 30 tient, et l'écran le dit** : seules les confirmations
      passent par une notification ; un refus, un avertissement ou une panne va
      dans un pop-up qu'on ferme, et ESLint refuse les autres appels. Ces
      réglages ne rouvrent pas ce que cette règle a fermé — ils décident de la
      **manière** dont s'affiche ce qui a déjà le droit de s'y afficher. Un
      encart l'explique dans le formulaire, sinon on croirait pouvoir
      raccourcir un message d'erreur.
      La durée est bornée entre 2 et 20 s — en deçà on ne lit pas, au-delà les
      messages s'empilent — et **re-bornée à la lecture** : une valeur hors
      bornes venue d'une base modifiée à la main ferait disparaître la
      notification avant qu'elle soit lue.

      **Repris le 20 août au soir**, sur la capture de l'écran équivalent de
      Stratrack *(migration `0065`)* :
      - **Position réglable**, six coins. Le défaut passe de « en haut à
        droite » à **« en bas à droite »** : en haut à droite vivent le menu ⋮
        des lignes, le bouton d'export et les actions d'en-tête — la
        notification s'y posait sur ce qu'on venait de cliquer, au moment où
        l'on s'apprête à cliquer à nouveau.
      - **La durée passe en curseur.** On ne connaît pas la bonne durée, on la
        **cherche** : « quatre secondes, est-ce trop ? » ne se répond qu'en
        comparant. Un champ oblige à effacer puis retaper pour essayer la valeur
        voisine ; un curseur la donne d'un cran, et rend l'intervalle visible —
        les bornes n'ont plus à être expliquées. La valeur reste affichée à
        côté : un curseur sans nombre laisse deviner où l'on est.
        Pas de **demi-seconde** : entre 2 et 5 s, là où le réglage se joue, la
        seconde est trop grossière.

- [x] ~~**Styles de toast par contexte**~~ — les quatre listes de la capture
      Stratrack (création, modification, suppression, erreur).
      **Écarté le 20 août 2026, sur décision de l'utilisateur : « on s'en tient
      au style unique ».** Écrit ici pour que la question ne se repose pas.

      Ce qui l'a fait écarter, et qui reste vrai :
      - **Ce n'est pas le réglage qui coûte, c'est l'appel.** SYNOD compte
        **57 appels `toast.success`** sans contexte : leur donner une couleur
        propre suppose de déclarer à chacun de quel geste il s'agit. Mécanique
        mais large — et un demi-parcours donnerait un écran où la moitié des
        notifications ignore le réglage.
      - **Le contexte « erreur » n'existe pas ici.** La règle 30 envoie tout
        refus, avertissement ou panne dans un pop-up qu'on ferme, et ESLint
        refuse les autres appels à `toast`. Lui donner une couleur ferait un
        réglage qui ne décide de rien — exactement ce que cette liste reproche
        partout ailleurs.
- [ ] **Référentiel « Événement ».** ⚠ **La demande est plus lourde que son
      énoncé, et l'estimation portée ici le 20 août était fausse.**
      Ce n'est **pas** une liste figée en TypeScript : `type_evenement_dime` est
      un **enum PostgreSQL** (`0027`), porté par
      `finance_entries.dime_evenement`, et surtout employé comme **type de
      paramètre** de `fn_saisir_collecte_dime` — dont la signature est reprise
      dans **huit migrations successives** (`0029`, `0030`, `0032`, `0035`,
      `0036`, `0038`, `0056`, `0057`, `0058`).
      **Ce que cela impose :**
      1. une table `evenements_dime` (id, code, libellé, `niveau_hote`, ordre,
         `is_active`) avec ses politiques RLS, et l'entrée au registre ;
      2. la conversion de `finance_entries.dime_evenement` de l'enum vers du
         **texte**, plus une clé étrangère sur le code — les valeurs existantes
         sont déjà les codes, donc la reprise est directe ;
      3. le **remplacement de `fn_saisir_collecte_dime`** : changer un type de
         paramètre change la signature, donc `drop function` puis recréation à
         l'identique de la dernière version — celle de `0058` —, et le point
         d'appel TypeScript avec.
      **Le risque est là, pas dans le référentiel** : cette fonction écrit les
      collectes de dîmes, à l'unité comme à l'import. La recopier de travers ne
      se verrait pas au typecheck.
      **`NIVEAU_HOTE` doit devenir une colonne**, pas rester en dur : c'est lui
      qui décide quelle entité peut héberger l'événement, et un événement créé
      à l'écran sans niveau n'aurait aucune entité éligible — la liste serait
      simplement vide, sans que rien ne l'explique (même piège qu'EF-ADM-14).

### Apparence

- [x] **Bordure de focus des champs : noire**, pas violette. *(20 août 2026)* —
      le jeton `--ring` de `globals.css`, pas une classe posée écran par écran.
      **En thème sombre elle ne peut pas être littérale** : un contour noir sur
      fond sombre ne se verrait pas, et ENF-UTI-03 exige un focus visible. Chaque
      thème prend donc son `--foreground` — noir en clair, presque blanc en
      sombre. Même traitement pour `--sidebar-ring`, qui aurait sinon gardé
      l'indigo dans la navigation.
- [x] **Marges horizontales du contenu réduites à 4 px.** *(20 août 2026)* —
      `px-1 md:px-2` dans le gabarit applicatif. **Écart assumé à la règle 6**,
      et le raisonnement est écrit sur place : la grille de 8 px vaut pour ce qui
      SÉPARE des éléments entre eux ; une marge extérieure ne sépare rien, elle
      ne fait que rogner la zone utile. Sur les tableaux larges de cette
      application, chaque pixel rendu est une colonne de moins à faire défiler.
      Le `py-6` vertical, lui, **reste sur la grille** : il sépare bien quelque
      chose. `px-1` est sur l'échelle Tailwind, donc ESLint l'accepte — ce n'est
      pas une valeur arbitraire.
- [x] **Flou retiré, pop-up déplaçables.** *(20 août 2026)* — `backdrop-filter`
      forçait le navigateur à recomposer toute la page derrière le pop-up à
      chaque image : sur un organigramme React Flow ou un tableau de mille
      lignes, c'est ce qui rendait l'ouverture pâteuse. Le voile passe de
      `bg-black/10` à `bg-black/20` et dit ce que le flou disait — « ceci est
      au-dessus » — sans rien recalculer.
      **On ne tire que par l'en-tête.** Rendre toute la surface saisissable
      ferait déplacer le pop-up en essayant de sélectionner un libellé ou de
      cocher une case ; un `pointerdown` sur un bouton ou un champ n'entraîne
      rien non plus. **La position ne se mémorise pas** : le pop-up se démonte à
      la fermeture, donc rouvrir redonne un pop-up centré. Une position retenue
      ferait rouvrir hors écran après un changement de taille de fenêtre, et
      personne ne saurait pourquoi le pop-up « ne s'ouvre plus ».
      *(Le piège à focus et la fermeture au clavier sont inchangés : Radix les
      tient, on n'a ajouté que des gestionnaires de pointeur.)*
- [x] **Ordre protocolaire par glisser-déposer**, doublé de **deux flèches**.
      *(20 août 2026, **sans migration**.)*
      **Le mot « remettre » de la demande était exact, et plus littéralement
      que je ne l'avais cru.** J'avais d'abord écrit que la colonne
      `ordre_protocolaire` existait depuis la migration `0004` et que rien ne la
      lisait. **C'était faux** : la migration `0022` l'a *supprimée* le 9 août
      2026, sur décision de l'utilisateur, parce qu'elle servait alors à
      **déduire** l'organigramme d'un bureau — usage disparu depuis que
      l'organigramme se dessine (`0021`). Je n'avais cherché la colonne que dans
      le code TypeScript, jamais dans le SQL.
      **Migration `0061`** la rétablit, et ce n'est pas un revirement : la
      `0022` retirait un rang qui **prétendait dire** la hiérarchie ; celui-ci
      ne fixe que l'**ordre d'affichage** d'une liste. `bureau_postes` reste la
      seule source de préséance d'un bureau. **EF-REF-03 n'avait jamais été
      amendée** et exige toujours l'ordre protocolaire au référentiel Fonction :
      la remettre restaure la conformité, la note d'EF-BUR-07 a été précisée en
      conséquence.
      Les valeurs de départ reprennent l'**ordre alphabétique actuel** : un
      défaut uniforme laisserait l'ordre indéfini, et la liste changerait toute
      seule au premier rechargement. La migration ne déplace rien — elle rend
      l'ordre modifiable.
      **Le rang ne se tape plus.** « Ordre d'affichage : 100, 200, 300 » est une
      représentation, pas une intention : pour glisser le pasteur avant
      l'évangéliste il fallait deviner un nombre libre entre les deux, et le jour
      où il n'y en avait plus, renuméroter la liste entière. Le champ numérique
      est retiré des formulaires — le garder à côté du glisser-déposer aurait
      donné deux chemins pour la même chose (règle 16).
      **Un piège de la règle 19 évité de justesse** : `ordre` était resté dans le
      schéma Zod avec `.default(100)`. Le formulaire ne l'affichant plus, chaque
      modification d'un grade aurait **remis son rang à 100**, sans message ni
      erreur. Un test le verrouille désormais.
      **La colonne d'ordre ne s'appelle pas partout pareil** — `ordre` pour les
      grades et les catégories, `ordre_protocolaire` pour les fonctions : elle se
      **déclare** au registre (`colonneOrdre`) au lieu d'être devinée. Les
      nationalités n'en ont pas, et c'est voulu : leur imposer un rang
      inventerait une hiérarchie entre des pays.
      **Les rangs sont espacés de dix**, jamais de 1 à N : une valeur créée plus
      tard, ou par un import, doit pouvoir s'insérer sans toucher ses voisines.
      L'écriture est **un seul `upsert`** — une ligne par valeur coûterait un
      aller-retour par fonction (règle 28), et une interruption à mi-parcours
      laisserait un ordre à moitié appliqué, donc faux et sans trace.
      *(Étendu aux **catégories financières**, qui se rangeaient déjà par
      `ordre` : le même argument y vaut mot pour mot, et laisser une des trois
      tables se comporter autrement aurait demandé plus d'explications que de
      l'aligner.)*

### Écrans

- [x] **`/structure` : la barre latérale se replie automatiquement.** *(20 août
      2026)* — l'organigramme est un **graphe** : il se dispose lui-même en
      largeur, et une branche de six niveaux n'a nulle part où aller si la
      fenêtre rétrécit. Le mécanisme existait déjà pour `/rapports`
      (`CHEMINS_LARGES`) : c'est un chemin de plus, pas un second dispositif.
      **Le repli reste un défaut, pas un verrou** — on rouvre la navigation pour
      la visite — et il ne touche pas à la préférence mémorisée.
- [x] **`/structure` : le bouton « Accès à l'application » y figure aussi.**
      *(20 août 2026)* — « qui se connecte » est une propriété de la structure
      autant qu'une contrainte des finances. Ce n'est pas un second chemin
      (règle 16) : même pop-up, même action, deux portes d'entrée.
- [x] **`/mon-compte` : la photo de profil s'affiche.** *(20 août 2026)* — elle
      vient de la fiche de **croyant** du titulaire : un compte n'a pas de
      visage, une personne en a un. Le responsable informatique, qui ne siège
      nulle part, peut n'en avoir aucune — les initiales prennent alors le
      relais, et **c'est l'état normal**, pas un défaut d'affichage. C'est
      `AvatarCroyant`, celui de tous les autres écrans (règle 16) : il porte déjà
      la teinte dérivée du nom, si bien qu'une personne garde son visage d'un
      écran à l'autre.
- [x] **Pop-up « Accès à l'application » — les trois corrections.** *(20 août
      2026)*
      1. **Hauteur verrouillée** à `h-[22rem]`, le gabarit du pop-up de
         workflow. `max-h-96` laissait la liste grandir avec son contenu :
         changer d'onglet ou taper une recherche faisait sauter la hauteur, et
         le pop-up se recentrait à chaque frappe. Le message « aucune entité ne
         correspond » prend la **même** hauteur — sans quoi une recherche
         infructueuse ferait s'effondrer le cadre puis le rouvrir à la lettre
         suivante.
      2. **Interrupteurs inversés** : allumé = l'entité **a** accès. Un
         interrupteur allumé se lit comme une capacité accordée, pas comme une
         privation — la lecture spontanée était donc l'inverse du réglage. Les
         libellés suivent (« A accès » / « Sans accès »), et l'encart d'aide
         **annonce le sens** avant qu'on touche à quoi que ce soit.
         **Seul l'affichage s'inverse** : `sans_acces_application` garde son nom
         et son sens en base. Le compte du bouton continue de porter
         l'**exception** — combien d'entités sont sans accès —, avec un `title`
         qui le dit, parce qu'un nombre nu se lirait aussi bien dans l'autre
         sens.
      3. **Le chargement prend la place de l'interrupteur**, il ne s'y ajoute
         plus. Une roue de 16 px substituée à un interrupteur de 36 px faisait
         rétrécir la ligne, donc trembler le pop-up, et sa hauteur changeante
         faisait apparaître deux barres de défilement. Le gabarit est fixe ;
         c'est ce qui est dedans qui change.

- [x] **Hiérarchie intermédiaire dans l'organigramme des bureaux.** *(20 août
      2026, migration `0064`.)* Le modèle fourni : « Vice-président adjoint »
      accroché au trait vertical qui descend du directeur général, décalé sur le
      côté, au-dessus de la rangée des autres subordonnés.

      **Un drapeau sur le poste, jamais un niveau de plus.** C'est la décision
      qui commande tout le reste : le vice-président est un **enfant** du
      directeur général. Lui donner un rang intermédiaire décalerait toute la
      descendance d'un cran pour obtenir un effet de dessin.
      `parent_fonction_id` continue de dire **de qui l'on dépend** ;
      `en_derivation` dit seulement **où l'on se dessine**. Un test le vérifie :
      le petit-enfant reste au même niveau qu'en l'absence d'adjoint.

      **L'invariant central : la rangée des frères ne bouge pas.** Une dérivation
      compte parmi les enfants pour la parenté, jamais pour la **largeur** —
      l'inclure dans le calcul déplacerait toute la rangée pour loger un bloc
      qui n'y figure pas, et le plan changerait à chaque adjoint nommé. La
      distinction se fait à un seul endroit, au tri ; tout le reste — largeur,
      centrage, profondeur — ignore leur existence.

      **Le trait change aussi.** Le trait ordinaire descend puis coude vers
      l'enfant, qui l'accueille par le **haut**. Un adjoint posé à mi-hauteur du
      tronc n'a pas de haut à offrir : le trait y arriverait en biais ou
      par-dessus le bloc. On sort donc du tronc à sa hauteur et on y entre par
      la **gauche** — le « T » couché du modèle, qui fait lire l'adjoint comme
      un rattachement latéral plutôt que comme un subordonné de plus.

      **Le PDF le recalcule, il ne le recopie pas** (règle 33) : la position
      vient du drapeau, pas de l'écran. À l'écran, le bloc garde la place où on
      l'a mis — un plan de travail n'est pas un document.

      **Une dérivation sans supérieur n'en est pas une.** L'entrée de menu
      n'apparaît que sur un bloc relié, et détacher un bloc marqué le remet dans
      la rangée **côté écran** plutôt qu'en base : la contrainte de `0064`
      refuserait l'écriture entière, et le plan serait perdu pour un détail de
      dessin.

      **Le réglage se voit à l'écran** — une pastille « Dérivation » — alors
      qu'il ne change que le papier. Sans elle, on ne saurait qu'un bloc est en
      dérivation qu'en imprimant, donc trop tard pour le corriger.

---

## 8. Anomalies signalées le 20 août 2026

- [x] **Une saisie refusée là où elle aurait dû aboutir.** *(20 août 2026 —
      diagnostiqué, tranché, corrigé.)*

      *Signalé :* Hanitra Eugenie, rattachée à l'église **Antsahatsiresy**, ne
      pouvait pas saisir un mouvement pour la cellule **FITAHIANA (CEL-0002)**.
      L'écran répondait « Vous n'avez pas l'autorisation d'effectuer cette
      action » — alors que l'autorisation était bien là.

      **Ce n'était donc pas un trou de sécurité mais son contraire : un blocage.**
      La cellule a accès à l'application et n'a pas encore de bureau. Les deux
      branches refusaient à la fois :
      - la saisie **directe**, parce que `finance.create` est `PROPRE` depuis
        `0050` — une portée sur l'église ne couvre pas sa cellule ;
      - la saisie **déléguée**, parce qu'elle exigeait `sans_acces_application`,
        et que la cellule a l'accès.

      L'argent de la cellule n'entrait donc **nulle part**.

      **La règle posée par l'utilisateur, et pourquoi elle est la bonne.** Un
      ascendant peut saisir pour un enfant qui n'a personne pour le faire, dans
      la limite de ses propres habilitations. « Personne » couvre **deux** cas
      que le code n'en voyait qu'un :
      1. l'entité est **déclarée sans accès** — une décision, qui durera ;
      2. l'entité a l'accès mais **aucun membre de bureau en fonction** — un
         compte suppose un mandat en cours (lot 7), donc pas de bureau signifie
         pas d'opérateur. C'est un état de fait, qui se résoudra tout seul.

      Ils se ressemblent par ce qui compte : **il n'y a personne pour saisir**.

      **Ce qui a été fait :**
      - `motifDeDelegation` et `exigeDelegation` dans `lib/domain/finance.ts` —
        purs, testés (`tests/unit/delegation.test.ts`). La condition se relit à
        **chaque écriture** (règle 21) : le jour où un bureau s'ouvre, la
        délégation se referme d'elle-même, sans rien à défaire.
      - `compterTitulairesEnFonction` dans `lib/data/bureaux.ts` — une requête,
        sur la seule entité visée, `head: true`.
      - **La case à cocher a disparu.** Elle n'avait rien d'un choix : soit
        l'entité a un opérateur et la délégation lui est refusée, soit elle n'en
        a pas et c'est le seul mode possible. Laisser choisir, c'était laisser
        se tromper — et c'est exactement l'erreur qui a été signalée. Le mode se
        **déduit** de l'entité choisie, et le formulaire annonce ce qu'il va
        faire, validation immédiate comprise.
      - **Aucune migration** : `fn_chiffres_perimetre` (`0053`) rendait déjà le
        nombre de titulaires par entité, en une passe, pour l'écran.

      **Le refus se dit maintenant AVANT la saisie, et il nomme.** *(20 août
      2026, second passage.)* `peutDeleguer` valait `true` **en dur** : l'écran
      ne vérifiait pas `finance.delegate` et le découvrait au retour du serveur,
      sous la forme la moins utile — « Vous n'avez pas l'autorisation
      d'effectuer cette action », sans dire laquelle. L'utilisateur détenant
      bien `finance.create` et le sachant, il cherchait ailleurs : c'est ce qui
      a fait passer un blocage pour un bogue.
      - L'encart avertit désormais quand le droit manque, **sur l'entité
        choisie** (règle 3 : le droit s'évalue avec sa portée) ;
      - et le serveur, s'il est atteint quand même, **nomme l'habilitation** au
        lieu de la formule générique. La ligne d'audit `DENIED` est conservée :
        un refus est un événement, le remplacer par un message le ferait
        disparaître du journal.

      *Reste ouvert :* le **sélecteur d'entité n'est toujours pas filtré** par
      `peut('finance.create', path)`. Il propose tout le périmètre actif. Une
      entité pourvue d'un bureau et hors de la portée du droit reste donc
      sélectionnable — mais elle est maintenant refusée **avec son motif**.

- [x] **Retirer un titulaire : demander le motif.** *(21 août 2026, migration
      `0066`)* — **deux gestes que l'application confondait**, et qui ne
      laissent pas la même trace :
      - **Erreur d'assignation** → la ligne est **effacée**. Rien n'entre dans
        l'historique du croyant, parce qu'il ne s'est rien passé dans sa vie : on
        a tapé le mauvais nom. Un mandat d'un jour laissé dans sa frise se lirait
        un jour comme une destitution, et personne ne saurait dire le contraire.
      - **Retrait en cours de mandat** → le mandat est **clos**, motif
        **obligatoire**. Un mandat interrompu sans raison écrite est exactement
        ce qu'on cherchera dans dix ans.

      **Le choix se demande, il ne se devine pas** : deviner à la place de
      l'utilisateur ferait perdre une ligne d'historique qu'il croyait garder —
      ou l'inverse. Chaque option affiche **sa conséquence**, pas seulement son
      nom.

      **La fenêtre de 15 jours court depuis l'ENREGISTREMENT**, pas depuis le
      début du mandat : un bureau peut être saisi en retard, avec un début
      antérieur de six mois. Elle se vérifie **côté serveur** — un menu masqué ne
      ferme rien, et ce qui est en jeu est un effacement : le refus se corrige,
      la ligne effacée non.

      **La colonne reste nullable**, et c'est voulu : un mandat se clôt aussi
      par la fermeture de son bureau ou par un remplacement, qui ne sont pas des
      retraits — exiger un motif les ferait échouer.

      **Depuis l'organigramme, le retrait est toujours une décision** : le choix
      entre les deux gestes se fait dans la composition, où l'on voit la
      personne et depuis quand elle est enregistrée. Deux endroits pour décider
      d'un effacement divergeraient (règle 16).

- [x] **« Gérer les modèles partagés » (rapports) : portée corrigée.**
      *(21 août 2026, **sans migration** — l'étendue vit dans la ligne du
      modèle, pas dans le schéma.)*

      *Le défaut :* un district cochait « Siège » et son modèle s'annonçait à
      une entité hors de son périmètre. C'est la doctrine du lot 6 — **« une
      entité ne compose que pour elle-même »** — qui fuyait par une autre
      porte : l'entité **propriétaire** ne se choisissait pas, donc ne pouvait
      pas se refuser ; mais l'**étendue**, elle, se choisissait librement.

      *La règle :* on propose **son propre niveau et ceux qui en dépendent**,
      jamais au-dessus. Le Siège les obtient tous — non par exception mais par
      application : il est au niveau 1, et tout est en dessous de lui. Un
      modèle **officiel** échappe à la règle : il n'appartient à aucune entité,
      et le contrôle de portée élargie l'a déjà borné au Siège.

      *Trois points tenus :* le **serveur refuse** et **nomme les niveaux
      fautifs** — un masquage à l'écran ne ferme rien, la Server Action
      s'appelle sans passer par l'écran qui la propose ; l'écran **dit la
      borne** plutôt que de la laisser deviner, sinon quatre pictogrammes sur
      six se lisent comme un défaut d'affichage ; et un **niveau illisible rend
      une liste vide**, pas complète — mieux vaut ne rien proposer qu'ouvrir
      tout sur une valeur qu'on ne sait pas lire.


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

---

## 10. Demandes du 21 août 2026 (soir)

- [x] **Organigramme d'un bureau : la palette « Fonctions à poser » ignore
      l'ordre protocolaire.** *(21 août 2026, sans migration.)*
      Le défaut était bien dans la lecture, pas dans le schéma : `fonctionsDuNiveau`
      (`lib/domain/bureau.ts`) portait encore un `.sort()` alphabétique par
      `libelle`, resté d'une époque où `ordre_protocolaire` n'existait pas. La
      migration `0061` avait corrigé la requête (`listerFonctions`, triée en
      base) mais ce tri en mémoire, appliqué APRÈS, écrasait silencieusement son
      résultat — pour la composition tabulaire **et** pour la palette de
      l'organigramme, qui partagent le même appel. **Ne pas retrier en mémoire
      ce que la requête trie déjà** : deux ordres qui se superposent finissent
      par diverger, et c'est le second, invisible dans le schéma, qui gagne.
      Corrigé en supprimant le tri : `fonctionsDuNiveau` ne fait plus que
      filtrer, et préserve l'ordre de son entrée. Les tests qui validaient
      l'ancien tri alphabétique masquaient le défaut — entrée déjà triée, la
      régression ne pouvait pas se voir ; réécrits pour vérifier la préservation
      de l'ordre ET l'absence de réordonnancement au filtrage
      (`tests/unit/bureau.test.ts`).

- [x] **Centraliser le délai de 15 jours dans Administration.**
      *(21 août 2026, migration `0069`.)*
      Les deux constantes dupliquées — `JOURS_ERREUR_ASSIGNATION`
      (`lib/domain/bureau.ts`) et `JOURS_ERREUR_GRADE`
      (`lib/domain/promotion.ts`) — ont disparu au profit d'une fonction
      partagée, `dansLeDelaiDeCorrection` (`lib/domain/delai-correction.ts`),
      et d'un réglage : `organisation_settings.jours_correction_saisie`, exposé
      dans le nouveau groupe « Corrections de saisie » de
      `/administration/parametres`.
      **Le délai borne un effacement, donc il est relu à CHAQUE écriture**
      (règle 21) — jamais mis en cache dans un pop-up ouvert depuis des heures.
      Les deux Server Actions concernées (`lib/actions/bureaux.ts`,
      `lib/actions/croyants.ts`) rappellent `getParametres()` au moment de
      trancher, et c'est cette valeur, jamais celle passée en prop, qui décide.
      Les pop-up (`retrait-dialog.tsx`, `changement-grade-dialog.tsx`) reçoivent
      `joursDelai` en prop : un simple **hint d'écran**, pour annoncer le bon
      nombre de jours avant même la soumission — le serveur reste seul à
      trancher pour de bon. Ce hint est enfilé depuis `getParametres()` à
      chaque page qui monte ces pop-up, avec un repli sur
      `JOURS_CORRECTION_SAISIE_DEFAUT` (15 jours) là où il n'a pas encore de
      valeur réelle à offrir (`useEntityDialogs`).

- [x] **« Erreur d'assignation » devient l'option PAR DÉFAUT.**
      *(22 août 2026, sans migration — décision explicitement demandée à
      l'utilisateur avant d'y toucher, le risque étant nommé dans la demande
      elle-même.)*
      Les deux pop-up — retrait d'un titulaire (`retrait-dialog.tsx`) et
      changement de grade (`changement-grade-dialog.tsx`) — initialisent
      désormais leur état à `'ERREUR'` (au lieu de `'DECISION'`), et le
      réinitialisent à `'ERREUR'` à la fermeture plutôt qu'à `'DECISION'` : ils
      ne se démontent pas entre deux ouvertures, c'est cette réinitialisation
      qui fixe le défaut vu à la prochaine ouverture.
      **Rien ne change à la garde qui protège `DECISION`** : `choix` reste
      calculé comme `erreurPossible ? nature : 'DECISION'` — hors du délai,
      l'option `ERREUR` n'est de toute façon jamais proposée ni sélectionnable,
      donc l'écran retombe automatiquement sur `DECISION` (motif obligatoire)
      sans code supplémentaire.

- [x] **Le glisser-déposer des pop-up n'est pas fluide : la souris « lâche ».**
      *(22 août 2026, sans migration.)*
      `setPointerCapture` était bien déjà en place (`components/ui/dialog.tsx`,
      depuis le 20 août) — ce n'était donc pas la première piste. C'était la
      seconde : `auMouvement` posait un `setState` à **chaque** `pointermove`,
      qui re-rendait tout le contenu du pop-up — formulaire, tableau — à chaque
      pixel parcouru. Sur un pop-up chargé, le fil d'événements pointeur
      s'engorge et la souris semble « lâcher » la prise, même sous capture.
      **Le décalage mute désormais le DOM directement** (`ref.current.style.
      transform`), sans passer par l'état React — même principe que la
      correction déjà apportée à l'organigramme, cité par la demande elle-même :
      ce qui bouge en continu appartient au geste, pas au rendu. La position ne
      se mémorisant de toute façon pas (RG déjà en place), rien n'a besoin
      d'être *su* du composant entre deux gestes.

- [x] **Réduire l'épaisseur du contour de focus des champs.**
      *(22 août 2026, sans migration.)*
      Un **seul jeton**, `--epaisseur-focus` (`app/globals.css`), pour les DEUX
      mécanismes de focus de l'écran : l'`outline` par défaut (`@layer base`,
      déjà centralisé) et le `box-shadow` que les composants shadcn posent
      chacun via leur propre classe `ring-2`/`ring-3`/`ring-[3px]` — Tailwind
      grave cette largeur en dur dans chaque classe générée, sans variable
      commune à leur redonner ; la retoucher aurait exigé de réécrire plus
      d'une dizaine de fichiers, exactement ce que la demande refusait.
      **La résolution passe par les couches de cascade (Cascade Layers)** :
      les classes `ring-*` vivent dans `@layer utilities`, et une déclaration
      posée HORS de tout `@layer` l'emporte toujours sur une déclaration de
      calque, quelle que soit sa spécificité. Une seule règle non calquée,
      `:focus-visible { --tw-ring-shadow: … calc(var(--epaisseur-focus) + …) … }`,
      reprend donc la largeur effective partout où `box-shadow:
      var(--tw-ring-shadow)` la lit — sans toucher à la couleur de chaque
      composant, ni à un seul des fichiers qui posent `ring-*`.
      Valeur retenue : **2px** (contre 3px sur les champs — input, select,
      case à cocher, interrupteur —, et déjà 2px sur le contour générique).
      Le contour **reste visible au clavier**, borne de §18.3 : on l'amenuise,
      on ne le supprime pas.


## Ce qui attend une réponse de l'utilisateur

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
