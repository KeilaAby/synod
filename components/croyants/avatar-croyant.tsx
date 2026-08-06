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

const TAILLES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
} as const;

export function AvatarCroyant({
  nom,
  prenom,
  taille = 'sm',
  className,
}: {
  nom: string;
  prenom: string;
  taille?: keyof typeof TAILLES;
  className?: string;
}) {
  const initiales = initialesAvatar(nom, prenom);

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
