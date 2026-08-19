import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { chargerCorbeille } from '@/lib/data/corbeille';
import { peut } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';
import { formatNombre } from '@/lib/utils/format';

import { CorbeilleClient } from './corbeille-client';

export const metadata: Metadata = { title: 'Corbeille' };

/**
 * EF-ADM-10 — ce qui a ete supprime, et peut revenir.
 *
 * La RLS borne au perimetre ; `trash.restore` conditionne l'ecriture, et la
 * carte du hub n'est proposee qu'a lui. La lecture, elle, suit le perimetre
 * ordinaire : voir ce qu'on a supprime n'est pas un droit a part.
 */
export default async function CorbeillePage() {
  const [elements, session] = await Promise.all([chargerCorbeille(), getSession()]);

  /**
   * EF-ADM-10 — `trash.purge` est a portee PROPRE (RG-25, migration 0055) : le
   * detenir sur un district ne l'ouvre pas sur ses eglises. Ici on ne peut
   * l'evaluer que sur l'entite de rattachement, faute de connaitre le chemin de
   * chaque ligne avant de l'afficher — l'action, elle, le verifie ligne par
   * ligne. L'ecran decide donc si les gestes APPARAISSENT ; le serveur decide
   * s'ils aboutissent.
   */
  const peutPurger = session
    ? peut(session, 'trash.purge', session.scopePath)
    : false;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Corbeille"
        description={
          elements.length > 0
            ? `${formatNombre(elements.length)} element${elements.length > 1 ? 's' : ''} supprime${elements.length > 1 ? 's' : ''} dans votre perimetre.`
            : 'Rien n a ete supprime dans votre perimetre.'
        }
      />

      <CorbeilleClient elements={elements} peutPurger={peutPurger} />
    </div>
  );
}
