import 'server-only';

import type { Solde } from '@/lib/domain/finance';

import { type ChiffresEntite, chargerChiffresPerimetre } from './entities';
import { chargerSoldesPerimetre } from './finances';
import { getParametres } from './settings';

/**
 * EF-STR-06 — le paquet de chiffres pret a TRAVERSER la frontiere.
 *
 * POURQUOI UN MODULE A PART, ET NON UNE FONCTION DE `entities.ts`.
 *
 * `finances.ts` importe deja `entities.ts` : y ajouter l'import inverse
 * fabriquait un CYCLE. TypeScript l'accepte et le paquet se construit, mais un
 * module qui echoue au chargement casse en amont de tout garde-fou — la Server
 * Action ne demarre pas, aucun `try/catch` n'attrape rien, l'ecran reste muet
 * (regle 29). Ce module-ci depend des trois et n'est importe par aucun d'eux :
 * le cycle n'existe pas plutot que d'etre tolere.
 *
 * REGLE 24 : une `Map` ne passe pas du serveur au client — elle arrive vide, et
 * la page tombe au premier `.get()`. Les deux lectures rendent des `Map` parce
 * que c'est ce qui sert le mieux le code serveur ; on les aplatit ici, une
 * fois, au bon endroit.
 *
 * Les trois lectures partent EN PARALLELE (regle 28), et les soldes viennent de
 * `chargerSoldesPerimetre` : en ecrire une seconde somme donnerait deux
 * resultats que rien ne garantirait egaux (regle 16).
 */
export interface ChiffresStructure {
  readonly chiffres: Record<string, ChiffresEntite>;
  readonly soldes: Record<string, Solde>;
  readonly devise: string;
}

export async function chargerChiffresStructure(): Promise<ChiffresStructure> {
  const [chiffres, soldes, parametres] = await Promise.all([
    chargerChiffresPerimetre(),
    chargerSoldesPerimetre(),
    getParametres(),
  ]);

  return {
    chiffres: Object.fromEntries(chiffres),
    soldes: Object.fromEntries(soldes),
    devise: parametres.devise,
  };
}
