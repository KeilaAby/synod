import { initialesAvatar } from '@/lib/domain/croyant';
import { cn } from '@/lib/utils';

/**
 * Avatar d'un croyant — EF-CRO-09 (en attendant le téléversement de photo).
 *
 * Deux initiales dans un cercle. La teinte est DÉRIVÉE du nom, pas tirée au
 * hasard : la même personne garde la même couleur d'un écran à l'autre, ce qui
 * aide à la repérer dans une liste sans rien lire.
 *
 * La palette reste sobre — fonds pâles, texte foncé — pour ne pas concurrencer
 * l'information (UI-05).
 */

const TEINTES = [
  'bg-slate-100 text-slate-700',
  'bg-indigo-100 text-indigo-700',
  'bg-sky-100 text-sky-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
] as const;

/** Somme des codes de caractères : stable, et suffisante pour répartir. */
function teinte(cle: string): string {
  let somme = 0;
  for (let i = 0; i < cle.length; i++) somme += cle.charCodeAt(i);
  return TEINTES[somme % TEINTES.length]!;
}

/**
 * `xl` EST LE PORTRAIT DE LA FICHE — EF-CRO-09, 26 aout 2026.
 *
 * Il grandit avec l'ecran plutot que de valoir 192 px partout : a cette
 * taille, un portrait fixe pousserait le nom et les badges sous la ligne de
 * flottaison sur un telephone, et la fiche commencerait par une photo au lieu
 * de commencer par quelqu'un.
 *
 * 192 px au plus large, pour 1024 px de source : le rapport couvre les ecrans
 * a haute densite, qui demandent le double de pixels physiques.
 */
const TAILLES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-32 text-4xl sm:size-40 md:size-48',
} as const;

export function AvatarCroyant({
  nom,
  prenom,
  url,
  taille = 'sm',
  className,
}: {
  nom: string;
  prenom: string;
  /** URL signee de la photo (EF-CRO-09). Les initiales prennent le relais. */
  url?: string | null;
  taille?: keyof typeof TAILLES;
  className?: string;
}) {
  const initiales = initialesAvatar(nom, prenom);

  if (url) {
    return (
      // Pas de `next/image` : l'URL est signée, donc change à chaque rendu et
      // pointe hors du domaine. L'optimiseur la retéléchargerait à chaque
      // signature, et son cache ne servirait jamais deux fois. L'image est
      // déjà réduite au téléversement (COTE_PHOTO_PIXELS) — plus rien à optimiser.
      // eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus
      <img
        src={url}
        alt=""
        aria-hidden
        className={cn(
          'inline-block shrink-0 rounded-full object-cover',
          TAILLES[taille],
          className,
        )}
      />
    );
  }

  return (
    <span
      // `aria-hidden` : le nom figure juste à côté. Le lire deux fois
      // encombrerait la navigation au lecteur d'écran.
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        TAILLES[taille],
        teinte(`${nom}${prenom}`),
        className,
      )}
    >
      {initiales}
    </span>
  );
}
