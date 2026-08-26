'use client';

import { Camera, Eye, ImageOff, Loader2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { avertir } from '@/components/shared/messages';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supprimerPhotoCroyant, televerserPhotoCroyant } from '@/lib/actions/photos';
import { COTE_PHOTO_PIXELS, CONTRAINTES_FICHIER } from '@/lib/storage/types';
import { cn } from '@/lib/utils';

import { AvatarCroyant } from './avatar-croyant';
import { preparerPhoto, versFichierWebp } from './preparer-photo';

/**
 * Photo de profil d'un croyant EXISTANT — EF-CRO-09.
 *
 * L'envoi est immediat : la fiche existe, donc la cle `photos/<uuid>` aussi.
 * A la CREATION l'identifiant n'existe pas encore ; c'est `SelecteurPhoto` qui
 * garde le fichier en attente, et le formulaire l'envoie une fois la fiche
 * creee. Le traitement d'image est partage : voir `preparer-photo.ts`.
 *
 * UN PORTRAIT, ET UNE SEULE COMMANDE — refonte du 26 aout 2026.
 *
 * L'ecran posait un avatar de 64 px suivi de DEUX boutons en clair
 * (« Changer », « Retirer ») et d'une ligne de contraintes techniques. Trois
 * elements de commande pour une image qu'on vient regarder, et qu'on ne change
 * peut-etre qu'une fois dans la vie de la fiche : le rapport etait inverse.
 *
 * Desormais la photo occupe la place qui lui revient, et les actions se
 * replient sous une pastille d'appareil photo posee sur le bord du portrait.
 * C'est le geste que tout le monde connait — on clique la photo pour agir
 * dessus — et il ne coute plus rien tant qu'on ne s'en sert pas.
 *
 * « VOIR LA PHOTO » EST LA PREMIERE ENTREE, et ce n'est pas de la courtoisie :
 * c'est la seule action ouverte a TOUT LE MONDE, y compris a qui n'a pas le
 * droit de modifier. Le portrait de la fiche est borne pour tenir dans une mise
 * en page ; l'image, elle, fait 1024 px de cote, et il y a des visages qu'on ne
 * reconnait qu'en grand.
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
  const [agrandie, setAgrandie] = useState(false);
  const [aRetirer, setARetirer] = useState(false);
  /**
   * Apercu local : la photo s'affiche des l'envoi accepte, sans attendre que
   * le serveur ait revalide la page.
   */
  const [apercu, setApercu] = useState<string | null>(null);

  const affichee = apercu ?? urlPhoto;

  /**
   * L'URL LOCALE SE LIBERE quand elle cesse de servir.
   *
   * `URL.createObjectURL` retient le blob tant que le document vit : changer
   * trois fois de photo sans quitter la fiche garderait trois images en
   * memoire, dont deux que plus rien n'affiche.
   */
  useEffect(() => {
    return () => {
      if (apercu) URL.revokeObjectURL(apercu);
    };
  }, [apercu]);

  async function envoyer(fichier: File) {
    setEnCours(true);
    try {
      const carre = await preparerPhoto(fichier);

      if (carre.size > CONTRAINTES_FICHIER.photo.tailleMaxOctets) {
        avertir(`Photo trop lourde. Attendu : ${CONTRAINTES_FICHIER.photo.libelle}.`);
        return;
      }

      const formulaire = new FormData();
      formulaire.set('croyantId', croyantId);
      formulaire.set('photo', versFichierWebp(carre));

      const resultat = await televerserPhotoCroyant(formulaire);
      if (!resultat.ok) {
        avertir(resultat.error);
        return;
      }

      setApercu(URL.createObjectURL(carre));
      toast.success('Photo enregistrée.');
      router.refresh();
    } catch {
      // Un fichier corrompu ou un format que le navigateur ne sait pas decoder
      // echoue ici, avant tout envoi.
      avertir('Ce fichier n’a pas pu être lu comme une image.');
    } finally {
      setEnCours(false);
      if (champ.current) champ.current.value = '';
    }
  }

  async function retirer() {
    const resultat = await supprimerPhotoCroyant({ croyantId });
    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    setApercu(null);
    toast.success('Photo retirée.');
    router.refresh();
  }

  /**
   * Sans photo NI droit de modifier, il n'y a ni rien a voir ni rien a faire :
   * la pastille disparait plutot que d'ouvrir un menu vide.
   */
  const menuUtile = Boolean(affichee) || peutModifier;

  return (
    <div className={cn('relative w-fit', className)}>
      <AvatarCroyant nom={nom} prenom={prenom} url={affichee} taille="xl" />

      {enCours && (
        <span className="bg-card/70 absolute inset-0 flex items-center justify-center rounded-full">
          <Loader2 className="text-muted-foreground size-8 animate-spin" aria-hidden />
        </span>
      )}

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

      {menuUtile && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/*
              LA PASTILLE MORD SUR LE PORTRAIT — c'est ce qui la rattache à la
              photo plutôt qu'à la mise en page. Posée à côté, elle se lirait
              comme un bouton parmi d'autres ; posée dessus, elle dit « ceci
              agit sur cette image », sans un mot.

              `ring-card` la détoure de la couleur du fond : sur un portrait
              sombre, un rond sombre sans liseré disparaîtrait dans l'image.
            */}
            <button
              type="button"
              disabled={enCours}
              aria-label={`Photo de ${prenom} ${nom}`}
              className="bg-foreground text-background ring-card hover:bg-foreground/85 absolute right-1 bottom-1 flex size-9 items-center justify-center rounded-full ring-4 transition-colors disabled:opacity-50 sm:right-2 sm:bottom-2 sm:size-10"
            >
              <Camera className="size-4 sm:size-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-56">
            {/* La seule action ouverte à TOUS, y compris en lecture seule. */}
            {affichee && (
              <DropdownMenuItem onSelect={() => setAgrandie(true)}>
                <Eye className="mr-2 size-4" aria-hidden />
                Voir la photo
              </DropdownMenuItem>
            )}

            {peutModifier && (
              <>
                {affichee && <DropdownMenuSeparator />}

                <DropdownMenuItem onSelect={() => champ.current?.click()}>
                  {affichee ? (
                    <Camera className="mr-2 size-4" aria-hidden />
                  ) : (
                    <Upload className="mr-2 size-4" aria-hidden />
                  )}
                  {affichee ? 'Changer la photo' : 'Ajouter une photo'}
                </DropdownMenuItem>

                {affichee && (
                  <DropdownMenuItem
                    onSelect={() => setARetirer(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Retirer la photo
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/*
        LA CONTRAINTE NE S'AFFICHE PLUS EN PERMANENCE.

        « JPEG ou PNG, 2 Mo au plus, recadré en carré » était écrit sous chaque
        fiche, pour un geste rare — et personne ne lit deux fois une consigne
        qui ne le concerne pas. Elle vit maintenant là où l'on regarde déjà la
        photo, et le refus la rappelle de toute façon quand il arrive.
      */}
      <Dialog open={agrandie} onOpenChange={setAgrandie}>
        <DialogContent className="w-[min(96vw,44rem)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>
              {prenom} {nom}
            </DialogTitle>
            <DialogDescription>
              {CONTRAINTES_FICHIER.photo.libelle}. L’image est recadrée en carré et
              réduite à {COTE_PHOTO_PIXELS} px avant l’envoi.
            </DialogDescription>
          </DialogHeader>

          {affichee ? (
            // Pas de `next/image` : l'URL est signee, donc change a chaque rendu
            // et pointe hors du domaine (meme raison que dans `AvatarCroyant`).
            // eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus
            <img
              src={affichee}
              alt={`Photo de ${prenom} ${nom}`}
              className="mx-auto max-h-[70vh] w-full max-w-lg rounded-xl object-contain"
            />
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <ImageOff className="size-4" aria-hidden />
              Aucune photo sur cette fiche.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/*
        LE POP-UP DE CONFIRMATION EST PILOTÉ, et non déclenché par son propre
        bouton : une entrée de menu ne peut pas servir de `trigger` — le menu se
        ferme au choix, ce qui démonterait le déclencheur avant que le pop-up
        n'ait eu le temps de s'ouvrir.
      */}
      <ConfirmDialog
        open={aRetirer}
        onOpenChange={setARetirer}
        title="Retirer la photo ?"
        description="La fiche reprendra l’avatar à initiales. L’image est définitivement supprimée du stockage."
        confirmLabel="Retirer"
        onConfirm={retirer}
      />
    </div>
  );
}
