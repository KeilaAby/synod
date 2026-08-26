import { describe, expect, it } from 'vitest';

import { entreeBureauDeEntite, peutOuvrirUnAutreBureau } from '@/lib/domain/bureau';
import {
  cloreMandatSchema,
  modifierBureauSchema,
  ouvrirMandatSchema,
} from '@/lib/validation/bureau';

/**
 * EF-BUR-01, EF-BUR-02 — schemas des bureaux.
 *
 * Ces tests fixent la BORNE des periodes. Elle a coute une panne le 8 aout
 * 2026 : la contrainte exigeait `date_fin > date_debut`, donc interdisait de
 * clore un bureau le jour de son ouverture — precisement le geste par lequel on
 * corrige une ouverture faite par erreur.
 */

const ENTITE = '11111111-1111-4111-8111-111111111111';
const BUREAU = '22222222-2222-4222-8222-222222222222';

describe('EF-BUR-02 — la periode se clot le jour meme, jamais avant', () => {
  it('accepte une fin egale au debut', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-08',
    });
    expect(r.success).toBe(true);
  });

  it('refuse une fin anterieure au debut', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-07',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['dateFin']);
    }
  });

  /**
   * EF-BUR-02, RG-07 — CE TEST DISAIT L'INVERSE JUSQU'AU 20 AOUT 2026 : « la
   * fin est facultative, un mandat peut rester ouvert ».
   *
   * Ce qui a change n'est pas l'avis, c'est la CONSEQUENCE. Depuis qu'un mandat
   * echu ferme l'application, un bureau sans terme ne s'acheve jamais — et
   * l'acces de ses membres non plus. La regle « seuls les membres en exercice
   * ont un compte » deviendrait alors une regle qu'on ne peut plus appliquer.
   */
  it('EF-BUR-02 — un bureau ne s’OUVRE PAS sans terme', () => {
    const r = ouvrirMandatSchema.safeParse({
      entityId: ENTITE,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '',
    });
    expect(r.success).toBe(false);
  });

  /**
   * LA MODIFICATION, ELLE, RESTE TOLERANTE — et ce n'est pas une incoherence.
   *
   * Des bureaux ont ete ouverts avant cette regle, sans terme. Corriger le
   * LIBELLE de l'un d'eux ne doit pas obliger a inventer sa date de fin : une
   * date de fin de mandat inventee est pire qu'une absente — elle a l'air
   * vraie, elle fermera des acces le jour venu, et personne ne saura d'ou elle
   * sort. Le trigger `trg_bureau_terme_requis` (0059) porte la meme borne en
   * base, a l'INSERT seulement.
   */
  it('EF-BUR-02 — la modification tolère l’absence de terme sur l’existant', () => {
    const r = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateFin).toBeNull();
  });

  it('applique la meme borne a la modification', () => {
    const memeJour = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Comite des finances',
      dateDebut: '2026-08-08',
      dateFin: '2026-08-08',
    });
    expect(memeJour.success).toBe(true);

    const inverse = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Comite des finances',
      dateDebut: '2026-08-08',
      dateFin: '2026-01-01',
    });
    expect(inverse.success).toBe(false);
  });
});

