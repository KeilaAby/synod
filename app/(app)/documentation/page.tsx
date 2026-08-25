import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DocumentationClient } from '@/components/documentation/documentation-client';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Centre d’Aide & Documentation',
  description: 'Manuel d’utilisation complet et guide d’administration de la plateforme SYNOD.',
};

export default async function DocumentationPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const estAdmin = session.role === 'SUPERADMIN' || session.role === 'ENTITE_ADMIN';

  return <DocumentationClient estAdmin={estAdmin} />;
}
