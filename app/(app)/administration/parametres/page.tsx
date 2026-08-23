import type { Metadata } from 'next';

import { ReglagesAttestationTransfert } from '@/components/administration/reglages-attestation-transfert';
import { ReglagesCourriel } from '@/components/administration/reglages-courriel';
import { ReglagesProfils } from '@/components/administration/reglages-profils';
import { PageHeader } from '@/components/shared/page-header';
import { chargerParametresAttestation } from '@/lib/data/attestation-transfert';
import { chargerConfigurationCourriel, chargerModelesCourriel } from '@/lib/data/courriel';
import { signerPhotos } from '@/lib/data/photos';
import { chargerProfilsHabilitation } from '@/lib/data/profils';
import { getParametres } from '@/lib/data/settings';
import { getSession } from '@/lib/session';

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
  const [session, parametres, configuration, modeles, profils, attestation] = await Promise.all([
    getSession(),
    getParametres(),
    chargerConfigurationCourriel(),
    chargerModelesCourriel(),
    chargerProfilsHabilitation(),
    chargerParametresAttestation(),
  ]);

  // Cle relative -> URL signee (regle 11) : une seule requete pour les deux
  // logos de l'ecran, plutot que deux appels au stockage.
  const logos = await signerPhotos([attestation.logo_key, parametres.logo_key]);

  /**
   * EF-ADM-05 — un profil GLOBAL est COMMUN a toute l'organisation : il
   * apparait dans le formulaire de compte de chaque entite. Le composer se
   * decide donc au Siege, comme la trame des rapports (0045). Les profils
   * LOCAUX se composent ailleurs, sur `/administration/profils` — chaque
   * entite gere les siens (`permission.delegate`), pas ceux qui valent pour
   * tout le monde.
   *
   * L'ecran refuse AVANT le geste, et l'action refuse aussi : un garde-fou
   * d'interface se contourne par un appel direct.
   */
  const peutComposerProfils = session?.entiteType === 'SIEGE';

  // Cet onglet ne montre QUE les profils GLOBAUX : un profil local d'un
  // district encombrerait l'ecran du Siege sans que celui-ci puisse le
  // modifier — chaque entite gere les siens sur son propre ecran.
  const profilsGlobaux = profils.filter((p) => p.entity_id === null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Parametres generaux"
        description="Ce qui vaut pour toute l'organisation : identite, devise, workflows et defauts."
      />

      <OngletsParametres
        general={
          <ParametresClient
            parametres={parametres}
            logoUrl={parametres.logo_key ? (logos.get(parametres.logo_key) ?? null) : null}
          />
        }
        profils={<ReglagesProfils profils={profilsGlobaux} peutComposer={peutComposerProfils} />}
        courriel={<ReglagesCourriel configuration={configuration} modeles={modeles} />}
        attestation={
          <ReglagesAttestationTransfert
            parametres={attestation}
            logoUrl={attestation.logo_key ? (logos.get(attestation.logo_key) ?? null) : null}
          />
        }
      />
    </div>
  );
}
