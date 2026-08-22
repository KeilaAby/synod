'use client';

import { LogoUploader } from '@/components/shared/logo-uploader';
import { supprimerLogoEntite, televerserLogoEntite } from '@/lib/actions/entities';

/**
 * L'en-tête propre à une entité — EF-RAP-02, migration `0073`.
 *
 * Source du bloc Image d'un rapport généré pour cette entité ; à défaut, le
 * logo de l'organisation prend sa place (`lib/data/rapport-generation.ts`).
 *
 * SANS `entity.update`, RIEN NE SE TÉLÉVERSE : le lecteur voit l'en-tête s'il
 * y en a un (règle 15 — la vérité est visible, pas devinée), mais aucun
 * bouton ne lui promet un geste qu'il ne peut pas accomplir.
 */
export function EntiteLogo({
  entiteId,
  logoUrl,
  peutModifier,
}: {
  entiteId: string;
  /** URL signée courante, ou `null` — la base ne stocke que la clé (règle 11). */
  logoUrl: string | null;
  peutModifier: boolean;
}) {
  if (!peutModifier) {
    if (!logoUrl) return null;
    return (
      <div className="flex h-16 w-32 items-center justify-center rounded border border-border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL signée, hors de tout domaine connu à l'avance. */}
        <img src={logoUrl} alt="" className="max-h-14 max-w-28 object-contain" />
      </div>
    );
  }

  return (
    <LogoUploader
      logoUrl={logoUrl}
      onUpload={(formulaire) => {
        formulaire.set('entityId', entiteId);
        return televerserLogoEntite(formulaire);
      }}
      onRemove={() => supprimerLogoEntite({ entityId: entiteId })}
      hint="Source du bloc Image des rapports générés pour cette entité (EF-RAP-02). Sans en-tête propre, le logo de l’organisation est utilisé."
      removeDescription="Les rapports générés pour cette entité utiliseront le logo de l’organisation, s’il y en a un. Le fichier est définitivement supprimé du stockage."
    />
  );
}
