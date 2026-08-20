import { describe, expect, it } from 'vitest';

import { exigeDelegation, motifDeDelegation } from '@/lib/domain/finance';

/**
 * ARB-2 / EF-FIN-05 — QUI N'A PERSONNE POUR TENIR SES ECRITURES.
 *
 * Le critere etait « declaree sans acces a l'application ». Il etait trop
 * etroit, et le defaut s'est vu le 20 aout 2026 : une cellule ouverte la veille
 * a l'acces et n'a pourtant AUCUN compte — un compte suppose un mandat en cours
 * (lot 7), et son bureau n'est pas constitue. `finance.create` etant PROPRE
 * depuis 0050, l'ascendant ne pouvait pas davantage saisir en direct : les deux
 * branches refusaient, et l'argent n'entrait nulle part.
 */
describe('EF-FIN-05 — la saisie deleguee suppose l absence d operateur', () => {
  it('une entite declaree sans acces a besoin qu on saisisse pour elle', () => {
    expect(
      exigeDelegation({ sansAccesApplication: true, membresBureauEnCours: 0 }),
    ).toBe(true);
  });

  it('une entite qui a l acces mais AUCUN titulaire aussi — le cas manquant', () => {
    expect(
      exigeDelegation({ sansAccesApplication: false, membresBureauEnCours: 0 }),
    ).toBe(true);
  });

  it('une entite pourvue d un seul titulaire saisit pour elle-meme', () => {
    // Un seul suffit : la question est « y a-t-il quelqu'un », pas « le bureau
    // est-il complet ». Exiger un bureau au complet fermerait la saisie a une
    // eglise qui n'a qu'un tresorier, ce qui est le cas courant.
    expect(
      exigeDelegation({ sansAccesApplication: false, membresBureauEnCours: 1 }),
    ).toBe(false);
  });

  it('le motif nomme une DECISION avant de nommer une lacune', () => {
    /**
     * Une entite sans acces n'a pas de compte, donc pas de titulaire : les deux
     * motifs sont vrais a la fois. On rend le plus explicatif — « ne se
     * connecte pas » est une decision qui durera, « pas encore de bureau » un
     * etat de fait qui se resoudra tout seul.
     */
    expect(
      motifDeDelegation({ sansAccesApplication: true, membresBureauEnCours: 0 }),
    ).toBe('SANS_ACCES');

    expect(
      motifDeDelegation({ sansAccesApplication: false, membresBureauEnCours: 0 }),
    ).toBe('SANS_OPERATEUR');
  });

  it('rend `null` quand l entite se debrouille — la delegation lui est REFUSEE', () => {
    // `null` n'est pas « on ne sait pas » : c'est « elle n'en a pas besoin ».
    // C'est ce qui empeche un ascendant de signer du nom d'une entite qui tient
    // tres bien ses propres ecritures.
    expect(
      motifDeDelegation({ sansAccesApplication: false, membresBureauEnCours: 3 }),
    ).toBeNull();
  });

  it('la delegation SE REFERME d elle-meme le jour ou un bureau s ouvre', () => {
    // La condition se relit a chaque ecriture (regle 21) : rien a defaire, rien
    // a penser a retirer. C'est ce qui distingue ce critere d'un reglage.
    const avant = { sansAccesApplication: false, membresBureauEnCours: 0 };
    const apres = { ...avant, membresBureauEnCours: 2 };

    expect(exigeDelegation(avant)).toBe(true);
    expect(exigeDelegation(apres)).toBe(false);
  });
});
