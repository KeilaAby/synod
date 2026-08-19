import type { Metadata } from 'next';

import { ReglagesCourriel } from '@/components/administration/reglages-courriel';
import { ReglagesProfils } from '@/components/administration/reglages-profils';
import { PageHeader } from '@/components/shared/page-header';
import {
  chargerConfigurationCourriel,
  chargerModelesCourriel,
  chargerProfilsHabilitation,
} from '@/lib/data/courriel';
import { getParametres } from '@/lib/data/settings';

import { OngletsParametres } from './onglets-parametres';
import { ParametresClient } from './parametres-client';

export const metadata: Metadata = { title: 'Parametres generaux' };

/**
 * EF-ADM-11, EF-ADM-13 — les options configurables, au meme endroit.
 *
 * TROIS ONGLETS PLUTOT QU'UN SEUL FORMULAIRE. EF-ADM-13 demande un ENDROIT
 * unique, pas un ECRAN unique : trois familles de reglages qui ne se relisent
 * jamais ensemble — l'organisation, les droits, le courriel — donneraient une
 * page de trois metres ou l'on ne retrouverait rien. L'onglet garde l'unite de
 * lieu sans imposer l'unite de page.
 *
 * CHAQUE ONGLET A SON PROPRE ENREGISTREMENT. Un bouton commun ferait renvoyer
 * la configuration SMTP a chaque changement de devise, et un refus sur l'une
 * ferait perdre les deux autres.
 *
 * Regle 21 — les parametres se LISENT a chaque rendu. `getParametres` est
 * memoise par requete, pas par processus : le reglage change et l'ecran suit,
 * sans redemarrage.
 */
export default async function ParametresPage() {
  /**
   * Trois lectures INDEPENDANTES, en parallele (regle 28). Les deux dernieres
   * ne rendent rien sans `settings.manage` — leur RLS s'en charge, et le repli
   * tient lieu de reponse.
   */
  const [parametres, configuration, modeles, profils] = await Promise.all([
    getParametres(),
    chargerConfigurationCourriel(),
    chargerModelesCourriel(),
    chargerProfilsHabilitation(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Parametres generaux"
        description="Ce qui vaut pour toute l'organisation : identite, devise, workflows et defauts."
      />

      <OngletsParametres
        general={<ParametresClient parametres={parametres} />}
        profils={<ReglagesProfils profils={profils} />}
        courriel={<ReglagesCourriel configuration={configuration} modeles={modeles} />}
      />
    </div>
  );
}
