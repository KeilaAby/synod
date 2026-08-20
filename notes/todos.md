# TODO — demandes en attente

> Liste tenue à jour au **19 août 2026**, pour la reprise sur une autre machine.
>
> Elle ne contient QUE ce qui a été demandé et n'est pas encore fait. Ce qui est
> livré sort d'ici et entre dans [`CLAUDE.md`](../CLAUDE.md) et dans le dernier
> [point d'étape](../.claude-code-history/2026-08-19_resumes-moi.md).
>
> **À lire avant de commencer** : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
> puis `CLAUDE.md`, [`cdg.md`](cdg.md) et [`plan.md`](plan.md).

---

## ⚠ État de la base

Appliquées : `0001` à `0058`.

| N° | Ce qu'elle apporte | Sans elle |
|---|---|---|
| `0059` | Deux verrous de bureau : le **terme exigé à l'ouverture** et l'**interdiction de supprimer un bureau clos** | Un bureau peut s'ouvrir sans fin — donc ses membres gardent l'accès indéfiniment (RG-07) — et l'écran seul empêche la suppression, ce qu'un appel direct à l'API contourne |

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

## 7. ⏳ Reporté volontairement en fin de liste

- [ ] **Le PDF d'un rapport est toujours bâclé.**
      *Quatre tentatives, toutes insuffisantes :*
      1. barre latérale collante masquée → première page toujours blanche ;
      2. hauteurs d'écran et `transform` → idem ;
      3. sélecteur étendu aux enfants directs de `body` (les portails) → idem ;
      4. **changement de méthode** — `imprimerRapport` ouvre désormais une
         fenêtre vide et n'y met que l'aperçu, avec les feuilles de style de
         l'application et un `<base href>` pour qu'elles se résolvent. Le rendu
         ne suit toujours pas.
      5. Il faut personaliser le reglage des marges (Top - Bottom - Right - left) et non une barre de selection actuelle pour toutes les marges (Apercu A4 du rapport)

      **Reprendre avec le PDF produit sous les yeux.** Les trois premiers
      diagnostics étaient chacun justes sans être suffisants : la cause
      restante n'est probablement pas celle qu'on suppose.

---

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
