'use client';

import { useEffect, useRef, useState } from 'react';

import { RenduRapport, type EnteteRapport } from '@/components/rapports/rendu-rapport';
import type { StructureRapport } from '@/lib/domain/rapport';

/**
 * L'aperçu A4, DANS LA PAGE — EF-RAP-05.
 *
 * « Prévisualiser en temps réel **pendant** la composition » : un pop-up
 * échoue à la lettre de l'exigence. On ne compose pas et on ne regarde pas en
 * même temps s'il faut ouvrir puis fermer une fenêtre entre chaque geste — et
 * c'est précisément l'aller-retour que l'aperçu doit supprimer. Il occupe donc
 * la troisième colonne, comme `plan.md` §9.6 l'annonçait.
 *
 * L'ÉCHELLE EST MESURÉE, PAS DEVINÉE. Une feuille A4 fait 210 mm — environ
 * 794 px — et le panneau en fait quatre cents : il faut réduire. Un facteur
 * codé en dur serait faux dès qu'on redimensionne la fenêtre ou qu'on replie la
 * navigation. Un `ResizeObserver` lit la largeur réelle et en tire le rapport.
 *
 * LE PIÈGE DE `transform: scale`. Une transformation ne change PAS la place que
 * l'élément occupe dans le flux : réduite de moitié, la feuille laisse quand
 * même sa hauteur entière sous elle, et le panneau défile sur deux fois trop de
 * vide. D'où le conteneur intermédiaire, dont la hauteur est posée à la hauteur
 * réelle multipliée par l'échelle.
 */
export function ApercuPanneau({
  structure,
  entete,
}: {
  structure: StructureRapport;
  entete: EnteteRapport;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const feuille = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(0.45);
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    const exterieur = cadre.current;
    const interieur = feuille.current;
    if (!exterieur || !interieur) return;

    function mesurer() {
      if (!exterieur || !interieur) return;

      // `offsetWidth` reste la largeur de MISE EN PAGE — la transformation ne
      // l'affecte pas. C'est ce qui permet de mesurer sans boucler.
      const naturelle = interieur.offsetWidth;
      if (naturelle === 0) return;

      // Jamais d'agrandissement : une feuille A4 rendue à 130 % serait floue et
      // ne dirait rien de plus.
      const rapport = Math.min(1, exterieur.clientWidth / naturelle);
      setEchelle(rapport);
      setHauteur(interieur.offsetHeight * rapport);
    }

    const observateur = new ResizeObserver(mesurer);
    observateur.observe(exterieur);
    observateur.observe(interieur);
    mesurer();

    return () => observateur.disconnect();
    // La structure change la HAUTEUR du rendu : sans elle en dépendance, le
    // conteneur garderait celle de la composition précédente. (Le
    // `ResizeObserver` la rattraperait, mais un rendu plus tard.)
  }, [structure]);

  const vide = structure.sections.every((s) => s.blocs.length === 0);

  if (vide) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Rien à prévisualiser : posez un premier bloc et la feuille apparaîtra ici.
      </p>
    );
  }

  return (
    <div
      ref={cadre}
      /*
        `data-apercu` : à l'impression, `globals.css` masque tout le reste —
        palette, composition, navigation — et rend CETTE feuille à l'échelle 1.
        Imprimer, c'est imprimer l'aperçu (règle 16).
      */
      data-apercu
      className="w-full overflow-hidden"
    >
      <div style={{ height: hauteur }} className="print:h-auto">
        <div
          ref={feuille}
          style={{
            width: '210mm',
            transform: `scale(${echelle})`,
            transformOrigin: 'top left',
          }}
          className="print:!transform-none"
        >
          <RenduRapport structure={structure} entete={entete} />
        </div>
      </div>
    </div>
  );
}
