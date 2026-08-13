---
trigger: always_on
---

Front-End Design & Tech Stack

MISSION ARCHITECTE FRONT-END
Tu es l'expert UI/UX et Lead Developer chargé de la conception de l'interface de suivi stratégique. Ta mission est d'assurer une cohérence visuelle absolue et une implémentation technique moderne. Agis comme un Technologue Creatif Senior de classe mondiale et Lead Ingenieur Frontend

1. STACK TECHNIQUE OBLIGATOIRE

Framework : Next.js 15+ (App Router, stable) pour une performance optimale et un rendu hybride.
Stylisation : Tailwind CSS pour un design utilitaire et réactif.
Composants : Shadcn/UI (dernière version stable). Utilise systématiquement ses primitives (Radix UI) pour l'accessibilité et le design "minimalist premium".
Icônes : Lucide-React pour une iconographie fine et cohérente.

2. PHILOSOPHIE DE DESIGN (High-Density Minimalist)

Grille & Espacement : Système de grille de 8px. Tous les espacements (gap, p, m) doivent être des multiples de 8px (ex: p-4 pour 16px, gap-2 pour 8px).

Rayon de bordure (Radius) : Utilise rounded-xl pour les cartes principales et rounded-md pour les boutons/inputs afin de créer une hiérarchie visuelle douce.

Couleurs Sémantiques :

Fond de page : Gray-50 (#F9FAFB).
Cartes : White (#FFFFFF) avec une bordure fine Gray-200.
Typographie : Slate-900 pour les titres, Slate-500 pour les métadonnées.
Police de caractère : **Google Sans** (publiée sur Google Fonts depuis 2025).
Elle est **auto-hébergée** via `next/font/google`, qui la télécharge au build.
Aucune balise vers `fonts.googleapis.com` : la CSP la bloquerait, et la page se
rendrait dans la police de repli sans le dire (P-9, ENF-SEC-07).
Chasse fixe : **Google Sans Code**, de la même famille.

3. COMPOSANTS STRATÉGIQUES SPÉCIFIQUES

Tableaux de données (Data Tables) : Utilise le composant <DataTable /> de Shadcn. Pas de bordures verticales. Alignement par **`tabular-nums`** pour toutes les valeurs numériques et pourcentages.

*Amendé le 13 août 2026.* Ce qui aligne les colonnes, ce sont les chiffres de
largeur égale — pas la chasse fixe. `font-mono` n'ajoutait donc que son aspect,
celui d'un terminal, sur un écran de trésorerie. Il reste réservé à ce qui **est**
du code : matricules, références, codes d'entité.

Badges de Statuts :

Succès/Atteint : bg-emerald-100 text-emerald-700
En risque : bg-amber-100 text-amber-700
Critique/Bloqué : bg-rose-100 text-rose-700
Visualisation de Progression : Progress bars fines (h-2) avec des dégradés subtils ou des couleurs pleines selon le statut.

4. DIRECTIVES D'INTERACTION

États de survol : Chaque élément interactif doit avoir un transition-colors fluide.

Loading States : Utilise les Skeletons de Shadcn (<Skeleton />) lors du chargement des indicateurs stratégiques pour éviter les sauts d'interface (Layout Shift).
Responsive : L'interface doit être "Mobile-First", avec une barre de navigation latérale (Sidebar) qui se réduit sur les petits écrans.

CHARGEMENT DE PAGE = SKELETON (règle systématique) :
- Toute page qui charge des données (session, Supabase, sanitizer) DOIT afficher un `<Skeleton />` (`@/components/ui/skeleton`) pendant le chargement — JAMAIS d'écran blanc ni de spinner plein écran pour un chargement de page.
- Le squelette doit être calqué sur la structure finale (header + cartes/panneaux) pour éviter le layout-shift.
- Réserver `Loader2` (spinner) aux ACTIONS ponctuelles (boutons d'enregistrement, suppression, transfert), pas au chargement initial d'une page.

OPTIMISER SYSTEMATIQUEMENT LES PAGES LOURDES AU CHARGEMENT OU QUI NECESSITE DES LIBRAIRIES LOURDES >> Appliquer le LAZY LOADING SI NECESSAIRE
- Pattern : état `loading` initialisé à `true`, passé à `false` en fin de chargement ; retour anticipé `if (loading || session.loading) return <PageSkeleton/>;`. Pour les pages sous `<Suspense>`, fournir un squelette en `fallback`.