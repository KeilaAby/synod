# Résumé — 21 août 2026

> Point d'étape destiné à la reprise de session.
> **Nouvelle machine ou nouvelle session ? Lire d'abord**
> [`.agents/rules/reprise.md`](../.agents/rules/reprise.md), puis
> **[`notes/todos.md`](../notes/todos.md)** — c'est là que se trouve ce qu'il
> reste à faire, et l'état exact de la base.
>
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-20_resumes-moi.md`](2026-08-20_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local`.

---

## L'état de la base

**Appliquées : `0001` à `0066`.** L'état qui fait foi est en tête de
`notes/todos.md` — ce fichier-ci ne le répète pas deux fois.

`0066` ajoute `bureau_membres.motif_retrait` : pourquoi un mandat a été
**interrompu** avant son terme.

**810 tests unitaires, 40 fichiers.** `pnpm verify` vert.

---

## Ce qui a été livré aujourd'hui

### Les deux anomalies signalées le 20 août — fermées

**Les modèles de rapport ne débordent plus du périmètre.** Un district cochait
« Siège » et son modèle s'annonçait à une entité qui n'est pas la sienne. On
propose désormais **son niveau et ceux qui en dépendent**, jamais au-dessus.

**Retirer un titulaire demande lequel des deux gestes** — effacer une
désignation fautive, ou clore un mandat avec son motif.

### Attestation de transfert

Un document A4 sous l'en-tête de l'entité, sous un droit distinct
(`transfer.certify`), délivré uniquement sur un transfert **abouti**.

---

## Les décisions à ne pas défaire

**L'étendue d'un modèle ne remonte jamais au-dessus de son auteur.** C'est la
doctrine du lot 6 — *une entité ne compose que pour elle-même* — qui fuyait par
une autre porte : l'entité **propriétaire** ne se choisissait pas, donc ne
pouvait pas se refuser ; l'**étendue**, elle, se choisissait librement.

**Une erreur de saisie s'efface, une décision se conserve.** Un mandat d'un jour
laissé dans la frise d'un croyant se lirait un jour comme une destitution, et
personne ne saurait dire le contraire. Le choix **se demande** : deviner ferait
perdre une ligne d'historique qu'on croyait garder, ou l'inverse.

**La fenêtre de quinze jours court depuis l'ENREGISTREMENT**, pas depuis le
début du mandat — un bureau peut être saisi en retard, avec un début antérieur
de six mois. Elle se vérifie **côté serveur** : ce qui est en jeu est un
effacement, et un refus se corrige là où une ligne effacée ne revient pas.

**Deux entrées pour la même opération doivent agir pareil.** Un motif d'office
avait d'abord été posé dans l'organigramme, au prétexte que le choix appartenait
à l'écran de composition — c'était l'inverse de la règle 16, et la conséquence
était concrète : le même geste effaçait ici et conservait là.

**On n'atteste que ce qui a abouti.** Délivrer le papier d'une demande en
attente ferait circuler un document qui affirme un transfert qui n'a pas eu
lieu — et personne, en le lisant, ne saurait qu'il ne vaut rien.

**Un transfert ne réécrit RIEN de l'historique des dîmes.** L'église affichée
est celle qui a **collecté**, figée sur le mouvement ; le numéro d'enveloppe est
recopié sur chaque versement. La lire par l'église *courante* du croyant
attribuerait rétroactivement ses anciennes dîmes à sa nouvelle église.

---

## Ce qu'il reste

**La liste fait foi : [`notes/todos.md`](../notes/todos.md).** En tête de file :

- **`/croyants`** — validation des promotions de grade ; impression de la liste
  avec ses filtres ; **lien conjugal** époux ↔ épouse (le plus lourd : migration
  et trigger, le lien devant rester symétrique).
- **Deux demandes du 21 août sur l'attestation** — qu'elle soit **consultable
  avant approbation** par l'entité réceptrice, et **configurable** par l'entité
  émettrice. Les deux sont détaillées dans la liste, avec les questions à
  trancher avant d'écrire.
- **`/finances`** — le rapprochement des dîmes rendu à l'église (six points).
- **`/rapports`** — logo téléversé.
- **`/administration`** — portée par droit ; profils locaux.
- **Reporté en fin de liste** — le PDF d'un rapport, et les quatre marges
  réglables séparément.
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
pnpm verify       # secrets + lint + types + 810 tests + build
pnpm dev:propre   # cache Turbopack vidé — après toute série de modifications
```

Lire avant toute tâche : [`.agents/rules/reprise.md`](../.agents/rules/reprise.md),
`notes/todos.md`, puis `CLAUDE.md`, `notes/cdg.md` et `notes/plan.md`.
