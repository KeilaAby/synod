import {
  ArrowLeftRight,
  Baby,
  Briefcase,
  Building2,
  Cake,
  ChartColumnBig,
  Church,
  ClipboardCheck,
  Coins,
  Flag,
  Gauge,
  Globe,
  HeartHandshake,
  Home,
  Landmark,
  type LucideIcon,
  MapPin,
  Mars,
  Network,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  UsersRound,
  Venus,
} from 'lucide-react';
import { createElement } from 'react';

/**
 * Le pictogramme de chaque indicateur — EF-DSH-06.
 *
 * IL N'EST PAS DANS `KPI_REGISTRY`, et ce n'est pas un oubli. Une icône est une
 * FONCTION React : elle ne traverse pas la frontière serveur → client, et un
 * registre qui en porterait une ferait échouer la page entière (règle 24). La
 * page passe donc la CLÉ de l'indicateur, et le client lit cette table —
 * exactement le contournement que la règle 24 recommande.
 *
 * Ce fichier n'est importé que par des composants clients : rien de tout cela
 * ne part au serveur.
 *
 * UNE ICÔNE NE DÉCORE PAS, ELLE DISTINGUE. Sur une grille de vingt cartes, on
 * cherche « le solde » avant de lire les libellés : c'est la forme qu'on
 * reconnaît de loin. D'où des pictogrammes DIFFÉRENTS pour des indicateurs
 * voisins — hommes et femmes, recettes et dépenses — plutôt qu'un même symbole
 * décliné, qui obligerait à relire le texte pour trancher.
 */
export const ICONES_KPI: Readonly<Record<string, LucideIcon>> = {
  // --- Effectifs
  croyants: Users,
  femmes: Venus,
  hommes: Mars,
  nouveaux_baptises: Baby,
  encellules: HeartHandshake,
  derniers_croyants: Sparkles,
  repartition_age: Cake,
  repartition_grade: ShieldCheck,
  repartition_nationalite: Globe,

  // --- Structure
  regionaux: MapPin,
  districts: Landmark,
  paroisses: Building2,
  eglises: Church,
  cellules: Home,
  repartition_entite: Network,

  // --- Gouvernance
  bureaux_actifs: Briefcase,
  membres_bureau: UsersRound,
  membres_finances: Coins,
  transferts_attente: ArrowLeftRight,
  couverture_bureaux: Gauge,

  // --- Finances
  recettes: TrendingUp,
  depenses: TrendingDown,
  solde_consolide: PiggyBank,
  mouvements_attente: ClipboardCheck,
  evolution_finances: ChartColumnBig,
};

/**
 * Le repli d'un indicateur sans icône déclarée.
 *
 * UN DRAPEAU NEUTRE plutôt qu'une case vide : la carte garderait sinon une
 * hauteur différente de ses voisines, et la grille se décalerait pour un
 * oubli de deux lignes dans une table.
 */
export const ICONE_PAR_DEFAUT: LucideIcon = Flag;

/**
 * Le pictogramme d'un indicateur, rendu.
 *
 * PAR `createElement`, ET PAS PAR UNE VARIABLE MAJUSCULE. Lier le résultat
 * d'une recherche à `const Icone` puis écrire `<Icone />` fait voir au
 * compilateur React un composant CRÉÉ pendant le rendu — ce qu'il refuse, et à
 * juste titre : il ne peut plus garantir la stabilité de l'arbre. Ici le
 * composant vient d'une table figée au chargement du module, et
 * `createElement` le dit sans ambiguïté.
 *
 * `aria-hidden` : l'icône ne porte rien que le libellé n'ait déjà.
 */
export function IconeKpi({ cle, className }: { cle: string; className?: string }) {
  const composant = ICONES_KPI[cle] ?? ICONE_PAR_DEFAUT;
  return createElement(composant, { className, 'aria-hidden': true });
}
