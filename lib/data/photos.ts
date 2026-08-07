import 'server-only';

import { DUREE_URL_PHOTO_SECONDES, storage } from '@/lib/storage';

/**
 * Resolution des photos — EF-CRO-09, ENF-SEC-06.
 *
 * La base ne stocke QUE des cles relatives (`photos/<uuid>.webp`) : l'URL
 * signee est fabriquee a l'affichage et n'est jamais persistee. C'est ce qui
 * permet de changer d'hebergeur sans reecrire une seule ligne (ENF-POR-03).
 *
 * La signature se fait EN LOT et une seule fois par rendu : signer photo par
 * photo ramenerait le probleme que le chargement integral de la liste vient
 * justement de resoudre — un aller-retour par ligne.
 */
export async function signerPhotos(
  cles: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const distinctes = [...new Set(cles.filter((c): c is string => Boolean(c)))];

  // Aucune photo : pas de requete du tout. Le cas reste le plus frequent tant
  // que le televersement n'est pas systematique.
  if (distinctes.length === 0) return new Map();

  const resultat = await storage().signedUrls(distinctes, DUREE_URL_PHOTO_SECONDES);

  // Un stockage indisponible ne doit pas priver l'utilisateur de sa liste :
  // les avatars a initiales prennent le relais.
  return resultat.ok ? resultat.data : new Map();
}
