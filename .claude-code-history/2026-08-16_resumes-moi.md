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

## À FAIRE EN PREMIER — la migration `0039`

`supabase/migrations/0039_finance_synthese.sql` **n'est pas appliquée**. Sans
elle, `/finances/synthese` ne peut rien calculer : les deux fonctions
`fn_finance_synthese_categories` et `fn_finance_synthese_soeurs` n'existent pas
encore en base.

```bash
# à passer dans l'éditeur SQL Supabase
supabase/migrations/0039_finance_synthese.sql
```

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

Les migrations `0023` à `0038` sont appliquées ; seule `0039` attend.

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
| **Synthèse périodique — EF-FIN-24** *(migration `0039` à appliquer)* | ✅ |

505 tests unitaires, 25 fichiers. `pnpm verify` vert.

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

### Finances, hors dîmes
- **EF-FIN-22** — les filtres de `/finances` couvrent le sens et le statut ;
  manquent la période, la catégorie, l'auteur, la plage de montants et
  l'origine (directe / déléguée).
- **EF-FIN-25** *(Should)* — l'export Excel/CSV/PDF des mouvements et synthèses.
- **EF-FIN-26** *(Could)* — le verrouillage d'une période clôturée.

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
pnpm verify       # lint + types + 478 tests + build
pnpm db:bucket    # le stockage ne se configure PAS en SQL
```

Lire avant toute tâche : `CLAUDE.md`, puis `notes/cdg.md` et `notes/plan.md`.
