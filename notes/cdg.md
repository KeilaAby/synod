# Cahier des charges — **SYNOD**
### Plateforme web de gestion et de pilotage d'une organisation ecclésiale

| | |
|---|---|
| **Nom du produit** | **SYNOD** |
| **Version du document** | 1.1 |
| **Date** | 6 août 2026 |
| **Sources** | `Brouillon.md` (spécification métier), `.agents/rules/designrules.md` (stack & design system), maquettes de référence *Stratrack* (langage visuel), arbitrages du 6 août 2026 |
| **Statut** | Pour validation |

### Journal des modifications

| Version | Modifications |
|---|---|
| **1.0** | Version initiale |
| **1.1** | **ARB-1** nom retenu : SYNOD · **ARB-2** finances en recettes **et** dépenses, calcul du **solde disponible**, **saisie déléguée** par le Siège, introduction du niveau **Siège** dans la hiérarchie · **ARB-3** **workflow de validation financière** activable par le SuperAdmin + **habilitations fines délégables** · **ARB-4** **workflow d'approbation des transferts** rendu obligatoire · **ARB-5** fenêtre « nouveaux baptisés » fixée à **15 jours** · **ARB-7** multi-devises retiré du périmètre · **ARB-8** Supabase retenu avec **exigence de portabilité** des données · **Nouveau module : Générateur de rapports** |

