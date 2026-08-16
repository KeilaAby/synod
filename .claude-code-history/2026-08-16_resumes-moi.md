# Résumé — 16 août 2026

> Point d'étape destiné à la reprise de session.
> Historique : [`SESSION_HISTORY.md`](SESSION_HISTORY.md) ·
> Découpage en lots : [`notes/plan.md`](../notes/plan.md) ·
> Point précédent : [`2026-08-09_resumes-moi.md`](2026-08-09_resumes-moi.md)
>
> Avec `SESSION_HISTORY.md`, ce fichier est l'un des **deux seuls** de
> `.claude-code-history/` à être versionné : les transcripts bruts en sont
> exclus, ils contiennent des valeurs lues dans `.env.local` (voir
> `.gitignore`).

---

## Aucune migration n'attend

Les migrations `0023` à `0042` sont appliquées.

Deux pièges rencontrés sur `0042`, qui valent d'être retenus :

- **`nationalites` porte `code_iso`**, pas `code` — les quatre référentiels ne
  sont pas uniformes, et le supposer coûte une migration refusée.
- **`create or replace` ne suffit pas pour un `returns table`** : les paramètres
  `OUT` font partie de la signature, donc *ajouter une colonne* est un changement
  de type de retour (42P13). Il faut `drop function if exists` juste avant — et
  l'erreur n'arrive qu'à **l'application**, jamais à l'écriture. Règle 23
  amendée.

---

## La migration `0038` — appliquée le 16 août 2026

Base à jour. Ce qu'elle a corrigé mérite d'être retenu, parce que le défaut
était invisible à l'écran.

C'était un défaut de conception, pas un oubli. Le statut de la collecte était
laissé au workflow du Siège, ce qui ne donnait que deux issues, toutes deux
fausses : soit elle dormait en brouillon indéfiniment — c'est ce qui a été
observé —, soit elle comptait **avant que l'argent ait quitté l'église**.

La migration tranche : la collecte naît `SOUMIS`, et **c'est la remise qui
valide**. Ce qui est juste au fond — la dîme appartient au Siège dès qu'elle est
collectée, mais elle n'est sa recette qu'une fois **remise en mains propres**.

C'est ce qui explique pourquoi une collecte de dîmes ne peut pas alimenter le
Siège avant d'avoir été remise.

---

## Où en est le projet

**SYNOD** — plateforme de gestion d'église. **Lots 0 à 3 livrés**, **lot 4
livré pour l'essentiel**.

| Module | État |
|---|---|
| Authentification, session, habilitations avec portée | ✅ |
| Structure — organigramme éditable, vue liste, CRUD en pop-up, corbeille | ✅ |
| Référentiels, croyants, photo de profil, transferts, baptêmes | ✅ |
| Baptêmes en lot — EF-BAP-07 | ✅ |
| Bureaux — composition, organigramme React Flow, impression A4 | ✅ |
| **Finances — socle, workflow par entité, soldes en base** | ✅ |
| **Pièce justificative, saisie en série (EF-FIN-07/08)** | ✅ |
| **File de validation par lot (EF-FIN-21)** | ✅ |
| **Vue consolidée du Siège (EF-FIN-11)** | ✅ |
| **Dîmes — collecte, anonymes, remise, import, rapprochement** | ✅ |
| **Reçu imprimé — A4 à huit talons *et* rouleau 80 mm** | ✅ |
| **Historique des versements sur la fiche (EF-FIN-35)** | ✅ |
| **Synthèse périodique — EF-FIN-24** | ✅ |
| **Filtres complets du registre — EF-FIN-22** | ✅ |
| **Exports XLSX / CSV / PDF — EF-FIN-25** | ✅ |
| **Clôture d'une période — EF-FIN-26** | ✅ |
| **Tableau de bord — EF-DSH-01/02/04/11/12** | ✅ |
| **Personnalisation du tableau de bord — EF-DSH-03/07/09** | ✅ |
| **Blocs composés et parts — EF-DSH-05/06 (partiel)** | ✅ |
| **Répartitions, classement et jauge — EF-DSH-05** *(migration `0042`)* | ✅ |
| **Périmètre et période réglables — EF-DSH-06** | ✅ |
| **Impression, exports, icônes — EF-DSH-10** | ✅ |
| **Modèles applicables en un clic — EF-DSH-08 (partiel)** | ✅ |

