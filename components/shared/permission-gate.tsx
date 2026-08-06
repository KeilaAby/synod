'use client';

import type { Permission } from '@/lib/domain/permissions';

import { useSession } from './session-provider';

/**
 * Masque une action non autorisee — plan.md §5.4.
 *
 * CONFORT D'AFFICHAGE UNIQUEMENT. Ce composant ne protege rien : il evite
 * seulement de proposer un bouton qui echouerait. La securite reelle est
 * assuree par la Server Action (droit + portee + perimetre) puis par la RLS.
 *
 * `scope` doit etre fourni des lors que l'action porte sur une entite precise :
 * detenir « finance.create » ne signifie pas pouvoir saisir pour n'importe
 * quelle paroisse (RG-25).
 */
export function PermissionGate({
  perm,
  scope,
  children,
  fallback = null,
}: {
  perm: Permission;
  /** Chemin ltree de l'entite visee. Omis = simple test de detention. */
  scope?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const session = useSession();
  const autorise = scope ? session.peut(perm, scope) : session.detient(perm);
  return <>{autorise ? children : fallback}</>;
}
