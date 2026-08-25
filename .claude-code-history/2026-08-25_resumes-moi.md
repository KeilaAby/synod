# Point d'étape — 25 août 2026

## 1. Ce qui vient d'être livré

### Centre d'Aide & Documentation Intégré dans l'Application
1. **Guide Utilisateur Intégré (Tous les membres et administrateurs)** :
   - Rédigé de A à Z en langage clair, accessible et pédagogique ("version sans jargon / pour les nuls").
   - Couvre l'ensemble des 10 modules applicatifs :
     * *Premiers pas & Découverte* (Connexion, Sécurité des mots de passe, Périmètre de portée).
     * *Structure Ecclésiale* (Arborescence des 6 niveaux, navigation, entités sans accès).
     * *Gestion des Croyants* (Fiche complète, Matricule automatique, Liens conjugaux, Photos, Sélection des colonnes pour impression PDF).
     * *Transferts & Mutations* (Demande, Approbation hiérarchique, Attestation officielle, Clôture automatique de mandat).
     * *Cérémonies de Baptême* (Saisie en lot collective, Grade initial « Croyant », Certificats).
     * *Bureaux & Organigrammes* (Composition, Organigramme glisser-déposer, Dérivations & Adjoints, Impression vectorielle A4).
     * *Finances Générales* (Recettes, Dépenses, Solde disponible, Circuit de validation des pièces justificatives).
     * *Gestion des Dîmes* (Principe sacré de la dîme versée au Siège, Enveloppes nominatives, Reçus papier/thermiques, Remises au Siège).
     * *Tableaux de Bord* (Chiffres clés interactifs, Jauge financière, Personnalisation glisser-déposer).
     * *Générateur de Rapports* (Bibliothèque de modèles, Assemblage sans code, Omission confidentielle RG-26, Gel définitif RG-27, Export PDF).

2. **Manuel d'Administration Intégré (SuperAdmin & Habilités)** :
   - Interface dédiée de gouvernance couvrant les 7 piliers :
     * *Gestion des Comptes & Accès* (Mots de passe provisoires en main propre, Suspension).
     * *Habilitations Fines & Délégation* (Matrice Droit + Portée, Profils réutilisables, Délégation bornée).
     * *Administration des Référentiels* (Grades & restrictions de genre, Fonctions & rôle financier, Catégories comptables, Événements de dîme).
     * *Journal d'Audit & Sécurité* (Traçabilité en langage naturel, Tentatives refusées).
     * *Corbeille & Rétention* (Restauration avec intégrité référentielle, Purge).
     * *Paramètres Généraux & Courriels* (Identité, Logo, Configuration & Test SMTP).
     * *Portabilité, Sauvegardes & S3* (Export intégral, Schéma PostgreSQL standard, Reprise d'activité `RESTORE.md`).

3. **Expérience Utilisateur & Ergonomie (« High-Density Minimalist »)** :
   - **En-tête supérieur et barre de recherche figés au défilement (`sticky top-0 z-20`)** : restent parfaitement visibles sans débordement sur la barre latérale rétractée.
   - **Fil d'Ariane et chemin d’accès systématique dans chaque section** : chaque thème (Gestion des Croyants, Baptêmes, Finances, etc.) affiche désormais dans son en-tête le fil d'Ariane officiel à suivre dans l'application (`Accès : Menu principal ➔ ...`), avec lien cliquable direct.
   - **Palette de recherche rapide instantanée sur raccourci clavier `CTRL+K` / `⌘K` (`components/documentation/documentation-recherche-dialog.tsx`)** :
     * Largeur agrandie et aérée (`sm:max-w-3xl w-[95vw]`) pour une lecture confortable.
     * Suppression du double cadre intérieur / icône en doublon pour une barre de saisie épurée sur fond blanc pur.
     * Affichage en tête des **Dernières recherches récentes** (badges interactifs) et des **Sujets fréquents & Raccourcis clés** en grille à deux colonnes.
     * Recherche instantanée transversale dans tous les chapitres avec bascule automatique d'espace et défilement fluide vers la section ciblée.
   - Barre latérale principale de l'application repliée par défaut (`CHEMINS_LARGES`) pour maximiser l'espace de lecture.
   - Barre latérale interne des thèmes et catégories **fixe au défilement** (`sticky`) pour une navigation fluide et continue dans les longs chapitres.
   - Sélecteur d'espace (« Guide Utilisateur » / « Manuel Administration ») pour les administrateurs.
   - Encadrés pédagogiques (💡 *Astuces*, ⚠️ *Règles d’or*, 📌 *Cas pratiques*).
   - Accès direct depuis la barre latérale principale (`app-sidebar.tsx`), le menu utilisateur de l'en-tête (`topbar.tsx`), et le Hub d'Administration (`/administration`).

### Certificat Officiel de Baptême d'Eau (Génération & Impression A4)
1. **Moteur d'Impression Solennel (`components/baptemes/imprimer-certificat-bapteme.ts`)** :
   - Mise en page A4 portrait solennelle avec double cadre ornemental.
   - En-tête officiel de l'organisation et nom de l'église locale.
   - Verset biblique (Matthieu 28:19) et déclaration officielle d'immersion dans la foi chrétienne.
   - Données d'état civil, matricule officiel, date et lieu de cérémonie.
   - Cartouches de signatures : pasteur(s) célébrant(s), secrétariat / sceau officiel de l'église.
2. **Points d'accès dans l'application** :
   - Bouton d'action direct dans chaque ligne du tableau des baptêmes ([`/baptemes`](file:///d:/projet/synod/app/(app)/baptemes/page.tsx)).
   - Bouton dédié sur la fiche complète du croyant baptisé ([`/croyants/[croyantId]`](file:///d:/projet/synod/app/(app)/croyants/[croyantId]/page.tsx)).

---

## 2. Validation & Tests
- `pnpm check:secrets` : 0 secret détecté.
- `pnpm lint` : 0 erreur, 0 warning.
- `pnpm typecheck` : 0 erreur TypeScript.
- `pnpm test` : **904 tests unitaires validés avec succès** (48 suites de tests Vitest).
- `pnpm build` : Build de production Next.js 16 (Turbopack) validé avec 34 routes générées.

---

## 3. Ce qui attend une décision de l'utilisateur
- Autorisation pour effectuer le `git push` vers le dépôt distant.