573 tests unitaires, 27 fichiers. `pnpm verify` vert.

---

## Les dîmes — l'invariant à ne pas perdre

**Une dîme n'est pas une recette de l'église qui la collecte.** Elle appartient
au Siège, à qui elle est remise en mains propres.

Le mouvement porte donc `entity_id = <Siège>` et **jamais l'église**. Le lien
avec l'église passe par `entite_collecte_id`, qui sert la traçabilité et n'entre
dans aucun solde. Porter les deux ferait compter le même argent deux fois — chez
celui qui l'a collecté et chez celui à qui il appartient : deux soldes
plausibles, tous deux faux.

Le circuit complet : **collecte** (nominative, enveloppe anonyme, ou en vrac) →
**import** d'une feuille → **rapprochement** des noms non reconnus → **remise**
au Siège, qui valide et émet le bordereau.

---

## Ce qu'il reste

### Dîmes — **rien**, le lot est clos

Le ticket de reçu imprimable et l'historique du croyant (EF-FIN-35) ont été
livrés le 16 août. EF-FIN-27 à 35 sont tous servis.

### Lot 5 — tableau de bord, la suite

Indicateurs, masquage, squelette, **personnalisation**, parts en pourcentage,
dernières fiches, **courbe financière par catégorie**, **quatre répartitions**
(âge, grade, nationalité, entités filles) et **jauge de couverture** sont
livrés. Restent :

- **EF-DSH-06, réglage par indicateur** — le périmètre et la période se règlent
  désormais pour **tout l'écran** (barre en tête, portée par l'URL). Le cahier
  des charges les veut aussi *widget par widget* : reste à poser une surcharge
  dans la disposition, pour les seuls indicateurs qui dépendent d'une période.
- **EF-DSH-08, la seconde moitié** — « le SuperAdmin peut IMPOSER un modèle par
  défaut à un niveau donné ». Les modèles applicables en un clic sont livrés ;
  imposer demande `dashboard_templates` (elle existe depuis `0005`) et un écran
  d'administration.

### Finances — **le lot 4 est complet**

EF-FIN-01 à 35 sont tous servis. Reste une dette technique, pas une exigence :

- La **règle 17 à moitié tenue** sur `/finances` : les filtres sont bien en
  mémoire, mais l'écran n'a jamais synchronisé l'URL par `history.replaceState`.
  Le faire pour les cinq nouveaux critères seulement aurait donné un
  comportement incohérent — c'est un changement propre à part entière.

La **saisie déléguée** est livrée depuis le lot 4 (EF-FIN-05/06) : la case du
pop-up de mouvement et le badge dans les listes. Un écran dédié n'est exigé
nulle part — il ferait un second chemin pour la même création (règle 16).

### À décider par vous
- **Faire tourner `SUPABASE_SERVICE_ROLE_KEY`** — voir « Rotation d'un secret »
  dans `README.md`.
- Le **fuseau par défaut** : `Africa/Porto-Novo` est encore en place,
  `Indian/Antananarivo` serait juste.
- **Borner ou non la visibilité des croyants** dans la liste de saisie des
  dîmes. Elle est aujourd'hui volontairement large (EF-FIN-32) : un croyant
  verse là où il assiste au culte, pas là où il est inscrit.

---

## Reprendre la session

```bash
pnpm install      # installe aussi le hook pre-commit de détection de secrets
pnpm dev          # http://localhost:3000
pnpm dev:propre   # même chose, cache Turbopack vidé au préalable
pnpm verify       # lint + types + 573 tests + build
pnpm db:bucket    # le stockage ne se configure PAS en SQL
```

Lire avant toute tâche : `CLAUDE.md`, puis `notes/cdg.md` et `notes/plan.md`.
