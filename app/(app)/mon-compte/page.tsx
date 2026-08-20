import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

import { AvatarCroyant } from '@/components/croyants/avatar-croyant';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { ENTITY_LABELS, type EntityType } from '@/lib/domain/hierarchy';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  type Permission,
  type PermissionGroup,
} from '@/lib/domain/permissions';
import { photoDuCompte } from '@/lib/data/comptes';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mon compte' };

/**
 * EF-AUT-04 / EF-AUT-05 — profil personnel et transparence sur ses droits.
 *
 * Afficher a chacun ses propres habilitations n'est pas cosmetique : c'est ce
 * qui permet a un utilisateur de comprendre pourquoi une action lui est
 * refusee, et de demander le bon droit a son administrateur.
 *
 * La modification du profil et du mot de passe est branchee au lot 7, avec la
 * gestion des comptes.
 */
export default async function MonComptePage() {
  const session = await requireSession();

  /**
   * EF-AUT-04 — le portrait, pris sur la fiche de croyant du titulaire.
   *
   * Une lecture de plus, mais elle ne retarde rien d'autre : la session est
   * déjà là, et il n'y a pas d'autre requête sur cette page avec laquelle la
   * paralléliser.
   */
  const photo = await photoDuCompte(session.profileId);

  /**
   * `nomComplet` est une seule chaîne — la session ne sépare pas nom et prénom.
   * L'avatar attend les deux : on coupe au premier espace, ce qui suffit à
   * produire deux initiales et une teinte stable. Le nom affiché, lui, reste
   * celui de la session, entier.
   */
  const [prenomAvatar = session.nomComplet, ...resteDuNom] = session.nomComplet.split(' ');
  const nomAvatar = resteDuNom.join(' ') || session.nomComplet;

  const typeEntite = session.entiteType as EntityType;
  const libelleType = ENTITY_LABELS[typeEntite]?.singulier ?? session.entiteType;

  // Regroupement par categorie, comme dans la matrice d'habilitations (EF-ADM-02).
  const parGroupe = new Map<PermissionGroup, { permission: Permission; restreinte: boolean }[]>();

  for (const octroi of session.permissions) {
    const meta = PERMISSIONS[octroi.permission];
    if (!meta) continue;
    const liste = parGroupe.get(meta.group) ?? [];
    liste.push({ permission: octroi.permission, restreinte: octroi.scopePath !== null });
    parGroupe.set(meta.group, liste);
  }

  return (
    <div className="space-y-8">
      {/*
        EF-AUT-04 — LE PORTRAIT, à côté du nom.

        La photo vient de la fiche de CROYANT du titulaire : un compte n'a pas
        de visage, une personne en a un. Absente — le responsable informatique
        ne siège nulle part, et peut n'avoir jamais été photographié —, les
        initiales prennent le relais. Ce n'est pas un défaut d'affichage, c'est
        l'état normal de la moitié des comptes.
      */}
      <div className="flex items-start gap-5">
        {/*
          LE MÊME AVATAR QUE PARTOUT AILLEURS (règle 16). Il porte déjà la
          teinte dérivée du nom — la même personne garde sa couleur d'un écran
          à l'autre — et le repli sur les initiales. En refaire un ici aurait
          donné deux visages à la même personne.
        */}
        <AvatarCroyant
          nom={nomAvatar}
          prenom={prenomAvatar}
          url={photo}
          taille="lg"
          className="border-border border"
        />

        <PageHeader
          eyebrow="Compte personnel"
          title={session.nomComplet}
          description={session.email}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-6 p-6">
            <h2 className="text-sm font-semibold text-foreground">Rattachement</h2>

            <dl className="space-y-4">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className="text-sm font-medium text-foreground">
                  {ROLE_LABELS[session.role]}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Perimetre</dt>
                <dd className="text-sm font-medium text-foreground">
                  {libelleType} {session.entiteNom}
                </dd>
                <dd className="font-mono text-xs text-muted-foreground">
                  {session.entiteCode}
                </dd>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              Votre perimetre couvre cette entite et l&apos;ensemble de ses entites
              rattachees.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Mes habilitations</h2>
                <p className="text-xs text-muted-foreground">
                  {session.role === 'SUPERADMIN'
                    ? "En tant qu'administrateur du Siege, vous detenez l'ensemble des droits."
                    : `${session.permissions.length} droit${session.permissions.length > 1 ? 's' : ''} accorde${session.permissions.length > 1 ? 's' : ''}. Contactez votre administrateur pour toute evolution.`}
                </p>
              </div>
              <ShieldCheck className="size-5 shrink-0 text-slate-400" aria-hidden />
            </div>

            {session.role === 'SUPERADMIN' ? (
              <StatusBadge tone="accent">Tous les droits</StatusBadge>
            ) : (
              <div className="space-y-6">
                {PERMISSION_GROUPS.map((groupe) => {
                  const droits = parGroupe.get(groupe);
                  if (!droits?.length) return null;

                  return (
                    <div key={groupe} className="space-y-2">
                      <p className="eyebrow">{groupe}</p>
                      <ul className="flex flex-wrap gap-2">
                        {droits.map(({ permission, restreinte }) => (
                          <li key={permission}>
                            <StatusBadge tone={restreinte ? 'warning' : 'neutral'}>
                              {PERMISSIONS[permission].label}
                              {/* RG-25 : signaler une portee restreinte evite
                                  l'incomprehension « j'ai le droit mais ca echoue ». */}
                              {restreinte && ' · portee limitee'}
                            </StatusBadge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
