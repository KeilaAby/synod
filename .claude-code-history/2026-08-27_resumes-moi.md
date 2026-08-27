# Résumé de la session du 27 août 2026

## 1. Ce qui a été livré

### Module complet de Planification des Visites Pastorales & Ordres de Mission (`/visites`)
- **Base de données & Migration `0078_visites_pastorales.sql` (bundle `install.sql`)** :
  - Tables `visites_pastorales` et `visites_pastorales_delegues`.
  - Trigger SQL de génération automatique du numéro d'ordre de mission au format officiel `OM-SYNOD-AAAA-MM/XXX`.
  - Politiques RLS fines (lecture accordée à l'entité initiatrice et à l'église cible ; mutations réservées à l'entité initiatrice).
  - Portées propres `PROPRE` déclarées dans `fn_permissions_portee_propre()`.
- **Habilitations Fines & Rôles (RG-24 / RG-25)** :
  - Ajout des 6 permissions : `visite.read`, `visite.create`, `visite.update`, `visite.validate`, `visite.print`, `visite.delete`.
  - Intégration dans `ROLE_TEMPLATES` (`SUPERADMIN`, `ENTITE_ADMIN`, `ENTITE_OPERATEUR`, `LECTEUR`) et `PROFILS_RACCOURCIS` (`RESPONSABLE`, `SECRETAIRE`, `CONSULTATION`).
- **Calendrier Horizontal Fluide (`components/visites/calendrier-horizontal.tsx`)** :
  - Affichage horizontal sur 31 jours défilables (`overflow-x: auto`), sans blocage sur les jours passés.
  - Dimanches sobres respectant la charte graphique Synod.
  - Bouton discret `+` sur l'en-tête de chaque date pour planifier une visite à ce jour.
  - Bouton discret crayon `pencil` sur les cartes pour modifier les visites planifiées / confirmées.
  - Glisser-déposer (Drag & Drop) interactif pour reprogrammer les visites planifiées et confirmées (verrouillage des visites effectuées).
- **Formulaire de Planification & Dialogue Élargi (`components/visites/visite-dialog.tsx`)** :
  - Largeur spacieuse et aérée (`max-w-4xl`) avec grille responsive.
  - **Sélecteur hiérarchique officiel `EntityPicker`** : recherche rapide, regroupement par niveaux hiérarchiques (Sièges, Régionaux, Districts, Paroisses, Églises) pour l'entité organisatrice et l'église destinataire.
  - **Sélecteur officiel `CroyantPicker`** : recherche instantanée, pastilles colorées d'initiales, portraits et grade affiché sous le nom.
  - Saisie libre pour le Type de Culte / Célébration et pour le Rôle missionnaire de chaque gradé désigné.
- **Cartes Interactives du Calendrier (`components/visites/calendrier-horizontal.tsx`)** :
  - Clic direct sur la carte pour afficher immédiatement la modale d'Ordre de Mission et les détails de la visite pastorale.
  - Icône crayon `pencil` dédiée à la modification des visites modifiables (`PLANIFIE` et `CONFIRME`).
  - **EntityPicker** intégré dans la barre de filtres principale de `/visites`.
  - Document solennel A4 officiel avec en-tête ecclésial, portraits des missionnaires, références, verset biblique et blocs de signatures/sceaux.
- **Table & Navigation (`components/visites/visites-table.tsx`, `components/layout/nav-items.ts`, `app/(app)/visites/`)** :
  - Vue liste tabulaire avec filtres avancés (par entité, par statut, recherche de personne en direct) et bascule Vue Calendrier / Vue Liste.
  - Navigation latérale enrichie avec l'icône `CalendarCheck2`.

## 2. Validation & Qualité

- **`pnpm verify`** :
  - 0 secret détecté.
  - 0 erreur ESLint.
  - 0 erreur TypeScript.
  - **1056 tests unitaires passés** (54 suites de tests, dont `tests/unit/visites-pastorales.test.ts` et `tests/unit/permissions.test.ts`).
  - Build Next.js 16.3 / Turbopack validé avec la nouvelle route `/visites`.

## 3. Ce qui attend l'utilisateur

1. **Appliquer la migration `0078_visites_pastorales.sql`** dans l'éditeur SQL Supabase.
2. **Autoriser le push Git vers GitHub** (règle `.agents/rules/gitpush.md`).
