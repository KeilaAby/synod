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
   - Écran `/documentation` avec navigation latérale par catégories et icônes Lucide.
   - Barre de recherche textuelle instantanée en temps réel.
   - Sélecteur d'espace (« Guide Utilisateur » / « Manuel Administration ») pour les administrateurs.
   - Encadrés pédagogiques (💡 *Astuces*, ⚠️ *Règles d’or*, 📌 *Cas pratiques*).
   - Accès direct depuis la barre latérale principale (`app-sidebar.tsx`), le menu utilisateur de l'en-tête (`topbar.tsx`), et le Hub d'Administration (`/administration`).

---

## 2. Validation & Tests
- `pnpm check:secrets` : 0 secret détecté.
- `pnpm lint` : 0 erreur, 0 warning.
- `pnpm typecheck` : 0 erreur TypeScript.
- `pnpm test` : **903 tests unitaires validés avec succès** (47 suites de tests Vitest).
- `pnpm build` : Build de production Next.js 16 (Turbopack) validé avec 34 routes générées.

---

## 3. Ce qui attend une décision de l'utilisateur
- Autorisation pour effectuer le `git push` vers le dépôt distant.