describe('EF-BUR-02 — ce que la modification NE touche pas', () => {
  /**
   * Regle 19 — un champ absent du formulaire ne doit pas voyager. L'entite de
   * rattachement en est un : la changer invaliderait RG-09 pour tous les
   * titulaires, qui appartiennent au sous-arbre de l'entite d'origine.
   */
  it("ignore l'entite et le cycle de vie qu'on tenterait de lui passer", () => {
    const r = modifierBureauSchema.safeParse({
      bureauId: BUREAU,
      libelle: 'Bureau executif',
      dateDebut: '2026-08-08',
      dateFin: '',
      entityId: ENTITE,
      is_active: true,
      deleted_at: null,
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual([
        'bureauId',
        'dateDebut',
        'dateFin',
        'libelle',
      ]);
    }
  });
});

describe("EF-BUR-01 — l'entree « bureau » du menu d'une entite", () => {
  it('propose de creer quand aucun bureau n existe, et qu on en a le droit', () => {
    expect(entreeBureauDeEntite([], true)).toBe('creer');
  });

  it('ne propose RIEN a qui ne peut ni gerer ni consulter', () => {
    // Une entree qui ouvrirait sur un refus vaut moins qu'une entree absente.
    expect(entreeBureauDeEntite([], false)).toBeNull();
  });

  it('mene droit a la composition quand le bureau est vide', () => {
    // Lister zero titulaire n'apprend rien : la seule action utile est d'en
    // nommer un.
    expect(entreeBureauDeEntite([{ nbMembres: 0 }], true)).toBe('composer');
  });

  it('laisse consulter un bureau vide sans droit de gestion', () => {
    // La lecture ne depend pas de `bureau.manage` : la RLS l'ouvre a tout le
    // perimetre. L'ecran adaptera son libelle, pas sa destination.
    expect(entreeBureauDeEntite([{ nbMembres: 0 }], false)).toBe('composer');
  });

  it('bascule sur la liste des membres des qu il y a un titulaire', () => {
    expect(entreeBureauDeEntite([{ nbMembres: 1 }], true)).toBe('consulter');
  });

  it('RG-10 : plusieurs bureaux, un seul total de titulaires', () => {
    // Le comite des finances est compose, la commission des jeunes non :
    // la liste vaut d'etre ouverte.
    expect(entreeBureauDeEntite([{ nbMembres: 0 }, { nbMembres: 3 }], true)).toBe(
      'consulter',
    );
    // Aucun des deux n'a de titulaire : on va composer.
    expect(entreeBureauDeEntite([{ nbMembres: 0 }, { nbMembres: 0 }], true)).toBe(
      'composer',
    );
  });
});

describe('Regle 12 — les schemas partages sont idempotents', () => {
  it('revalide sans se contredire ce qu il a deja transforme', () => {
    const brut = {
      bureauId: BUREAU,
      libelle: '  Bureau executif  ',
      dateDebut: '2026-08-08',
      dateFin: '',
    };

    const premier = modifierBureauSchema.parse(brut);
    const second = modifierBureauSchema.parse(premier);

    expect(second).toEqual(premier);
    expect(premier.libelle).toBe('Bureau executif');
    // `z.preprocess` et non `z.coerce` : `coerce.date('')` donnerait 1970.
    expect(premier.dateFin).toBeNull();
  });

  it('accepte la date de cloture sous ses deux formes', () => {
    const chaine = cloreMandatSchema.parse({ bureauId: BUREAU, dateFin: '2026-08-08' });
    const objet = cloreMandatSchema.parse({ bureauId: BUREAU, dateFin: chaine.dateFin });
    expect(objet.dateFin.getTime()).toBe(chaine.dateFin.getTime());
  });
});

/**
 * RG-10 — OUVRIR UN AUTRE BUREAU, alors qu'il en existe deja.
 *
 * LE DEFAUT QUE CES TESTS VERROUILLENT (signale le 26 aout 2026) : le menu ne
 * rendait QU'UNE entree, choisie sur l'etat. Des le premier bureau cree, elle
 * basculait sur « composer » puis « consulter », et « ouvrir un bureau »
 * disparaissait — une entite n'en avait donc plus jamais un second, alors que
 * la regle l'autorise et que le pop-up des bureaux l'annonce.
 */
describe('RG-10 — ouvrir un bureau de plus', () => {
  it('se propose des qu un bureau existe et qu on peut gerer', () => {
    expect(peutOuvrirUnAutreBureau([{ nbMembres: 0 }], true)).toBe(true);
    expect(peutOuvrirUnAutreBureau([{ nbMembres: 7 }], true)).toBe(true);
  });

  /**
   * SANS AUCUN BUREAU, L'ENTREE D'ETAT VAUT DEJA « creer ». Un second
   * « creer » ferait douter de la difference entre les deux, et l'utilisateur
   * ouvrirait l'un puis l'autre pour comprendre.
   */
  it('ne DOUBLE PAS l entree « creer » quand il n y a aucun bureau', () => {
    expect(peutOuvrirUnAutreBureau([], true)).toBe(false);
  });

  /**
   * Une entree qui ouvrirait sur un refus vaut moins qu'une entree absente —
   * meme raisonnement que pour `entreeBureauDeEntite`.
   */
  it('reste absente sans droit de gestion', () => {
    expect(peutOuvrirUnAutreBureau([{ nbMembres: 3 }], false)).toBe(false);
    expect(peutOuvrirUnAutreBureau([], false)).toBe(false);
  });

  /**
   * LES DEUX ENTREES COHABITENT, et c'est le point : l'une dit ou en est le
   * bureau, l'autre en ouvre un autre. Les confondre a produit le defaut.
   */
  it('coexiste avec l entree d etat, sans la remplacer', () => {
    const bureaux = [{ nbMembres: 7 }];
    expect(entreeBureauDeEntite(bureaux, true)).toBe('consulter');
    expect(peutOuvrirUnAutreBureau(bureaux, true)).toBe(true);
  });
});
