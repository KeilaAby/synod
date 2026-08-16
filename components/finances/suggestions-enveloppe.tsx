'use client';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';

/**
 * Qui a déjà porté ce numéro d'enveloppe — EF-FIN-27.
 *
 * Un membre du bureau tient l'enveloppe en main et en lit le NUMÉRO avant le
 * nom — souvent il n'y a pas de nom du tout. L'historique sait qui l'utilisait ;
 * il le propose.
 *
 * Une SUGGESTION, jamais une attribution : deux personnes peuvent avoir porté
 * le même numéro à des années d'écart, et c'est l'utilisateur qui reconnaît
 * l'écriture sur l'enveloppe.
 *
 * PARTAGÉ ENTRE LA COLLECTE ET LA FILE DE RAPPROCHEMENT. Le numéro lu dans un
 * fichier importé pose exactement la même question que celui tapé pendant un
 * culte — « à qui est cette enveloppe ? » — et mérite donc la même réponse.
 * Deux rendus séparés auraient divergé au premier ajustement.
 */

export interface PorteurSuggere {
  readonly croyantId: string;
  readonly nom: string;
  readonly prenom: string;
}

export function SuggestionsEnveloppe({
  porteurs,
  fiche,
  photos = {},
  onChoisir,
}: {
  porteurs: readonly PorteurSuggere[];
  /**
   * Le complément de la fiche : matricule, église, portrait.
   *
   * Une FONCTION plutôt qu'une liste : l'appelant garde ses options telles
   * qu'il les a reçues, sans en fabriquer une copie remise en forme à chaque
   * rendu.
   */
  fiche?: (croyantId: string) => {
    matricule?: string;
    detail?: string | null;
    photoKey?: string | null;
  } | null;
  /** Clé de stockage -> URL signée, signées en lot par la page (EF-CRO-09). */
  photos?: Record<string, string>;
  onChoisir: (croyantId: string) => void;
}) {
  if (porteurs.length === 0) return null;

  return (
    /*
      LE MÊME RENDU QUE LA LISTE DES CROYANTS — portrait, nom, matricule,
      église — mais posé À PLAT, sans déclencheur ni recherche.

      L'en-tête remplace le champ de recherche : il dit d'où viennent ces noms,
      ce qu'un champ vide n'aurait jamais expliqué.
    */
    <div className="border-border mt-1 rounded-md border">
      <p className="text-muted-foreground border-border border-b px-2 py-1.5 text-xs">
        Numéro déjà utilisé par :
      </p>

      {/*
        DES NOMS CLIQUABLES, pas un menu.

        Une liste déroulante demandait un clic pour l'ouvrir avant celui qui
        retient le nom : deux gestes pour une suggestion qu'on accepte ou qu'on
        ignore d'un coup d'œil. Les porteurs sont peu nombreux — ils tiennent à
        l'écran.
      */}
      {porteurs.map((p) => {
        const complement = fiche?.(p.croyantId);

        return (
          <button
            key={p.croyantId}
            type="button"
            onClick={() => onChoisir(p.croyantId)}
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 p-2 text-left"
          >
            {/* Un visage se reconnaît plus vite qu'un nom, surtout entre
                homonymes. */}
            <AvatarCroyant
              nom={p.nom}
              prenom={p.prenom}
              url={complement?.photoKey ? photos[complement.photoKey] : null}
            />

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {p.nom.toLocaleUpperCase('fr')} {p.prenom}
                </span>
                {/* Le matricule sépare deux homonymes quand le visage manque. */}
                {complement?.matricule && (
                  <span className="text-muted-foreground font-mono text-xs">
                    {complement.matricule}
                  </span>
                )}
              </span>
              {complement?.detail && (
                <span className="text-muted-foreground truncate text-xs">
                  {complement.detail}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
