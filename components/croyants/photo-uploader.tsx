'use client';

import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { supprimerPhotoCroyant, televerserPhotoCroyant } from '@/lib/actions/photos';
import { COTE_PHOTO_PIXELS, CONTRAINTES_FICHIER } from '@/lib/storage/types';
import { cn } from '@/lib/utils';

import { AvatarCroyant } from './avatar-croyant';
import { preparerPhoto, versFichierWebp } from './preparer-photo';

/**
 * Photo de profil d'un croyant EXISTANT — EF-CRO-09.
 *
 * L'envoi est immediat : la fiche existe, donc la cle `photos/<uuid>` aussi.
 * A la CREATION l'identifiant n'existe pas encore ; c'est `SelecteurPhoto`
 * qui garde le fichier en attente, et le formulaire l'envoie une fois la fiche
 * creee.
 *
 * Le traitement d'image est partage : voir `preparer-photo.ts`.
 */

export function PhotoUploader({
  croyantId,
  nom,
  prenom,
  urlPhoto,
  peutModifier,
  className,
}: {
  croyantId: string;
  nom: string;
  prenom: string;
  /** URL signee courante, ou `null` : la base ne stocke que la cle. */
  urlPhoto: string | null;
  peutModifier: boolean;
  className?: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);

  const [enCours, setEnCours] = useState(false);
  // Aperçu local : la photo s'affiche des l'envoi accepte, sans attendre que
  // le serveur ait revalide la page.
  const [apercu, setApercu] = useState<string | null>(null);

  const affichee = apercu ?? urlPhoto;

  async function envoyer(fichier: File) {
    setEnCours(true);
    try {
      const carre = await preparerPhoto(fichier);

      if (carre.size > CONTRAINTES_FICHIER.photo.tailleMaxOctets) {
        toast.error(`Photo trop lourde. Attendu : ${CONTRAINTES_FICHIER.photo.libelle}.`);
        return;
      }

      const formulaire = new FormData();
      formulaire.set('croyantId', croyantId);
      formulaire.set('photo', versFichierWebp(carre));

      const resultat = await televerserPhotoCroyant(formulaire);
      if (!resultat.ok) {
        toast.error(resultat.error);
        return;
      }

      setApercu(URL.createObjectURL(carre));
      toast.success('Photo enregistree.');
      router.refresh();
    } catch {
      // Un fichier corrompu ou un format que le navigateur ne sait pas decoder
      // echoue ici, avant tout envoi.
      toast.error("Ce fichier n'a pas pu etre lu comme une image.");
    } finally {
      setEnCours(false);
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative">
        <AvatarCroyant nom={nom} prenom={prenom} url={affichee} taille="lg" />

        {enCours && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-card/70">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </span>
        )}
      </div>

      {peutModifier && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={champ}
              type="file"
              accept={CONTRAINTES_FICHIER.photo.types.join(',')}
              className="sr-only"
              aria-label="Choisir une photo"
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) void envoyer(fichier);
              }}
            />

            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={enCours}
              onClick={() => champ.current?.click()}
            >
              {affichee ? (
                <Camera className="mr-2 size-4" aria-hidden />
              ) : (
                <Upload className="mr-2 size-4" aria-hidden />
              )}
              {affichee ? 'Changer' : 'Ajouter une photo'}
            </Button>

            {affichee && (
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-destructive hover:text-destructive"
                    disabled={enCours}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Retirer
                  </Button>
                }
                title="Retirer la photo ?"
                description="La fiche reprendra l'avatar a initiales. L'image est definitivement supprimee du stockage."
                confirmLabel="Retirer"
                onConfirm={async () => {
                  const resultat = await supprimerPhotoCroyant({ croyantId });
                  if (!resultat.ok) {
                    toast.error(resultat.error);
                    return;
                  }
                  setApercu(null);
                  toast.success('Photo retiree.');
                  router.refresh();
                }}
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {CONTRAINTES_FICHIER.photo.libelle}. L&apos;image est recadree en carre et
            reduite a {COTE_PHOTO_PIXELS} px avant l&apos;envoi.
          </p>
        </div>
      )}
    </div>
  );
}
