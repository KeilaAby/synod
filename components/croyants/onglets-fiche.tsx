'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Les sections de la fiche d'un croyant, en onglets — EF-CRO-06.
 *
 * CE QUE CELA REMPLACE. Les cinq cartes s'empilaient : identité, coordonnées,
 * rattachement, versements de dîme, historique. Sur une fiche complète, la
 * frise se trouvait à trois écrans de défilement du nom — et l'on y descendait
 * en passant devant tout le reste, à chaque fois.
 *
 * ELLES NE SE COMPARENT PAS ENTRE ELLES : on vient pour l'une d'elles, on sait
 * laquelle en arrivant, et on n'a pas besoin de voir les autres pour la lire.
 * C'est exactement ce que des onglets servent — et ce que le réglage du
 * workflow financier fait déjà, dont ce composant reprend l'habillage.
 *
 * L'IDENTITÉ RESTE EN PREMIER, et c'est le seul ordre défendable : c'est la
 * réponse à « qui est-ce ? », la question qu'on se pose avant toutes les
 * autres. Le portrait et le nom, eux, sont AU-DESSUS des onglets — ils ne se
 * cachent jamais, quel que soit l'onglet ouvert.
 *
 * LES CONTENUS SONT RENDUS PAR LE SERVEUR et traversent en `children` : ce
 * composant ne connaît ni les données, ni les droits, ni les requêtes. Il ne
 * décide que de ce qui est visible.
 */

export interface OngletFiche {
  readonly cle: string;
  readonly libelle: string;
  /**
   * Compteur facultatif, à droite du libellé. Absent quand il n'y a rien à
   * dénombrer : un « 0 » sur « Identité » n'apprendrait rien.
   */
  readonly compte?: number;
  readonly contenu: React.ReactNode;
}

export function OngletsFiche({ onglets }: { onglets: readonly OngletFiche[] }) {
  const [actif, setActif] = useState(onglets[0]?.cle ?? '');

  if (onglets.length === 0) return null;

  return (
    <Tabs value={actif} onValueChange={setActif}>
      {/*
        `variant="line"` : le trait sous l'onglet actif, et rien d'autre — pas
        de pastille, pas de fond. Le filet qui court sous toute la rangée est ce
        qui donne à ce trait sa place.
      */}
      <TabsList
        variant="line"
        className="border-border h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b p-0"
      >
        {onglets.map((onglet) => (
          /*
            Le trait de l'onglet actif POSE SUR le filet gris, sans interstice :
            `after:bottom-0` l'aligne sur le bord bas du déclencheur, que `p-0`
            sur la liste fait coïncider avec la bordure. Les deux classes
            reprennent le préfixe de variante du composant partagé — sans lui,
            elles s'ajouteraient aux siennes au lieu de les remplacer.
          */
          <TabsTrigger
            key={onglet.cle}
            value={onglet.cle}
            className="group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px] flex-none px-1 pt-1 pb-3 text-sm"
          >
            {onglet.libelle}
            {onglet.compte !== undefined && onglet.compte > 0 && (
              <span className="text-muted-foreground ml-2 font-mono text-xs tabular-nums">
                {onglet.compte}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {onglets.map((onglet) => (
        <TabsContent key={onglet.cle} value={onglet.cle} className="mt-6">
          {onglet.contenu}
        </TabsContent>
      ))}
    </Tabs>
  );
}
