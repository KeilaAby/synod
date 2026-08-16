'use client';

import Link from 'next/link';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import type { CroyantRecent } from '@/lib/data/tableau-de-bord';
import { formatDate } from '@/lib/utils/format';

/**
 * Les dernières fiches enregistrées — EF-DSH-05.
 *
 * UN EFFECTIF DIT COMBIEN NOUS SOMMES, jamais QUI a rejoint. C'est pourtant la
 * première chose qu'un responsable regarde en ouvrant son écran, et la seule
 * qui appelle un geste : accueillir quelqu'un.
 *
 * CHAQUE LIGNE MÈNE À SA FICHE. Reconnaître un nom sans pouvoir l'ouvrir
 * obligerait à le retaper dans la recherche des croyants — deux gestes pour
 * revenir là où le premier clic aurait mené.
 */
export function DerniersCroyants({
  croyants,
  photos = {},
}: {
  croyants: CroyantRecent[];
  /** Clé de stockage -> URL signée, signées en lot par la page (EF-CRO-09). */
  photos?: Record<string, string>;
}) {
  if (croyants.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {/* Une liste vide n'est pas une panne : un périmètre neuf n'a encore
            personne, et le dire vaut mieux qu'un cadre vide (règle 15). */}
        Aucune fiche enregistrée dans votre périmètre.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {croyants.map((c) => (
        <li key={c.id}>
          <Link
            href={`/croyants/${c.id}`}
            className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
          >
            {/* Un visage se reconnaît plus vite qu'un nom. */}
            <AvatarCroyant
              nom={c.nom}
              prenom={c.prenom}
              url={c.photoKey ? photos[c.photoKey] : null}
            />

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {c.nom.toLocaleUpperCase('fr')} {c.prenom}
              </span>
              {c.egliseNom && (
                <span className="text-muted-foreground truncate text-xs">
                  {c.egliseNom}
                </span>
              )}
            </span>

            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatDate(c.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
