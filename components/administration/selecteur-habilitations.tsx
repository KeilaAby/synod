'use client';

import {
  BarChart3,
  Briefcase,
  Eye,
  FileText,
  Network,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  type Permission,
  type PermissionGroup,
} from '@/lib/domain/permissions';
import {
  PROFILS_RACCOURCIS,
  type ProfilRaccourci,
  permissionsDuProfil,
  profilApplique,
} from '@/lib/domain/profils-habilitation';
import { cn } from '@/lib/utils';

/**
 * Les habilitations fines — RG-24, RG-25.
 *
 * DES INTERRUPTEURS, PAS DES CASES. Une case dit « ceci fait partie d'une
 * sélection » ; un interrupteur dit « ceci est actif ». Sur une liste de trente
 * droits, la nuance change la lecture : on ne compte pas des cases, on parcourt
 * des états.
 *
 * DEUX ÉTAGES, ET C'EST DÉLIBÉRÉ. Les **raccourcis** posent d'un clic ce qu'on
 * demande neuf fois sur dix ; les **détails** corrigent le dixième. Un écran
 * qui n'aurait que les seconds ferait cocher quinze interrupteurs à chaque
 * ouverture de compte, et quelqu'un finirait par tout accorder pour aller plus
 * vite.
 *
 * UN RACCOURCI POSE, IL N'ENFERME PAS. Après l'avoir cliqué on ajuste
 * librement — le compte n'est rattaché à aucun profil, il porte des droits.
 * C'est la différence avec un rôle, et c'est elle qui survit aux cas
 * particuliers.
 *
 * CE QU'ON NE PEUT PAS ACCORDER RESTE VISIBLE, ÉTEINT ET EXPLIQUÉ (plan.md
 * §10.6) : un administrateur de district qui ne verrait pas « Valider un
 * mouvement » croirait que le droit n'existe pas, alors qu'il ne le détient
 * simplement pas lui-même.
 */

const ICONES_GROUPE: Record<PermissionGroup, LucideIcon> = {
  Structure: Network,
  Croyants: Users,
  Bureaux: Briefcase,
  Finances: Wallet,
  Rapports: FileText,
  Pilotage: BarChart3,
  Administration: ShieldCheck,
};

const ICONES_PROFIL: Record<string, LucideIcon> = {
  ADMINISTRATEUR: ShieldCheck,
  RESPONSABLE: Network,
  TRESORIER: Wallet,
  SECRETAIRE: Users,
  CONSULTATION: Eye,
};

export function SelecteurHabilitations({
  accordees,
  delegables,
  profils = PROFILS_RACCOURCIS,
  onRemplacer,
  onBasculer,
}: {
  accordees: readonly Permission[];
  /**
   * Les raccourcis proposes. Une liste VIDE les retire — c est le cas quand ce
   * selecteur sert a DEFINIR un profil : lui proposer des raccourcis reviendrait
   * a definir un profil a partir d un autre, et personne ne saurait plus lequel
   * fait autorite.
   */
  profils?: readonly ProfilRaccourci[];
  /** Ce que le délégant détient lui-même, et peut donc transmettre (RG-24). */
  delegables: readonly Permission[];
  /** Un raccourci REMPLACE la sélection : c'est ce qu'on attend d'un préréglage. */
  onRemplacer: (permissions: Permission[]) => void;
  onBasculer: (permission: Permission, accordee: boolean) => void;
}) {
  return (
    <div className="space-y-8">
      {/* --- Les raccourcis ---------------------------------------------- */}
      {profils.length > 0 && (
      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Profils de privilèges (raccourcis)
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {profils.map((profil) => {
            const Icone = ICONES_PROFIL[profil.cle] ?? ShieldCheck;
            const posables = permissionsDuProfil(profil, delegables);
            const applique = profilApplique(profil, accordees, delegables);

            return (
              <button
                key={profil.cle}
                type="button"
                onClick={() => onRemplacer(posables)}
                // Un raccourci qui ne poserait RIEN — le délégant ne détient
                // aucun de ses droits — est éteint plutôt que trompeur.
                disabled={posables.length === 0}
                aria-pressed={applique}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  posables.length === 0
                    ? 'cursor-not-allowed border-dashed border-border opacity-50'
                    : 'border-border hover:border-slate-300',
                  applique && 'border-indigo-500 bg-indigo-50',
                )}
                title={
                  posables.length === 0
                    ? 'Vous ne détenez aucun des droits de ce profil (RG-24).'
                    : profil.description
                }
              >
                <span className="flex items-center gap-2">
                  <Icone className="size-4 shrink-0 text-slate-500" aria-hidden />
                  <span className="text-sm font-medium text-foreground">
                    {profil.libelle}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{profil.description}</span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* --- Le détail ---------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Habilitations détaillées
          </h3>
          <span className="text-xs text-muted-foreground">
            <span className="tabular-nums">{accordees.length}</span> accordée
            {accordees.length > 1 ? 's' : ''}
          </span>
        </div>

        {PERMISSION_GROUPS.map((groupe) => (
          <GroupeHabilitations
            key={groupe}
            groupe={groupe}
            accordees={accordees}
            delegables={delegables}
            onBasculer={onBasculer}
          />
        ))}
      </section>
    </div>
  );
}

function GroupeHabilitations({
  groupe,
  accordees,
  delegables,
  onBasculer,
}: {
  groupe: PermissionGroup;
  accordees: readonly Permission[];
  delegables: readonly Permission[];
  onBasculer: (permission: Permission, accordee: boolean) => void;
}) {
  const cles = (Object.keys(PERMISSIONS) as Permission[]).filter(
    (p) => PERMISSIONS[p].group === groupe,
  );
  if (cles.length === 0) return null;

  const Icone = ICONES_GROUPE[groupe];
  const retenues = cles.filter((p) => accordees.includes(p)).length;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icone className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {groupe}
        </h4>
        {retenues > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {retenues} / {cles.length}
          </span>
        )}
      </div>

      <ul className="grid gap-2 lg:grid-cols-2">
        {cles.map((permission) => {
          const meta = PERMISSIONS[permission];
          const possible = delegables.includes(permission);
          const active = accordees.includes(permission);

          return (
            <li key={permission}>
              <label
                className={cn(
                  'flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
                  possible
                    ? 'cursor-pointer border-border hover:border-slate-300'
                    : 'cursor-not-allowed border-dashed border-border opacity-60',
                  active && 'border-indigo-500 bg-indigo-50',
                )}
                // Le survol dit POURQUOI c'est éteint : ne pas détenir un droit
                // et l'application ne pas le proposer sont deux choses.
                title={
                  possible
                    ? meta.description
                    : `Vous ne détenez pas « ${meta.label} » et ne pouvez donc pas l’accorder (RG-24).`
                }
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {meta.label}
                    </span>
                    {active && (
                      <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
                        Actif
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {meta.description}
                  </span>
                </span>

                <Switch
                  checked={active}
                  disabled={!possible}
                  onCheckedChange={(v) => onBasculer(permission, v === true)}
                  aria-label={meta.label}
                  className="mt-0.5 shrink-0"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
