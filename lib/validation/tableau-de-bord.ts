import { z } from 'zod';

/**
 * La disposition du tableau de bord — EF-DSH-03, EF-DSH-07.
 *
 * ELLE EST BORNEE, alors qu'elle ne concerne que son auteur. Une colonne
 * `jsonb` accepte n'importe quoi : sans plafond, un appel direct a l'API y
 * ecrirait un mégaoctet de cles inventees, relu a chaque ouverture de la page
 * par le compte lui-meme. Le plafond n'est pas la pour proteger les autres,
 * mais pour que la table reste une preference et non un depot.
 *
 * LES CLES NE SONT PAS VALIDEES CONTRE LE REGISTRE, et c'est voulu : une cle
 * inconnue ne resout aucun indicateur et disparait d'elle-meme a l'affichage.
 * Les refuser obligerait a migrer les dispositions de tout le monde le jour ou
 * un indicateur est renomme.
 */
const cle = z.string().trim().min(1).max(64);

export const dispositionSchema = z.object({
  ordre: z.array(cle).max(100),
  masques: z.array(cle).max(100),
});

export type DispositionInput = z.input<typeof dispositionSchema>;
