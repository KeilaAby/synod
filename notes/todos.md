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

## ⚠ À faire en premier — migrations non appliquées

| N° | Ce qu'elle apporte | Sans elle |
|---|---|---|
| `0054` | `trash.purge` entre dans `fn_permissions_non_delegables()` | Le droit serait délégable en base alors qu'il ne l'est pas dans l'écran — et un test compare les deux listes |
| `0055` | `trash.purge` entre dans `fn_permissions_portee_propre()` | Le droit descendrait dans le sous-arbre : purger sur un district effacerait chez ses églises |

Appliquées : `0001` à `0053`.

---

## 1. `/croyants`

- [ ] **Document d'attestation de transfert.** Dynamique comme les rapports,
      avec l'en-tête de l'entité. Demande une habilitation fine et distincte —
      un document signé n'est pas une lecture de liste.
- [ ] **Tri des colonnes au clic**, avec chevrons indiquant le sens.
- [ ] **Validation de la promotion de grade par une entité supérieure.**
      Workflow à activer ou non dans les paramètres généraux (règle 21 : le
      réglage se lit à chaque rendu, jamais codé en dur).
- [ ] **La liste des versements sans fiche** devient la base des croyants non
      rattachés, et se replie.

## 2. `/bureaux`

- [ ] **Onglets d'entité → cartes → liste des bureaux** (réorganisation de la
      navigation de l'écran).
- [ ] **Date de fin de mandat obligatoire.**
      ⚠ Voir règle 26 : `bureaux_periode` est en `>` et `membres_periode` en
      `>=` — les deux tables portent la même règle et se sont déjà contredites.
- [ ] **Un mandat échu révoque l'accès de ses membres**, sauf le responsable
      informatique (il n'y siège pas, c'est sa raison d'être — migration `0047`).
- [ ] **Un bureau clos est archivé, jamais supprimé.**

## 3. `/finances`

- [ ] **Trois nouvelles règles de rapprochement à l'import des dîmes.**
      *(Les règles elles-mêmes n'ont pas été détaillées — à redemander.)*
- [ ] **Numéro d'enveloppe facultatif** à la saisie manuelle d'une collecte.

## 4. `/rapports`

- [ ] **Génération périodique programmée.**
- [ ] **Filtres par bloc.**
- [ ] **Logo téléversé** pour le bloc Image (aujourd'hui le bloc existe, la
      source du logo non).
- [ ] **Retirer la publication** — un rapport reste confidentiel à son entité.
      Conséquence à traiter : `report.read` et la publication décidaient
      ensemble qui pouvait ouvrir un rapport ; il faudra reprendre cette règle.
- [ ] **Monter l'écran du réglage `rapport_composition_libre`** (migration
      `0045`). `CompositionDialog` est **écrit et prêt**, aucun écran ne le
      monte : sa place est dans Administration.

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

      **Reprendre avec le PDF produit sous les yeux.** Les trois premiers
      diagnostics étaient chacun justes sans être suffisants : la cause
      restante n'est probablement pas celle qu'on suppose.

---

## Ce qui attend une réponse de l'utilisateur

- **Les trois règles de rapprochement** des dîmes à l'import (point 3) n'ont
  jamais été détaillées.
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
