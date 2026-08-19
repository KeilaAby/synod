import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';

import { ChangementForm } from './changement-form';

export const metadata: Metadata = { title: 'Choisir un mot de passe' };

/**
 * EF-ADM-01, EF-ADM-08 — remplacer un mot de passe PROVISOIRE.
 *
 * L'ecran vit dans le groupe `(auth)`, hors du gabarit applicatif : sa
 * navigation renverrait vers des ecrans que l'utilisateur ne doit pas atteindre
 * avant d'avoir choisi son mot de passe. C'est aussi ce qui evite la boucle —
 * le gabarit `(app)` redirige ICI, et cet ecran n'en fait pas partie.
 *
 * QUI N'A RIEN A Y FAIRE EN REPART. Arriver ici sans drapeau signifie qu'on a
 * tape l'adresse : on renvoie au tableau de bord plutot que de proposer un
 * changement qui n'est pas demande — pour cela, `/mon-compte` existe.
 */
export default async function ChangerMotDePassePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');
  if (!session.doitChangerMotDePasse) redirect('/tableau-de-bord');

  return <ChangementForm nomComplet={session.nomComplet} />;
}
