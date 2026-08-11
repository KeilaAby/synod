'use client';

import { Camera, Loader2, Upload, X } from 'lucide-react';
import { useState } from 'react';

import { avertir } from '@/components/shared/messages';
import { Button } from '@/components/ui/button';
import { COTE_PHOTO_PIXELS, CONTRAINTES_FICHIER } from '@/lib/storage/types';
import { cn } from '@/lib/utils';

import { AvatarCroyant } from './avatar-croyant';
import { preparerPhoto } from './preparer-photo';

/**
 * Choix d'une photo A LA CREATION — EF-CRO-09.
 *
 * La cle de stockage est `photos/<identifiant du croyant>` : tant que la fiche
 * n'existe pas, il n'y a nulle part ou deposer. Ce composant ne televerse donc
 * RIEN — il prepare l'image et la garde en memoire ; le formulaire l'envoie
 * une fois la fiche creee et l'identifiant connu.
 *
 * Demander la photo apres coup, sur la fiche, aurait ete plus simple a coder
 * et moins bon a l'usage : on saisit un croyant une fois, avec sa photo sous
 * les yeux. Revenir plus tard, c'est ne jamais revenir.
 */
export function SelecteurPhoto({
  nom,
  prenom,
  photo,
  onPhoto,
  className,
}: {
  nom: string;
  prenom: string;
  /** Image deja preparee, ou `null`. Detenue par le formulaire. */
  photo: Blob | null;
  onPhoto: (photo: Blob | null) => void;
  className?: string;
}) {
  const [enCours, setEnCours] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);

  async function choisir(fichier: File) {
    setEnCours(true);
    try {
      const carre = await preparerPhoto(fichier);

      if (carre.size > CONTRAINTES_FICHIER.photo.tailleMaxOctets) {
        avertir(`Photo trop lourde. Attendu : ${CONTRAINTES_FICHIER.photo.libelle}.`);
        return;
      }

      // L'ancien aperçu est revoque : sans cela, chaque essai laisserait une
      // URL objet vivante jusqu'au rechargement de la page.
      if (apercu) URL.revokeObjectURL(apercu);

      setApercu(URL.createObjectURL(carre));
      onPhoto(carre);
    } catch {
      avertir("Ce fichier n'a pas pu etre lu comme une image.");
    } finally {
      setEnCours(false);
    }
  }

  function retirer() {
    if (apercu) URL.revokeObjectURL(apercu);
    setApercu(null);
    onPhoto(null);
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative">
        <AvatarCroyant nom={nom || '?'} prenom={prenom} url={apercu} taille="lg" />

        {enCours && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-card/70">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {/*
            `label` plutot qu'un bouton pilotant un `input` cache : dans un
            formulaire, un `<button>` sans `type` vaut « submit » — et un clic
            sur « Ajouter une photo » aurait valide l'etape.
          */}
          <label
            className={cn(
              'inline-flex h-10 cursor-pointer items-center rounded-md border border-input',
              'bg-background px-4 text-sm font-medium transition-colors hover:bg-slate-50',
              'focus-within:ring-2 focus-within:ring-ring',
              enCours && 'pointer-events-none opacity-60',
            )}
          >
            {photo ? (
              <Camera className="mr-2 size-4" aria-hidden />
            ) : (
              <Upload className="mr-2 size-4" aria-hidden />
            )}
            {photo ? 'Changer la photo' : 'Ajouter une photo'}
            <input
              type="file"
              accept={CONTRAINTES_FICHIER.photo.types.join(',')}
              className="sr-only"
              disabled={enCours}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) void choisir(fichier);
                // Rechoisir le meme fichier doit redeclencher `change`.
                e.target.value = '';
              }}
            />
          </label>

          {photo && (
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={retirer}
              disabled={enCours}
            >
              <X className="mr-2 size-4" aria-hidden />
              Retirer
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Facultatif — {CONTRAINTES_FICHIER.photo.libelle}. Recadree en carre et reduite
          a {COTE_PHOTO_PIXELS} px. Elle sera jointe a l&apos;enregistrement.
        </p>
      </div>
    </div>
  );
}
