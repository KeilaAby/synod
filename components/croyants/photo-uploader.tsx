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

/**
 * Photo de profil — EF-CRO-09.
 *
 * Le fichier est recadre en carre et redimensionne a {@link COTE_PHOTO_PIXELS}
 * AVANT l'envoi. Une photo de telephone pese 3 a 5 Mo ; la meme en WebP 512 px
 * en pese une cinquantaine de kilo-octets. Sur une liaison lente, c'est la
 * difference entre un envoi instantane et une minute d'attente — pour un
 * resultat identique a l'ecran, ou l'image ne depasse jamais 64 px.
 *
 * Le recadrage est CENTRE. Un cadrage interactif (glisser, zoomer) reste a
 * faire ; il n'ajoute rien tant que la photo n'est affichee qu'en vignette.
 *
 * Le serveur ne fait aucune confiance a ce traitement : il relit les premiers
 * octets pour determiner le type reel (ENF-SEC-06).
 */

/** Recadre au centre, redimensionne, et encode en WebP. */
async function preparer(fichier: File): Promise<Blob> {
  const image = await chargerImage(fichier);

  // Le plus petit cote donne le carre : on ne deforme jamais, on rogne.
  const cote = Math.min(image.width, image.height);
  const x = (image.width - cote) / 2;
  const y = (image.height - cote) / 2;

  const canevas = document.createElement('canvas');
  canevas.width = COTE_PHOTO_PIXELS;
  canevas.height = COTE_PHOTO_PIXELS;

  const contexte = canevas.getContext('2d');
  if (!contexte) throw new Error('canvas indisponible');

  contexte.imageSmoothingQuality = 'high';
  contexte.drawImage(image, x, y, cote, cote, 0, 0, COTE_PHOTO_PIXELS, COTE_PHOTO_PIXELS);

  return new Promise<Blob>((resoudre, rejeter) => {
    canevas.toBlob(
      (blob) => (blob ? resoudre(blob) : rejeter(new Error('encodage impossible'))),
      'image/webp',
      0.85,
    );
  });
}

function chargerImage(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();

    image.onload = () => {
      // L'URL objet est revoquee des le decodage : la garder ferait fuir de la
      // memoire a chaque essai de photo.
      URL.revokeObjectURL(url);
      resoudre(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error('image illisible'));
    };
    image.src = url;
  });
}

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
      const carre = await preparer(fichier);

      if (carre.size > CONTRAINTES_FICHIER.photo.tailleMaxOctets) {
        toast.error(`Photo trop lourde. Attendu : ${CONTRAINTES_FICHIER.photo.libelle}.`);
        return;
      }

      const formulaire = new FormData();
      formulaire.set('croyantId', croyantId);
      formulaire.set('photo', new File([carre], 'photo.webp', { type: 'image/webp' }));

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
