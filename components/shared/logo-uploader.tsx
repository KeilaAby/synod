'use client';

import { Loader2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/domain/result';
import { CONTRAINTES_FICHIER } from '@/lib/storage/types';

/**
 * Un logo à clé fixe, téléversé puis retiré — le même geste partout où une
 * ligne de réglages unique porte une seule image (règle 16) : l'attestation
 * de transfert (EF-TRF-08) et le logo de l'organisation (EF-RAP-02).
 * Extrait le 22 août 2026 en écrivant le second appelant : la première
 * occurrence n'avait pas encore de raison de se dédoubler.
 *
 * ENVOI IMMÉDIAT, PAS DE BROUILLON : le fichier existe ou n'existe pas, il
 * n'y a rien à confirmer par un bouton « Enregistrer » séparé — même
 * distinction que `PhotoUploader`.
 */
export function LogoUploader({
  logoUrl,
  onUpload,
  onRemove,
  hint,
  removeTitle = 'Retirer le logo ?',
  removeDescription,
}: {
  /** URL signée courante, ou `null` — la base ne stocke que la clé (règle 11). */
  logoUrl: string | null;
  onUpload: (formulaire: FormData) => Promise<ActionResult<{ logoKey: string }>>;
  onRemove: () => Promise<ActionResult<void>>;
  /** Où et comment ce logo précis s'imprime. */
  hint: string;
  removeTitle?: string;
  removeDescription: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fichier: File) {
    setEnCours(true);
    try {
      const formulaire = new FormData();
      formulaire.set('logo', fichier);

      const resultat = await onUpload(formulaire);
      if (!resultat.ok) {
        avertir(resultat.error);
        return;
      }
      toast.success('Logo enregistré.');
      router.refresh();
    } finally {
      setEnCours(false);
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-border p-4">
      <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée, hors de tout domaine connu à l'avance.
          <img src={logoUrl} alt="" className="max-h-14 max-w-28 object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Aucun logo</span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={champ}
            type="file"
            accept={CONTRAINTES_FICHIER.photo.types.join(',')}
            className="sr-only"
            aria-label="Choisir un logo"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void envoyer(fichier);
            }}
          />

          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={enCours}
            onClick={() => champ.current?.click()}
          >
            {enCours ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-2 size-4" aria-hidden />
            )}
            {logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
          </Button>

          {logoUrl && (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 text-destructive hover:text-destructive"
                  disabled={enCours}
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Retirer
                </Button>
              }
              title={removeTitle}
              description={removeDescription}
              confirmLabel="Retirer"
              onConfirm={async () => {
                const resultat = await onRemove();
                if (!resultat.ok) {
                  avertir(resultat.error);
                  return;
                }
                toast.success('Logo retiré.');
                router.refresh();
              }}
            />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {CONTRAINTES_FICHIER.photo.libelle}. {hint}
        </p>
      </div>
    </div>
  );
}