---

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Périmètre](#2-périmètre)
3. [Glossaire métier](#3-glossaire-métier)
4. [Acteurs, rôles et habilitations](#4-acteurs-rôles-et-habilitations)
5. [Exigences fonctionnelles](#5-exigences-fonctionnelles)
6. [Règles de gestion](#6-règles-de-gestion)
7. [Exigences non fonctionnelles](#7-exigences-non-fonctionnelles)
8. [Exigences UI / UX](#8-exigences-ui--ux)
9. [Contraintes techniques](#9-contraintes-techniques)
10. [Livrables et jalons](#10-livrables-et-jalons)
11. [Critères d'acceptation](#11-critères-dacceptation)
12. [Risques, hypothèses et arbitrages](#12-risques-hypothèses-et-arbitrages)

---

## 1. Contexte et objectifs

### 1.1 Contexte

L'organisation ecclésiale est structurée en six niveaux hiérarchiques (Siège → Régional → District → Paroisse → Église → Cellule de prière) au bas desquels se trouvent les croyants. Aujourd'hui, la collecte des effectifs, la composition des bureaux et le suivi des finances sont réalisés de manière décentralisée et hétérogène, ce qui rend la consolidation au niveau du Siège lente, partielle et peu fiable.

### 1.2 Objectifs

| Réf. | Objectif | Indicateur de réussite |
|---|---|---|
| **OBJ-1** | Disposer d'un **référentiel unique** de la structure ecclésiale et des croyants | 100 % des entités et croyants saisis dans une seule base |
| **OBJ-2** | **Décentraliser la saisie** vers les entités tout en gardant le contrôle au Siège | Chaque entité (hors Cellule) saisit ses propres données selon ses habilitations |
| **OBJ-3** | **Consolider automatiquement** les effectifs et les finances par périmètre hiérarchique | Tableau de bord temps réel, solde disponible consolidé sans retraitement manuel |
| **OBJ-4** | Assurer la **traçabilité** des bureaux, des transferts et des mouvements financiers | Historique complet, approbations horodatées, journal d'audit exportable |
| **OBJ-5** | Offrir un **pilotage visuel configurable** adapté à chaque niveau | Chaque utilisateur compose son tableau de bord et ses rapports |
| **OBJ-6** | Garantir la **maîtrise et la portabilité** du patrimoine de données | Export complet et restauration vérifiée chez un hébergeur tiers |

### 1.3 Principes directeurs

1. **Flexibilité** — structure, référentiels, habilitations, tableaux de bord et rapports s'adaptent à l'organisation sans intervention de développeur.
2. **Simplicité** — un utilisateur non technique doit réussir une saisie de croyant sans formation.
3. **Rapidité** — les écrans les plus utilisés répondent en moins d'une seconde.
4. **Sécurité** — cloisonnement strict des données par périmètre hiérarchique.
5. **Visualisation** — les hiérarchies (entités, bureaux) sont représentées via **React Flow**.
6. **Souveraineté** — aucune donnée n'est prisonnière de l'hébergeur *(ARB-8)*.

---

## 2. Périmètre

### 2.1 Dans le périmètre (V1)

- Gestion de la hiérarchie des entités sur **6 niveaux**, Siège inclus.
- Gestion des croyants, de leurs transferts et du **workflow d'approbation** associé.
- Référentiels administrables : Grades, Nationalités, Fonctions, Catégories financières.
- Gestion des Bureaux (mandats, membres, fonctions) pour chaque entité.
- **Finances en recettes et dépenses**, calcul du **solde disponible**, **saisie déléguée** par le Siège, **workflow de validation activable**.
- Saisie et remontée des **nouveaux baptisés**.
- Tableaux de bord **configurables** pour le Siège et pour chaque entité.
- **Générateur de rapports** flexible (composition par blocs, export PDF) pour le Siège et pour chaque entité.
- Gestion des comptes, des rôles et des **habilitations fines délégables**.
- Visualisation des hiérarchies en organigramme (React Flow).
- Exports (Excel / CSV / PDF), corbeille, journal d'audit et **export intégral portable**.

### 2.2 Hors périmètre (V1)

- Application mobile native (le web responsive couvre le besoin V1).
- Paiement ou collecte de dîmes en ligne (mobile money, carte).
- Gestion des événements, cultes, programmes et présences.
- Comptabilité générale normée (plan comptable, bilan, grand livre, lettrage).
- Messagerie interne, SMS et campagnes e-mail.
- **Multi-devises avec taux de change historisés** — *retiré sur arbitrage ARB-7*. L'application fonctionne en **devise unique paramétrable** (XOF par défaut).
- Multi-organisation (SaaS multi-tenant) — l'architecture doit néanmoins **ne pas l'interdire**.

---

## 3. Glossaire métier

| Terme | Définition |
|---|---|
| **Entité** | Nœud de la structure ecclésiale : Siège, Régional, District, Paroisse, Église ou Cellule. Possède un **nom** et un **code** d'au moins 3 caractères. |
| **Siège** | Niveau 1, racine **unique** de la hiérarchie. Administré par le SuperAdmin. Dispose de son propre Bureau et de ses propres finances *(ARB-2)*. |
| **Régional** | Niveau 2. Composé de Districts. |
| **District** | Niveau 3. Composé de Paroisses. |
| **Paroisse** | Niveau 4. Composée d'Églises. |
| **Église** | Niveau 5. Composée de Cellules. **Rattachement obligatoire de tout croyant.** |
| **Cellule de prière** | Niveau 6. Rattachement **facultatif** d'un croyant. Ne dispose **pas** d'un accès à la plateforme. |
| **Croyant** | Personne physique membre de l'organisation, rattachée à une Église. |
| **Grade** | Statut ecclésial du croyant (Diacre, Pasteur, Croyant…). Référentiel administrable. |
| **Nationalité** | Nationalité du croyant (Béninoise, Française, Malienne…). Référentiel administrable. |
| **Fonction** | Rôle occupé au sein d'un Bureau (Président, Secrétaire, Trésorier, Directeur des finances…). Référentiel administrable. |
| **Bureau** | Instance dirigeante d'une entité, composée de croyants occupant chacun une Fonction, sur un **mandat** daté. |
| **Membre de bureau** | Croyant titulaire d'une Fonction dans un Bureau. |
| **Membre de finances** | Membre de bureau dont la Fonction porte l'indicateur **fonction financière**. |
| **Mouvement financier** | Ligne de **recette** ou de **dépense** rattachée à une entité et à une catégorie. |
| **Solde disponible** | `Σ recettes validées − Σ dépenses validées` sur une entité et l'ensemble de son sous-arbre, pour une période donnée. |
| **Saisie déléguée** | Mouvement financier saisi par le Siège **pour le compte** d'une entité dans l'impossibilité de saisir ou dépourvue d'accès à l'application *(ARB-2)*. |
| **Workflow de validation** | Circuit `Brouillon → Soumis → Validé` applicable aux mouvements financiers, **activable par le SuperAdmin** *(ARB-3)*. |
| **Workflow d'approbation** | Circuit de demande/approbation applicable aux transferts inter-entités *(ARB-4)*. |
| **Périmètre** | Sous-arbre de la hiérarchie visible par un utilisateur (son entité et tous ses descendants). |
| **Habilitation** | Droit unitaire accordé à un compte, éventuellement **restreint à une sous-structure** du périmètre. |
| **Délégation d'habilitation** | Faculté, pour un Administrateur d'entité, d'accorder à un compte de son périmètre un sous-ensemble des droits qu'il détient lui-même *(ARB-3)*. |
| **Nouveau baptisé** | Croyant dont la date de baptême remonte à **15 jours ou moins** *(ARB-5)*. |
| **Modèle de rapport** | Composition réutilisable de blocs (titre, texte, indicateur, tableau, graphique, jauge, frise, organigramme) définissant la structure d'un rapport. |
| **Rapport généré** | Instance figée d'un modèle, produite sur un périmètre et une période donnés, exportable en PDF. |

---

## 4. Acteurs, rôles et habilitations

### 4.1 Cartographie des acteurs

| Acteur | Description | Périmètre de données |
|---|---|---|
| **SuperAdmin (Siège)** | Administrateur national. Configure la structure, les référentiels, les comptes, les habilitations et les options globales. Peut saisir en délégation pour toute entité. | **Totalité** de la hiérarchie |
| **Administrateur d'entité** | Responsable d'un Régional, District, Paroisse ou Église. Gère les données de son périmètre et **délègue des habilitations** aux comptes de son périmètre. | Son entité **et ses descendants** |
| **Opérateur de saisie** | Compte rattaché à une entité, limité à la saisie (croyants, baptisés, mouvements financiers). | Son entité et ses descendants |
| **Lecteur** | Consultation, rapports et export uniquement. | Son entité et ses descendants |

> **EF-ACT-1** — Les **Cellules ne disposent d'aucun compte** d'accès à la plateforme. Leurs données sont saisies par l'Église parente.
> **EF-ACT-2** — Le compte SuperAdmin est rattaché à l'entité **Siège**, ce qui lui confère naturellement un périmètre couvrant toute la hiérarchie.

### 4.2 Catalogue des habilitations

Les habilitations sont **unitaires**, regroupées par catégorie, et chacune peut être **restreinte à une sous-structure** du périmètre du compte *(habilitations fines — ARB-3)*.

| Catégorie | Clé | Libellé |
|---|---|---|
| **Structure** | `entity.read` · `entity.create` · `entity.update` · `entity.delete` | Consulter / créer / modifier / supprimer une entité |
| **Croyants** | `croyant.read` · `croyant.create` · `croyant.update` · `croyant.delete` · `croyant.transfer` · `transfer.approve` · `bapteme.create` | Gestion des croyants, demande et **approbation** de transfert, saisie des baptisés |
| **Bureaux** | `bureau.read` · `bureau.manage` | Consulter / gérer les bureaux et mandats |
| **Finances** | `finance.read` · `finance.create` · `finance.update` · `finance.submit` · `finance.validate` · `finance.delegate` | Consulter, saisir, modifier un brouillon, **soumettre**, **valider**, **saisir pour le compte d'une autre entité** |
| **Rapports** | `report.read` · `report.create` · `report.publish` · `report.template.manage` | Consulter, composer, publier un rapport, gérer les modèles partagés |
| **Pilotage** | `dashboard.configure` · `export.data` | Personnaliser son tableau de bord, exporter |
| **Administration** | `referentiel.manage` · `user.manage` · `permission.delegate` · `settings.manage` · `audit.read` · `trash.restore` | Référentiels, comptes, **délégation d'habilitations**, paramètres globaux, audit, corbeille |

### 4.3 Matrice rôles × habilitations

| Habilitation | SuperAdmin | Admin entité | Opérateur | Lecteur |
|---|:---:|:---:|:---:|:---:|
| `entity.read` | ✅ | ✅ | ✅ | ✅ |
| `entity.create` · `entity.update` | ✅ | ⚙️ | ❌ | ❌ |
| `entity.delete` | ✅ | ❌ | ❌ | ❌ |
| `croyant.read` | ✅ | ✅ | ✅ | ✅ |
| `croyant.create` · `croyant.update` | ✅ | ⚙️ | ⚙️ | ❌ |
| `croyant.delete` | ✅ | ⚙️ | ❌ | ❌ |
| `croyant.transfer` | ✅ | ⚙️ | ❌ | ❌ |
| `transfer.approve` | ✅ | ⚙️ | ❌ | ❌ |
| `bapteme.create` | ✅ | ⚙️ | ⚙️ | ❌ |
| `bureau.read` | ✅ | ✅ | ✅ | ✅ |
| `bureau.manage` | ✅ | ⚙️ | ❌ | ❌ |
| `finance.read` | ✅ | ⚙️ | ⚙️ | ⚙️ |
| `finance.create` · `finance.update` | ✅ | ⚙️ | ⚙️ | ❌ |
| `finance.submit` | ✅ | ⚙️ | ⚙️ | ❌ |
| `finance.validate` | ✅ | ⚙️ | ❌ | ❌ |
| `finance.delegate` | ✅ | ❌ | ❌ | ❌ |
| `report.read` | ✅ | ✅ | ✅ | ✅ |
| `report.create` · `report.publish` | ✅ | ⚙️ | ⚙️ | ❌ |
| `report.template.manage` | ✅ | ⚙️ | ❌ | ❌ |
| `dashboard.configure` | ✅ | ✅ | ✅ | ✅ |
| `export.data` | ✅ | ⚙️ | ⚙️ | ⚙️ |
| `referentiel.manage` | ✅ | ❌ | ❌ | ❌ |
| `user.manage` | ✅ | ⚙️ | ❌ | ❌ |
| `permission.delegate` | ✅ | ⚙️ | ❌ | ❌ |
| `settings.manage` | ✅ | ❌ | ❌ | ❌ |
| `audit.read` | ✅ | ⚙️ | ❌ | ❌ |
| `trash.restore` | ✅ | ⚙️ | ❌ | ❌ |

**Légende** — ✅ toujours accordé · ⚙️ accordable (par le SuperAdmin, ou par un Administrateur d'entité dans les limites du §6 RG-24) · ❌ jamais accordé.

---

## 5. Exigences fonctionnelles

### 5.1 Module **Structure** (hiérarchie des entités)

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-STR-01** | Créer, consulter, modifier et supprimer (logiquement) une entité de type Siège, Régional, District, Paroisse, Église ou Cellule. | **Must** |
| **EF-STR-02** | Toute entité porte un **nom** et un **code** d'au moins 3 caractères, **unique** dans toute l'application. Le code est **attribué automatiquement à la création** au format `<PRÉFIXE>-<séquence de 4 chiffres>` — `SG`, `REG`, `DIS`, `PAR`, `EGL`, `CEL` selon le niveau — et reste modifiable ensuite (reprise de codes existants). | **Must** |
| **EF-STR-03** | Toute entité, sauf le Siège, référence obligatoirement une entité parente **du niveau immédiatement supérieur**. Le Siège est **unique** et n'a pas de parent. | **Must** |
| **EF-STR-04** | Visualiser l'arborescence complète sous forme d'**organigramme interactif React Flow** : zoom, déplacement, repli/dépliage d'une branche, mini-carte, recherche et centrage sur un nœud. | **Must** |
| **EF-STR-05** | Chaque nœud affiche : nom, code, type, effectif de croyants du sous-arbre, présence d'un bureau actif et **solde disponible** *(si l'utilisateur détient `finance.read`)*. | **Must** |
| **EF-STR-06** | Naviguer d'un nœud vers la fiche entité (onglets : Informations, Sous-entités, Croyants, Bureau, Finances, Rapports, Statistiques). | **Must** |
| **EF-STR-07** | **Rattacher une entité à un nouveau parent**. L'opération déplace tout le sous-arbre et est journalisée. | **Should** |
| **EF-STR-08** | Interdire la suppression d'une entité possédant des sous-entités, des croyants, un bureau ou des mouvements financiers non archivés ; proposer une désactivation. | **Must** |
| **EF-STR-09** | Rechercher et filtrer les entités par type, parent, code, nom et statut. | **Must** |
| **EF-STR-10** | Marquer une entité comme **« sans accès à l'application »**, ce qui autorise la saisie déléguée par le Siège et la signale dans les écrans de saisie *(ARB-2)*. | **Must** |
| **EF-STR-11** | Importer une structure initiale depuis Excel/CSV (modèle fourni), avec rapport d'erreurs ligne à ligne avant validation. | **Should** |
| **EF-STR-12** | Exporter la structure (Excel/CSV) et l'organigramme (PDF/PNG). | **Should** |

### 5.2 Module **Croyants**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-CRO-01** | Créer un croyant avec : photo *(facultatif)*, **nom**, **prénom**, statut marital *(facultatif)*, e-mail *(facultatif)*, téléphone *(facultatif)*, **sexe**, **date de naissance**, date de baptême *(facultatif — voir note)*, **adresse**, **église d'appartenance**, cellule *(facultatif)*, **grade**, **nationalité**. | **Must** |
| **EF-CRO-01b** | La saisie se fait en **trois étapes** — identité, coordonnées, rattachement ecclésial — avec une frise de progression et validation au passage de chaque étape. | **Should** |

> **Note — date de baptême.** `Brouillon.md` la donnait obligatoire. Rendue
> **facultative** le 6 août 2026 sur décision de l'utilisateur : une fiche se crée
> souvent avant que la date ne soit connue (reprise d'un registre papier, croyant
> en préparation). Conséquence sur **RG-30** : un croyant sans date de baptême
> n'entre jamais dans les « nouveaux baptisés ».
| **EF-CRO-02** | Attribuer automatiquement un **matricule unique et immuable** au format `<INITIALES>-<SÉQUENCE 5 chiffres>-<AA>`, ex. `MNK-00001-26` : initiales du nom puis du prénom (**3 au plus**), séquence, deux derniers chiffres de l'année d'enregistrement. *(Format arrêté le 6 août 2026 : le précédent, fondé sur le code d'église, était trop long à lire et à recopier sur un registre papier.)* | **Must** |
| **EF-CRO-03** | La cellule sélectionnable appartient obligatoirement à l'église choisie (liste filtrée dynamiquement). | **Must** |
| **EF-CRO-04** | Lister les croyants avec pagination serveur, tri multi-colonnes et filtres combinables : entité (tout niveau), sexe, grade, nationalité, statut marital, tranche d'âge, période de baptême, présence en cellule, statut. | **Must** |
| **EF-CRO-05** | Rechercher en texte libre (nom, prénom, matricule, téléphone, e-mail) avec tolérance aux fautes de frappe. | **Must** |
| **EF-CRO-06** | Consulter une fiche complète : identité, rattachements, grade, historique des transferts, fonctions occupées en bureau. | **Must** |
| **EF-CRO-07** | Modifier un croyant ; toute modification est journalisée (champ, ancienne valeur, nouvelle valeur, auteur, horodatage). | **Must** |
| **EF-CRO-08** | Supprimer logiquement (corbeille) et restaurer. La suppression définitive est réservée au SuperAdmin. | **Must** |
| **EF-CRO-09** | Téléverser une photo (JPEG/PNG/WebP, ≤ 5 Mo), redimensionnée et recadrée côté client. | **Should** |
| **EF-CRO-10** | Gérer le statut : `ACTIF`, `INACTIF`, `TRANSFÉRÉ`, `DÉCÉDÉ`. Les croyants non actifs sont exclus des effectifs par défaut. | **Must** |
| **EF-CRO-11** | Importer un lot de croyants depuis **CSV** avec **correspondance de colonnes**, pré-validation et rapport d'erreurs ligne à ligne. Aucun modèle de fichier n'est imposé : les colonnes de l'utilisateur sont lues et il désigne ce qu'elles contiennent. Les églises, grades et nationalités se résolvent par **libellé ou par code**. *(XLSX livré le 9 août 2026 : lecteur sans dépendance, `lib/domain/xlsx.ts` — voir ARB-6.)* | **Should** |
| **EF-CRO-12** | Exporter la liste filtrée (Excel/CSV) et la fiche individuelle (PDF). | **Should** |
| **EF-CRO-13** | Détecter les doublons potentiels (même nom + prénom + date de naissance) et demander une confirmation explicite. | **Should** |

### 5.3 Module **Transferts** *(workflow d'approbation — ARB-4)*

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-TRF-01** | Transférer un croyant d'une **cellule**, **église**, **paroisse**, **district** ou **régional** à un(e) autre. | **Must** |
| **EF-TRF-02** | Un transfert au-dessus du niveau Église impose de désigner l'**église de destination** ; les rattachements sont recalculés en cascade. | **Must** |
| **EF-TRF-03** | Tout transfert suit un **workflow d'approbation** : `Demandé → Approuvé → Effectué`, ou `Demandé → Refusé (motivé)`. Aucun transfert n'est appliqué avant approbation. | **Must** |
| **EF-TRF-04** | L'approbateur est un compte détenant `transfer.approve` dont le périmètre couvre **à la fois** l'entité d'origine et l'entité de destination — c'est-à-dire le plus petit ancêtre commun ou un de ses ascendants. Le SuperAdmin peut toujours approuver. | **Must** |
| **EF-TRF-05** | Un transfert **interne au périmètre** de l'utilisateur qui le demande, et dont l'utilisateur détient `transfer.approve`, est auto-approuvé en une seule étape, sans perte de traçabilité. | **Must** |
| **EF-TRF-06** | Un transfert enregistre : date de demande, date effective, entité d'origine, entité de destination, motif, demandeur, approbateur, décision. | **Must** |
| **EF-TRF-07** | Notifier les approbateurs concernés des demandes en attente (indicateur dans la barre de navigation + liste dédiée). | **Must** |
| **EF-TRF-08** | Consulter l'**historique complet** des transferts d'un croyant et le journal global, filtrable par période, entité et statut. | **Must** |
| **EF-TRF-09** | Un transfert effectif **clôt** les mandats de bureau détenus dans le sous-arbre d'origine — et **n'en accorde aucun** à la destination, qui désigne si elle le souhaite. Ne sont clos que les mandats que la destination ne couvre pas : un transfert entre deux églises d'une même paroisse ne démet personne du bureau de cette paroisse. *(Précisé le 7 août 2026.)* | **Must** |
| **EF-TRF-10** | Annuler une demande tant qu'elle n'est pas approuvée. | **Should** |
| **EF-TRF-11** | Transférer un lot de croyants en une seule demande (ex. scission d'une cellule). | **Could** |

### 5.4 Module **Référentiels**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-REF-01** | Gérer le référentiel **Grade** (libellé, code, ordre, actif/inactif) — Diacre, Pasteur, Croyant… | **Must** |
| **EF-REF-02** | Gérer le référentiel **Nationalité** (libellé, code ISO, actif/inactif) — Béninoise, Française, Malienne… | **Must** |
| **EF-REF-03** | Gérer le référentiel **Fonction** (libellé, code, catégorie, ordre protocolaire, **indicateur « fonction financière »**, niveaux d'entité applicables) — Président, Secrétaire, Trésorier, Directeur des finances, Directeur des communications, Directeur des œuvres… | **Must** |
| **EF-REF-04** | Gérer le référentiel **Catégorie financière** (libellé, code, **sens recette/dépense**, ordre, actif/inactif) — Dîme, Quête, Offrande, Don *(recettes)* ; Charges, Travaux, Aides, Fonctionnement *(dépenses)*. | **Must** |
| **EF-REF-05** | Interdire la suppression d'une valeur utilisée ; proposer une désactivation qui la masque des nouvelles saisies sans altérer l'historique. | **Must** |
| **EF-REF-06** | Réserver la gestion des référentiels au SuperAdmin (`referentiel.manage`). | **Must** |

### 5.5 Module **Bureaux**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-BUR-01** | Créer et gérer un Bureau pour **chaque entité** — Siège, Régional, District, Paroisse, Église, Cellule. | **Must** |
| **EF-BUR-02** | Un Bureau porte un **nom** — « Bureau exécutif », « Comité des finances » — et un **mandat** : date de début, date de fin *(facultative)*, statut. Une entité peut avoir **plusieurs bureaux**, mais **un seul mandat actif par bureau**. Rouvrir un bureau du même nom clôt le mandat précédent et permet d'en reconduire la composition. | **Must** |
| **EF-BUR-03** | Composer un Bureau en associant, à chaque **Fonction**, un **croyant** existant. Un membre de bureau est **obligatoirement** un croyant enregistré. | **Must** |
| **EF-BUR-04** | Un croyant peut n'avoir **aucune** fonction : l'appartenance à un bureau est facultative. | **Must** |
| **EF-BUR-05** | Une même Fonction n'est occupée que par **un seul croyant** dans un bureau à une date donnée. | **Must** |
| **EF-BUR-06** | Le croyant désigné doit appartenir au **périmètre de l'entité** concernée. | **Must** |
| **EF-BUR-07** | **Dessiner** l'organigramme d'un bureau en React Flow : poser les fonctions applicables depuis une palette, les positionner librement, tracer les liens de dépendance, désigner un titulaire par glisser-déposer. Fonctions vacantes visibles. *(Révisé le 9 août 2026 : l'exigence disait « ordonné par rang protocolaire ». Le rang a été supprimé — voir `0022` — parce que l'organigramme se dessine désormais et que plus rien n'en dépendait. Chaque bureau porte sa propre hiérarchie dans `bureau_postes` ; l'ordre alphabétique classe les listes, sans prétendre exprimer une préséance.)* *(Précisé le 20 août 2026 : le rang **revient** au référentiel — migration `0061` —, mais pour l'**ordre d'affichage des listes** et lui seul. Ce que la `0022` avait retiré, c'est un rang qui **prétendait dire** la hiérarchie ; l'organigramme continue de se dessiner, et `bureau_postes` reste la seule source de préséance d'un bureau. EF-REF-03, qui n'avait jamais été amendée, redevient de ce fait conforme.)* | **Must** |
| **EF-BUR-08** | Remplacer un membre en cours de mandat : clôture du mandat individuel, création du suivant, historique conservé. | **Must** |
| **EF-BUR-09** | Clore un mandat et en ouvrir un nouveau, avec **reconduction** de la composition précédente en un clic. | **Should** |
| **EF-BUR-10** | Consulter, pour un croyant, l'ensemble des fonctions occupées (entité, fonction, période). | **Must** |
| **EF-BUR-11** | Exporter l'organigramme d'un bureau (PDF). *(Livré le 9 août 2026 : redessiné en SVG vectoriel — `lib/domain/organigramme-svg.ts` — et remis à l'impression du navigateur, qui sait enregistrer en PDF. Aucune dépendance. **L'export Excel de la composition est abandonné le 12 août 2026** : le PDF de l'organigramme couvre le besoin, et une seconde sortie du même contenu se serait désynchronisée de la première.)* | **Should — clos** |

### 5.6 Module **Finances** *(recettes, dépenses et solde — ARB-2 / ARB-3)*

#### 5.6.1 Saisie et périmètre

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-FIN-01** | Saisir un mouvement financier rattaché à **une entité** et à **une catégorie**, avec : sens *(déduit de la catégorie)*, montant, date d'opération, libellé, référence, pièce jointe *(facultative)*. | **Must** |
| **EF-FIN-02** | Une entité saisit **recettes et dépenses** dans la **stricte limite de son périmètre** : son entité et ses descendants, jamais au-delà. | **Must** |
| **EF-FIN-03** | Créer et gérer les finances pour **chaque entité** — Siège, Régional, District, Paroisse, Église, Cellule. | **Must** |
| **EF-FIN-04** | Le **Siège dispose de ses propres finances** : le SuperAdmin y enregistre les recettes et dépenses propres au Siège. | **Must** |
| **EF-FIN-05** | Le SuperAdmin peut enregistrer un mouvement **pour le compte d'une entité** (`finance.delegate`) qui est dans l'impossibilité de saisir ou qui n'a pas accès à l'application. Le mouvement est rattaché à l'entité bénéficiaire, et **marqué « saisie déléguée »** avec mention de l'auteur réel. | **Must** |
| **EF-FIN-06** | Signaler visuellement, dans les listes et les rapports, les mouvements issus d'une saisie déléguée. | **Must** |
| **EF-FIN-07** | Téléverser une pièce justificative (PDF/JPEG/PNG, ≤ 10 Mo) par mouvement. | **Should** |
| **EF-FIN-08** | Saisir en série (« Enregistrer et saisir un autre ») en conservant entité, catégorie et date. | **Should** |

#### 5.6.2 Solde disponible

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-FIN-09** | Calculer le **solde disponible** d'une entité : `Σ recettes validées − Σ dépenses validées`, sur l'entité **et l'ensemble de son sous-arbre**. | **Must** |
| **EF-FIN-10** | Afficher, pour toute entité, le triptyque **Recettes / Dépenses / Solde** sur la période sélectionnée, ainsi que le solde cumulé depuis l'origine. | **Must** |
| **EF-FIN-11** | Rendre le **solde disponible de chaque entité visible par le SuperAdmin**, en consolidé comme en détail entité par entité, avec classement et détection des soldes négatifs. | **Must** |
| **EF-FIN-12** | Distinguer, dans l'affichage du solde, la part **propre à l'entité** de la part **consolidée du sous-arbre**. | **Should** |
| **EF-FIN-13** | Alerter visuellement (badge `Critique`) toute entité dont le solde de la période est négatif. | **Should** |

#### 5.6.3 Workflow de validation *(ARB-3)*

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-FIN-14** | Implémenter un **workflow de validation** des mouvements : `Brouillon → Soumis → Validé`, avec `Rejeté (motivé)` et `Annulé (motivé)`. | **Must** |
| **EF-FIN-15** | Le workflow est **activable et désactivable par entité**, en plus du réglage global qui sert de valeur par défaut. *(Amendé le 12 août 2026 : l'exigence d'origine le voulait uniquement global. Une église de trois personnes n'a personne pour valider ce qu'une autre a saisi, quand un district structuré l'exige — un réglage unique alignait toute l'organisation sur son maillon le moins outillé. Le réglage d'une entité est **hérité** par sa descendance tant que celle-ci n'a rien décidé, sans quoi activer le workflow sur un district demanderait de le poser une à une sur ses vingt églises, et la vingt-et-unième créée le mois suivant serait passée au travers en silence.)* | **Must** |
| **EF-FIN-16** | **Workflow désactivé** : un mouvement saisi par un compte détenant `finance.create` est immédiatement validé et alimente les consolidations. | **Must** |
| **EF-FIN-17** | **Workflow activé** : la validation s'effectue **impérativement au niveau des entités**. Le validateur est un compte détenant `finance.validate` dont le périmètre couvre l'entité du mouvement ; le Siège ne se substitue pas à l'entité, sauf pour les mouvements en **saisie déléguée** et pour ses propres mouvements. | **Must** |
| **EF-FIN-18** | Un compte ne peut valider un mouvement **qu'il a lui-même soumis** que s'il détient explicitement le droit de double rôle ; par défaut, la séparation saisie/validation est appliquée. | **Should** |
| **EF-FIN-19** | Seuls les mouvements au statut **Validé** alimentent le solde, les tableaux de bord et les rapports. | **Must** |
| **EF-FIN-20** | Un mouvement **Validé est immuable** : seule une **annulation motivée** est possible ; la ligne d'origine est conservée et l'annulation est journalisée. | **Must** |
| **EF-FIN-21** | Notifier les validateurs des mouvements en attente (indicateur de navigation + file de validation dédiée avec traitement par lot). | **Must** |

#### 5.6.4 Consultation et synthèse

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-FIN-22** | Lister et filtrer les mouvements par entité, sens, catégorie, période, statut, auteur, plage de montants et origine (saisie directe / déléguée). | **Must** |
| **EF-FIN-23** | Consolider automatiquement les montants d'une entité **et de son sous-arbre**, par sens, catégorie et période. | **Must** |
| **EF-FIN-24** | Produire une **synthèse périodique** (mensuelle, trimestrielle, annuelle) : recettes et dépenses par catégorie, évolution du solde, comparatif entre entités sœurs. | **Must** |
| **EF-FIN-25** | Exporter mouvements et synthèses (Excel/CSV/PDF). | **Should** |
| **EF-FIN-26** | Verrouiller une période clôturée : aucune saisie ni modification rétroactive sans réouverture par le SuperAdmin. | **Could** |
| **EF-FIN-27** | **Dîmes — saisie détaillée par croyant.** Chaque croyant dispose d'une **enveloppe numérotée** qui lui est propre ; le membre du bureau qui reçoit la dîme lui remet un **reçu numéroté**. L'église tient ainsi le détail de ce qu'elle a **collecté**. *(Ajouté le 12 août 2026 — conception dans `plan.md` §4.bis.)* | **Must** |
| **EF-FIN-28** | Le formulaire des dîmes admet **deux modes** — *détaillé* (numéro d'enveloppe et montant par croyant, reçu émis) et *global* (un seul montant pour la collecte) —, administrés par le SuperAdmin et **réglés église par église**, sans héritage depuis la hiérarchie. | **Must** |
| **EF-FIN-29** | **Une dîme n'est jamais une recette de l'église qui la collecte.** Elle appartient au **Siège**, à qui elle est remise **en mains propres**. L'église en tient le détail et en délivre les reçus, mais la dîme **n'entre pas dans son solde** : ni recette, ni ressource mobilisable pour ses dépenses. *(Ajouté le 12 août 2026.)* | **Must** |
| **EF-FIN-30** | La dîme est **comptabilisée au Siège** comme recette propre, et y finance ses dépenses au même titre que toute autre recette. Elle n'alimente le solde du Siège qu'une fois **reçue** — la remise physique est ce que constate la validation. | **Must** |
| **EF-FIN-31** | Le **détail d'une collecte reste consultable par l'église** qui l'a effectuée — reçus, enveloppes, montants par croyant — et par sa hiérarchie, sans pour autant figurer à son solde. Une église doit pouvoir répondre à un croyant qui demande la trace de sa dîme. | **Must** |
| **EF-FIN-32** | **Tout croyant peut verser sa dîme dans n'importe quelle entité collectrice**, et non seulement dans le sous-arbre de celle-ci : un croyant de passage assiste au culte d'une autre église et y remet son enveloppe. La liste proposée à la saisie n'est donc bornée que par l'**habilitation** du saisissant, jamais par la hiérarchie. *(Amende EF-FIN-30, le 13 août 2026.)* | **Must** |
| **EF-FIN-33** | **Versements anonymes.** Une collecte comprend des enveloppes **sans nom** — numérotées mais non attribuées — et des espèces déposées **en vrac** dans l'urne, sans enveloppe. Les deux entrent dans le total de la collecte et n'ouvrent aucun reçu nominatif. | **Must** |
| **EF-FIN-34** | **Import d'une feuille de versements** (Excel/CSV). Les noms et prénoms sont **rapprochés** du fichier des croyants comme à l'import de croyants (EF-CRO-11). Une ligne **portant un nom** mais sans correspondance est conservée et présentée dans une zone dédiée de `/croyants`, où elle se résout — rattachement à une fiche existante, ou création. Une ligne **sans nom** est simplement comptée comme **enveloppe anonyme** : il n'y a rien à rapprocher, et l'inscrire dans la file de résolution la remplirait de lignes qu'aucun travail ne peut clore. *(Précisé le 13 août 2026.)* | **Should** |
| **EF-FIN-35** | Le **numéro d'enveloppe d'un croyant peut changer** ; l'historique de ses versements est conservé avec le numéro **en vigueur au moment du versement**, et reste consultable depuis sa fiche — dîmes comme autres collectes (quête, don). | **Must** |

### 5.7 Module **Nouveaux baptisés**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-BAP-01** | Permettre à une entité de saisir les informations des **nouveaux baptisés** via un formulaire dédié et simplifié. | **Must** |
| **EF-BAP-02** | La saisie d'un nouveau baptisé **crée le croyant correspondant** dans l'église concernée ; aucune double saisie. | **Must** |
| **EF-BAP-03** | Enregistrer les informations de baptême : date, lieu, **un ou plusieurs célébrants** *(croyants de grade Pasteur, Évangéliste ou Diacre)*, session ou cérémonie. *(Pluriel arrêté le 7 août 2026 : un baptême est fréquemment célébré à plusieurs — un pasteur assisté d'un diacre, deux pasteurs en cérémonie collective. Une colonne unique perdait le second sans rien signaler.)* | **Should** |
| **EF-BAP-04** | Rendre les nouveaux baptisés **immédiatement visibles** dans le tableau de bord du SuperAdmin (indicateur dédié + liste détaillée). | **Must** |
| **EF-BAP-05** | Un « nouveau baptisé » est un croyant baptisé depuis **15 jours ou moins** *(ARB-5)*. Ce seuil est **paramétrable** par le SuperAdmin. | **Must** |
| **EF-BAP-06** | Filtrer les nouveaux baptisés par période, entité, sexe et tranche d'âge. | **Must** |
| **EF-BAP-07** | Saisir un lot de baptisés issus d'une même cérémonie (formulaire multi-lignes). | **Should** |

### 5.8 Module **Tableaux de bord**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-DSH-01** | Fournir un tableau de bord au **SuperAdmin** couvrant l'ensemble de l'organisation. | **Must** |
| **EF-DSH-02** | Fournir un tableau de bord aux **entités**, strictement limité aux données de leur périmètre. | **Must** |
| **EF-DSH-03** | Le tableau de bord est **configurable et flexible** : chaque utilisateur choisit les indicateurs affichés, leur ordre et leur taille. *Exemple : le Siège n'affiche que le nombre de femmes et le nombre de croyants ; un District affiche le nombre de croyants, le nombre de femmes et le nombre de membres de bureau.* | **Must** |
| **EF-DSH-04** | Proposer au minimum : nombre de croyants, de cellules, d'églises, de paroisses, de districts, de régionaux, de femmes, d'hommes, de membres de bureau, de membres de finances, de nouveaux baptisés, **recettes**, **dépenses** et **solde disponible**. | **Must** |
| **EF-DSH-05** | Proposer des indicateurs analytiques complémentaires : répartition par grade, nationalité, tranche d'âge, sexe ; taux d'encellulement ; couverture des bureaux ; évolution des effectifs ; évolution du solde ; classement des entités filles ; transferts et mouvements en attente. | **Should** |
| **EF-DSH-06** | Chaque indicateur est réglable individuellement : périmètre, période, granularité, type de rendu (valeur, jauge, courbe, barres, camembert, tableau). | **Must** |
| **EF-DSH-07** | Réorganiser les widgets par **glisser-déposer** ; la configuration est persistée par utilisateur. | **Must** |
| **EF-DSH-08** | Fournir des **modèles de tableau de bord** prédéfinis par rôle, applicables en un clic ; le SuperAdmin peut imposer un modèle par défaut à un niveau donné. | **Should** |
| **EF-DSH-09** | Cliquer sur un indicateur ouvre la liste détaillée sous-jacente, filtres appliqués (*drill-down*). | **Should** |
| **EF-DSH-10** | Exporter le tableau de bord en PDF et chaque widget en image ou CSV. | **Should** |
| **EF-DSH-11** | Afficher un **squelette de chargement** calqué sur la grille finale — jamais d'écran blanc ni de spinner plein écran. | **Must** |
| **EF-DSH-12** | Masquer automatiquement les indicateurs dont l'habilitation requise n'est pas détenue (ex. finances). | **Must** |

### 5.9 Module **Générateur de rapports** *(nouveau)*

> Besoin exprimé : *« un Générateur de rapport flexible comme Stratrack, pour le Siège et pour chaque Entité »*.

#### 5.9.1 Composition

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-RAP-01** | Composer un rapport **sans écrire de code**, en assemblant des **blocs** dans un éditeur visuel par glisser-déposer. | **Must** |
| **EF-RAP-02** | Types de blocs disponibles : **titre**, **paragraphe de texte** *(champs dynamiques insérables)*, **indicateur** (carte de statistique), **tableau de données**, **graphique** (courbe, barres, camembert), **jauge**, **frise chronologique**, **organigramme** (structure ou bureau), **image**, **saut de page**, **bloc de signature**. | **Must** |
| **EF-RAP-03** | Chaque bloc de données puise dans les **sources** de l'application : croyants, entités, bureaux, finances, transferts, baptêmes — avec ses propres filtres (périmètre, période, catégorie, sexe, grade…). | **Must** |
| **EF-RAP-04** | Organiser les blocs en **sections** et régler leur largeur sur une grille (pleine largeur, demi, tiers). | **Must** |
| **EF-RAP-05** | Prévisualiser le rapport en **rendu paginé A4** fidèle au PDF final, en temps réel pendant la composition. | **Must** |
| **EF-RAP-06** | Personnaliser l'en-tête et le pied de page : logo de l'organisation, nom de l'entité, période, numérotation, mention de confidentialité. | **Should** |

#### 5.9.2 Modèles et portée

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-RAP-07** | Enregistrer une composition comme **modèle réutilisable**, propre à une entité ou **partagé** à tout ou partie de la hiérarchie. | **Must** |
| **EF-RAP-08** | Le SuperAdmin met à disposition des **modèles officiels** (`report.template.manage`) que les entités peuvent utiliser sans les modifier, ou dupliquer pour les adapter. | **Must** |
| **EF-RAP-09** | Une entité compose et enregistre **ses propres modèles**, visibles d'elle-même et, si elle le choisit, de ses descendants. | **Must** |
| **EF-RAP-10** | Un modèle déclare les **niveaux d'entité auxquels il s'applique** (ex. un modèle « Synthèse de district » n'est proposé qu'aux districts). | **Should** |
| **EF-RAP-11** | Dupliquer, renommer, archiver et versionner un modèle. | **Should** |

#### 5.9.3 Génération, sécurité et diffusion

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-RAP-12** | Générer un rapport en choisissant le **périmètre** (une entité du périmètre de l'utilisateur) et la **période**. | **Must** |
| **EF-RAP-13** | Un rapport n'expose **jamais** de données hors du périmètre de l'utilisateur qui le génère, quel que soit le modèle utilisé. Les blocs hors portée sont omis, pas remplis de zéros. | **Must** |
| **EF-RAP-14** | Un bloc dont l'habilitation requise n'est pas détenue (ex. finances) est **omis du rendu**, avec mention explicite en bas de page. | **Must** |
| **EF-RAP-15** | **Figer** un rapport généré : les données sont capturées à l'instant de la génération et ne changent plus, garantissant qu'un rapport diffusé reste reproductible. | **Must** |
| **EF-RAP-16** | **Exporter en PDF** en quelques secondes ; exporter les données sous-jacentes en Excel. | **Must** |
| **EF-RAP-17** | Consulter l'historique des rapports générés (modèle, périmètre, période, auteur, date) et retélécharger un PDF antérieur. | **Must** |
| **EF-RAP-18** | Publier un rapport pour le rendre consultable par les comptes du périmètre concerné (`report.publish`). | **Should** |
| **EF-RAP-19** | Programmer une génération **périodique** (mensuelle, trimestrielle) avec dépôt automatique dans l'historique. | **Could** |

### 5.10 Module **Administration, comptes et habilitations** *(ARB-3)*

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-ADM-01** | Créer un compte, le rattacher à **une entité** (jamais une Cellule) et lui attribuer un rôle servant de gabarit d'habilitations. | **Must** |
| **EF-ADM-02** | Attribuer et retirer les **habilitations unitaires** d'un compte, présentées **par catégorie** (Structure, Croyants, Bureaux, Finances, Rapports, Pilotage, Administration). | **Must** |
| **EF-ADM-03** | Restreindre une habilitation à une **sous-structure** du périmètre du compte (ex. `finance.create` limité à une seule paroisse du district). | **Must** |
| **EF-ADM-04** | **Déléguer l'administration des habilitations** : un Administrateur d'entité détenant `permission.delegate` accorde des droits aux comptes de son périmètre, **strictement dans la limite des droits qu'il détient lui-même et de son propre périmètre**. Aucune élévation de privilège n'est possible. | **Must** |
| **EF-ADM-05** | Définir des **profils d'habilitation** réutilisables (globaux au Siège, ou locaux à une entité) applicables en un clic à un compte. | **Should** |
| **EF-ADM-06** | Visualiser, pour un compte, la **provenance** de chaque droit : gabarit de rôle, profil appliqué, ou octroi individuel — avec l'auteur et la date. | **Should** |
| **EF-ADM-07** | Lier facultativement un compte à une **fiche croyant** existante. | **Should** |
| **EF-ADM-08** | Activer, désactiver et réinitialiser le mot de passe d'un compte. | **Must** |
| **EF-ADM-09** | Consulter un **journal d'audit** horodaté et immuable : connexions, créations, modifications, suppressions, transferts, approbations, validations financières, changements d'habilitation, générations de rapport. | **Must** |
| **EF-ADM-10** | Consulter et restaurer les éléments de la **corbeille** ; purge définitive réservée au SuperAdmin. | **Must** |
| **EF-ADM-11** | Configurer les **paramètres généraux** : nom de l'organisation, logo, devise, fuseau horaire, format de matricule, **fenêtre « nouveaux baptisés » (15 jours par défaut)**, **activation du workflow de validation financière**, séparation saisie/validation. | **Must** |
| **EF-ADM-12** | Déclencher un **export intégral portable** des données (§7.6) et consulter l'historique des exports. | **Must** |
| **EF-ADM-13** | **Centraliser dans l'administration tout ce qui est paramétrable.** Aucun seuil, aucune liste de valeurs autorisées, aucune option de comportement ne doit rester codée dans un écran ou une migration : ce qu'une organisation peut vouloir régler différemment se règle ici. *(Décidé le 7 août 2026.)* | **Must** |
| **EF-ADM-14** | Configurer les **grades habilités à célébrer un baptême**. Aujourd'hui codé en dur — `PASTEUR`, `ÉVANGÉLISTE`, `DIACRE` (`CODES_GRADE_CELEBRANT`) : une organisation dont la discipline diffère ne peut pas l'ajuster. | **Should** |
| **EF-ADM-15** | Rendre les **quatre référentiels** — grades, nationalités, fonctions, catégories financières — accessibles depuis l'administration. Leur CRUD existe depuis le lot 1 (EF-REF-01 à 04) mais rien ne l'y relie : le SuperAdmin ignore qu'il peut créer un grade. **Un renvoi, pas un second écran de saisie.** | **Must** |

### 5.11 Module **Authentification et compte personnel**

| Réf. | Exigence | Priorité |
|---|---|---|
| **EF-AUT-01** | S'authentifier par e-mail ou un matricule et mot de passe. | **Must** |
| **EF-AUT-02** | Réinitialiser son mot de passe par lien envoyé par e-mail (valide 60 minutes, usage unique) ou communiquer par le SuperAdmin. | **Must** |
| **EF-AUT-03** | Fermer la session automatiquement après 30 minutes d'inactivité. | **Must** |
| **EF-AUT-04** | Modifier son profil, son mot de passe et ses préférences d'affichage. | **Must** |
| **EF-AUT-05** | Consulter ses propres habilitations en lecture seule (transparence). | **Should** |
| **EF-AUT-06** | Proposer une double authentification (TOTP) pour les comptes SuperAdmin. | **Could** |

---

## 6. Règles de gestion

| Réf. | Règle |
|---|---|
| **RG-01** | La hiérarchie est strictement ordonnée : `Siège (1) > Régional (2) > District (3) > Paroisse (4) > Église (5) > Cellule (6)`. Un parent est **toujours** du niveau immédiatement supérieur. Aucun saut de niveau, aucun cycle. |
| **RG-02** | Le **code** d'une entité comporte **au moins 3 caractères** et est **unique** sur toute l'application. À défaut de valeur fournie, il est **généré par la base** : préfixe du niveau, puis séquence de 4 chiffres propre à ce niveau. La génération relève de la base et non du client — elle seule garantit l'unicité face à deux créations simultanées. |
| **RG-03** | Il existe **une et une seule** entité de type Siège, et elle est la racine de la hiérarchie. |
| **RG-04** | Tout croyant est rattaché à **exactement une Église**. Le rattachement à une **Cellule est facultatif**. |
| **RG-05** | Si une cellule est renseignée, elle doit être **fille directe de l'église** du croyant. |
| **RG-06** | Le **grade** et la **nationalité** proviennent obligatoirement des référentiels dédiés. |
| **RG-07** | Un **membre de bureau est obligatoirement un croyant** enregistré ; un croyant n'a **pas nécessairement** de fonction. |
| **RG-08** | Une **Fonction** est occupée par **au plus un croyant** dans un bureau donné à une date donnée. |
| **RG-09** | Un croyant désigné dans le bureau d'une entité appartient au **sous-arbre** de cette entité — autrement dit, l'entité est sur la **chaîne d'ascendants de son église**. Il peut donc cumuler des mandats à plusieurs niveaux — son église, sa paroisse, son district, son régional — et dans plusieurs bureaux d'une même entité. Il ne peut pas siéger dans une branche voisine. *(Confirmé le 7 août 2026 ; la variante « siéger au régional ouvre ses sous-entités » a été écartée : l'éligibilité aurait dépendu des mandats déjà détenus, et changé à la clôture de l'un d'eux.)* |
| **RG-10** | Une entité possède **au plus un mandat actif par bureau**. Elle peut en revanche faire coexister **plusieurs bureaux de noms différents** — Bureau exécutif, Comité des finances, Commission des jeunes. Les mandats antérieurs sont conservés. *(Corrigé le 7 août 2026 : la rédaction initiale — « au plus un bureau actif par entité » — interdisait au second bureau d'exister.)* |
| **RG-11** | Un **transfert** n'est appliqué qu'après **approbation**. Une fois effectif, il met à jour les rattachements, clôt les mandats de bureau de l'entité d'origine et crée une ligne d'historique. Il ne supprime jamais l'antériorité. |
| **RG-12** | L'**approbateur** d'un transfert détient `transfer.approve` et son périmètre couvre **simultanément** l'entité d'origine et l'entité de destination. Le SuperAdmin peut toujours approuver. |
| **RG-13** | Un mouvement financier porte un **sens** — recette ou dépense — **déduit de sa catégorie** et non modifiable après validation. |
| **RG-14** | Le **solde disponible** d'une entité vaut `Σ recettes validées − Σ dépenses validées` sur l'entité **et l'ensemble de son sous-arbre**, pour la période considérée. |
| **RG-15** | Une entité ne saisit de mouvement que **dans son périmètre**. Seul un compte détenant `finance.delegate` (le SuperAdmin) peut saisir pour le compte d'une entité hors de son propre rattachement ; le mouvement est alors marqué **saisie déléguée** et conserve l'identité de l'auteur réel. |
| **RG-16** | **Workflow de validation désactivé** : un mouvement saisi est immédiatement `Validé`. **Workflow activé** : un mouvement suit `Brouillon → Soumis → Validé`, et la validation s'effectue **au niveau de l'entité** du mouvement, par un compte détenant `finance.validate` dont le périmètre la couvre. |
| **RG-17** | Un mouvement au statut `Validé` est **immuable** : seule une annulation motivée est possible, et elle conserve la ligne d'origine. |
| **RG-18** | Seuls les mouvements `Validé` alimentent le solde, les tableaux de bord et les rapports. |
| **RG-33** | La **dîme est une recette du Siège**, jamais de l'église qui la collecte. L'église en tient le détail et en délivre les reçus ; le mouvement financier est rattaché au **Siège** et n'entre donc ni dans le solde de l'église, ni dans le consolidé de sa paroisse ou de son district. La **remise en mains propres** est ce que constate la validation : tant qu'elle n'a pas eu lieu, la dîme collectée ne compte au solde de personne. *(Ajoutée le 12 août 2026.)* |
| **RG-19** | Les statistiques consolidées n'agrègent que les croyants au statut `ACTIF`, sauf filtre contraire explicite. |
| **RG-20** | Un utilisateur ne voit et ne modifie **que** les données de son entité et de ses descendants. Le SuperAdmin, rattaché au Siège, couvre par construction toute la hiérarchie. |
| **RG-21** | Les **Cellules ne disposent d'aucun compte d'accès** à la plateforme. |
| **RG-22** | La suppression est **logique par défaut** (corbeille). La suppression définitive est réservée au SuperAdmin et journalisée. |
| **RG-23** | Une valeur de référentiel **utilisée** ne peut être supprimée ; elle est désactivée et reste lisible dans l'historique. |
| **RG-24** | **Délégation d'habilitation** : un compte ne peut accorder qu'un droit qu'il **détient lui-même**, à un compte de **son propre périmètre**, et pour une portée **incluse** dans la sienne. Toute tentative d'élévation de privilège est rejetée et journalisée. |
| **RG-25** | Un droit **restreint à une sous-structure** ne s'applique qu'à celle-ci et à ses descendants, jamais au reste du périmètre du compte. |
| **RG-26** | Un **rapport** n'expose jamais de données hors du périmètre de l'utilisateur qui le génère ; les blocs dont l'habilitation requise n'est pas détenue sont **omis** du rendu, et la mention en est portée en pied de page. |
| **RG-27** | Un **rapport généré est figé** : ses données sont capturées à l'instant de la génération et ne sont plus recalculées. |
| **RG-28** | `date_bapteme ≥ date_naissance`, et aucune de ces deux dates ne peut être postérieure à la date du jour. |
| **RG-29** | Le **matricule** d'un croyant est immuable, même après transfert vers une autre église. |
| **RG-30** | Un « nouveau baptisé » est un croyant dont la date de baptême remonte à **15 jours ou moins** *(seuil paramétrable)*. |
| **RG-31** | Un « membre de finances » est un membre de bureau actif dont la Fonction porte l'indicateur **fonction financière**. |
| **RG-32** | L'ensemble des données métier doit pouvoir être **exporté puis restauré chez un autre hébergeur** sans perte ni dépendance à une fonctionnalité propriétaire. |

---

## 7. Exigences non fonctionnelles

### 7.1 Performance

| Réf. | Exigence | Cible |
|---|---|---|
| **ENF-PRF-01** | Temps de réponse des écrans de liste (100 lignes, filtres appliqués) | ≤ 800 ms au 95ᵉ centile |
| **ENF-PRF-02** | Temps d'affichage complet du tableau de bord | ≤ 1,5 s au 95ᵉ centile |
| **ENF-PRF-03** | Rendu de l'organigramme React Flow | ≤ 2 s pour 1 000 nœuds, interaction à 60 fps |
| **ENF-PRF-04** | Génération et export PDF d'un rapport de 10 blocs | ≤ 8 s |
| **ENF-PRF-05** | Volumétrie supportée sans dégradation | 200 000 croyants · 5 000 entités · 500 000 mouvements financiers |
| **ENF-PRF-06** | Utilisateurs simultanés | 300 sessions actives |
| **ENF-PRF-07** | Scores Lighthouse (Performance / Accessibilité / Bonnes pratiques) | ≥ 90 sur les écrans principaux |
| **ENF-PRF-08** | Une liste ne charge jamais plus de **2 000 lignes** ; au-delà, l'écran annonce la troncature et invite à restreindre le périmètre. En deçà, le jeu est chargé **en une requête** et filtré côté client — mesuré le 7 août 2026, le filtrage serveur coûtait quatre allers-retours enchaînés par frappe, soit ~1,7 s. *(Révision de la rédaction initiale « pagination serveur obligatoire au-delà de 50 lignes » : c'est le nombre d'allers-retours qui coûte, pas le nombre de lignes.)* | — |
| **ENF-PRF-09** | Chargement différé systématique des modules lourds : React Flow, graphiques, générateur PDF, éditeur de rapport, éditeur d'image | — |

### 7.2 Sécurité

| Réf. | Exigence |
|---|---|
| **ENF-SEC-01** | Cloisonnement appliqué **au niveau de la base de données** (Row Level Security), et non uniquement dans l'interface. Une requête hors périmètre ne retourne aucune ligne. |
| **ENF-SEC-02** | Chiffrement en transit (TLS 1.3) et au repos (AES-256). |
| **ENF-SEC-03** | Mots de passe : 12 caractères minimum, contrôle de robustesse, hachage bcrypt/argon2, blocage après 5 échecs pendant 15 minutes. |
| **ENF-SEC-04** | Protection systématique contre l'injection SQL, le XSS (assainissement de toute entrée avant rendu) et le CSRF. |
| **ENF-SEC-05** | Toute mutation revalide **côté serveur** : session, habilitation, portée de l'habilitation, appartenance au périmètre. Le contrôle côté client n'est qu'un confort d'affichage. |
| **ENF-SEC-06** | Fichiers téléversés : contrôle du type MIME réel, limite de taille, stockage privé, accès par URL signée à durée limitée. |
| **ENF-SEC-07** | En-têtes de sécurité : CSP stricte, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. |
| **ENF-SEC-08** | Journal d'audit **immuable** (insertion seule), conservé 5 ans minimum. |
| **ENF-SEC-09** | Aucun secret ni clé de service exposé côté navigateur. |
| **ENF-SEC-10** | Limitation de débit sur l'authentification, les exports, les générations de rapport et les imports en masse. |
| **ENF-SEC-11** | Toute tentative d'élévation de privilège via la délégation d'habilitation est rejetée **et journalisée comme incident**. |

### 7.3 Protection des données personnelles

| Réf. | Exigence |
|---|---|
| **ENF-DCP-01** | Les données traitées (identité, coordonnées, date de naissance, appartenance religieuse) relèvent des **données sensibles**. Base légale, finalité et durée de conservation documentées. |
| **ENF-DCP-02** | Principe de minimisation : ne collecter que les champs listés au §5.2. |
| **ENF-DCP-03** | Droits des personnes : accès, rectification, effacement, portabilité — outillés par l'export de fiche et la suppression définitive. |
| **ENF-DCP-04** | Registre des accès aux données personnelles consultable par le SuperAdmin. |
| **ENF-DCP-05** | Anonymisation des jeux de données utilisés en environnement de test. |

### 7.4 Disponibilité, sauvegarde et exploitation

| Réf. | Exigence |
|---|---|
| **ENF-EXP-01** | Disponibilité cible : **99,5 %** en heures ouvrées. |
| **ENF-EXP-02** | Sauvegarde quotidienne automatique, rétention 30 jours, restauration à un instant donné (PITR) sur 7 jours. |
| **ENF-EXP-03** | Objectifs de reprise : **RPO ≤ 24 h**, **RTO ≤ 4 h**. |
| **ENF-EXP-04** | Environnements séparés : développement, recette, production. |
| **ENF-EXP-05** | Migrations de base versionnées, réversibles et rejouables. |
| **ENF-EXP-06** | Supervision des erreurs et des performances avec alerte sur seuil. |

### 7.5 Utilisabilité et accessibilité

| Réf. | Exigence |
|---|---|
| **ENF-UTI-01** | Interface intégralement en **français**, architecture prête pour l'internationalisation. |
| **ENF-UTI-02** | **Mobile-first** : usage complet sur écran 360 px ; sidebar rétractable. |
| **ENF-UTI-03** | Conformité **WCAG 2.1 niveau AA**. |
| **ENF-UTI-04** | Toute action destructive fait l'objet d'une confirmation explicite mentionnant l'objet concerné. |
| **ENF-UTI-05** | Messages d'erreur explicites, en français, orientés correction. |
| **ENF-UTI-06** | Sauvegarde automatique des brouillons sur les formulaires longs et sur l'éditeur de rapport. |
| **ENF-UTI-07** | Créer un croyant complet en **moins de 90 secondes** pour un utilisateur formé. |
| **ENF-UTI-08** | Composer un rapport de 6 blocs et l'exporter en PDF en **moins de 5 minutes** pour un utilisateur formé. |

### 7.6 Portabilité et réversibilité *(ARB-8)*

> L'hébergeur retenu est **Supabase**, mais les données doivent rester **transférables vers un autre hébergeur**.

| Réf. | Exigence |
|---|---|
| **ENF-POR-01** | Le schéma de données n'utilise que des fonctionnalités **PostgreSQL standard** (types, contraintes, triggers, vues matérialisées, RLS, extensions `ltree` / `pg_trgm` / `pgcrypto`). Aucune fonctionnalité propriétaire dans le chemin des données. |
| **ENF-POR-02** | L'**authentification** est isolée derrière une couche d'abstraction : le modèle métier ne dépend pas du schéma `auth` de l'hébergeur. Changer de fournisseur d'identité ne doit impacter qu'un seul module. |
| **ENF-POR-03** | Le **stockage de fichiers** est isolé derrière une interface unique. La base ne stocke que des **clés d'objet relatives**, jamais des URL signées ni des chemins propres à un hébergeur. |
| **ENF-POR-04** | Aucune logique métier n'est implantée dans des services propriétaires (fonctions edge, files d'attente spécifiques). Les tâches planifiées sont déclenchées par un ordonnanceur externe interchangeable. |
| **ENF-POR-05** | Les **migrations** sont du SQL simple, applicables par n'importe quel client PostgreSQL, indépendamment de l'outillage de l'hébergeur. |
| **ENF-POR-06** | Fournir une commande d'**export intégral** produisant : un dump PostgreSQL restaurable, l'arborescence complète des fichiers stockés, et un manifeste décrivant le contenu et la version du schéma. |
| **ENF-POR-07** | Fournir une **procédure de restauration documentée** vers une instance PostgreSQL standard + un stockage compatible S3. |
| **ENF-POR-08** | La réversibilité est **prouvée en recette** : une restauration complète chez un hébergeur tiers est réalisée et vérifiée au moins une fois avant la mise en production. |

### 7.7 Maintenabilité

| Réf. | Exigence |
|---|---|
| **ENF-MNT-01** | TypeScript en mode strict ; aucun `any` implicite. |
| **ENF-MNT-02** | Validation de schéma partagée client/serveur (source unique de vérité). |
| **ENF-MNT-03** | Couverture de tests ≥ 70 % sur la logique métier ; **100 % des règles de gestion du §6** couvertes par un test nommé. |
| **ENF-MNT-04** | Intégration continue : lint, types, tests, build — bloquants avant fusion. |
| **ENF-MNT-05** | Documentation du modèle de données, des règles de gestion et des procédures d'exploitation maintenue à jour. |

---

## 8. Exigences UI / UX

> Issues de `.agents/rules/designrules.md` et du langage visuel des maquettes de référence (*design sobre*).

### 8.1 Philosophie : **High-Density Minimalist**

Densité d'information élevée, respiration visuelle maîtrisée : peu de couleurs, beaucoup de blanc, hiérarchie typographique nette, aucune décoration gratuite.

### 8.2 Fondations

| Réf. | Exigence |
|---|---|
| **UI-01** | **Grille de 8 px** : tous les espacements sont des multiples de 8 px. |
| **UI-02** | **Rayons** : `rounded-xl` pour les cartes, `rounded-md` pour boutons et champs. |
| **UI-03** | **Fond** `Gray-50 (#F9FAFB)` · **Cartes** `White` + bordure `Gray-200` · **Titres** `Slate-900` · **Métadonnées** `Slate-500`. |
| **UI-04** | **Police** : *Google Sans* (repli Inter, system-ui). |
| **UI-05** | Ombres portées limitées au strict nécessaire ; la séparation repose sur la **bordure**. |
| **UI-06** | **Accent** unique réservé aux libellés de section et aux états en cours ; le bouton principal reste `Slate-900`. |

### 8.3 Composants

| Réf. | Exigence |
|---|---|
| **UI-07** | **Tableaux** : `<DataTable />` Shadcn, **sans bordures verticales**, `font-mono` pour toutes les valeurs numériques, pourcentages et **montants**. |
| **UI-08** | **Badges de statut** — Succès/Validé : `bg-emerald-100 text-emerald-700` · En attente/En risque : `bg-amber-100 text-amber-700` · Rejeté/Critique/Solde négatif : `bg-rose-100 text-rose-700`. |
| **UI-09** | **Barres de progression** fines (`h-2`), couleur pleine selon le statut. |
| **UI-10** | **Cartes de fonctionnalité** : icône Lucide dans un carré arrondi, titre court, description en `Slate-500` — grille 3 colonnes sur desktop, 1 sur mobile. |
| **UI-11** | **En-tête de section** : *eyebrow* en majuscules · titre large en gras · sous-titre gris. |
| **UI-12** | Iconographie exclusivement **Lucide-React**, trait fin, 16 ou 20 px. |
| **UI-13** | **Montants financiers** : `font-mono tabular-nums`, séparateurs de milliers, recettes en `Slate-900`, dépenses préfixées d'un signe moins, **solde négatif en `Rose-600`**. |

### 8.4 Interactions et états

| Réf. | Exigence |
|---|---|
| **UI-14** | Transition de couleur fluide (`transition-colors`) sur tout élément interactif. |
| **UI-15** | **Toute page qui charge des données affiche un `<Skeleton />`** calqué sur sa structure finale — **jamais** d'écran blanc ni de spinner plein écran. |
| **UI-16** | Le spinner (`Loader2`) est **réservé aux actions ponctuelles** : enregistrement, suppression, transfert, validation, génération de rapport. |
| **UI-17** | Aucun décalage de mise en page au chargement : le squelette occupe les dimensions définitives. |
| **UI-18** | Pages lourdes et bibliothèques volumineuses chargées en différé, squelette en `fallback` de `<Suspense>`. |
| **UI-19** | Chaque écran de liste possède un **état vide** explicite (illustration sobre, explication, action principale). |
| **UI-20** | Retour utilisateur systématique après une mutation (*toast* de succès ou d'erreur, annulation quand c'est pertinent). |
| **UI-21** | Les éléments **en attente d'action** de l'utilisateur (transferts à approuver, mouvements à valider) sont signalés par un compteur dans la navigation. |

---

## 9. Contraintes techniques

| Couche | Technologie | Statut |
|---|---|---|
| **Framework** | **Next.js 15+** (App Router, stable) | Imposé |
| **Langage** | TypeScript (mode strict) | Imposé |
| **Stylisation** | **Tailwind CSS** | Imposé |
| **Composants** | **Shadcn/UI** (primitives Radix UI) | Imposé |
| **Icônes** | **Lucide-React** | Imposé |
| **Visualisation de hiérarchie** | **React Flow** | Imposé |
| **Base de données & backend** | PostgreSQL via **Supabase** (Auth, Storage, RLS) — **avec exigence de portabilité §7.6** | Retenu *(ARB-8)* |
| **Graphiques** | Recharts | Retenu |
| **Formulaires & validation** | React Hook Form + Zod | Retenu |
| **Glisser-déposer** | dnd-kit (tableau de bord, éditeur de rapport) | Retenu |
| **Génération PDF** | Rendu HTML paginé + moteur PDF côté serveur | Retenu |
| **Tests** | Vitest (unitaire), Playwright (bout en bout) | Retenu |
| **Navigateurs cibles** | 2 dernières versions de Chrome, Edge, Firefox, Safari (desktop et mobile) | — |

---

## 10. Livrables et jalons

### 10.1 Livrables

| Réf. | Livrable |
|---|---|
| **LIV-1** | Application web déployée (recette + production) |
| **LIV-2** | Code source versionné, documenté, avec pipeline d'intégration continue |
| **LIV-3** | Schéma de base de données, migrations SQL portables et jeu de démonstration anonymisé |
| **LIV-4** | Documentation technique (architecture, modèle de données, politiques de sécurité, matrice d'habilitations) |
| **LIV-5** | Guide utilisateur par rôle (SuperAdmin, Administrateur d'entité, Opérateur) |
| **LIV-6** | Modèles d'import Excel/CSV (structure, croyants) et **bibliothèque de modèles de rapport officiels** |
| **LIV-7** | Procès-verbal de recette et rapport de tests |
| **LIV-8** | Procédures d'exploitation : sauvegarde, restauration, montée de version |
| **LIV-9** | **Procédure de réversibilité** et preuve de restauration chez un hébergeur tiers *(ENF-POR-08)* |

### 10.2 Jalons

| Jalon | Contenu | Durée |
|---|---|---|
| **J0 — Socle** | Projet initialisé, design system, authentification portable, layout, RLS de base | 2 semaines |
| **J1 — Structure & référentiels** | Hiérarchie 6 niveaux avec Siège, organigramme React Flow, 4 référentiels | 3 semaines |
| **J2 — Croyants & transferts** | CRUD, recherche, filtres, photos, import, **workflow d'approbation des transferts** | 4 semaines |
| **J3 — Bureaux** | Mandats, membres, fonctions, organigramme de bureau | 2 semaines |
| **J4 — Finances** | Recettes/dépenses, solde, saisie déléguée, **workflow de validation activable**, synthèses | 3 semaines |
| **J5 — Tableaux de bord** | Registre d'indicateurs, grille configurable, drill-down, exports | 3 semaines |
| **J6 — Générateur de rapports** | Éditeur de blocs, modèles, prévisualisation A4, génération figée, export PDF | 3 semaines |
| **J7 — Habilitations & administration** | Habilitations fines, portées, **délégation**, profils, audit, corbeille, paramètres | 3 semaines |
| **J8 — Portabilité, recette & mise en production** | Export intégral, **restauration prouvée chez un tiers**, durcissement, performances, formation, bascule | 3 semaines |

**Durée totale indicative : 26 semaines.**

---

## 11. Critères d'acceptation

| Réf. | Critère |
|---|---|
| **CA-01** | Toutes les exigences de priorité **Must** du §5 sont implémentées et démontrées. |
| **CA-02** | Les 32 règles de gestion du §6 sont vérifiées par un test automatisé nommé et traçable. |
| **CA-03** | Un utilisateur d'entité connecté ne peut, **par aucun moyen** (interface, appel API direct, requête forgée), lire ou modifier une donnée hors de son périmètre. Test d'intrusion documenté. |
| **CA-04** | Une tentative de **délégation d'habilitation au-delà des droits ou du périmètre du délégant** est rejetée et journalisée. |
| **CA-05** | Le **solde disponible** consolidé du Siège est exact et rapproché manuellement sur un jeu de contrôle de 200 mouvements mêlant recettes, dépenses, saisies déléguées et annulations. |
| **CA-06** | Le **workflow de validation financière** est activable et désactivable par le SuperAdmin, et son activation impose effectivement la validation au niveau des entités. |
| **CA-07** | Aucun **transfert** n'est appliqué sans approbation ; l'historique restitue demandeur, approbateur, décision et horodatage. |
| **CA-08** | Le tableau de bord est configurable indépendamment par le SuperAdmin et par chaque entité, et la configuration est persistée par utilisateur. |
| **CA-09** | Un **rapport composé par une entité** ne contient aucune donnée hors de son périmètre, et un rapport généré est **reproductible à l'identique** après modification ultérieure des données sous-jacentes. |
| **CA-10** | Les organigrammes de structure et de bureau sont rendus via React Flow, navigables et exportables. |
| **CA-11** | Aucune page ne présente d'écran blanc ni de spinner plein écran au chargement. |
| **CA-12** | Les cibles ENF-PRF-01 à 04 sont atteintes sur un jeu de 200 000 croyants et 500 000 mouvements. |
| **CA-13** | Scores Lighthouse Performance et Accessibilité ≥ 90 sur le tableau de bord, la liste des croyants et l'éditeur de rapport. |
| **CA-14** | L'interface respecte le design system du §8 : audit visuel sur grille 8 px, rayons, palette, typographie et badges. |
| **CA-15** | L'application est pleinement utilisable sur un écran de 360 px de large. |
| **CA-16** | Une **restauration complète chez un hébergeur tiers** (PostgreSQL standard + stockage S3) est réalisée et vérifiée, application fonctionnelle à l'issue. |
| **CA-17** | Le journal d'audit restitue l'intégralité des opérations d'un scénario de recette de bout en bout, approbations et validations comprises. |

---

## 12. Risques, hypothèses et arbitrages

### 12.1 Risques

| Réf. | Risque | Impact | Parade |
|---|---|---|---|
| **RSQ-1** | Volumétrie dégradant les agrégations du tableau de bord et le calcul des soldes | Élevé | Vues matérialisées, index adaptés, rafraîchissement incrémental |
| **RSQ-2** | Complexité des politiques RLS sur 6 niveaux, avec portées d'habilitation restreintes | Élevé | Chemin matérialisé (`ltree`) + fonctions d'appartenance testées unitairement |
| **RSQ-3** | Qualité hétérogène des données existantes lors de la reprise | Moyen | Imports en deux temps : pré-validation, rapport d'erreurs, puis validation |
| **RSQ-4** | Adoption faible par les entités éloignées (connectivité limitée) | Moyen | Interface légère, squelettes, brouillons sauvegardés, **saisie déléguée par le Siège** |
| **RSQ-5** | Sensibilité des données (appartenance religieuse) | Élevé | Chiffrement, RLS, audit, minimisation, politique de conservation |
| **RSQ-6** | Workflows de validation perçus comme un frein à la saisie | Moyen | Workflow **désactivable**, auto-approbation intra-périmètre, traitement par lot |
| **RSQ-7** | Générateur de rapports devenant un outil de reporting générique complexe | Moyen | Bibliothèque de blocs **fermée** et modèles officiels fournis par le Siège |
| **RSQ-8** | Dérive vers une comptabilité générale complète | Moyen | Périmètre §2.2 réaffirmé : mouvements, solde et consolidations uniquement |
| **RSQ-9** | Adhérence progressive à l'hébergeur malgré l'exigence de portabilité | Moyen | Couches d'abstraction auth/stockage, **preuve de réversibilité en recette** *(CA-16)* |

### 12.2 Hypothèses

- Un croyant appartient à **une seule** église à la fois.
- Une cellule ne dispose d'aucun compte : ses données sont saisies par l'église parente.
- La devise est **unique et paramétrable** (XOF par défaut) — *ARB-7*.
- L'organisation compte **un seul Siège**, racine unique de la hiérarchie.
- Les utilisateurs disposent d'un accès Internet, éventuellement bas débit.

### 12.3 Arbitrages

| Réf. | Question | Décision |
|---|---|---|
| **ARB-1** | Nom définitif du produit | ✅ **SYNOD** |
| **ARB-2** | Recettes seules ou recettes et dépenses ? | ✅ **Les deux.** Saisie par les entités dans la limite de leur périmètre, calcul du **solde disponible** visible par le SuperAdmin. Le **Siège** dispose de ses propres finances et peut saisir **pour le compte** d'une entité sans accès à l'application. → §5.6, RG-13 à RG-18 |
| **ARB-3** | Validation des mouvements par l'entité ou par le niveau supérieur ? | ✅ **Option implémentée et activable par le SuperAdmin.** Si activée, la validation se fait **impérativement au niveau des entités**. Accompagnée d'**habilitations fines** (droits par catégorie + portée par structure), **configurables par le SuperAdmin et par un Administrateur d'entité**. → §5.6.3, §5.10, RG-16, RG-24, RG-25 |
| **ARB-4** | Workflow d'approbation des transferts ? | ✅ **Oui, obligatoire.** → §5.3, RG-11, RG-12 |
| **ARB-5** | Fenêtre « nouveaux baptisés » | ✅ **15 jours**, paramétrable. → RG-30 |
| **ARB-6** | Reprise de données : volume, format, qualité des fichiers sources | ✅ **Clos le 9 août 2026, sans les fichiers.** La question portait sur le format ; elle a cessé de se poser quand le lecteur XLSX a été écrit sans dépendance (`lib/domain/xlsx.ts` : un .xlsx est une archive ZIP de XML, et le navigateur sait décompresser). CSV et XLSX aboutissent au même `string[][]`, et la correspondance de colonnes n'impose aucun modèle : ni l'ordre, ni les intitulés, ni le format des fichiers réels ne peuvent plus surprendre. Restent hors périmètre du lecteur, et signalés comme tels : classeurs multi-feuilles au-delà de la première, cellules fusionnées. Le **volume** se traite par le plafond annoncé à l'écran (ENF-PRF-08). |
| **ARB-7** | Multi-devises réel ? | ✅ **Ignoré.** Devise unique paramétrable. → §2.2 |
| **ARB-8** | Hébergement | ✅ **Supabase**, avec **exigence de portabilité** : données transférables vers un autre hébergeur, réversibilité prouvée en recette. → §7.6, CA-16 |

---

*Fin du cahier des charges — voir [`plan.md`](plan.md) pour la conception détaillée.*
