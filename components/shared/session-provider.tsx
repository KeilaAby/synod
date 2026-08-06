'use client';

import { createContext, useContext, useMemo } from 'react';

import {
  type Permission,
  type SessionUtilisateur,
  detient,
  estSuperAdmin,
  peut,
} from '@/lib/domain/permissions';

/**
 * Session cote client — plan.md §4.3.
 *
 * Chargee une seule fois par le layout applicatif (Server Component) puis
 * transmise ici. Aucun composant ne refait d'aller-retour en base pour savoir
 * s'il doit afficher un bouton.
 *
 * AVERTISSEMENT : ce contexte sert UNIQUEMENT a l'affichage. Il n'a aucune
 * valeur de securite — un utilisateur peut modifier ce qu'il veut dans son
 * navigateur. Toute action reste revalidee cote serveur, puis par la RLS.
 */

export interface SessionClient extends SessionUtilisateur {
  readonly email: string;
  readonly nomComplet: string;
  readonly entiteNom: string;
  readonly entiteCode: string;
  readonly entiteType: string;
}

interface ValeurContexte {
  session: SessionClient;
  /** Droit detenu, sans evaluation de portee — pour un item de menu. */
  detient: (permission: Permission) => boolean;
  /** Droit + portee + perimetre — pour une action sur une entite precise. */
  peut: (permission: Permission, cheminEntite: string) => boolean;
  estSuperAdmin: boolean;
}

const ContexteSession = createContext<ValeurContexte | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionClient;
  children: React.ReactNode;
}) {
  const valeur = useMemo<ValeurContexte>(
    () => ({
      session,
      detient: (permission) => detient(session, permission),
      peut: (permission, cheminEntite) => peut(session, permission, cheminEntite),
      estSuperAdmin: estSuperAdmin(session),
    }),
    [session],
  );

  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>;
}

export function useSession(): ValeurContexte {
  const contexte = useContext(ContexteSession);
  if (!contexte) {
    throw new Error('useSession doit etre utilise a l interieur de <SessionProvider>.');
  }
  return contexte;
}
