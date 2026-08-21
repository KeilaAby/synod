// @ts-check
/**
 * Ecrit les CANEVAS D'IMPORT sur disque — `pnpm canevas`.
 *
 * L'APPLICATION LES FABRIQUE DEJA AU CLIC : le bouton « Télécharger le canevas
 * Excel » vit dans chacun des deux pop-up d'import, et c'est le chemin normal.
 * Ce script sert le cas ou l'on veut les fichiers SANS ouvrir l'application —
 * les joindre a un courriel, les poser sur un partage, les imprimer.
 *
 * IL NE REDEFINIT RIEN. Le contenu — colonnes, obligation, aide, exemples,
 * guide — vit dans `lib/domain/canevas-import.ts`, avec le reste des regles
 * d'import. Le recopier ici en ferait une seconde version, et le jour ou une
 * colonne devient facultative, celle-ci l'ignorerait. Or c'est le fichier que
 * le saisiste remplit.
 *
 * `tsx` execute le TypeScript directement : le script reste une commande, sans
 * etape de compilation a maintenir.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANEVAS_CROYANTS,
  CANEVAS_DIMES,
  feuillesDuCanevas,
  nomDuCanevas,
} from '@/lib/domain/canevas-import';
import { ecrireClasseurXlsx } from '@/lib/domain/xlsx-ecriture';

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'canevas');
mkdirSync(SORTIE, { recursive: true });

console.log('Canevas ecrits dans canevas/ :');

for (const canevas of [CANEVAS_CROYANTS, CANEVAS_DIMES]) {
  const nom = nomDuCanevas(canevas);
  writeFileSync(join(SORTIE, nom), ecrireClasseurXlsx(feuillesDuCanevas(canevas)));
  console.log(`  · ${nom}`);
}
