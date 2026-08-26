import { COTE_PHOTO_PIXELS } from '@/lib/storage/types';

/**
 * Recadrage et reduction d'une photo dans le NAVIGATEUR — EF-CRO-09.
 *
 * Une photo de telephone pese 3 a 5 Mo ; la meme, recadree et en WebP, en pese une
 * cinquantaine de kilo-octets. Sur une liaison lente, c'est la difference
 * entre un envoi immediat et une minute d'attente — pour un resultat identique
 * a l'ecran, ou l'image ne depasse jamais le portrait de la fiche.
 *
 * Le recadrage est CENTRE. Un cadrage interactif (glisser, zoomer) reste a
 * faire ; il n'ajoute rien tant que la photo n'est affichee qu'en vignette.
 *
 * Module partage par la SAISIE (creation, ou l'on garde le fichier en attente
 * de l'identifiant) et le TELEVERSEMENT (fiche, ou l'envoi est immediat) : un
 * second traitement aurait fini par produire des photos de formats differents
 * selon le chemin emprunte.
 *
 * Le serveur ne fait aucune confiance a ce traitement : il relit les premiers
 * octets pour determiner le type reel (ENF-SEC-06).
 */
export async function preparerPhoto(fichier: File): Promise<Blob> {
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

/** Le fichier prepare, pret a partir en `FormData`. */
export function versFichierWebp(blob: Blob): File {
  return new File([blob], 'photo.webp', { type: 'image/webp' });
}
